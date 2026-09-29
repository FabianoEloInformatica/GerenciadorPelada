import {
  obterBanco,
  type JogadorDB,
  type TipoJogador,
} from './database'

import { normalizarNome } from '../utils/normalizarNome'

export type NovoJogador = {
  nomeCompleto: string
  nomeExibicao: string
  apelidos: string[]
  tipoPadrao: TipoJogador
}

function limparApelidos(
  apelidos: string[],
  nomeCompleto: string,
  nomeExibicao: string,
): string[] {
  const identificadoresUsados = new Set<string>([
    normalizarNome(nomeCompleto),
    normalizarNome(nomeExibicao),
  ])

  const resultado: string[] = []

  for (const apelidoOriginal of apelidos) {
    const apelido = apelidoOriginal.trim()

    if (!apelido) {
      continue
    }

    const normalizado = normalizarNome(apelido)

    if (identificadoresUsados.has(normalizado)) {
      continue
    }

    identificadoresUsados.add(normalizado)
    resultado.push(apelido)
  }

  return resultado
}

export async function listarJogadores(): Promise<JogadorDB[]> {
  const db = await obterBanco()

  const jogadores = await db.getAll('jogadores')

  return jogadores.sort((a, b) =>
    a.nomeExibicao.localeCompare(b.nomeExibicao, 'pt-BR', {
      sensitivity: 'base',
    }),
  )
}

export async function cadastrarJogador(
  dados: NovoJogador,
): Promise<number> {
  const db = await obterBanco()

  const agora = new Date().toISOString()

  const jogador: JogadorDB = {
    nomeCompleto: dados.nomeCompleto.trim(),
    nomeExibicao: dados.nomeExibicao.trim(),

    apelidos: limparApelidos(
  dados.apelidos,
  dados.nomeCompleto,
  dados.nomeExibicao,
),

    tipoPadrao: dados.tipoPadrao,

    ativo: true,

    criadoEm: agora,
    atualizadoEm: agora,
  }

  return db.add('jogadores', jogador)
}

export async function buscarJogadorPorId(
  id: number,
): Promise<JogadorDB | undefined> {
  const db = await obterBanco()

  return db.get('jogadores', id)
}

export async function atualizarJogador(
  jogador: JogadorDB,
): Promise<void> {
  if (!jogador.id) {
    throw new Error('Jogador sem ID.')
  }

  const db = await obterBanco()

  await db.put('jogadores', {
    ...jogador,

    nomeCompleto: jogador.nomeCompleto.trim(),
    nomeExibicao: jogador.nomeExibicao.trim(),

    apelidos: limparApelidos(
  jogador.apelidos,
  jogador.nomeCompleto,
  jogador.nomeExibicao,
),

    atualizadoEm: new Date().toISOString(),
  })
}

export async function alterarStatusJogador(
  id: number,
  ativo: boolean,
): Promise<void> {
  const jogador = await buscarJogadorPorId(id)

  if (!jogador) {
    throw new Error('Jogador não encontrado.')
  }

  await atualizarJogador({
    ...jogador,
    ativo,
  })
}
export type CorrespondenciaJogador = {
  jogador: JogadorDB
  encontradoEm: 'NOME_COMPLETO' | 'NOME_EXIBICAO' | 'APELIDO'
  valorEncontrado: string
}

export async function buscarJogadoresPorIdentificador(
  identificador: string,
): Promise<CorrespondenciaJogador[]> {
  const procurado = normalizarNome(identificador)

  if (!procurado) {
    return []
  }

  const jogadores = await listarJogadores()

  const correspondencias: CorrespondenciaJogador[] = []

  for (const jogador of jogadores) {
    if (normalizarNome(jogador.nomeCompleto) === procurado) {
      correspondencias.push({
        jogador,
        encontradoEm: 'NOME_COMPLETO',
        valorEncontrado: jogador.nomeCompleto,
      })

      continue
    }

    if (normalizarNome(jogador.nomeExibicao) === procurado) {
      correspondencias.push({
        jogador,
        encontradoEm: 'NOME_EXIBICAO',
        valorEncontrado: jogador.nomeExibicao,
      })

      continue
    }

    const apelidoEncontrado = jogador.apelidos.find(
      (apelido) => normalizarNome(apelido) === procurado,
    )

    if (apelidoEncontrado) {
      correspondencias.push({
        jogador,
        encontradoEm: 'APELIDO',
        valorEncontrado: apelidoEncontrado,
      })
    }
  }

  return correspondencias
}

export type SugestaoJogador = {
  jogador: JogadorDB
  motivo: 'NOME' | 'NOME_EXIBICAO' | 'APELIDO'
  valorEncontrado: string
}

/*
 * Busca candidatos plausíveis para identificação manual.
 *
 * Diferente do reconhecimento automático, esta busca aceita correspondências
 * parciais, mas evita sugestões muito distantes do nome informado.
 */
export async function buscarSugestoesJogador(
  identificador: string,
): Promise<SugestaoJogador[]> {
  const procurado = normalizarNome(identificador)

  if (!procurado) return []

  const jogadores = await listarJogadores()
  const sugestoes: SugestaoJogador[] = []

  /*
   * Para nomes muito curtos, como "F", não fazemos busca parcial.
   * Isso evita dezenas de candidatos sem relação real.
   */
  const permiteBuscaParcial = procurado.length >= 3

  for (const jogador of jogadores) {
    const nomeCompleto = normalizarNome(jogador.nomeCompleto)
    const nomeExibicao = normalizarNome(jogador.nomeExibicao)

    const apelidoEncontrado = jogador.apelidos.find((apelido) => {
      const apelidoNormalizado = normalizarNome(apelido)

      if (apelidoNormalizado === procurado) {
        return true
      }

      if (!permiteBuscaParcial) {
        return false
      }

      return (
        apelidoNormalizado.startsWith(procurado) ||
        procurado.startsWith(apelidoNormalizado)
      )
    })

    // Nome de exibição tem prioridade entre as sugestões.
    if (
      nomeExibicao === procurado ||
      (permiteBuscaParcial &&
        (nomeExibicao.startsWith(procurado) ||
          procurado.startsWith(nomeExibicao)))
    ) {
      sugestoes.push({
        jogador,
        motivo: 'NOME_EXIBICAO',
        valorEncontrado: jogador.nomeExibicao,
      })

      continue
    }

    /*
     * No nome completo comparamos palavras inteiras.
     * Assim "Marcelo" encontra "Marcelo Alexandrino",
     * mas não encontra "Marquinhos".
     */
    const palavrasNomeCompleto = nomeCompleto.split(' ')

    if (
      nomeCompleto === procurado ||
      palavrasNomeCompleto.includes(procurado)
    ) {
      sugestoes.push({
        jogador,
        motivo: 'NOME',
        valorEncontrado: jogador.nomeCompleto,
      })

      continue
    }

    if (apelidoEncontrado) {
      sugestoes.push({
        jogador,
        motivo: 'APELIDO',
        valorEncontrado: apelidoEncontrado,
      })
    }
  }

  /*
   * Remove possíveis duplicidades pelo ID.
   * Um jogador pode coincidir por mais de um identificador.
   */
  return sugestoes.filter(
    (sugestao, indice, lista) =>
      lista.findIndex(
        (item) => item.jogador.id === sugestao.jogador.id,
      ) === indice,
  )
}