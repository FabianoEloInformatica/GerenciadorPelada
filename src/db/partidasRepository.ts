import {
  obterBanco,
  type PartidaDB,
  type PartidaJogadorDB,
  type PartidaTimeDB,
} from './database'

export type FormacaoTimeNovaPartida = {
  lado: 1 | 2
  grupoOrigem?: number
  goleiroId: number
  corColete?: string
  jogadoresLinhaIds: number[]
}

/*
 * Inicia a primeira partida de forma atômica.
 * A partida, seus dois times, todos os atletas e o status da sessão são
 * gravados na mesma transação para não existir "meia partida" após uma falha.
 */
export async function iniciarPrimeiraPartida(
  sessaoId: number,
  times: [FormacaoTimeNovaPartida, FormacaoTimeNovaPartida],
): Promise<number> {
  const db = await obterBanco()

  const tx = db.transaction(
    ['sessoes', 'partidas', 'partida_times', 'partida_jogadores'],
    'readwrite',
  )

  const sessoes = tx.objectStore('sessoes')
  const partidas = tx.objectStore('partidas')
  const partidaTimes = tx.objectStore('partida_times')
  const partidaJogadores = tx.objectStore('partida_jogadores')

  const sessao = await sessoes.get(sessaoId)

  if (!sessao) {
    throw new Error('Sessão não encontrada.')
  }

  if (sessao.status !== 'PREPARACAO') {
    throw new Error('Esta pelada já foi iniciada ou finalizada.')
  }

  const partidaExistente = await partidas
    .index('por-sessao-numero')
    .get([sessaoId, 1])

  if (partidaExistente) {
    throw new Error('A primeira partida desta pelada já foi criada.')
  }

  if (times[0].lado === times[1].lado) {
    throw new Error('Os dois times da partida precisam ocupar lados diferentes.')
  }

  const ids = times.flatMap((time) => [
    time.goleiroId,
    ...time.jogadoresLinhaIds,
  ])

  if (new Set(ids).size !== ids.length) {
    throw new Error('Um jogador não pode ocupar dois lugares na mesma partida.')
  }

  const agora = new Date().toISOString()

  const partida: PartidaDB = {
    sessaoId,
    numero: 1,
    status: 'EM_ANDAMENTO',
    placarTime1: 0,
    placarTime2: 0,
    iniciadaEm: agora,
    pausada: false,
    totalPausadoMs: 0,
    criadoEm: agora,
    atualizadoEm: agora,
  }

  const partidaId = await partidas.add(partida)

  for (const time of times) {
    const registroTime: PartidaTimeDB = {
      partidaId,
      lado: time.lado,
      grupoOrigem: time.grupoOrigem,
      goleiroId: time.goleiroId,
      corColete: time.corColete,
      criadoEm: agora,
    }

    await partidaTimes.add(registroTime)

    const goleiro: PartidaJogadorDB = {
      partidaId,
      lado: time.lado,
      jogadorId: time.goleiroId,
      funcao: 'GOLEIRO',
      ordemFormacao: 0,
      criadoEm: agora,
    }

    await partidaJogadores.add(goleiro)

    for (let indice = 0; indice < time.jogadoresLinhaIds.length; indice += 1) {
      const jogador: PartidaJogadorDB = {
        partidaId,
        lado: time.lado,
        jogadorId: time.jogadoresLinhaIds[indice],
        funcao: 'LINHA',
        ordemFormacao: indice + 1,
        criadoEm: agora,
      }

      await partidaJogadores.add(jogador)
    }
  }

  /*
   * A sessão só vira EM_ANDAMENTO depois que a formação oficial foi gravada
   * dentro desta mesma transação.
   */
  sessao.status = 'EM_ANDAMENTO'
  sessao.atualizadoEm = agora
  await sessoes.put(sessao)

  await tx.done
  return partidaId
}

export async function buscarPartidaEmAndamentoDaSessao(
  sessaoId: number,
): Promise<PartidaDB | undefined> {
  const db = await obterBanco()
  const partidas = await db.getAllFromIndex('partidas', 'por-sessao', sessaoId)

  return partidas.find((partida) => partida.status === 'EM_ANDAMENTO')
}


export type PartidaEmAndamentoCompleta = {
  partida: PartidaDB
  times: PartidaTimeDB[]
  jogadores: PartidaJogadorDB[]
}

/*
 * Recupera o retrato oficial da partida em andamento.
 * A tela usa a formação persistida ao iniciar, nunca refaz o sorteio.
 */
export async function buscarPartidaEmAndamentoCompleta(
  sessaoId: number,
): Promise<PartidaEmAndamentoCompleta | null> {
  const db = await obterBanco()
  const partida = await buscarPartidaEmAndamentoDaSessao(sessaoId)

  if (!partida?.id) return null

  const [times, jogadores] = await Promise.all([
    db.getAllFromIndex('partida_times', 'por-partida', partida.id),
    db.getAllFromIndex('partida_jogadores', 'por-partida', partida.id),
  ])

  return {
    partida: normalizarRelogioPartida(partida),
    times: times.sort((a, b) => a.lado - b.lado),
    jogadores: jogadores.sort((a, b) => {
      if (a.lado !== b.lado) return a.lado - b.lado
      return a.ordemFormacao - b.ordemFormacao
    }),
  }
}


/* Partidas da v7 são normalizadas sem perder o horário de início já salvo. */
export function normalizarRelogioPartida(partida: PartidaDB): PartidaDB {
  return { ...partida, pausada: partida.pausada ?? false, totalPausadoMs: partida.totalPausadoMs ?? 0 }
}

export async function pausarPartida(partidaId: number): Promise<PartidaDB> {
  const db = await obterBanco()
  const original = await db.get('partidas', partidaId)
  if (!original) throw new Error('Partida não encontrada.')
  if (original.status !== 'EM_ANDAMENTO') throw new Error('A partida não está em andamento.')
  const partida = normalizarRelogioPartida(original)
  if (partida.pausada) return partida
  const agora = new Date().toISOString()
  partida.pausada = true
  partida.pausadaEm = agora
  partida.atualizadoEm = agora
  await db.put('partidas', partida)
  return partida
}

export async function retomarPartida(partidaId: number): Promise<PartidaDB> {
  const db = await obterBanco()
  const original = await db.get('partidas', partidaId)
  if (!original) throw new Error('Partida não encontrada.')
  if (original.status !== 'EM_ANDAMENTO') throw new Error('A partida não está em andamento.')
  const partida = normalizarRelogioPartida(original)
  if (!partida.pausada || !partida.pausadaEm) return partida
  const agoraMs = Date.now()
  partida.totalPausadoMs += Math.max(0, agoraMs - new Date(partida.pausadaEm).getTime())
  partida.pausada = false
  partida.pausadaEm = undefined
  partida.atualizadoEm = new Date(agoraMs).toISOString()
  await db.put('partidas', partida)
  return partida
}
