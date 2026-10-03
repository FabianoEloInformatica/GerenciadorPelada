import {
  obterBanco,
  type PartidaDB,
  type PartidaEventoDB,
  type PartidaJogadorDB,
  type PartidaTimeDB,
  type TampinhaEmpateDB,
  type TampinhaSubstituicaoDB,
  type FilaOperacionalDB,
  type PrioridadeFilaOperacional,
  type TipoJogador,
  type FormacaoOperacionalDB,
  type FormacaoOperacionalMembroDB,
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

export type RegistrarGolPartidaDados = {
  ladoBeneficiado: 1 | 2
  jogadorId?: number
  golContra?: boolean
}

export type ResultadoRegistroGol = {
  partida: PartidaDB
  evento: PartidaEventoDB
}

function calcularTempoEfetivoPartida(partida: PartidaDB, agoraMs: number): number {
  const normalizada = normalizarRelogioPartida(partida)
  const inicioMs = new Date(normalizada.iniciadaEm).getTime()
  return Math.max(0, agoraMs - inicioMs - normalizada.totalPausadoMs)
}

/*
 * Evento e placar são gravados na mesma transação para nunca divergirem.
 */
export async function registrarGolPartida(
  partidaId: number,
  dados: RegistrarGolPartidaDados,
): Promise<ResultadoRegistroGol> {
  const db = await obterBanco()
  const tx = db.transaction(
    ['partidas', 'partida_jogadores', 'partida_eventos'],
    'readwrite',
  )
  const partidas = tx.objectStore('partidas')
  const jogadores = tx.objectStore('partida_jogadores')
  const eventos = tx.objectStore('partida_eventos')
  const original = await partidas.get(partidaId)

  if (!original) throw new Error('Partida não encontrada.')
  if (original.status !== 'EM_ANDAMENTO') {
    throw new Error('A partida não está em andamento.')
  }

  const partida = normalizarRelogioPartida(original)
  if (partida.pausada) {
    throw new Error('Retome a partida antes de registrar um gol.')
  }

  const golContra = dados.golContra === true
  if (!golContra) {
    if (!dados.jogadorId) throw new Error('Selecione o autor do gol.')
    const atleta = await jogadores
      .index('por-partida-jogador')
      .get([partidaId, dados.jogadorId])
    if (!atleta || atleta.lado !== dados.ladoBeneficiado) {
      throw new Error('O autor selecionado não pertence ao time que marcou.')
    }
  }

  const agoraMs = Date.now()
  const agora = new Date(agoraMs).toISOString()
  const evento: PartidaEventoDB = {
    partidaId,
    tipo: golContra ? 'GOL_CONTRA' : 'GOL',
    ladoBeneficiado: dados.ladoBeneficiado,
    jogadorId: golContra ? undefined : dados.jogadorId,
    tempoJogoMs: calcularTempoEfetivoPartida(partida, agoraMs),
    criadoEm: agora,
  }
  const eventoId = await eventos.add(evento)

  if (dados.ladoBeneficiado === 1) partida.placarTime1 += 1
  else partida.placarTime2 += 1

  partida.atualizadoEm = agora
  await partidas.put(partida)
  await tx.done

  return { partida, evento: { ...evento, id: eventoId } }
}

export async function listarEventosPartida(
  partidaId: number,
): Promise<PartidaEventoDB[]> {
  const db = await obterBanco()
  const eventos = await db.getAllFromIndex('partida_eventos', 'por-partida', partidaId)
  return eventos.sort((a, b) =>
    a.tempoJogoMs !== b.tempoJogoMs
      ? a.tempoJogoMs - b.tempoJogoMs
      : (a.id ?? 0) - (b.id ?? 0),
  )
}



export type ResultadoFinalizacaoPartida = {
  partida: PartidaDB
}

/*
 * Recupera a partida mais recente da sessão, inclusive se já finalizada.
 * Isso mantém o resultado visível após F5 enquanto a próxima rotação
 * ainda não foi criada.
 */
export async function buscarUltimaPartidaCompletaDaSessao(
  sessaoId: number,
): Promise<PartidaEmAndamentoCompleta | null> {
  const db = await obterBanco()
  const partidas = await db.getAllFromIndex('partidas', 'por-sessao', sessaoId)

  const partida = partidas
    .sort((a, b) => {
      if (a.numero !== b.numero) return b.numero - a.numero
      return (b.id ?? 0) - (a.id ?? 0)
    })[0]

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

/*
 * Finaliza somente a partida atual. A sessão continua EM_ANDAMENTO porque
 * a pelada ainda terá rotação e novas partidas.
 */
export async function finalizarPartida(
  partidaId: number,
  motivo: 'MANUAL' | 'LIMITE_GOLS' | 'TEMPO' = 'MANUAL',
): Promise<ResultadoFinalizacaoPartida> {
  const db = await obterBanco()
  const tx = db.transaction(['partidas'], 'readwrite')
  const partidas = tx.objectStore('partidas')
  const original = await partidas.get(partidaId)

  if (!original) throw new Error('Partida não encontrada.')
  if (original.status !== 'EM_ANDAMENTO') {
    throw new Error('Esta partida já foi finalizada.')
  }

  const partida = normalizarRelogioPartida(original)
  const agoraMs = Date.now()
  const agora = new Date(agoraMs).toISOString()

  // Finalizar durante uma pausa congela o relógio no instante esportivo da pausa.
  if (partida.pausada && partida.pausadaEm) {
    partida.totalPausadoMs += Math.max(
      0,
      agoraMs - new Date(partida.pausadaEm).getTime(),
    )
  }

  const inicioMs = new Date(partida.iniciadaEm).getTime()
  partida.tempoFinalMs = Math.max(
    0,
    agoraMs - inicioMs - partida.totalPausadoMs,
  )

  partida.status = 'FINALIZADA'
  partida.finalizadaEm = agora
  partida.motivoFinalizacao = motivo
  partida.pausada = false
  partida.pausadaEm = undefined
  partida.atualizadoEm = agora

  if (partida.placarTime1 > partida.placarTime2) {
    partida.resultado = 'TIME1'
    partida.ladoVencedor = 1
    partida.ladoPerdedor = 2
  } else if (partida.placarTime2 > partida.placarTime1) {
    partida.resultado = 'TIME2'
    partida.ladoVencedor = 2
    partida.ladoPerdedor = 1
  } else {
    partida.resultado = 'EMPATE'
    partida.ladoVencedor = undefined
    partida.ladoPerdedor = undefined
  }

  await partidas.put(partida)
  await tx.done
  return { partida }
}

export type DadosProximoTime = {
  grupoOrigem: number
  goleiroId: number
  jogadoresLinhaIds: number[]
}

/*
 * Cria a próxima partida usando o vencedor da partida anterior e o primeiro
 * time disponível da fila. O vencedor mantém lado, colete e formação.
 * O time que entra ocupa o lado/colete do perdedor.
 */
export async function iniciarProximaPartida(
  partidaFinalizadaId: number,
  proximoTime: DadosProximoTime,
): Promise<number> {
  const db = await obterBanco()

  const tx = db.transaction(
    ['partidas', 'partida_times', 'partida_jogadores'],
    'readwrite',
  )

  const partidas = tx.objectStore('partidas')
  const partidaTimes = tx.objectStore('partida_times')
  const partidaJogadores = tx.objectStore('partida_jogadores')

  const anterior = await partidas.get(partidaFinalizadaId)

  if (!anterior) throw new Error('Partida finalizada não encontrada.')
  if (anterior.status !== 'FINALIZADA') {
    throw new Error('Finalize a partida atual antes de iniciar a próxima.')
  }
  if (anterior.resultado === 'EMPATE' || !anterior.ladoVencedor || !anterior.ladoPerdedor) {
    throw new Error(
      'O empate precisa ser decidido pela tampinha antes da próxima partida.',
    )
  }

  const existente = await partidas
    .index('por-sessao-numero')
    .get([anterior.sessaoId, anterior.numero + 1])

  if (existente) {
    throw new Error('A próxima partida desta pelada já foi criada.')
  }

  const timesAnteriores = await partidaTimes
    .index('por-partida')
    .getAll(partidaFinalizadaId)

  const jogadoresAnteriores = await partidaJogadores
    .index('por-partida')
    .getAll(partidaFinalizadaId)

  const timeVencedor = timesAnteriores.find(
    (time) => time.lado === anterior.ladoVencedor,
  )
  const timePerdedor = timesAnteriores.find(
    (time) => time.lado === anterior.ladoPerdedor,
  )

  if (!timeVencedor || !timePerdedor) {
    throw new Error('Não foi possível recuperar as formações da partida anterior.')
  }

  const jogadoresVencedores = jogadoresAnteriores
    .filter(
      (jogador) =>
        jogador.lado === anterior.ladoVencedor && jogador.funcao === 'LINHA',
    )
    .sort((a, b) => a.ordemFormacao - b.ordemFormacao)

  const idsNovaPartida = [
    timeVencedor.goleiroId,
    ...jogadoresVencedores.map((jogador) => jogador.jogadorId),
    proximoTime.goleiroId,
    ...proximoTime.jogadoresLinhaIds,
  ]

  if (new Set(idsNovaPartida).size !== idsNovaPartida.length) {
    throw new Error('Um jogador não pode ocupar dois lugares na próxima partida.')
  }

  const agora = new Date().toISOString()
  const novaPartida: PartidaDB = {
    sessaoId: anterior.sessaoId,
    numero: anterior.numero + 1,
    status: 'EM_ANDAMENTO',
    placarTime1: 0,
    placarTime2: 0,
    iniciadaEm: agora,
    pausada: false,
    totalPausadoMs: 0,
    criadoEm: agora,
    atualizadoEm: agora,
  }

  const novaPartidaId = await partidas.add(novaPartida)

  // Vencedor permanece exatamente no mesmo lado e com o mesmo colete.
  await partidaTimes.add({
    partidaId: novaPartidaId,
    lado: anterior.ladoVencedor,
    grupoOrigem: timeVencedor.grupoOrigem,
    goleiroId: timeVencedor.goleiroId,
    corColete: timeVencedor.corColete,
    criadoEm: agora,
  })

  await partidaJogadores.add({
    partidaId: novaPartidaId,
    lado: anterior.ladoVencedor,
    jogadorId: timeVencedor.goleiroId,
    funcao: 'GOLEIRO',
    ordemFormacao: 0,
    criadoEm: agora,
  })

  for (let indice = 0; indice < jogadoresVencedores.length; indice += 1) {
    await partidaJogadores.add({
      partidaId: novaPartidaId,
      lado: anterior.ladoVencedor,
      jogadorId: jogadoresVencedores[indice].jogadorId,
      funcao: 'LINHA',
      ordemFormacao: indice + 1,
      criadoEm: agora,
    })
  }

  /*
   * O time da fila assume o lado e o colete do perdedor.
   * O goleiro recebido pela tela já pode ser o goleiro próprio do grupo ou,
   * quando não houver, o goleiro do time perdedor.
   */
  await partidaTimes.add({
    partidaId: novaPartidaId,
    lado: anterior.ladoPerdedor,
    grupoOrigem: proximoTime.grupoOrigem,
    goleiroId: proximoTime.goleiroId,
    corColete: timePerdedor.corColete,
    criadoEm: agora,
  })

  await partidaJogadores.add({
    partidaId: novaPartidaId,
    lado: anterior.ladoPerdedor,
    jogadorId: proximoTime.goleiroId,
    funcao: 'GOLEIRO',
    ordemFormacao: 0,
    criadoEm: agora,
  })

  for (let indice = 0; indice < proximoTime.jogadoresLinhaIds.length; indice += 1) {
    await partidaJogadores.add({
      partidaId: novaPartidaId,
      lado: anterior.ladoPerdedor,
      jogadorId: proximoTime.jogadoresLinhaIds[indice],
      funcao: 'LINHA',
      ordemFormacao: indice + 1,
      criadoEm: agora,
    })
  }

  await tx.done
  return novaPartidaId
}

/*
 * Retorna todos os grupos de origem que já entraram oficialmente em quadra.
 * Isso evita depender do número da partida para descobrir o próximo time da fila.
 */
export async function listarGruposJaUtilizados(
  sessaoId: number,
): Promise<number[]> {
  const db = await obterBanco()
  const partidas = await db.getAllFromIndex('partidas', 'por-sessao', sessaoId)
  const grupos = new Set<number>()

  for (const partida of partidas) {
    if (!partida.id) continue
    const times = await db.getAllFromIndex(
      'partida_times',
      'por-partida',
      partida.id,
    )

    for (const time of times) {
      if (time.grupoOrigem !== undefined) grupos.add(time.grupoOrigem)
    }
  }

  return Array.from(grupos).sort((a, b) => a - b)
}

/*
 * O empate continua registrado como EMPATE. A tampinha é uma decisão
 * operacional separada, persistida para sobreviver a F5 e orientar fila/goleiros.
 */
export async function registrarTampinhaEmpate(
  partidaId: number,
  totalParticipantes: number,
  maiorNumeroVence: boolean,
): Promise<TampinhaEmpateDB> {
  const db = await obterBanco()

  const existente = await db.getFromIndex(
    'tampinhas_empate',
    'por-partida',
    partidaId,
  )
  if (existente) return existente

  const partida = await db.get('partidas', partidaId)
  if (!partida) throw new Error('Partida não encontrada.')
  if (partida.status !== 'FINALIZADA' || partida.resultado !== 'EMPATE') {
    throw new Error('A tampinha do empate só pode ser feita após um empate finalizado.')
  }

  if (totalParticipantes < 2) {
    throw new Error('São necessários pelo menos dois participantes para sortear a tampinha.')
  }

  const numeroLado1 = Math.floor(Math.random() * totalParticipantes) + 1
  let numeroLado2 = Math.floor(Math.random() * totalParticipantes) + 1
  while (numeroLado2 === numeroLado1) {
    numeroLado2 = Math.floor(Math.random() * totalParticipantes) + 1
  }

  const ladoVencedor: 1 | 2 = maiorNumeroVence
    ? numeroLado1 > numeroLado2 ? 1 : 2
    : numeroLado1 < numeroLado2 ? 1 : 2
  const ladoPerdedor: 1 | 2 = ladoVencedor === 1 ? 2 : 1

  const registro: TampinhaEmpateDB = {
    sessaoId: partida.sessaoId,
    partidaId,
    numeroLado1,
    numeroLado2,
    ladoVencedor,
    ladoPerdedor,
    maiorNumeroVence,
    criadoEm: new Date().toISOString(),
  }

  const id = await db.add('tampinhas_empate', registro)
  return { ...registro, id }
}

export async function buscarTampinhaEmpate(
  partidaId: number,
): Promise<TampinhaEmpateDB | null> {
  const db = await obterBanco()
  return (
    (await db.getFromIndex('tampinhas_empate', 'por-partida', partidaId)) ??
    null
  )
}

export type TimeEntradaAposEmpate = {
  grupoOrigem: number
  goleiroId: number
  jogadoresLinhaIds: number[]
}

/*
 * Cenário do empate com MENOS de dois times de linha completos fora:
 * vencedor da tampinha permanece; próximo grupo entra no lado/colete do perdedor.
 */
export async function iniciarProximaPartidaAposEmpateComPermanencia(
  partidaFinalizadaId: number,
  ladoVencedorTampinha: 1 | 2,
  proximoTime: TimeEntradaAposEmpate,
): Promise<number> {
  const db = await obterBanco()
  const tx = db.transaction(
    ['partidas', 'partida_times', 'partida_jogadores'],
    'readwrite',
  )

  const partidas = tx.objectStore('partidas')
  const timesStore = tx.objectStore('partida_times')
  const jogadoresStore = tx.objectStore('partida_jogadores')

  const anterior = await partidas.get(partidaFinalizadaId)
  if (!anterior || anterior.status !== 'FINALIZADA' || anterior.resultado !== 'EMPATE') {
    throw new Error('A partida anterior precisa ser um empate finalizado.')
  }

  const ladoPerdedorTampinha: 1 | 2 = ladoVencedorTampinha === 1 ? 2 : 1
  const existente = await partidas
    .index('por-sessao-numero')
    .get([anterior.sessaoId, anterior.numero + 1])
  if (existente) throw new Error('A próxima partida desta pelada já foi criada.')

  const timesAnteriores = await timesStore.index('por-partida').getAll(partidaFinalizadaId)
  const jogadoresAnteriores = await jogadoresStore.index('por-partida').getAll(partidaFinalizadaId)

  const vencedor = timesAnteriores.find((time) => time.lado === ladoVencedorTampinha)
  const perdedor = timesAnteriores.find((time) => time.lado === ladoPerdedorTampinha)
  if (!vencedor || !perdedor) throw new Error('Formação anterior não encontrada.')

  const linhaVencedor = jogadoresAnteriores
    .filter((j) => j.lado === ladoVencedorTampinha && j.funcao === 'LINHA')
    .sort((a, b) => a.ordemFormacao - b.ordemFormacao)

  const ids = [
    vencedor.goleiroId,
    ...linhaVencedor.map((j) => j.jogadorId),
    proximoTime.goleiroId,
    ...proximoTime.jogadoresLinhaIds,
  ]
  if (new Set(ids).size !== ids.length) {
    throw new Error('Um jogador não pode ocupar dois lugares na próxima partida.')
  }

  const agora = new Date().toISOString()
  const novaId = await partidas.add({
    sessaoId: anterior.sessaoId,
    numero: anterior.numero + 1,
    status: 'EM_ANDAMENTO',
    placarTime1: 0,
    placarTime2: 0,
    iniciadaEm: agora,
    pausada: false,
    totalPausadoMs: 0,
    criadoEm: agora,
    atualizadoEm: agora,
  })

  await timesStore.add({
    partidaId: novaId,
    lado: ladoVencedorTampinha,
    grupoOrigem: vencedor.grupoOrigem,
    goleiroId: vencedor.goleiroId,
    corColete: vencedor.corColete,
    criadoEm: agora,
  })
  await jogadoresStore.add({
    partidaId: novaId,
    lado: ladoVencedorTampinha,
    jogadorId: vencedor.goleiroId,
    funcao: 'GOLEIRO',
    ordemFormacao: 0,
    criadoEm: agora,
  })
  for (let i = 0; i < linhaVencedor.length; i += 1) {
    await jogadoresStore.add({
      partidaId: novaId,
      lado: ladoVencedorTampinha,
      jogadorId: linhaVencedor[i].jogadorId,
      funcao: 'LINHA',
      ordemFormacao: i + 1,
      criadoEm: agora,
    })
  }

  await timesStore.add({
    partidaId: novaId,
    lado: ladoPerdedorTampinha,
    grupoOrigem: proximoTime.grupoOrigem,
    goleiroId: proximoTime.goleiroId,
    corColete: perdedor.corColete,
    criadoEm: agora,
  })
  await jogadoresStore.add({
    partidaId: novaId,
    lado: ladoPerdedorTampinha,
    jogadorId: proximoTime.goleiroId,
    funcao: 'GOLEIRO',
    ordemFormacao: 0,
    criadoEm: agora,
  })
  for (let i = 0; i < proximoTime.jogadoresLinhaIds.length; i += 1) {
    await jogadoresStore.add({
      partidaId: novaId,
      lado: ladoPerdedorTampinha,
      jogadorId: proximoTime.jogadoresLinhaIds[i],
      funcao: 'LINHA',
      ordemFormacao: i + 1,
      criadoEm: agora,
    })
  }

  await tx.done
  return novaId
}

/*
 * Cenário do empate com DOIS times de linha completos fora:
 * os dois times da quadra saem e os dois grupos seguintes entram.
 */
export async function iniciarPartidaComDoisTimesAposEmpate(
  partidaFinalizadaId: number,
  timeLado1: TimeEntradaAposEmpate,
  timeLado2: TimeEntradaAposEmpate,
): Promise<number> {
  const db = await obterBanco()
  const tx = db.transaction(
    ['partidas', 'partida_times', 'partida_jogadores'],
    'readwrite',
  )
  const partidas = tx.objectStore('partidas')
  const timesStore = tx.objectStore('partida_times')
  const jogadoresStore = tx.objectStore('partida_jogadores')

  const anterior = await partidas.get(partidaFinalizadaId)
  if (!anterior || anterior.status !== 'FINALIZADA' || anterior.resultado !== 'EMPATE') {
    throw new Error('A partida anterior precisa ser um empate finalizado.')
  }

  const existente = await partidas
    .index('por-sessao-numero')
    .get([anterior.sessaoId, anterior.numero + 1])
  if (existente) throw new Error('A próxima partida desta pelada já foi criada.')

  const timesAnteriores = await timesStore.index('por-partida').getAll(partidaFinalizadaId)
  const antigoLado1 = timesAnteriores.find((time) => time.lado === 1)
  const antigoLado2 = timesAnteriores.find((time) => time.lado === 2)
  if (!antigoLado1 || !antigoLado2) throw new Error('Times anteriores não encontrados.')

  const ids = [
    timeLado1.goleiroId,
    ...timeLado1.jogadoresLinhaIds,
    timeLado2.goleiroId,
    ...timeLado2.jogadoresLinhaIds,
  ]
  if (new Set(ids).size !== ids.length) {
    throw new Error('Um jogador não pode ocupar dois lugares na próxima partida.')
  }

  const agora = new Date().toISOString()
  const novaId = await partidas.add({
    sessaoId: anterior.sessaoId,
    numero: anterior.numero + 1,
    status: 'EM_ANDAMENTO',
    placarTime1: 0,
    placarTime2: 0,
    iniciadaEm: agora,
    pausada: false,
    totalPausadoMs: 0,
    criadoEm: agora,
    atualizadoEm: agora,
  })

  const entradas: Array<[1 | 2, TimeEntradaAposEmpate, string | undefined]> = [
    [1, timeLado1, antigoLado1.corColete],
    [2, timeLado2, antigoLado2.corColete],
  ]

  for (const [lado, time, corColete] of entradas) {
    await timesStore.add({
      partidaId: novaId,
      lado,
      grupoOrigem: time.grupoOrigem,
      goleiroId: time.goleiroId,
      corColete,
      criadoEm: agora,
    })
    await jogadoresStore.add({
      partidaId: novaId,
      lado,
      jogadorId: time.goleiroId,
      funcao: 'GOLEIRO',
      ordemFormacao: 0,
      criadoEm: agora,
    })
    for (let i = 0; i < time.jogadoresLinhaIds.length; i += 1) {
      await jogadoresStore.add({
        partidaId: novaId,
        lado,
        jogadorId: time.jogadoresLinhaIds[i],
        funcao: 'LINHA',
        ordemFormacao: i + 1,
        criadoEm: agora,
      })
    }
  }

  await tx.done
  return novaId
}

export type ItemInicialFilaOperacional = {
  jogadorId: number
  funcao: TipoJogador
  prioridade: PrioridadeFilaOperacional
  grupoOrigem?: number
  emQuadra?: boolean
}

const PESO_PRIORIDADE_FILA: Record<PrioridadeFilaOperacional, number> = {
  NAO_JOGOU: 1,
  CHEGADA_ATRASADA: 2,
  RETORNO: 3,
}

/*
 * Ordenação oficial:
 * 1) quem ainda não jogou;
 * 2) chegada atrasada;
 * 3) quem já jogou e voltou para a fila.
 * Dentro da mesma prioridade, a ordem persistida decide.
 */
export async function listarFilaOperacional(
  sessaoId: number,
): Promise<FilaOperacionalDB[]> {
  const db = await obterBanco()
  const itens = await db.getAllFromIndex(
    'fila_operacional',
    'por-sessao',
    sessaoId,
  )

  return itens.sort((a, b) => {
    const prioridade =
      PESO_PRIORIDADE_FILA[a.prioridade] - PESO_PRIORIDADE_FILA[b.prioridade]
    if (prioridade !== 0) return prioridade
    if (a.ordem !== b.ordem) return a.ordem - b.ordem
    return (a.id ?? 0) - (b.id ?? 0)
  })
}

/*
 * Inicializa a fila apenas quando ela ainda não existe.
 * Serve também para sessões antigas criadas antes da versão 11.
 */
export async function inicializarFilaOperacional(
  sessaoId: number,
  itens: ItemInicialFilaOperacional[],
): Promise<void> {
  const db = await obterBanco()
  const existentes = await db.getAllFromIndex(
    'fila_operacional',
    'por-sessao',
    sessaoId,
  )
  if (existentes.length > 0) return

  const tx = db.transaction('fila_operacional', 'readwrite')
  const store = tx.objectStore('fila_operacional')
  const agora = new Date().toISOString()

  const contadores: Record<PrioridadeFilaOperacional, number> = {
    NAO_JOGOU: 0,
    CHEGADA_ATRASADA: 0,
    RETORNO: 0,
  }

  for (const item of itens) {
    contadores[item.prioridade] += 1
    await store.add({
      sessaoId,
      jogadorId: item.jogadorId,
      funcao: item.funcao,
      prioridade: item.prioridade,
      status: item.emQuadra ? 'EM_QUADRA' : 'AGUARDANDO',
      ordem: contadores[item.prioridade],
      grupoOrigem: item.grupoOrigem,
      criadoEm: agora,
      atualizadoEm: agora,
    })
  }

  await tx.done
}


/*
 * Garante que TODO participante presente da sessão exista na fila operacional.
 *
 * Fonte de verdade:
 * - sessao_participantes = quem está presente;
 * - sorteio_linha_inicial / sorteio_goleiros_inicial = origem e ordem iniciais;
 * - partida_jogadores = quem já entrou em quadra alguma vez.
 *
 * Esta rotina não sorteia, não apaga fila existente e não muda decisões esportivas.
 * Ela apenas cria registros que estiverem faltando. Isso torna a fila independente
 * do estado React e permite recuperar corretamente sessões antigas/incompletas.
 */
export async function garantirFilaOperacionalCompletaDaSessao(
  sessaoId: number,
): Promise<void> {
  const db = await obterBanco()

  const [participantes, filaExistente, sorteioLinha, sorteioGoleiros, partidas] =
    await Promise.all([
      db.getAllFromIndex('sessao_participantes', 'por-sessao', sessaoId),
      db.getAllFromIndex('fila_operacional', 'por-sessao', sessaoId),
      db.getAllFromIndex('sorteio_linha_inicial', 'por-sessao', sessaoId),
      db.getAllFromIndex('sorteio_goleiros_inicial', 'por-sessao', sessaoId),
      db.getAllFromIndex('partidas', 'por-sessao', sessaoId),
    ])

  const presentes = participantes.filter((item) => item.presente)
  const idsExistentes = new Set(filaExistente.map((item) => item.jogadorId))

  if (presentes.every((item) => idsExistentes.has(item.jogadorId))) return

  const linhaPorJogador = new Map(
    sorteioLinha.map((item) => [item.jogadorId, item]),
  )
  const goleiroPorJogador = new Map(
    sorteioGoleiros.map((item) => [item.jogadorId, item]),
  )

  // Histórico real: quem já apareceu em qualquer partida da sessão já jogou.
  const idsQueJaJogaram = new Set<number>()
  for (const partida of partidas) {
    if (!partida.id) continue
    const jogadores = await db.getAllFromIndex(
      'partida_jogadores',
      'por-partida',
      partida.id,
    )
    jogadores.forEach((item) => idsQueJaJogaram.add(item.jogadorId))
  }

  const partidaAtual = partidas
    .filter((item) => item.status === 'EM_ANDAMENTO' && item.id !== undefined)
    .sort((a, b) => b.numero - a.numero)[0]

  const idsEmQuadra = new Set<number>()
  if (partidaAtual?.id) {
    const jogadores = await db.getAllFromIndex(
      'partida_jogadores',
      'por-partida',
      partidaAtual.id,
    )
    jogadores.forEach((item) => idsEmQuadra.add(item.jogadorId))
  }

  const maiorOrdem: Record<PrioridadeFilaOperacional, number> = {
    NAO_JOGOU: filaExistente
      .filter((item) => item.prioridade === 'NAO_JOGOU')
      .reduce((maior, item) => Math.max(maior, item.ordem), 0),
    CHEGADA_ATRASADA: filaExistente
      .filter((item) => item.prioridade === 'CHEGADA_ATRASADA')
      .reduce((maior, item) => Math.max(maior, item.ordem), 0),
    RETORNO: filaExistente
      .filter((item) => item.prioridade === 'RETORNO')
      .reduce((maior, item) => Math.max(maior, item.ordem), 0),
  }

  const faltantes = presentes
    .filter((item) => !idsExistentes.has(item.jogadorId))
    .sort((a, b) => {
      const linhaA = linhaPorJogador.get(a.jogadorId)?.numeroSorteado
      const linhaB = linhaPorJogador.get(b.jogadorId)?.numeroSorteado
      const golA = goleiroPorJogador.get(a.jogadorId)?.ordem
      const golB = goleiroPorJogador.get(b.jogadorId)?.ordem
      const ordemA = linhaA ?? golA ?? a.ordemChegada ?? Number.MAX_SAFE_INTEGER
      const ordemB = linhaB ?? golB ?? b.ordemChegada ?? Number.MAX_SAFE_INTEGER
      return ordemA - ordemB
    })

  const agora = new Date().toISOString()
  const tx = db.transaction('fila_operacional', 'readwrite')
  const store = tx.objectStore('fila_operacional')

  for (const participante of faltantes) {
    const sorteioLinhaJogador = linhaPorJogador.get(participante.jogadorId)
    const sorteioGoleiroJogador = goleiroPorJogador.get(participante.jogadorId)
    const jaJogou = idsQueJaJogaram.has(participante.jogadorId)

    let prioridade: PrioridadeFilaOperacional
    if (jaJogou) {
      prioridade = 'RETORNO'
    } else if (participante.chegouAtrasado) {
      prioridade = 'CHEGADA_ATRASADA'
    } else {
      prioridade = 'NAO_JOGOU'
    }

    maiorOrdem[prioridade] += 1

    await store.add({
      sessaoId,
      jogadorId: participante.jogadorId,
      funcao: participante.tipoSessao,
      prioridade,
      status: idsEmQuadra.has(participante.jogadorId)
        ? 'EM_QUADRA'
        : 'AGUARDANDO',
      ordem: maiorOrdem[prioridade],
      grupoOrigem:
        sorteioLinhaJogador?.grupo ?? sorteioGoleiroJogador?.ordem,
      criadoEm: agora,
      atualizadoEm: agora,
    })
  }

  await tx.done
}

/*
 * Sincroniza quem está efetivamente na quadra e quem está aguardando.
 * Atletas que saem de uma partida passam para RETORNO, no fim dessa prioridade.
 * Atletas que entram mantêm o registro e passam para EM_QUADRA.
 */
export async function sincronizarFilaComPartida(
  sessaoId: number,
  jogadoresEmQuadra: Array<{
    jogadorId: number
    funcao: TipoJogador
    grupoOrigem?: number
  }>,
): Promise<void> {
  const db = await obterBanco()
  const tx = db.transaction('fila_operacional', 'readwrite')
  const store = tx.objectStore('fila_operacional')
  const indiceJogador = store.index('por-sessao-jogador')
  const indiceSessao = store.index('por-sessao')
  const existentes = await indiceSessao.getAll(sessaoId)
  const idsQuadra = new Set(jogadoresEmQuadra.map((item) => item.jogadorId))
  const agora = new Date().toISOString()

  let maiorRetorno = existentes
    .filter((item) => item.prioridade === 'RETORNO')
    .reduce((maior, item) => Math.max(maior, item.ordem), 0)

  for (const existente of existentes) {
    const estaNaQuadra = idsQuadra.has(existente.jogadorId)

    if (estaNaQuadra) {
      if (existente.status !== 'EM_QUADRA') {
        await store.put({
          ...existente,
          status: 'EM_QUADRA',
          atualizadoEm: agora,
        })
      }
      continue
    }

    // Quem estava em quadra e saiu volta oficialmente no fim da fila de retorno.
    if (existente.status === 'EM_QUADRA') {
      maiorRetorno += 1
      await store.put({
        ...existente,
        status: 'AGUARDANDO',
        prioridade: 'RETORNO',
        ordem: maiorRetorno,
        atualizadoEm: agora,
      })
    }
  }

  // Segurança para atleta que entrou em quadra sem registro anterior na fila.
  for (const atleta of jogadoresEmQuadra) {
    const existente = await indiceJogador.get([sessaoId, atleta.jogadorId])
    if (existente) continue

    await store.add({
      sessaoId,
      jogadorId: atleta.jogadorId,
      funcao: atleta.funcao,
      prioridade: 'NAO_JOGOU',
      status: 'EM_QUADRA',
      ordem: 0,
      grupoOrigem: atleta.grupoOrigem,
      criadoEm: agora,
      atualizadoEm: agora,
    })
  }

  await tx.done
}

/*
 * Chegada atrasada entra depois de todos que ainda não jogaram e antes dos
 * retornos. Se já existir, apenas atualiza sua posição/status.
 */
export async function incluirChegadaAtrasadaNaFila(
  sessaoId: number,
  jogadorId: number,
  funcao: TipoJogador,
): Promise<void> {
  const db = await obterBanco()
  const tx = db.transaction('fila_operacional', 'readwrite')
  const store = tx.objectStore('fila_operacional')
  const indiceJogador = store.index('por-sessao-jogador')
  const existentes = await store.index('por-sessao').getAll(sessaoId)
  const atual = await indiceJogador.get([sessaoId, jogadorId])
  const agora = new Date().toISOString()

  const proximaOrdem =
    existentes
      .filter((item) => item.prioridade === 'CHEGADA_ATRASADA')
      .reduce((maior, item) => Math.max(maior, item.ordem), 0) + 1

  if (atual) {
    await store.put({
      ...atual,
      funcao,
      prioridade: 'CHEGADA_ATRASADA',
      status: 'AGUARDANDO',
      ordem: proximaOrdem,
      atualizadoEm: agora,
    })
  } else {
    await store.add({
      sessaoId,
      jogadorId,
      funcao,
      prioridade: 'CHEGADA_ATRASADA',
      status: 'AGUARDANDO',
      ordem: proximaOrdem,
      criadoEm: agora,
      atualizadoEm: agora,
    })
  }

  await tx.done
}



/*
 * Retorna o próximo GRUPO completo que está aguardando na fila operacional.
 *
 * Importante: não usa número da partida nem "grupo + 1".
 * A prioridade vem da fila persistida:
 * NAO_JOGOU -> CHEGADA_ATRASADA -> RETORNO.
 *
 * Nesta fase da aplicação, a formação continua respeitando os grupos do
 * sorteio inicial. A fila individual será usada depois para recompor times.
 */
export async function buscarProximoGrupoCompletoFilaOperacional(
  sessaoId: number,
  quantidadeLinha: number,
): Promise<number | undefined> {
  const fila = await listarFilaOperacional(sessaoId)

  const linhasAguardando = fila.filter(
    (item) =>
      item.status === 'AGUARDANDO' &&
      item.funcao === 'LINHA' &&
      item.grupoOrigem !== undefined,
  )

  const grupos = new Map<
    number,
    { quantidade: number; primeiraPosicao: number }
  >()

  for (let indice = 0; indice < linhasAguardando.length; indice += 1) {
    const item = linhasAguardando[indice]
    const grupo = item.grupoOrigem!
    const atual = grupos.get(grupo)

    if (!atual) {
      grupos.set(grupo, { quantidade: 1, primeiraPosicao: indice })
    } else {
      atual.quantidade += 1
    }
  }

  return Array.from(grupos.entries())
    .filter(([, dados]) => dados.quantidade >= quantidadeLinha)
    .sort((a, b) => a[1].primeiraPosicao - b[1].primeiraPosicao)[0]?.[0]
}

/*
 * Quando dois times saem juntos depois de um empate, ambos entram na fila no
 * mesmo momento. A tampinha define a ordem entre eles.
 *
 * Retornos que já estavam aguardando NÃO perdem a vez. Exemplo:
 * Grupo 2 já aguardava; Grupos 1 e 3 empatam e saem.
 * A ordem fica: Grupo 2 -> vencedor da tampinha -> perdedor da tampinha.
 */
export async function ordenarRetornosDoEmpateNaFila(
  sessaoId: number,
  grupoVencedorTampinha: number,
  grupoPerdedorTampinha: number,
): Promise<void> {
  if (grupoVencedorTampinha === grupoPerdedorTampinha) return

  const db = await obterBanco()
  const tx = db.transaction('fila_operacional', 'readwrite')
  const store = tx.objectStore('fila_operacional')
  const itens = await store.index('por-sessao').getAll(sessaoId)

  const retornosAguardando = itens
    .filter(
      (item) =>
        item.status === 'AGUARDANDO' &&
        item.prioridade === 'RETORNO',
    )
    .sort((a, b) => a.ordem - b.ordem)

  const gruposEmpate = new Set([
    grupoVencedorTampinha,
    grupoPerdedorTampinha,
  ])

  // Mantém na frente todos os retornos que já aguardavam antes do empate.
  const anteriores = retornosAguardando.filter(
    (item) =>
      item.grupoOrigem === undefined ||
      !gruposEmpate.has(item.grupoOrigem),
  )

  const vencedor = retornosAguardando.filter(
    (item) => item.grupoOrigem === grupoVencedorTampinha,
  )
  const perdedor = retornosAguardando.filter(
    (item) => item.grupoOrigem === grupoPerdedorTampinha,
  )

  let ordem = 0
  const agora = new Date().toISOString()

  for (const item of [...anteriores, ...vencedor, ...perdedor]) {
    ordem += 1
    await store.put({
      ...item,
      ordem,
      atualizadoEm: agora,
    })
  }

  await tx.done
}


/*
 * Reconstrói a ordem dos GRUPOS pela história oficial das partidas.
 *
 * Por que existe:
 * sessões iniciadas antes da fila operacional podem ter uma fila local
 * incompleta. O histórico de partidas + tampinhas é a fonte confiável.
 *
 * Exemplo:
 * 1x2 -> 1x3 (empate) -> 4x5
 * fila reconstruída após 4x5:
 * 2 -> vencedor tampinha(1/3) -> perdedor tampinha(1/3) -> perdedor(4/5)
 */
export async function reconstruirOrdemGruposPeloHistorico(
  sessaoId: number,
  gruposIniciais: number[],
): Promise<number[]> {
  const db = await obterBanco()
  const partidas = (
    await db.getAllFromIndex('partidas', 'por-sessao', sessaoId)
  ).sort((a, b) => a.numero - b.numero)

  if (partidas.length === 0) return [...gruposIniciais].sort((a, b) => a - b)

  const gruposPorPartida = new Map<number, number[]>()

  for (const partida of partidas) {
    if (!partida.id) continue
    const times = await db.getAllFromIndex(
      'partida_times',
      'por-partida',
      partida.id,
    )
    gruposPorPartida.set(
      partida.id,
      times
        .map((time) => time.grupoOrigem)
        .filter((grupo): grupo is number => grupo !== undefined),
    )
  }

  const primeira = partidas[0]
  const gruposPrimeira = new Set(
    primeira.id ? gruposPorPartida.get(primeira.id) ?? [] : [],
  )

  // No início, todos que não estão na primeira partida aguardam pela 1ª chance.
  const fila = [...gruposIniciais]
    .filter((grupo) => !gruposPrimeira.has(grupo))
    .sort((a, b) => a - b)

  const removerDaFila = (grupo: number) => {
    const indice = fila.indexOf(grupo)
    if (indice >= 0) fila.splice(indice, 1)
  }

  const adicionarNoFim = (grupo: number) => {
    removerDaFila(grupo)
    fila.push(grupo)
  }

  for (let indice = 0; indice < partidas.length; indice += 1) {
    const atual = partidas[indice]
    if (!atual.id) continue

    const gruposAtual = gruposPorPartida.get(atual.id) ?? []
    const proxima = partidas[indice + 1]

    if (proxima?.id) {
      const gruposProxima = gruposPorPartida.get(proxima.id) ?? []

      // Quem entra na próxima partida deixa de aguardar.
      for (const grupo of gruposProxima) removerDaFila(grupo)

      const sairam = gruposAtual.filter(
        (grupo) => !gruposProxima.includes(grupo),
      )

      if (sairam.length === 2 && atual.resultado === 'EMPATE') {
        const tampinha = await db.getFromIndex(
          'tampinhas_empate',
          'por-partida',
          atual.id,
        )

        if (tampinha) {
          const times = await db.getAllFromIndex(
            'partida_times',
            'por-partida',
            atual.id,
          )
          const vencedor = times.find(
            (time) => time.lado === tampinha.ladoVencedor,
          )?.grupoOrigem
          const perdedor = times.find(
            (time) => time.lado === tampinha.ladoPerdedor,
          )?.grupoOrigem

          if (vencedor !== undefined) adicionarNoFim(vencedor)
          if (perdedor !== undefined) adicionarNoFim(perdedor)
          continue
        }
      }

      // Saída normal: quem saiu entra no fim, preservando retornos anteriores.
      for (const grupo of sairam) adicionarNoFim(grupo)
      continue
    }

    /*
     * Última partida já finalizada e ainda sem sucessora:
     * em vitória/derrota, o perdedor acabou de voltar para o fim da fila.
     * O vencedor permanece e não entra na fila.
     */
    if (
      atual.status === 'FINALIZADA' &&
      atual.resultado !== 'EMPATE' &&
      atual.ladoPerdedor
    ) {
      const times = await db.getAllFromIndex(
        'partida_times',
        'por-partida',
        atual.id,
      )
      const grupoPerdedor = times.find(
        (time) => time.lado === atual.ladoPerdedor,
      )?.grupoOrigem

      if (grupoPerdedor !== undefined) adicionarNoFim(grupoPerdedor)
    }
  }

  return fila
}


export type FormacaoFilaOperacional = {
  grupo: number
  jogadoresLinhaIds: number[]
  goleiroId?: number
  prioridade: PrioridadeFilaOperacional
  primeiraPosicao: number
}

export type ResultadoOrganizacaoChegada = {
  tipo: TipoJogador
  grupoDestino?: number
  cascata: TampinhaSubstituicaoDB[]
  aguardando: boolean
}

/*
 * Converte a fila individual em formações atuais. Diferente do sorteio inicial,
 * grupoOrigem aqui pode mudar: depois de atrasados/tampinhas ele representa a
 * formação operacional que existe AGORA.
 */
export async function listarFormacoesFilaOperacional(
  sessaoId: number,
): Promise<FormacaoFilaOperacional[]> {
  const fila = await listarFilaOperacional(sessaoId)
  const aguardando = fila.filter((item) => item.status === 'AGUARDANDO')
  const grupos = new Map<number, FormacaoFilaOperacional>()

  for (let posicao = 0; posicao < aguardando.length; posicao += 1) {
    const item = aguardando[posicao]
    if (item.grupoOrigem === undefined) continue

    let formacao = grupos.get(item.grupoOrigem)
    if (!formacao) {
      formacao = {
        grupo: item.grupoOrigem,
        jogadoresLinhaIds: [],
        prioridade: item.prioridade,
        primeiraPosicao: posicao,
      }
      grupos.set(item.grupoOrigem, formacao)
    }

    if (item.funcao === 'GOLEIRO') formacao.goleiroId = item.jogadorId
    else formacao.jogadoresLinhaIds.push(item.jogadorId)
  }

  return Array.from(grupos.values()).sort(
    (a, b) => a.primeiraPosicao - b.primeiraPosicao,
  )
}

function sortearNumerosUnicos(total: number, quantidade: number): number[] {
  const disponiveis = Array.from({ length: total }, (_, i) => i + 1)
  const resultado: number[] = []
  while (resultado.length < quantidade && disponiveis.length > 0) {
    const indice = Math.floor(Math.random() * disponiveis.length)
    resultado.push(disponiveis.splice(indice, 1)[0])
  }
  return resultado
}

/*
 * Organiza UMA chegada atrasada e suporta qualquer quantidade porque a tela
 * chama esta função a cada inclusão, preservando a ordem de chegada.
 *
 * LINHA:
 * 1) completa a primeira formação incompleta;
 * 2) se chegar na zona de retornos, entra no primeiro retorno completo e
 *    desloca um atleta por tampinha; o deslocado tenta o retorno seguinte,
 *    criando o efeito cascata;
 * 3) ao fim da cascata, inicia/continua uma nova formação.
 *
 * GOLEIRO:
 * 1) completa o primeiro time aguardando sem goleiro;
 * 2) se todos possuem goleiro, aguarda. A ordenação da fila garante que quem
 *    nunca jogou não é ultrapassado e que o atrasado fica antes dos retornos.
 */
export async function organizarChegadaAtrasadaNaFila(
  sessaoId: number,
  jogadorId: number,
  funcao: TipoJogador,
  quantidadeLinha: number,
  totalParticipantes: number,
  menorNumeroSai: boolean,
): Promise<ResultadoOrganizacaoChegada> {
  await incluirChegadaAtrasadaNaFila(sessaoId, jogadorId, funcao)

  const db = await obterBanco()
  const tx = db.transaction('fila_operacional', 'readwrite')
  const filaStore = tx.objectStore('fila_operacional')
  const indiceJogador = filaStore.index('por-sessao-jogador')
  const todos = await filaStore.index('por-sessao').getAll(sessaoId)
  const agora = new Date().toISOString()

  const peso = (p: PrioridadeFilaOperacional) => PESO_PRIORIDADE_FILA[p]
  const ordenados = [...todos].sort((a, b) => {
    const d = peso(a.prioridade) - peso(b.prioridade)
    if (d !== 0) return d
    if (a.ordem !== b.ordem) return a.ordem - b.ordem
    return (a.id ?? 0) - (b.id ?? 0)
  })

  const atual = await indiceJogador.get([sessaoId, jogadorId])
  if (!atual) throw new Error('Chegada atrasada não foi encontrada na fila.')

  /*
   * LINHA — REGRA GENÉRICA PARA N ATRASADOS
   * ----------------------------------------
   * Não fazemos tampinha individual no momento de cada cadastro.
   *
   * Motivo: se três atletas chegam em sequência, sortear a cada inclusão
   * espalharia um atleta por time. Os atrasados que AINDA NÃO JOGARAM precisam
   * permanecer como um bloco prioritário. A normalização V13 monta blocos com
   * `quantidadeLinha` atletas e, se o último bloco ficar parcial, retira de UMA
   * mesma formação de retorno apenas a quantidade necessária por tampinha.
   *
   * Portanto funciona para 1, 2, 3, 10... chegadas e também se a configuração
   * do time mudar de 4 para qualquer outra quantidade de jogadores de linha.
   * Assim que o atleta jogar e sair da quadra, sincronizarFilaComPartida()
   * converte sua prioridade para RETORNO e ele deixa automaticamente deste bloco.
   */
  if (funcao === 'LINHA') {
    await filaStore.put({
      ...atual,
      grupoOrigem: undefined,
      prioridade: 'CHEGADA_ATRASADA',
      status: 'AGUARDANDO',
      atualizadoEm: agora,
    })
    await tx.done

    // Os parâmetros permanecem na assinatura porque a normalização esportiva
    // usa esses valores logo depois; evitamos regras duplicadas nesta função.
    void quantidadeLinha
    void totalParticipantes
    void menorNumeroSai

    return {
      tipo: funcao,
      cascata: [],
      aguardando: true,
    }
  }

  /*
   * GOLEIRO continua com a regra própria: completa o primeiro time aguardando
   * sem goleiro. Se todos já possuem goleiro, ultrapassa somente goleiro de
   * RETORNO; quem ainda não jogou conserva a prioridade.
   */
  const grupos = new Map<number, FilaOperacionalDB[]>()
  for (const item of ordenados) {
    if (item.status !== 'AGUARDANDO' || item.grupoOrigem === undefined) continue
    const lista = grupos.get(item.grupoOrigem) ?? []
    lista.push(item)
    grupos.set(item.grupoOrigem, lista)
  }

  const ordemGrupos = Array.from(grupos.entries())
    .map(([grupo, itens]) => ({
      grupo,
      itens,
      primeiraPosicao: Math.min(...itens.map((i) => ordenados.indexOf(i))),
    }))
    .sort((a, b) => a.primeiraPosicao - b.primeiraPosicao)

  const destino = ordemGrupos.find(({ itens }) => {
    const linhas = itens.filter((i) => i.funcao === 'LINHA').length
    const temGoleiro = itens.some((i) => i.funcao === 'GOLEIRO')
    return linhas > 0 && !temGoleiro
  })

  if (destino) {
    await filaStore.put({
      ...atual,
      grupoOrigem: destino.grupo,
      atualizadoEm: agora,
    })
    await tx.done
    return {
      tipo: funcao,
      grupoDestino: destino.grupo,
      cascata: [],
      aguardando: false,
    }
  }

  const primeiroComGoleiroRetorno = ordemGrupos.find(({ itens }) =>
    itens.some(
      (i) => i.funcao === 'GOLEIRO' && i.prioridade === 'RETORNO',
    ),
  )

  if (primeiroComGoleiroRetorno) {
    const goleiroRetorno = primeiroComGoleiroRetorno.itens.find(
      (i) => i.funcao === 'GOLEIRO' && i.prioridade === 'RETORNO',
    )!
    await filaStore.put({
      ...goleiroRetorno,
      grupoOrigem: undefined,
      atualizadoEm: agora,
    })
    await filaStore.put({
      ...atual,
      grupoOrigem: primeiroComGoleiroRetorno.grupo,
      atualizadoEm: agora,
    })
    await tx.done
    return {
      tipo: funcao,
      grupoDestino: primeiroComGoleiroRetorno.grupo,
      cascata: [],
      aguardando: false,
    }
  }

  await tx.done
  return { tipo: funcao, cascata: [], aguardando: true }
}

export type ResultadoPreparacaoEmpateOperacional = {
  cascata: TampinhaSubstituicaoDB[]
  fila: FilaOperacionalDB[]
}


/*
 * Reconcilia uma cascata que ficou pendente porque a próxima formação ainda
 * estava marcada como EM_QUADRA quando o atrasado chegou.
 *
 * É idempotente: só trabalha com atletas que estão em formações temporárias
 * criadas no fim de uma cascata anterior e que possuem histórico de tampinha.
 * Não refaz a tampinha já gravada; apenas continua do ponto onde ela parou.
 */
export async function reconciliarCascataPendenteAposEmpate(
  sessaoId: number,
  gruposIniciais: number[],
  quantidadeLinha: number,
  totalParticipantes: number,
  menorNumeroSai: boolean,
): Promise<ResultadoPreparacaoEmpateOperacional> {
  const db = await obterBanco()
  const ultima = await buscarUltimaPartidaCompletaDaSessao(sessaoId)

  if (
    !ultima?.partida.id ||
    ultima.partida.status !== 'FINALIZADA' ||
    ultima.partida.resultado !== 'EMPATE'
  ) {
    return { cascata: [], fila: await listarFilaOperacional(sessaoId) }
  }

  const tampinhaEmpate = await buscarTampinhaEmpate(ultima.partida.id)
  if (!tampinhaEmpate) {
    return { cascata: [], fila: await listarFilaOperacional(sessaoId) }
  }

  const maxGrupoInicial = gruposIniciais.reduce(
    (maior, grupo) => Math.max(maior, grupo),
    0,
  )
  if (maxGrupoInicial <= 0) {
    return { cascata: [], fila: await listarFilaOperacional(sessaoId) }
  }

  const tx = db.transaction(
    ['fila_operacional', 'tampinhas_substituicao'],
    'readwrite',
  )
  const filaStore = tx.objectStore('fila_operacional')
  const tampinhasStore = tx.objectStore('tampinhas_substituicao')
  const indiceJogador = filaStore.index('por-sessao-jogador')
  const agora = new Date().toISOString()
  const cascata: TampinhaSubstituicaoDB[] = []

  const peso = (p: PrioridadeFilaOperacional) => PESO_PRIORIDADE_FILA[p]
  const ordenar = (itens: FilaOperacionalDB[]) =>
    [...itens].sort((a, b) => {
      const d = peso(a.prioridade) - peso(b.prioridade)
      if (d !== 0) return d
      if (a.ordem !== b.ordem) return a.ordem - b.ordem
      return (a.id ?? 0) - (b.id ?? 0)
    })

  const historico = await tampinhasStore.index('por-sessao').getAll(sessaoId)
  const todosIniciais = await filaStore.index('por-sessao').getAll(sessaoId)

  // Só é pendência recuperável quando a formação temporária contém alguém
  // que foi jogadorSaindo de uma tampinha já persistida.
  const pendentes = ordenar(todosIniciais).filter((item) =>
    item.funcao === 'LINHA' &&
    item.status === 'AGUARDANDO' &&
    (item.grupoOrigem ?? 0) > maxGrupoInicial &&
    historico.some((registro) => registro.jogadorSaindoId === item.jogadorId),
  )

  for (const pendente of pendentes) {
    let entrandoId = pendente.jogadorId
    const ultimaSaida = [...historico]
      .reverse()
      .find((registro) => registro.jogadorSaindoId === entrandoId)
    if (!ultimaSaida) continue

    // Remove primeiro o rastro temporário. Se a rotina for chamada novamente,
    // este mesmo atleta não será detectado como pendência outra vez.
    await filaStore.put({
      ...pendente,
      grupoOrigem: undefined,
      atualizadoEm: agora,
    })

    const filaAtual = ordenar(
      await filaStore.index('por-sessao').getAll(sessaoId),
    )

    const grupos = new Map<number, FilaOperacionalDB[]>()
    const primeiraPosicao = new Map<number, number>()
    filaAtual.forEach((item, indice) => {
      const grupo = item.grupoOrigem
      if (grupo === undefined || grupo > maxGrupoInicial) return
      const lista = grupos.get(grupo) ?? []
      lista.push(item)
      grupos.set(grupo, lista)
      if (!primeiraPosicao.has(grupo)) primeiraPosicao.set(grupo, indice)
    })

    const ordemFormacoes = Array.from(grupos.keys()).sort(
      (a, b) => (primeiraPosicao.get(a) ?? 0) - (primeiraPosicao.get(b) ?? 0),
    )
    const posicaoOrigem = ordemFormacoes.indexOf(ultimaSaida.grupo)
    const depoisDaOrigem = posicaoOrigem >= 0
      ? ordemFormacoes.slice(posicaoOrigem + 1)
      : ordemFormacoes

    for (const grupoDestino of depoisDaOrigem) {
      const itensGrupo = (
        await filaStore.index('por-sessao').getAll(sessaoId)
      ).filter((item) => item.grupoOrigem === grupoDestino)
      const linhas = itensGrupo.filter((item) => item.funcao === 'LINHA')

      if (linhas.length === 0) continue

      const todosEmQuadra = linhas.every((item) => item.status === 'EM_QUADRA')
      const retornoAguardando = linhas.every(
        (item) => item.status === 'AGUARDANDO' && item.prioridade === 'RETORNO',
      )

      // Nunca tira a primeira oportunidade de uma formação NAO_JOGOU.
      if (!todosEmQuadra && !retornoAguardando) continue

      if (linhas.length < quantidadeLinha) {
        const itemEntrando = await indiceJogador.get([sessaoId, entrandoId])
        if (!itemEntrando) throw new Error('Jogador pendente não encontrado.')
        await filaStore.put({
          ...itemEntrando,
          grupoOrigem: grupoDestino,
          status: 'AGUARDANDO',
          prioridade: 'RETORNO',
          atualizadoEm: agora,
        })
        entrandoId = 0
        break
      }

      const candidatos = linhas.slice(0, quantidadeLinha)
      const numeros = sortearNumerosUnicos(
        Math.max(totalParticipantes, candidatos.length),
        candidatos.length,
      )
      const pares = candidatos.map((item, indice) => ({
        jogadorId: item.jogadorId,
        numero: numeros[indice],
      }))
      const escolhido = [...pares].sort((a, b) =>
        menorNumeroSai ? a.numero - b.numero : b.numero - a.numero,
      )[0]

      const itemEntrando = await indiceJogador.get([sessaoId, entrandoId])
      const itemSaindo = await indiceJogador.get([sessaoId, escolhido.jogadorId])
      if (!itemEntrando || !itemSaindo) {
        throw new Error('Não foi possível reconciliar a cascata pendente.')
      }

      await filaStore.put({
        ...itemEntrando,
        grupoOrigem: grupoDestino,
        status: 'AGUARDANDO',
        prioridade: 'RETORNO',
        atualizadoEm: agora,
      })
      await filaStore.put({
        ...itemSaindo,
        grupoOrigem: undefined,
        status: 'AGUARDANDO',
        prioridade: 'RETORNO',
        atualizadoEm: agora,
      })

      const registro: TampinhaSubstituicaoDB = {
        sessaoId,
        grupo: grupoDestino,
        jogadorEntrandoId: entrandoId,
        jogadorSaindoId: escolhido.jogadorId,
        numeros: pares,
        menorNumeroSai,
        criadoEm: agora,
      }
      const id = await tampinhasStore.add(registro)
      cascata.push({ ...registro, id })
      entrandoId = escolhido.jogadorId
    }

    if (entrandoId !== 0) {
      const itemFinal = await indiceJogador.get([sessaoId, entrandoId])
      if (!itemFinal) throw new Error('Último jogador da reconciliação não encontrado.')
      const filaFinal = await filaStore.index('por-sessao').getAll(sessaoId)
      const maiorGrupo = filaFinal.reduce(
        (maior, item) => Math.max(maior, item.grupoOrigem ?? 0),
        maxGrupoInicial,
      )
      await filaStore.put({
        ...itemFinal,
        grupoOrigem: maiorGrupo + 1,
        status: 'AGUARDANDO',
        prioridade: 'RETORNO',
        atualizadoEm: agora,
      })
    }
  }

  await tx.done
  return { cascata, fila: await listarFilaOperacional(sessaoId) }
}

/*
 * Prepara a fila ANTES de montar a próxima partida de um empate.
 *
 * Por que esta rotina existe:
 * - os dois times que empataram podem sair juntos;
 * - uma chegada atrasada pode ter deixado um atleta deslocado aguardando a
 *   formação que ainda estava EM_QUADRA;
 * - a cascata precisa continuar por quantas formações forem necessárias.
 *
 * A rotina não depende de "grupo + 1". A próxima formação vem da ordem real
 * persistida da fila. Os grupos do sorteio inicial servem apenas para separar
 * formações históricas de formações temporárias criadas pela cascata.
 */
export async function prepararFilaParaRotacaoDeEmpate(
  sessaoId: number,
  grupoVencedorTampinha: number,
  grupoPerdedorTampinha: number,
  gruposIniciais: number[],
  quantidadeLinha: number,
  totalParticipantes: number,
  menorNumeroSai: boolean,
): Promise<ResultadoPreparacaoEmpateOperacional> {
  const db = await obterBanco()

  /*
   * O empate terminou e os dois times sairão. Primeiro devolvemos quem estava
   * em quadra para a fila. Isso torna essas formações elegíveis para a cascata.
   */
  await sincronizarFilaComPartida(sessaoId, [])
  await ordenarRetornosDoEmpateNaFila(
    sessaoId,
    grupoVencedorTampinha,
    grupoPerdedorTampinha,
  )

  const maxGrupoInicial = gruposIniciais.reduce(
    (maior, grupo) => Math.max(maior, grupo),
    0,
  )

  const tx = db.transaction(
    ['fila_operacional', 'tampinhas_substituicao'],
    'readwrite',
  )
  const filaStore = tx.objectStore('fila_operacional')
  const tampinhasStore = tx.objectStore('tampinhas_substituicao')
  const indiceJogador = filaStore.index('por-sessao-jogador')
  const agora = new Date().toISOString()

  const todos = await filaStore.index('por-sessao').getAll(sessaoId)
  const peso = (p: PrioridadeFilaOperacional) => PESO_PRIORIDADE_FILA[p]
  const ordenar = (itens: FilaOperacionalDB[]) =>
    [...itens].sort((a, b) => {
      const d = peso(a.prioridade) - peso(b.prioridade)
      if (d !== 0) return d
      if (a.ordem !== b.ordem) return a.ordem - b.ordem
      return (a.id ?? 0) - (b.id ?? 0)
    })

  const ordenados = ordenar(todos).filter((item) => item.status === 'AGUARDANDO')

  const grupos = new Map<number, FilaOperacionalDB[]>()
  for (const item of ordenados) {
    if (item.grupoOrigem === undefined) continue
    const lista = grupos.get(item.grupoOrigem) ?? []
    lista.push(item)
    grupos.set(item.grupoOrigem, lista)
  }

  /*
   * Formações temporárias acima do maior grupo do sorteio são o "rastro" de
   * uma cascata que não conseguiu enxergar um time ainda em quadra.
   * Elas serão absorvidas novamente pela fila real agora que o empate acabou.
   */
  const pendentes = Array.from(grupos.entries())
    .filter(([grupo, itens]) =>
      grupo > maxGrupoInicial &&
      itens.some((item) => item.funcao === 'LINHA'),
    )
    .sort((a, b) => a[0] - b[0])

  const cascata: TampinhaSubstituicaoDB[] = []

  for (const [grupoTemporario, itensTemporarios] of pendentes) {
    const linhasPendentes = itensTemporarios.filter((item) => item.funcao === 'LINHA')

    for (const pendenteOriginal of linhasPendentes) {
      let entrandoId = pendenteOriginal.jogadorId

      /*
       * Descobrimos de qual formação este atleta foi deslocado pela última
       * tampinha. Assim continuamos exatamente da formação seguinte na fila.
       */
      const historico = await tampinhasStore.index('por-sessao').getAll(sessaoId)
      const origem = [...historico]
        .reverse()
        .find((registro) => registro.jogadorSaindoId === entrandoId)?.grupo

      const filaAtual = ordenar(
        await filaStore.index('por-sessao').getAll(sessaoId),
      ).filter((item) => item.status === 'AGUARDANDO')

      const ordemGruposReais = Array.from(
        new Set(
          filaAtual
            .map((item) => item.grupoOrigem)
            .filter(
              (grupo): grupo is number =>
                grupo !== undefined && grupo <= maxGrupoInicial,
            ),
        ),
      )

      let inicio = origem !== undefined ? ordemGruposReais.indexOf(origem) + 1 : 0
      if (inicio < 0) inicio = 0

      // Retira o atleta da formação temporária antes de iniciar a propagação.
      const itemPendente = await indiceJogador.get([sessaoId, entrandoId])
      if (itemPendente) {
        await filaStore.put({
          ...itemPendente,
          grupoOrigem: undefined,
          atualizadoEm: agora,
        })
      }

      for (let indice = inicio; indice < ordemGruposReais.length; indice += 1) {
        const grupoDestino = ordemGruposReais[indice]
        const itensGrupo = (
          await filaStore.index('por-sessao').getAll(sessaoId)
        ).filter(
          (item) =>
            item.status === 'AGUARDANDO' &&
            item.grupoOrigem === grupoDestino,
        )
        const linhas = itensGrupo.filter((item) => item.funcao === 'LINHA')

        if (linhas.length < quantidadeLinha) {
          const itemEntrando = await indiceJogador.get([sessaoId, entrandoId])
          if (!itemEntrando) throw new Error('Jogador da cascata não encontrado.')
          await filaStore.put({
            ...itemEntrando,
            grupoOrigem: grupoDestino,
            prioridade: 'RETORNO',
            atualizadoEm: agora,
          })
          entrandoId = 0
          break
        }

        const candidatos = linhas.slice(0, quantidadeLinha)
        const numeros = sortearNumerosUnicos(
          Math.max(totalParticipantes, candidatos.length),
          candidatos.length,
        )
        const pares = candidatos.map((item, posicao) => ({
          jogadorId: item.jogadorId,
          numero: numeros[posicao],
        }))
        const escolhido = [...pares].sort((a, b) =>
          menorNumeroSai ? a.numero - b.numero : b.numero - a.numero,
        )[0]

        const itemEntrando = await indiceJogador.get([sessaoId, entrandoId])
        const itemSaindo = await indiceJogador.get([
          sessaoId,
          escolhido.jogadorId,
        ])
        if (!itemEntrando || !itemSaindo) {
          throw new Error('Não foi possível continuar a cascata operacional.')
        }

        await filaStore.put({
          ...itemEntrando,
          grupoOrigem: grupoDestino,
          prioridade: 'RETORNO',
          atualizadoEm: agora,
        })
        await filaStore.put({
          ...itemSaindo,
          grupoOrigem: undefined,
          prioridade: 'RETORNO',
          atualizadoEm: agora,
        })

        const registro: TampinhaSubstituicaoDB = {
          sessaoId,
          grupo: grupoDestino,
          jogadorEntrandoId: entrandoId,
          jogadorSaindoId: escolhido.jogadorId,
          numeros: pares,
          menorNumeroSai,
          criadoEm: agora,
        }
        const id = await tampinhasStore.add(registro)
        cascata.push({ ...registro, id })
        entrandoId = escolhido.jogadorId
      }

      /*
       * Se atravessou todas as formações cheias, o último deslocado fica no
       * fim da fila em uma formação temporária. Não há novo sorteio até surgir
       * outra formação elegível ou uma nova chegada.
       */
      if (entrandoId !== 0) {
        const itemFinal = await indiceJogador.get([sessaoId, entrandoId])
        if (!itemFinal) throw new Error('Último jogador da cascata não encontrado.')

        const filaFinal = await filaStore.index('por-sessao').getAll(sessaoId)
        const maiorGrupo = filaFinal.reduce(
          (maior, item) => Math.max(maior, item.grupoOrigem ?? 0),
          maxGrupoInicial,
        )
        const grupoFinal = Math.max(maiorGrupo, grupoTemporario)

        await filaStore.put({
          ...itemFinal,
          grupoOrigem: grupoFinal,
          prioridade: 'RETORNO',
          atualizadoEm: agora,
        })
      }
    }
  }

  await tx.done
  return {
    cascata,
    fila: await listarFilaOperacional(sessaoId),
  }
}


// ============================================================================
// MOTOR OPERACIONAL V13
// ============================================================================

export type FormacaoOperacionalCompletaV13 = {
  formacao: FormacaoOperacionalDB
  membros: FormacaoOperacionalMembroDB[]
}

export type ResultadoReconstrucaoOperacionalV13 = {
  formacoes: FormacaoOperacionalCompletaV13[]
  jogadoresSemFormacao: number[]
}

/*
 * Reconstrói as formações atuais a partir do estado persistido e do histórico
 * das tampinhas. O histórico de sorteios tem precedência sobre grupoOrigem:
 * se A entrou no grupo X e B saiu, A pertence a X e B segue deslocado até
 * aparecer como "entrando" numa etapa posterior da cascata.
 *
 * Esta rotina NÃO sorteia novamente. Portanto pode ser executada após F5 sem
 * alterar números ou repetir uma decisão esportiva já tomada.
 */

export type DiagnosticoFilaV13 = {
  totalFila: number
  linhaFila: number
  goleirosFila: number
  aguardandoFila: number
  jogadoresPartidaAtual: number
  linhaPartidaAtual: number
  goleirosPartidaAtual: number
  formacoesPersistidas: number
  membrosFormacoesPersistidas: number
  gruposAguardando: Array<{
    grupo: number
    linhas: number
    goleiros: number
  }>
}

export async function diagnosticarFilaOperacionalV13(
  sessaoId: number,
): Promise<DiagnosticoFilaV13> {
  const db = await obterBanco()
  const [fila, partidaAtual, formacoes] = await Promise.all([
    db.getAllFromIndex('fila_operacional', 'por-sessao', sessaoId),
    buscarPartidaEmAndamentoCompleta(sessaoId),
    db.getAllFromIndex('formacoes_operacionais', 'por-sessao', sessaoId),
  ])

  let membrosPersistidos = 0
  for (const formacao of formacoes) {
    if (!formacao.id) continue
    membrosPersistidos += (
      await db.getAllFromIndex(
        'formacao_operacional_membros',
        'por-formacao',
        formacao.id,
      )
    ).length
  }

  const idsQuadra = new Set(
    partidaAtual?.jogadores.map((item) => item.jogadorId) ?? [],
  )
  const mapa = new Map<number, { grupo: number; linhas: number; goleiros: number }>()

  for (const item of fila) {
    if (idsQuadra.has(item.jogadorId)) continue
    const grupo = item.grupoOrigem ?? -1
    const atual = mapa.get(grupo) ?? { grupo, linhas: 0, goleiros: 0 }
    if (item.funcao === 'LINHA') atual.linhas += 1
    else atual.goleiros += 1
    mapa.set(grupo, atual)
  }

  return {
    totalFila: fila.length,
    linhaFila: fila.filter((item) => item.funcao === 'LINHA').length,
    goleirosFila: fila.filter((item) => item.funcao === 'GOLEIRO').length,
    aguardandoFila: fila.filter((item) => !idsQuadra.has(item.jogadorId)).length,
    jogadoresPartidaAtual: partidaAtual?.jogadores.length ?? 0,
    linhaPartidaAtual:
      partidaAtual?.jogadores.filter((item) => item.funcao === 'LINHA').length ?? 0,
    goleirosPartidaAtual:
      partidaAtual?.jogadores.filter((item) => item.funcao === 'GOLEIRO').length ?? 0,
    formacoesPersistidas: formacoes.length,
    membrosFormacoesPersistidas: membrosPersistidos,
    gruposAguardando: [...mapa.values()].sort((a, b) => a.grupo - b.grupo),
  }
}

export async function reconstruirFormacoesOperacionaisV13(
  sessaoId: number,
  quantidadeLinha: number,
): Promise<ResultadoReconstrucaoOperacionalV13> {
  if (quantidadeLinha <= 0) {
    throw new Error('Quantidade de jogadores de linha deve ser maior que zero.')
  }

  const db = await obterBanco()
  const agora = new Date().toISOString()

  /*
   * FONTE ÚNICA DA ORGANIZAÇÃO
   * --------------------------
   * 1. sessao_participantes garante que ninguém presente desapareça;
   * 2. partida_jogadores da partida EM ANDAMENTO define somente quem está em quadra;
   * 3. fila_operacional define a ordem e a formação de TODOS os demais.
   *
   * A projeção v13 é sempre recriada a partir dessas fontes. Ela não depende
   * da projeção v13 anterior para existir, evitando o caso "nenhum time futuro"
   * durante uma partida em andamento.
   */
  await garantirFilaOperacionalCompletaDaSessao(sessaoId)

  const [filaOriginal, partidaAtual, formacoesAntigas] = await Promise.all([
    db.getAllFromIndex('fila_operacional', 'por-sessao', sessaoId),
    buscarPartidaEmAndamentoCompleta(sessaoId),
    db.getAllFromIndex('formacoes_operacionais', 'por-sessao', sessaoId),
  ])

  const idsEmQuadra = new Set<number>(
    partidaAtual?.jogadores.map((jogador) => jogador.jogadorId) ?? [],
  )

  const pesoPrioridade = (prioridade: PrioridadeFilaOperacional) =>
    PESO_PRIORIDADE_FILA[prioridade]

  /*
   * A ordem persistida da fila é respeitada. O status antigo NÃO decide quem
   * está em quadra; somente a partida oficial pode fazer isso.
   */
  const filaOrdenada = [...filaOriginal].sort((a, b) => {
    const prioridade =
      pesoPrioridade(a.prioridade) - pesoPrioridade(b.prioridade)
    if (prioridade !== 0) return prioridade
    if (a.ordem !== b.ordem) return a.ordem - b.ordem
    return (a.id ?? 0) - (b.id ?? 0)
  })

  const aguardando = filaOrdenada.filter(
    (item) => !idsEmQuadra.has(item.jogadorId),
  )

  /*
   * Sincroniza somente o status visual/persistido.
   * Quem não está na partida atual obrigatoriamente está AGUARDANDO.
   */
  const txStatus = db.transaction('fila_operacional', 'readwrite')
  const filaStatus = txStatus.objectStore('fila_operacional')
  for (const item of filaOrdenada) {
    const statusCorreto = idsEmQuadra.has(item.jogadorId)
      ? 'EM_QUADRA' as const
      : 'AGUARDANDO' as const

    if (item.status !== statusCorreto) {
      await filaStatus.put({
        ...item,
        status: statusCorreto,
        atualizadoEm: agora,
      })
      item.status = statusCorreto
    }
  }
  await txStatus.done

  type FormacaoMemoria = {
    grupoHistorico?: number
    prioridade: PrioridadeFilaOperacional
    membros: Array<{ jogadorId: number; funcao: TipoJogador }>
    primeiraPosicao: number
  }

  const formacoes: FormacaoMemoria[] = []
  const porGrupo = new Map<number, FormacaoMemoria>()

  /*
   * Reconstrói os times futuros diretamente da fila.
   *
   * grupoOrigem aqui é apenas a composição operacional já persistida pelas
   * tampinhas/cascatas. Se um atleta não possuir grupo, ele entra em uma
   * formação sem grupo e será encaixado pela ordem da fila.
   */
  for (let posicao = 0; posicao < aguardando.length; posicao += 1) {
    const item = aguardando[posicao]
    let destino: FormacaoMemoria | undefined

    /*
     * Jogador de LINHA que chegou atrasado e ainda não jogou NÃO fica preso ao
     * grupo histórico recebido por uma normalização anterior. Todos os atrasados
     * pendentes são reagrupados pela ordem de chegada em blocos de
     * `quantidadeLinha`. Isso torna a regra genérica para qualquer quantidade.
     */
    const reagruparAtrasadoLinha =
      item.funcao === 'LINHA' && item.prioridade === 'CHEGADA_ATRASADA'

    if (item.grupoOrigem !== undefined && !reagruparAtrasadoLinha) {
      destino = porGrupo.get(item.grupoOrigem)
      if (!destino) {
        destino = {
          grupoHistorico: item.grupoOrigem,
          prioridade: item.prioridade,
          membros: [],
          primeiraPosicao: posicao,
        }
        porGrupo.set(item.grupoOrigem, destino)
        formacoes.push(destino)
      }
    } else {
      /*
       * Sem grupo: tenta completar a última formação sem grupo compatível.
       * Isso cobre chegadas/retornos ainda não materializados sem misturar
       * automaticamente times históricos já consolidados.
       */
      destino = [...formacoes]
        .reverse()
        .find((formacao) => {
          if (formacao.grupoHistorico !== undefined) return false
          // Blocos sem grupo só se misturam quando possuem a mesma prioridade.
          // Assim CHEGADA_ATRASADA não é espalhada entre formações de RETORNO.
          if (formacao.prioridade !== item.prioridade) return false
          const linhas = formacao.membros.filter(
            (membro) => membro.funcao === 'LINHA',
          ).length
          const temGoleiro = formacao.membros.some(
            (membro) => membro.funcao === 'GOLEIRO',
          )
          return item.funcao === 'LINHA'
            ? linhas < quantidadeLinha
            : !temGoleiro
        })

      if (!destino) {
        destino = {
          grupoHistorico: undefined,
          prioridade: item.prioridade,
          membros: [],
          primeiraPosicao: posicao,
        }
        formacoes.push(destino)
      }
    }

    /*
     * Nunca excede a capacidade de linha e nunca coloca dois goleiros no mesmo
     * time. Se o grupo histórico estiver cheio, cria uma sobra operacional.
     */
    const linhasDestino = destino.membros.filter(
      (membro) => membro.funcao === 'LINHA',
    ).length
    const temGoleiroDestino = destino.membros.some(
      (membro) => membro.funcao === 'GOLEIRO',
    )

    const semVaga =
      (item.funcao === 'LINHA' && linhasDestino >= quantidadeLinha) ||
      (item.funcao === 'GOLEIRO' && temGoleiroDestino)

    if (semVaga) {
      destino = {
        grupoHistorico: undefined,
        prioridade: item.prioridade,
        membros: [],
        primeiraPosicao: posicao,
      }
      formacoes.push(destino)
    }

    destino.membros.push({
      jogadorId: item.jogadorId,
      funcao: item.funcao,
    })
  }

  const formacoesFinais = formacoes
    .filter((formacao) => formacao.membros.length > 0)
    .sort((a, b) => a.primeiraPosicao - b.primeiraPosicao)

  /*
   * INVARIANTE:
   * todos os atletas presentes na fila precisam estar em exatamente um lugar:
   * quadra atual OU formação futura.
   */
  const idsProjetados = formacoesFinais.flatMap((formacao) =>
    formacao.membros.map((membro) => membro.jogadorId),
  )
  const idsProjetadosUnicos = new Set(idsProjetados)
  const idsFila = new Set(filaOrdenada.map((item) => item.jogadorId))

  const duplicados = idsProjetados.length !== idsProjetadosUnicos.size
  const faltando = [...idsFila].filter(
    (id) => !idsEmQuadra.has(id) && !idsProjetadosUnicos.has(id),
  )
  const indevidos = [...idsProjetadosUnicos].filter(
    (id) => idsEmQuadra.has(id) || !idsFila.has(id),
  )

  if (duplicados || faltando.length > 0 || indevidos.length > 0) {
    throw new Error(
      `Falha de integridade da fila operacional. ` +
        `Aguardando sem formação: ${faltando.length}; ` +
        `duplicados/indevidos: ${duplicados ? 'sim' : indevidos.length}.`,
    )
  }

  const tx = db.transaction(
    [
      'fila_operacional',
      'formacoes_operacionais',
      'formacao_operacional_membros',
    ],
    'readwrite',
  )
  const filaStore = tx.objectStore('fila_operacional')
  const formacoesStore = tx.objectStore('formacoes_operacionais')
  const membrosStore = tx.objectStore('formacao_operacional_membros')

  // A v13 é projeção: apaga somente a projeção anterior, nunca histórico esportivo.
  for (const formacao of formacoesAntigas) {
    if (!formacao.id) continue
    const membrosAntigos = await membrosStore
      .index('por-formacao')
      .getAll(formacao.id)
    for (const membro of membrosAntigos) {
      if (membro.id) await membrosStore.delete(membro.id)
    }
    await formacoesStore.delete(formacao.id)
  }

  const formacoesCriadas: FormacaoOperacionalCompletaV13[] = []
  let proximoGrupoVirtual =
    filaOrdenada.reduce(
      (maior, item) => Math.max(maior, item.grupoOrigem ?? 0),
      0,
    ) + 1

  for (let indice = 0; indice < formacoesFinais.length; indice += 1) {
    const memoria = formacoesFinais[indice]
    const grupoHistorico =
      memoria.grupoHistorico ?? proximoGrupoVirtual++

    const formacao: FormacaoOperacionalDB = {
      sessaoId,
      ordem: indice + 1,
      status: 'AGUARDANDO',
      prioridade: memoria.prioridade,
      grupoHistorico,
      criadoEm: agora,
      atualizadoEm: agora,
    }
    const formacaoId = await formacoesStore.add(formacao)

    const membros: FormacaoOperacionalMembroDB[] = []
    for (let ordem = 0; ordem < memoria.membros.length; ordem += 1) {
      const membroMemoria = memoria.membros[ordem]
      const membro: FormacaoOperacionalMembroDB = {
        sessaoId,
        formacaoId,
        jogadorId: membroMemoria.jogadorId,
        funcao: membroMemoria.funcao,
        ordem: ordem + 1,
        criadoEm: agora,
        atualizadoEm: agora,
      }
      const membroId = await membrosStore.add(membro)
      membros.push({ ...membro, id: membroId })

      const itemFila = filaOrdenada.find(
        (item) => item.jogadorId === membroMemoria.jogadorId,
      )
      if (itemFila) {
        await filaStore.put({
          ...itemFila,
          status: 'AGUARDANDO',
          grupoOrigem: grupoHistorico,
          atualizadoEm: agora,
        })
      }
    }

    formacoesCriadas.push({
      formacao: { ...formacao, id: formacaoId },
      membros,
    })
  }

  await tx.done

  return {
    formacoes: formacoesCriadas,
    jogadoresSemFormacao: [],
  }
}

export type ResultadoNormalizacaoFilaV13 = {
  alterou: boolean
  cascata: TampinhaSubstituicaoDB[]
  formacoes: FormacaoOperacionalCompletaV13[]
}

/*
 * NORMALIZAÇÃO OPERACIONAL V13
 * ----------------------------
 * Resolve uma formação parcial que esteja à frente de times completos.
 *
 * Exemplo:
 *   [Ciro] -> [A B C D] -> [E F G H]
 *
 * vira, após as tampinhas:
 *   [Ciro + 3 do time seguinte] -> [deslocado + 3 do próximo] -> [último deslocado]
 *
 * Regras:
 * - a ordem das formações já persistida é respeitada;
 * - somente uma formação PARCIAL que esteja antes de uma formação COMPLETA
 *   gera cascata;
 * - o jogador que vem da formação anterior tem prioridade e não participa
 *   da tampinha que decide quem sai;
 * - cada tampinha é persistida antes da projeção ser atualizada;
 * - executar novamente com a fila já normalizada não sorteia nada;
 * - goleiros permanecem vinculados à formação em que já estavam;
 * - a última sobra fica no FIM da fila, pronta para receber os próximos retornos.
 */
export async function normalizarFilaOperacionalV13(
  sessaoId: number,
  quantidadeLinha: number,
  totalParticipantes: number,
  menorNumeroSai: boolean,
): Promise<ResultadoNormalizacaoFilaV13> {
  if (quantidadeLinha <= 0) {
    throw new Error('Quantidade de jogadores de linha deve ser maior que zero.')
  }

  // Primeiro garante uma fotografia íntegra e atual de todos os presentes.
  const base = await reconstruirFormacoesOperacionaisV13(
    sessaoId,
    quantidadeLinha,
  )

  const db = await obterBanco()
  const agora = new Date().toISOString()

  type FormacaoTrabalho = {
    formacao: FormacaoOperacionalDB
    membros: Array<{
      jogadorId: number
      funcao: TipoJogador
      ordem: number
    }>
  }

  const trabalho: FormacaoTrabalho[] = base.formacoes
    .filter(({ formacao }) => formacao.status === 'AGUARDANDO')
    .sort((a, b) => a.formacao.ordem - b.formacao.ordem)
    .map(({ formacao, membros }) => ({
      formacao: { ...formacao },
      membros: membros
        .sort((a, b) => a.ordem - b.ordem)
        .map((membro) => ({
          jogadorId: membro.jogadorId,
          funcao: membro.funcao,
          ordem: membro.ordem,
        })),
    }))

  const contarLinha = (f: FormacaoTrabalho) =>
    f.membros.filter((m) => m.funcao === 'LINHA').length

  /*
   * Só existe pendência quando uma formação parcial aparece ANTES de algum
   * time completo. Se a parcial já for a última sobra, a fila está estável.
   */
  const indiceParcial = trabalho.findIndex((formacao, indice) => {
    const linhas = contarLinha(formacao)
    if (linhas <= 0 || linhas >= quantidadeLinha) return false
    return trabalho
      .slice(indice + 1)
      .some((posterior) => contarLinha(posterior) >= quantidadeLinha)
  })

  if (indiceParcial < 0) {
    return {
      alterou: false,
      cascata: [],
      formacoes: base.formacoes,
    }
  }

  const cascata: TampinhaSubstituicaoDB[] = []

  /*
   * CASCATA EM LOTE
   * ---------------
   * A formação parcial é tratada como UM BLOCO prioritário.
   *
   * Exemplo com 4 jogadores por time e 3 atrasados:
   *   [Atrasado1, Atrasado2, Atrasado3] -> [A, B, C, D]
   *
   * Fazemos UMA tampinha entre A/B/C/D. Se menorNumeroSai=true, os 3 menores
   * saem de uma vez e o maior permanece com os 3 atrasados. Os 3 deslocados
   * seguem JUNTOS para a próxima formação, repetindo a mesma regra se preciso.
   *
   * Isso é genérico: o tamanho do lote vem da formação parcial e a capacidade
   * vem de `quantidadeLinha`. Não existem casos especiais para 1, 2, 3, 10...
   */
  const origemParcial = trabalho[indiceParcial]
  let loteEntrando = origemParcial.membros
    .filter((m) => m.funcao === 'LINHA')
    .sort((a, b) => a.ordem - b.ordem)
    .map((m) => m.jogadorId)

  // O bloco sai da formação parcial; goleiro, se houver, permanece nela.
  origemParcial.membros = origemParcial.membros.filter(
    (m) => m.funcao !== 'LINHA',
  )

  for (
    let indice = indiceParcial + 1;
    indice < trabalho.length && loteEntrando.length > 0;
    indice += 1
  ) {
    const destino = trabalho[indice]
    const linhasDestino = destino.membros.filter((m) => m.funcao === 'LINHA')
    // Fotografia dos ocupantes que já estavam aqui antes deste lote chegar.
    const linhasOriginais = [...linhasDestino]
    const vagasLivres = Math.max(0, quantidadeLinha - linhasDestino.length)

    /*
     * Vaga real não exige tampinha. Preenche o máximo possível preservando a
     * ordem do bloco. Se ainda restar gente, o restante continua para frente.
     */
    if (vagasLivres > 0) {
      const entrandoSemSorteio = loteEntrando.splice(0, vagasLivres)
      for (const jogadorId of entrandoSemSorteio) {
        destino.membros.push({
          jogadorId,
          funcao: 'LINHA',
          ordem: destino.membros.length + 1,
        })
      }
      if (loteEntrando.length === 0) break
    }

    const linhasCheias = destino.membros.filter((m) => m.funcao === 'LINHA')
    if (linhasCheias.length < quantidadeLinha || loteEntrando.length === 0) {
      continue
    }

    /*
     * O lote nunca precisa retirar mais atletas do que a capacidade do time.
     * Se houver um lote maior (por configuração/dado legado), consome somente
     * a capacidade nesta formação e o restante continua para a próxima.
     */
    const quantidadeTrocas = Math.min(
      loteEntrando.length,
      linhasOriginais.length,
    )
    const entrandoNesteTime = loteEntrando.splice(0, quantidadeTrocas)

    // UMA tampinha somente entre quem já ocupava este time antes do lote chegar.
    const numeros = sortearNumerosUnicos(
      Math.max(totalParticipantes, linhasOriginais.length),
      linhasOriginais.length,
    )
    const pares = linhasOriginais.map((membro, posicao) => ({
      jogadorId: membro.jogadorId,
      numero: numeros[posicao],
    }))

    const ordenadosParaSaida = [...pares].sort((a, b) =>
      menorNumeroSai ? a.numero - b.numero : b.numero - a.numero,
    )
    const escolhidosParaSair = ordenadosParaSaida.slice(0, quantidadeTrocas)
    const idsSaindo = escolhidosParaSair.map((item) => item.jogadorId)

    /*
     * Substitui exatamente os sorteados. Quem venceu a tampinha permanece.
     * A associação entrando/saindo é determinística apenas para persistir o
     * histórico; esportivamente a decisão é o conjunto de números do sorteio.
     */
    for (let troca = 0; troca < quantidadeTrocas; troca += 1) {
      const jogadorSaindoId = idsSaindo[troca]
      const jogadorEntrandoId = entrandoNesteTime[troca]
      const posicaoSaindo = destino.membros.findIndex(
        (m) => m.funcao === 'LINHA' && m.jogadorId === jogadorSaindoId,
      )
      if (posicaoSaindo < 0) {
        throw new Error(
          'Jogador sorteado para sair não foi encontrado na formação.',
        )
      }

      destino.membros[posicaoSaindo] = {
        jogadorId: jogadorEntrandoId,
        funcao: 'LINHA',
        ordem: destino.membros[posicaoSaindo].ordem,
      }

      const grupoRegistro =
        destino.formacao.grupoHistorico ?? destino.formacao.ordem

      cascata.push({
        sessaoId,
        grupo: grupoRegistro,
        jogadorEntrandoId,
        jogadorSaindoId,
        // Os registros do mesmo time compartilham o MESMO sorteio.
        numeros: pares,
        menorNumeroSai,
        criadoEm: agora,
      })
    }

    /*
     * Os deslocados seguem JUNTOS. Se havia sobra do lote original maior que a
     * capacidade, ela mantém prioridade e vem antes dos recém-deslocados.
     */
    loteEntrando = [...loteEntrando, ...idsSaindo]
  }

  /*
   * Se o bloco atravessou todas as formações, ele vira UMA OU MAIS formações
   * no fim da fila, sempre respeitando `quantidadeLinha`.
   */
  while (loteEntrando.length > 0) {
    const membrosNovoTime = loteEntrando.splice(0, quantidadeLinha)
    trabalho.push({
      formacao: {
        sessaoId,
        ordem: trabalho.length + 1,
        status: 'AGUARDANDO',
        prioridade: 'RETORNO',
        criadoEm: agora,
        atualizadoEm: agora,
      },
      membros: membrosNovoTime.map((jogadorId, posicao) => ({
        jogadorId,
        funcao: 'LINHA' as const,
        ordem: posicao + 1,
      })),
    })
  }

  // Remove formações sem jogadores de linha e sem goleiro.
  const finais = trabalho.filter((f) => f.membros.length > 0)

  /*
   * Persistência atômica: tampinhas + composição final + grupoOrigem de
   * compatibilidade são gravados juntos. Se algo falhar, nada fica pela metade.
   */
  const tx = db.transaction(
    [
      'tampinhas_substituicao',
      'formacoes_operacionais',
      'formacao_operacional_membros',
      'fila_operacional',
    ],
    'readwrite',
  )
  const tampinhasStore = tx.objectStore('tampinhas_substituicao')
  const formacoesStore = tx.objectStore('formacoes_operacionais')
  const membrosStore = tx.objectStore('formacao_operacional_membros')
  const filaStore = tx.objectStore('fila_operacional')
  const indiceFilaJogador = filaStore.index('por-sessao-jogador')

  // Persiste os sorteios exatamente uma vez.
  for (const registro of cascata) {
    const id = await tampinhasStore.add(registro)
    registro.id = id
  }

  const antigas = await formacoesStore.index('por-sessao').getAll(sessaoId)
  for (const antiga of antigas) {
    if (!antiga.id) continue
    const membrosAntigos = await membrosStore.index('por-formacao').getAll(antiga.id)
    for (const membro of membrosAntigos) {
      if (membro.id) await membrosStore.delete(membro.id)
    }
    await formacoesStore.delete(antiga.id)
  }

  const criadas: FormacaoOperacionalCompletaV13[] = []
  let proximoGrupoVirtual =
    finais.reduce(
      (maior, item) =>
        Math.max(maior, item.formacao.grupoHistorico ?? 0),
      0,
    ) + 1

  for (let indice = 0; indice < finais.length; indice += 1) {
    const item = finais[indice]
    const ordem = indice + 1
    const grupoHistorico =
      item.formacao.grupoHistorico ?? proximoGrupoVirtual++

    /*
     * IMPORTANTE: não espalhamos item.formacao aqui.
     * Este é um registro NOVO em uma store com keyPath "id" + autoIncrement.
     * Montamos um objeto totalmente novo somente com os campos persistíveis,
     * garantindo que nenhuma propriedade "id" antiga/undefined seja carregada.
     */
    const formacao: FormacaoOperacionalDB = {
      sessaoId,
      ordem,
      status: 'AGUARDANDO',
      prioridade: item.formacao.prioridade,
      grupoHistorico,
      atualizadoEm: agora,
      criadoEm: item.formacao.criadoEm || agora,
    }

    let formacaoId: number
    try {
      formacaoId = await formacoesStore.add(formacao)
    } catch (erro) {
      const possuiId = Object.prototype.hasOwnProperty.call(formacao, 'id')
      throw new Error(
        `V13 ADD FORMAÇÃO falhou: ordem=${ordem}; grupo=${grupoHistorico}; ` +
          `possuiId=${possuiId}; id=${String(formacao.id)}. ` +
          `${erro instanceof Error ? erro.message : String(erro)}`,
      )
    }

    const membrosCriados: FormacaoOperacionalMembroDB[] = []
    for (let posicao = 0; posicao < item.membros.length; posicao += 1) {
      const membroTrabalho = item.membros[posicao]
      const membro: FormacaoOperacionalMembroDB = {
        sessaoId,
        formacaoId,
        jogadorId: membroTrabalho.jogadorId,
        funcao: membroTrabalho.funcao,
        ordem: posicao + 1,
        criadoEm: agora,
        atualizadoEm: agora,
      }
      /*
       * Registro novo em store com keyPath "id" + autoIncrement.
       * O objeto é criado do zero e não recebe id antes do add().
       * O diagnóstico abaixo identifica imediatamente jogador/formação
       * caso o IndexedDB rejeite a gravação.
       */
      let membroId: number
      try {
        membroId = await membrosStore.add(membro)
      } catch (erro) {
        const possuiId = Object.prototype.hasOwnProperty.call(membro, 'id')
        throw new Error(
          `V13 ADD MEMBRO falhou: jogador=${membroTrabalho.jogadorId}; ` +
            `formacao=${formacaoId}; ordem=${posicao + 1}; ` +
            `possuiId=${possuiId}; id=${String(membro.id)}. ` +
            `${erro instanceof Error ? erro.message : String(erro)}`,
        )
      }

      membrosCriados.push({ ...membro, id: membroId })

      const fila = await indiceFilaJogador.get([
        sessaoId,
        membroTrabalho.jogadorId,
      ])
      if (fila) {
        await filaStore.put({
          ...fila,
          status: 'AGUARDANDO',
          grupoOrigem: grupoHistorico,
          atualizadoEm: agora,
        })
      }
    }

    criadas.push({
      formacao: { ...formacao, id: formacaoId },
      membros: membrosCriados,
    })
  }

  try {
    await tx.done
  } catch (erro) {
    throw new Error(
      `V13 COMMIT DA TRANSAÇÃO falhou. ${
        erro instanceof Error ? erro.message : String(erro)
      }`,
    )
  }

  // Invariante final: depois da normalização não pode existir parcial antes de completo.
  const existeParcialAntesDeCompleto = criadas.some((item, indice) => {
    const linhas = item.membros.filter((m) => m.funcao === 'LINHA').length
    if (linhas <= 0 || linhas >= quantidadeLinha) return false
    return criadas.slice(indice + 1).some(
      (posterior) =>
        posterior.membros.filter((m) => m.funcao === 'LINHA').length >=
        quantidadeLinha,
    )
  })

  if (existeParcialAntesDeCompleto) {
    throw new Error(
      'A fila ainda possui formação parcial antes de um time completo.',
    )
  }

  return {
    alterou: cascata.length > 0,
    cascata,
    formacoes: criadas,
  }
}


/* Retorna somente a projeção v13; não consulta grupoOrigem para montar a tela. */
export async function listarFormacoesOperacionaisV13(
  sessaoId: number,
): Promise<FormacaoOperacionalCompletaV13[]> {
  const db = await obterBanco()
  const formacoes = (
    await db.getAllFromIndex('formacoes_operacionais', 'por-sessao', sessaoId)
  ).sort((a, b) => a.ordem - b.ordem)

  const resultado: FormacaoOperacionalCompletaV13[] = []
  for (const formacao of formacoes) {
    if (!formacao.id) continue
    const membros = (
      await db.getAllFromIndex('formacao_operacional_membros', 'por-formacao', formacao.id)
    ).sort((a, b) => a.ordem - b.ordem)
    resultado.push({ formacao, membros })
  }
  return resultado
}

export type UltimoNumeroTampinhaJogadorV13 = {
  jogadorId: number
  numero: number
  grupo: number
  tampinhaId?: number
}

/*
 * Número é propriedade do SORTEIO, não do jogador. Para a tela exibimos apenas
 * o número da última tampinha em que o atleta participou.
 */
export async function listarUltimosNumerosTampinhaV13(
  sessaoId: number,
): Promise<UltimoNumeroTampinhaJogadorV13[]> {
  const db = await obterBanco()
  const tampinhas = (
    await db.getAllFromIndex('tampinhas_substituicao', 'por-sessao', sessaoId)
  ).sort((a, b) => (a.id ?? 0) - (b.id ?? 0))

  const ultimos = new Map<number, UltimoNumeroTampinhaJogadorV13>()
  for (const tampinha of tampinhas) {
    for (const item of tampinha.numeros) {
      ultimos.set(item.jogadorId, {
        jogadorId: item.jogadorId,
        numero: item.numero,
        grupo: tampinha.grupo,
        tampinhaId: tampinha.id,
      })
    }
  }
  return Array.from(ultimos.values())
}
