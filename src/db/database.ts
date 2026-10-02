import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export type TipoJogador = 'LINHA' | 'GOLEIRO'

export type JogadorDB = {
  id?: number
  nomeCompleto: string
  nomeExibicao: string
  apelidos: string[]
  tipoPadrao: TipoJogador
  ativo: boolean
  criadoEm: string
  atualizadoEm: string
}

/*
 * Status da sessão.
 * PREPARACAO = presença e sorteio ainda sendo organizados.
 * EM_ANDAMENTO e FINALIZADA serão usados nas próximas etapas.
 */
export type StatusSessao =
  | 'PREPARACAO'
  | 'EM_ANDAMENTO'
  | 'FINALIZADA'

export type SessaoDB = {
  id?: number
  data: string
  status: StatusSessao
  criadoEm: string
  atualizadoEm: string
}

/*
 * Participante da pelada naquele dia.
 *
 * tipoSessao é separado de tipoPadrao porque um jogador de linha
 * pode atuar como goleiro em uma determinada pelada sem alterar
 * seu cadastro permanente.
 */
export type SorteioGoleiroInicialDB = {
  id?: number
  sessaoId: number
  jogadorId: number
  numeroSorteado: number
  ordem: number
  corColete?: string
  criadoEm: string
}

export type SessaoParticipanteDB = {
  id?: number
  sessaoId: number
  jogadorId: number

  nomeImportado: string
  presente: boolean
  tipoSessao: TipoJogador

  chegouAtrasado: boolean
  ordemChegada?: number

  criadoEm: string
  atualizadoEm: string
}


export type CorColeteConfiguracao = {
  id: string
  nome: string
  hex: string
}

export type ConfiguracaoPeladaDB = {
  id: 'principal'

  jogadoresLinhaPorTime: number
  tempoQuedaMinutos: number
  limiteGols: number

  goleiroParticipaSorteio: boolean
  aguardarSaidaBola: boolean

  tampinhaEmpate: boolean
  maiorNumeroVence: boolean
  menorNumeroSai: boolean
  doisTimesSaemEmpate: boolean

  permaneceMantemColete: boolean
  primeiraBolaPermanece: boolean
  primeiraBolaPrioridade: boolean

  somInicio: boolean
  somGol: boolean
  somPausa: boolean
  somRetomada: boolean
  somTempoLimite: boolean
  somFinalizacao: boolean
  vibrarTempoLimite: boolean

  coresColetes: CorColeteConfiguracao[]

  atualizadoEm: string
}


export type SorteioLinhaInicialDB = {
  id?: number
  sessaoId: number
  jogadorId: number
  numeroSorteado: number
  grupo: number
  posicaoNoGrupo: number
  grupoCompleto: boolean
  criadoEm: string
}


export type StatusPartida = 'EM_ANDAMENTO' | 'FINALIZADA'
export type ResultadoPartida = 'TIME1' | 'TIME2' | 'EMPATE'
export type MotivoFinalizacaoPartida = 'MANUAL' | 'LIMITE_GOLS' | 'TEMPO'

export type PartidaDB = {
  id?: number
  sessaoId: number
  numero: number
  status: StatusPartida
  placarTime1: number
  placarTime2: number
  iniciadaEm: string
  finalizadaEm?: string

  // Resultado oficial da queda, usado depois pela rotação.
  resultado?: ResultadoPartida
  ladoVencedor?: 1 | 2
  ladoPerdedor?: 1 | 2
  motivoFinalizacao?: MotivoFinalizacaoPartida
  tempoFinalMs?: number

  // Relógio persistido: permite F5, bloqueio da tela e pausas sem perder o tempo.
  pausada: boolean
  pausadaEm?: string
  totalPausadoMs: number
  criadoEm: string
  atualizadoEm: string
}

export type PartidaTimeDB = {
  id?: number
  partidaId: number
  lado: 1 | 2
  grupoOrigem?: number
  goleiroId: number
  corColete?: string
  criadoEm: string
}

export type PartidaJogadorDB = {
  id?: number
  partidaId: number
  lado: 1 | 2
  jogadorId: number
  funcao: TipoJogador
  ordemFormacao: number
  criadoEm: string
}

export type TampinhaEmpateDB = {
  id?: number
  sessaoId: number
  partidaId: number
  numeroLado1: number
  numeroLado2: number
  ladoVencedor: 1 | 2
  ladoPerdedor: 1 | 2
  maiorNumeroVence: boolean
  criadoEm: string
}

export type PrioridadeFilaOperacional =
  | 'NAO_JOGOU'
  | 'CHEGADA_ATRASADA'
  | 'RETORNO'

export type StatusFilaOperacional = 'AGUARDANDO' | 'EM_QUADRA'

export type FilaOperacionalDB = {
  id?: number
  sessaoId: number
  jogadorId: number
  funcao: TipoJogador
  prioridade: PrioridadeFilaOperacional
  status: StatusFilaOperacional
  ordem: number
  grupoOrigem?: number
  criadoEm: string
  atualizadoEm: string
}



export type StatusFormacaoOperacional = 'AGUARDANDO' | 'EM_QUADRA'

/*
 * Versão 13: a formação operacional passa a ter identidade própria.
 * O grupo do sorteio inicial continua histórico e não precisa mais ser
 * reutilizado como identidade mutável durante rotações e cascatas.
 */
export type FormacaoOperacionalDB = {
  id?: number
  sessaoId: number
  ordem: number
  status: StatusFormacaoOperacional
  prioridade: PrioridadeFilaOperacional
  grupoHistorico?: number
  criadoEm: string
  atualizadoEm: string
}

export type FormacaoOperacionalMembroDB = {
  id?: number
  sessaoId: number
  formacaoId: number
  jogadorId: number
  funcao: TipoJogador
  ordem: number
  criadoEm: string
  atualizadoEm: string
}

export type TampinhaSubstituicaoDB = {
  id?: number
  sessaoId: number
  grupo: number
  jogadorEntrandoId: number
  jogadorSaindoId: number
  numeros: Array<{ jogadorId: number; numero: number }>
  menorNumeroSai: boolean
  criadoEm: string
}

export type TipoEventoPartida = 'GOL' | 'GOL_CONTRA'

export type PartidaEventoDB = {
  id?: number
  partidaId: number
  tipo: TipoEventoPartida
  // O lado beneficiado é sempre o time cujo placar aumenta.
  ladoBeneficiado: 1 | 2
  // Em GOL é o autor. Em GOL_CONTRA fica vazio para não creditar o adversário.
  jogadorId?: number
  // Tempo efetivo da partida no evento, descontando pausas.
  tempoJogoMs: number
  criadoEm: string
}

interface GerenciadorPeladaDB extends DBSchema {


  partidas: {
    key: number
    value: PartidaDB
    indexes: {
      'por-sessao': number
      'por-sessao-numero': [number, number]
      'por-status': StatusPartida
    }
  }




  formacoes_operacionais: {
    key: number
    value: FormacaoOperacionalDB
    indexes: {
      'por-sessao': number
      'por-sessao-status': [number, StatusFormacaoOperacional]
      'por-sessao-ordem': [number, number]
    }
  }

  formacao_operacional_membros: {
    key: number
    value: FormacaoOperacionalMembroDB
    indexes: {
      'por-sessao': number
      'por-formacao': number
      'por-sessao-jogador': [number, number]
    }
  }

  fila_operacional: {
    key: number
    value: FilaOperacionalDB
    indexes: {
      'por-sessao': number
      'por-sessao-jogador': [number, number]
      'por-sessao-status': [number, StatusFilaOperacional]
      'por-sessao-prioridade': [number, PrioridadeFilaOperacional]
    }
  }


  tampinhas_substituicao: {
    key: number
    value: TampinhaSubstituicaoDB
    indexes: {
      'por-sessao': number
      'por-sessao-grupo': [number, number]
    }
  }

  tampinhas_empate: {
    key: number
    value: TampinhaEmpateDB
    indexes: {
      'por-partida': number
      'por-sessao': number
    }
  }

  partida_eventos: {
    key: number
    value: PartidaEventoDB
    indexes: {
      'por-partida': number
      'por-partida-tipo': [number, TipoEventoPartida]
    }
  }

  partida_times: {
    key: number
    value: PartidaTimeDB
    indexes: {
      'por-partida': number
      'por-partida-lado': [number, number]
    }
  }

  partida_jogadores: {
    key: number
    value: PartidaJogadorDB
    indexes: {
      'por-partida': number
      'por-partida-lado': [number, number]
      'por-partida-jogador': [number, number]
    }
  }


  sorteio_linha_inicial: {
    key: number
    value: SorteioLinhaInicialDB
    indexes: {
      'por-sessao': number
      'por-sessao-jogador': [number, number]
      'por-sessao-grupo': [number, number]
    }
  }


  configuracoes: {
    key: string
    value: ConfiguracaoPeladaDB
  }

  jogadores: {
    key: number
    value: JogadorDB
    indexes: {
      'por-nome-exibicao': string
      'por-tipo-padrao': TipoJogador
      'por-ativo': number
    }
  }

  sessoes: {
    key: number
    value: SessaoDB
    indexes: {
      'por-data': string
      'por-status': StatusSessao
    }
  }

  sessao_participantes: {
    key: number
    value: SessaoParticipanteDB
    indexes: {
      'por-sessao': number
      'por-jogador': number
      'por-sessao-jogador': [number, number]
    }
  }

  sorteio_goleiros_inicial: {
    key: number
    value: SorteioGoleiroInicialDB
    indexes: {
      'por-sessao': number
      'por-sessao-jogador': [number, number]
    }
  }
}

let banco: Promise<IDBPDatabase<GerenciadorPeladaDB>> | null = null

export function obterBanco() {
  if (!banco) {
    banco = openDB<GerenciadorPeladaDB>('gerenciador-pelada', 13, {
      upgrade(db, oldVersion) {
        /*
         * Instalação nova:
         * cria a estrutura de jogadores.
         *
         * Em quem já está na versão 1 este bloco NÃO executa,
         * preservando todos os jogadores existentes.
         */
        if (oldVersion < 1) {
          const jogadores = db.createObjectStore('jogadores', {
            keyPath: 'id',
            autoIncrement: true,
          })

          jogadores.createIndex(
            'por-nome-exibicao',
            'nomeExibicao',
          )

          jogadores.createIndex(
            'por-tipo-padrao',
            'tipoPadrao',
          )

          jogadores.createIndex(
            'por-ativo',
            'ativo',
          )
        }

        /*
         * Versão 2:
         * adiciona sessões e participantes sem modificar
         * a store de jogadores existente.
         */
        if (oldVersion < 2) {
          const sessoes = db.createObjectStore('sessoes', {
            keyPath: 'id',
            autoIncrement: true,
          })

          sessoes.createIndex(
            'por-data',
            'data',
          )

          sessoes.createIndex(
            'por-status',
            'status',
          )

          const participantes = db.createObjectStore(
            'sessao_participantes',
            {
              keyPath: 'id',
              autoIncrement: true,
            },
          )

          participantes.createIndex(
            'por-sessao',
            'sessaoId',
          )

          participantes.createIndex(
            'por-jogador',
            'jogadorId',
          )

          /*
           * Um jogador deve possuir apenas um registro
           * de participação dentro da mesma sessão.
           */
          participantes.createIndex(
            'por-sessao-jogador',
            ['sessaoId', 'jogadorId'],
            { unique: true },
          )
        }

        /*
         * Versão 3:
         * adiciona somente o resultado do sorteio inicial dos goleiros.
         * Nenhuma store anterior é recriada ou apagada, preservando
         * jogadores, sessão atual e participantes já cadastrados.
         */
        if (oldVersion < 3) {
          const sorteioGoleiros = db.createObjectStore(
            'sorteio_goleiros_inicial',
            {
              keyPath: 'id',
              autoIncrement: true,
            },
          )

          sorteioGoleiros.createIndex(
            'por-sessao',
            'sessaoId',
          )

          sorteioGoleiros.createIndex(
            'por-sessao-jogador',
            ['sessaoId', 'jogadorId'],
            { unique: true },
          )
        }

        /*
         * Versão 4:
         * corColete é um campo opcional dentro dos registros já existentes.
         * IndexedDB não exige alteração estrutural da store para novos campos,
         * portanto apenas elevamos a versão e preservamos integralmente o
         * sorteio de goleiros realizado na versão 3.
         */
        if (oldVersion < 4) {
          // Migração intencionalmente sem recriar stores ou registros.
        }

        /*
         * Versão 5:
         * cria a store das configurações da pelada. As regras deixam de ficar
         * espalhadas pelas telas e passam a ter uma única fonte local.
         */
        if (oldVersion < 5) {
          db.createObjectStore('configuracoes', {
            keyPath: 'id',
          })
        }

        /*
         * Versão 6:
         * persiste o sorteio inicial dos jogadores de linha. O grupo é salvo
         * junto do número para que F5/reabertura nunca refaça o sorteio.
         */
        if (oldVersion < 6) {
          const store = db.createObjectStore('sorteio_linha_inicial', {
            keyPath: 'id',
            autoIncrement: true,
          })

          store.createIndex('por-sessao', 'sessaoId')
          store.createIndex(
            'por-sessao-jogador',
            ['sessaoId', 'jogadorId'],
            { unique: true },
          )
          store.createIndex(
            'por-sessao-grupo',
            ['sessaoId', 'grupo'],
          )
        }


        /*
         * Versão 7:
         * cria a estrutura oficial das partidas. A formação que entra em quadra
         * vira um registro próprio, independente do sorteio inicial, para que
         * F5/reabertura nunca precise reconstruir uma partida em andamento.
         */
        if (oldVersion < 7) {
          const partidas = db.createObjectStore('partidas', {
            keyPath: 'id',
            autoIncrement: true,
          })

          partidas.createIndex('por-sessao', 'sessaoId')
          partidas.createIndex(
            'por-sessao-numero',
            ['sessaoId', 'numero'],
            { unique: true },
          )
          partidas.createIndex('por-status', 'status')

          const times = db.createObjectStore('partida_times', {
            keyPath: 'id',
            autoIncrement: true,
          })

          times.createIndex('por-partida', 'partidaId')
          times.createIndex(
            'por-partida-lado',
            ['partidaId', 'lado'],
            { unique: true },
          )

          const jogadores = db.createObjectStore('partida_jogadores', {
            keyPath: 'id',
            autoIncrement: true,
          })

          jogadores.createIndex('por-partida', 'partidaId')
          jogadores.createIndex(
            'por-partida-lado',
            ['partidaId', 'lado'],
          )
          jogadores.createIndex(
            'por-partida-jogador',
            ['partidaId', 'jogadorId'],
            { unique: true },
          )
        }
        /* Versão 8: novos campos do relógio não exigem recriar a store. */
        if (oldVersion < 8) {
          // Migração sem alteração estrutural.
        }

        /*
         * Versão 9: histórico oficial dos eventos da partida.
         */
        if (oldVersion < 9) {
          const eventos = db.createObjectStore('partida_eventos', {
            keyPath: 'id',
            autoIncrement: true,
          })
          eventos.createIndex('por-partida', 'partidaId')
          eventos.createIndex('por-partida-tipo', ['partidaId', 'tipo'])
        }

        /*
         * Versão 10:
         * persiste o sorteio de tampinha usado para resolver operacionalmente
         * uma partida empatada. O empate continua sendo o resultado esportivo.
         */
        if (oldVersion < 10) {
          const tampinhas = db.createObjectStore('tampinhas_empate', {
            keyPath: 'id',
            autoIncrement: true,
          })
          tampinhas.createIndex('por-partida', 'partidaId', { unique: true })
          tampinhas.createIndex('por-sessao', 'sessaoId')
        }

        /*
         * Versão 11:
         * fila operacional persistente. Cada atleta passa a ter posição e
         * prioridade próprias, sem apagar o histórico do sorteio inicial.
         */
        if (oldVersion < 11) {
          const fila = db.createObjectStore('fila_operacional', {
            keyPath: 'id',
            autoIncrement: true,
          })
          fila.createIndex('por-sessao', 'sessaoId')
          fila.createIndex('por-sessao-jogador', ['sessaoId', 'jogadorId'], {
            unique: true,
          })
          fila.createIndex('por-sessao-status', ['sessaoId', 'status'])
          fila.createIndex('por-sessao-prioridade', ['sessaoId', 'prioridade'])
        }

        /*
         * Versão 12: persiste as tampinhas usadas na cascata de substituição
         * causada por chegadas atrasadas. Assim F5 nunca refaz um sorteio.
         */
        if (oldVersion < 12) {
          const tampinhasSubstituicao = db.createObjectStore('tampinhas_substituicao', {
            keyPath: 'id',
            autoIncrement: true,
          })
          tampinhasSubstituicao.createIndex('por-sessao', 'sessaoId')
          tampinhasSubstituicao.createIndex(
            'por-sessao-grupo',
            ['sessaoId', 'grupo'],
          )
        }

        /*
         * Versão 13: formações operacionais independentes do sorteio inicial.
         * A migração é propositalmente não destrutiva: não altera fila,
         * partidas ou tampinhas existentes. O repositório v13 fará a primeira
         * reconstrução idempotente das formações usando o estado já persistido.
         */
        if (oldVersion < 13) {
          const formacoes = db.createObjectStore('formacoes_operacionais', {
            keyPath: 'id',
            autoIncrement: true,
          })
          formacoes.createIndex('por-sessao', 'sessaoId')
          formacoes.createIndex('por-sessao-status', ['sessaoId', 'status'])
          formacoes.createIndex('por-sessao-ordem', ['sessaoId', 'ordem'], {
            unique: true,
          })

          const membros = db.createObjectStore('formacao_operacional_membros', {
            keyPath: 'id',
            autoIncrement: true,
          })
          membros.createIndex('por-sessao', 'sessaoId')
          membros.createIndex('por-formacao', 'formacaoId')
          membros.createIndex('por-sessao-jogador', ['sessaoId', 'jogadorId'], {
            unique: true,
          })
        }

      },
    })
  }

  return banco
}