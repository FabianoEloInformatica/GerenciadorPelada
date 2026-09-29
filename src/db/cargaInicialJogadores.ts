import {
  cadastrarJogador,
  listarJogadores,
} from './jogadoresRepository'

import type { TipoJogador } from './database'
import { normalizarNome } from '../utils/normalizarNome'

type JogadorCargaInicial = {
  nomeCompleto: string
  nomeExibicao: string
  apelidos: string[]
  tipoPadrao: TipoJogador
}

export type ResultadoCargaInicial = {
  cadastrados: number
  jaExistentes: number
}

/*
 * Jogadores habituais obtidos das listas reais da Pelada de Segunda.
 * Esta carga serve apenas para preparar a base inicial do sistema.
 */
const jogadoresCargaInicial: JogadorCargaInicial[] = [
  // GOLEIROS
  {
    nomeCompleto: 'Wesley Sergio',
    nomeExibicao: 'Cobrinha',
    apelidos: ['Cobrinha'],
    tipoPadrao: 'GOLEIRO',
  },
  {
    nomeCompleto: 'Augusto GK',
    nomeExibicao: 'Augusto',
    apelidos: ['Augusto'],
    tipoPadrao: 'GOLEIRO',
  },
  {
    nomeCompleto: 'Yuri GK',
    nomeExibicao: 'Yuri',
    apelidos: ['Yuri'],
    tipoPadrao: 'GOLEIRO',
  },
  {
    nomeCompleto: 'Rodrigo',
    nomeExibicao: 'Rodrigão',
    apelidos: ['Rodrigo', 'Rodrigao'],
    tipoPadrao: 'GOLEIRO',
  },

  // JOGADORES DE LINHA
  {
    nomeCompleto: 'Jose Paulo',
    nomeExibicao: 'JP',
    apelidos: ['JP'],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Fabiano Souza',
    nomeExibicao: 'Fabiano',
    apelidos: ['F', 'FB', 'Fbala'],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Lino',
    nomeExibicao: 'Lino',
    apelidos: ['Ursao'],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Gabriel',
    nomeExibicao: 'Geoffroy',
    apelidos: ['Geoffroy', 'Biel', 'Gabigol'],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Higor Lenyn',
    nomeExibicao: 'Higu',
    apelidos: ['Higu'],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Wellington',
    nomeExibicao: 'Wellington',
    apelidos: [],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Leandro',
    nomeExibicao: 'Leandro',
    apelidos: ['Sem X'],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Junior',
    nomeExibicao: 'Juninho',
    apelidos: ['Juninho', 'Limao'],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Eduardo Afonso',
    nomeExibicao: 'Dudu',
    apelidos: ['Dudu'],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Alencar',
    nomeExibicao: 'Alencar',
    apelidos: ['Alenca'],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Alisson',
    nomeExibicao: 'Bico',
    apelidos: ['Bico', 'Bicomendes'],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Lucas',
    nomeExibicao: 'Lucas',
    apelidos: ['Luquinha'],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Anderson Peixoto',
    nomeExibicao: 'Derson',
    apelidos: ['Derson'],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Jefferson Alves',
    nomeExibicao: 'Jefbala',
    apelidos: ['Jefbala', 'Jeffinho'],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Marcelo Alexandrino',
    nomeExibicao: 'Celin',
    apelidos: ['Marcelo', 'Celo'],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Ciro',
    nomeExibicao: 'Ciro',
    apelidos: [],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Davi',
    nomeExibicao: 'Davi Balu',
    apelidos: ['Davi Balu'],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Denner',
    nomeExibicao: 'Russo',
    apelidos: ['Russo', 'Russinho'],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Paulo',
    nomeExibicao: 'Paulo',
    apelidos: [],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Mateus',
    nomeExibicao: 'Mateus',
    apelidos: ['Mateuzinho'],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Marcos Sandy',
    nomeExibicao: 'M. Sandy',
    apelidos: ['M.Sandy', 'M. Sandy'],
    tipoPadrao: 'LINHA',
  },

  /*
   * Existem dois jogadores chamados Marcelo.
   * "Marcelo" poderá ser ambíguo e deverá ser resolvido pelo operador.
   */
  {
    nomeCompleto: 'Marcelo',
    nomeExibicao: 'Venezuela',
    apelidos: ['Venezuela'],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Marquinhos',
    nomeExibicao: 'MK',
    apelidos: ['MK'],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Eduardo Oliveira',
    nomeExibicao: 'Eduardo',
    apelidos: ['Du'],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Gustavo',
    nomeExibicao: 'Garoto',
    apelidos: ['Garoto', 'GRT'],
    tipoPadrao: 'LINHA',
  },
  {
    nomeCompleto: 'Italo',
    nomeExibicao: 'Italo',
    apelidos: [],
    tipoPadrao: 'LINHA',
  },
]

export async function executarCargaInicialJogadores():
  Promise<ResultadoCargaInicial> {
  const jogadoresExistentes = await listarJogadores()

  let cadastrados = 0
  let jaExistentes = 0

  for (const jogadorCarga of jogadoresCargaInicial) {
    /*
     * Nesta carga controlada usamos o nome completo como proteção principal
     * contra duplicação. Apelidos não servem para isso porque podem coincidir.
     */
    const existente = jogadoresExistentes.some(
      (jogador) =>
        normalizarNome(jogador.nomeCompleto) ===
        normalizarNome(jogadorCarga.nomeCompleto),
    )

    if (existente) {
      jaExistentes++
      continue
    }

    await cadastrarJogador(jogadorCarga)
    cadastrados++
  }

  return {
    cadastrados,
    jaExistentes,
  }
}