import {
  obterBanco,
  type SessaoDB,
  type SessaoParticipanteDB,
  type SorteioGoleiroInicialDB,
  type TipoJogador,
} from './database'

export type NovoParticipanteSessao = {
  jogadorId: number
  nomeImportado: string
  presente: boolean
  tipoSessao: TipoJogador
}

/*
 * Cria uma nova sessão da pelada.
 * Neste momento ela nasce em PREPARACAO, pois ainda estamos
 * organizando presença e sorteio inicial.
 */
export async function criarSessao(
  data: string,
): Promise<number> {
  const db = await obterBanco()
  const agora = new Date().toISOString()

  const sessao: SessaoDB = {
    data,
    status: 'PREPARACAO',
    criadoEm: agora,
    atualizadoEm: agora,
  }

  return db.add('sessoes', sessao)
}

/*
 * Busca uma sessão específica.
 */
export async function buscarSessaoPorId(
  sessaoId: number,
): Promise<SessaoDB | undefined> {
  const db = await obterBanco()

  return db.get('sessoes', sessaoId)
}

/*
 * Retorna todas as sessões cadastradas.
 * Será útil depois para histórico e recuperação de peladas.
 */
export async function listarSessoes(): Promise<SessaoDB[]> {
  const db = await obterBanco()

  return db.getAll('sessoes')
}

/*
 * Altera o status da sessão sem modificar os demais dados.
 */
export async function atualizarStatusSessao(
  sessaoId: number,
  status: SessaoDB['status'],
): Promise<void> {
  const db = await obterBanco()

  const sessao = await db.get('sessoes', sessaoId)

  if (!sessao) {
    throw new Error('Sessão não encontrada.')
  }

  sessao.status = status
  sessao.atualizadoEm = new Date().toISOString()

  await db.put('sessoes', sessao)
}

/*
 * Inclui ou atualiza um jogador dentro da sessão.
 *
 * O índice sessaoId + jogadorId é único, portanto o mesmo
 * jogador não pode aparecer duas vezes na mesma pelada.
 */
export async function salvarParticipanteSessao(
  sessaoId: number,
  dados: NovoParticipanteSessao,
): Promise<number> {
  const db = await obterBanco()

  const existente = await db.getFromIndex(
    'sessao_participantes',
    'por-sessao-jogador',
    [sessaoId, dados.jogadorId],
  )

  const agora = new Date().toISOString()

  if (existente) {
    existente.nomeImportado = dados.nomeImportado
    existente.presente = dados.presente
    existente.tipoSessao = dados.tipoSessao
    existente.atualizadoEm = agora

    await db.put('sessao_participantes', existente)

    return existente.id!
  }

  const participante: SessaoParticipanteDB = {
    sessaoId,
    jogadorId: dados.jogadorId,
    nomeImportado: dados.nomeImportado,
    presente: dados.presente,
    tipoSessao: dados.tipoSessao,

    /*
     * Participantes criados durante a preparação normal
     * ainda não são considerados chegada atrasada.
     */
    chegouAtrasado: false,

    criadoEm: agora,
    atualizadoEm: agora,
  }

  return db.add('sessao_participantes', participante)
}

/*
 * Salva vários participantes de uma vez.
 *
 * Nesta primeira versão usamos a mesma função individual
 * para preservar a regra de não duplicar jogador na sessão.
 */
export async function salvarParticipantesSessao(
  sessaoId: number,
  participantes: NovoParticipanteSessao[],
): Promise<void> {
  for (const participante of participantes) {
    await salvarParticipanteSessao(
      sessaoId,
      participante,
    )
  }
}

/*
 * Lista todos os participantes de uma sessão.
 */
export async function listarParticipantesSessao(
  sessaoId: number,
): Promise<SessaoParticipanteDB[]> {
  const db = await obterBanco()

  return db.getAllFromIndex(
    'sessao_participantes',
    'por-sessao',
    sessaoId,
  )
}

/*
 * Atualiza somente a presença.
 * Isso permite alterar SIM/NÃO sem reconstruir o participante.
 */
export async function atualizarPresencaParticipante(
  participanteId: number,
  presente: boolean,
): Promise<void> {
  const db = await obterBanco()

  const participante = await db.get(
    'sessao_participantes',
    participanteId,
  )

  if (!participante) {
    throw new Error('Participante da sessão não encontrado.')
  }

  participante.presente = presente
  participante.atualizadoEm = new Date().toISOString()

  await db.put(
    'sessao_participantes',
    participante,
  )
}

/*
 * Altera apenas a função exercida naquela pelada.
 *
 * Importante:
 * isso NÃO altera tipoPadrao no cadastro permanente do jogador.
 */
export async function atualizarTipoParticipante(
  participanteId: number,
  tipoSessao: TipoJogador,
): Promise<void> {
  const db = await obterBanco()

  const participante = await db.get(
    'sessao_participantes',
    participanteId,
  )

  if (!participante) {
    throw new Error('Participante da sessão não encontrado.')
  }

  participante.tipoSessao = tipoSessao
  participante.atualizadoEm = new Date().toISOString()

  await db.put(
    'sessao_participantes',
    participante,
  )
}

/*
 * Marca uma chegada após o início da pelada.
 *
 * ordemChegada será importante para respeitarmos posteriormente
 * a posição correta desse atleta na fila.
 */
export async function marcarChegadaAtrasada(
  participanteId: number,
  ordemChegada: number,
): Promise<void> {
  const db = await obterBanco()

  const participante = await db.get(
    'sessao_participantes',
    participanteId,
  )

  if (!participante) {
    throw new Error('Participante da sessão não encontrado.')
  }

  participante.presente = true
  participante.chegouAtrasado = true
  participante.ordemChegada = ordemChegada
  participante.atualizadoEm = new Date().toISOString()

  await db.put(
    'sessao_participantes',
    participante,
  )
}



export type DadosChegadaAtrasada = {
  jogadorId: number
  nomeImportado: string
  tipoSessao: TipoJogador
}

/*
 * Registra uma chegada depois que a pelada já começou.
 * A ordem é calculada dentro da mesma transação para que dois registros
 * consecutivos nunca recebam a mesma posição na fila de atrasados.
 *
 * Se o jogador já estava na lista como ausente, reaproveitamos o registro.
 * Se não estava na lista, criamos sua participação diretamente na sessão.
 */
export async function registrarChegadaAtrasada(
  sessaoId: number,
  dados: DadosChegadaAtrasada,
): Promise<SessaoParticipanteDB> {
  const db = await obterBanco()
  const tx = db.transaction('sessao_participantes', 'readwrite')
  const store = tx.objectStore('sessao_participantes')

  const existente = await store.index('por-sessao-jogador').get([
    sessaoId,
    dados.jogadorId,
  ])

  if (existente?.presente) {
    throw new Error('Este jogador já está presente nesta pelada.')
  }

  const participantes = await store.index('por-sessao').getAll(sessaoId)
  const maiorOrdem = participantes.reduce(
    (maior, participante) =>
      Math.max(maior, participante.ordemChegada ?? 0),
    0,
  )

  const agora = new Date().toISOString()
  const ordemChegada = maiorOrdem + 1

  if (existente) {
    existente.nomeImportado = dados.nomeImportado.trim()
    existente.presente = true
    existente.tipoSessao = dados.tipoSessao
    existente.chegouAtrasado = true
    existente.ordemChegada = ordemChegada
    existente.atualizadoEm = agora

    await store.put(existente)
    await tx.done
    return existente
  }

  const novo: SessaoParticipanteDB = {
    sessaoId,
    jogadorId: dados.jogadorId,
    nomeImportado: dados.nomeImportado.trim(),
    presente: true,
    tipoSessao: dados.tipoSessao,
    chegouAtrasado: true,
    ordemChegada,
    criadoEm: agora,
    atualizadoEm: agora,
  }

  const id = await store.add(novo)
  await tx.done

  return { ...novo, id }
}

/*
 * Salva o sorteio inicial dos goleiros de uma única vez.
 * O resultado é persistido para que F5/reabertura nunca refaça
 * automaticamente um sorteio que já aconteceu na quadra.
 */
export async function salvarSorteioInicialGoleiros(
  sessaoId: number,
  resultados: Array<{
    jogadorId: number
    numeroSorteado: number
    ordem: number
    corColete?: string
  }>,
): Promise<void> {
  const db = await obterBanco()
  const tx = db.transaction('sorteio_goleiros_inicial', 'readwrite')
  const store = tx.objectStore('sorteio_goleiros_inicial')

  const existentes = await store.index('por-sessao').getAllKeys(sessaoId)

  // Substituição atômica do sorteio daquela sessão evita resultado parcial.
  for (const id of existentes) {
    await store.delete(id)
  }

  const agora = new Date().toISOString()

  for (const resultado of resultados) {
    const registro: SorteioGoleiroInicialDB = {
      sessaoId,
      jogadorId: resultado.jogadorId,
      numeroSorteado: resultado.numeroSorteado,
      ordem: resultado.ordem,
      corColete: resultado.corColete,
      criadoEm: agora,
    }

    await store.add(registro)
  }

  await tx.done
}

/*
 * Recupera o sorteio já realizado, ordenado do menor número para o maior.
 */
export async function listarSorteioInicialGoleiros(
  sessaoId: number,
): Promise<SorteioGoleiroInicialDB[]> {
  const db = await obterBanco()

  const resultados = await db.getAllFromIndex(
    'sorteio_goleiros_inicial',
    'por-sessao',
    sessaoId,
  )

  return resultados.sort((a, b) => a.ordem - b.ordem)
}

/*
 * Descarta somente uma sessão que ainda está em PREPARACAO.
 * A exclusão é atômica: participantes e sorteios da sessão são removidos
 * juntos, sem tocar no cadastro permanente de jogadores ou configurações.
 */
export async function descartarSessaoEmPreparacao(
  sessaoId: number,
): Promise<void> {
  const db = await obterBanco()

  const sessao = await db.get('sessoes', sessaoId)

  if (!sessao) {
    throw new Error('Sessão não encontrada.')
  }

  if (sessao.status !== 'PREPARACAO') {
    throw new Error(
      'Somente uma pelada que ainda está em preparação pode ser descartada.',
    )
  }

  const tx = db.transaction(
    [
      'sessoes',
      'sessao_participantes',
      'sorteio_goleiros_inicial',
      'sorteio_linha_inicial',
    ],
    'readwrite',
  )

  const participantes = tx.objectStore('sessao_participantes')
  const goleiros = tx.objectStore('sorteio_goleiros_inicial')
  const linha = tx.objectStore('sorteio_linha_inicial')

  const idsParticipantes = await participantes
    .index('por-sessao')
    .getAllKeys(sessaoId)

  const idsGoleiros = await goleiros
    .index('por-sessao')
    .getAllKeys(sessaoId)

  const idsLinha = await linha
    .index('por-sessao')
    .getAllKeys(sessaoId)

  for (const id of idsParticipantes) {
    await participantes.delete(id)
  }

  for (const id of idsGoleiros) {
    await goleiros.delete(id)
  }

  for (const id of idsLinha) {
    await linha.delete(id)
  }

  await tx.objectStore('sessoes').delete(sessaoId)
  await tx.done
}
