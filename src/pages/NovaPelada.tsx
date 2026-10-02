import { useEffect, useMemo, useState } from 'react'
import { obterConfiguracaoPelada } from '../db/configuracoesRepository'
import {
  listarSorteioInicialLinha,
  salvarSorteioInicialLinha,
} from '../db/sorteioLinhaRepository'
import {
  buscarPartidaEmAndamentoCompleta,
  buscarTampinhaEmpate,
  buscarUltimaPartidaCompletaDaSessao,
  finalizarPartida,
  iniciarPrimeiraPartida,
  iniciarProximaPartida,
  iniciarProximaPartidaAposEmpateComPermanencia,
  iniciarPartidaComDoisTimesAposEmpate,
  listarFilaOperacional,
  listarFormacoesFilaOperacional,
  organizarChegadaAtrasadaNaFila,
  normalizarFilaOperacionalV13,
  diagnosticarFilaOperacionalV13,
  reconstruirFormacoesOperacionaisV13,
  type DiagnosticoFilaV13,
  listarUltimosNumerosTampinhaV13,
  type FormacaoOperacionalCompletaV13,
  type UltimoNumeroTampinhaJogadorV13,
  ordenarRetornosDoEmpateNaFila,
  registrarTampinhaEmpate,
  inicializarFilaOperacional,
  garantirFilaOperacionalCompletaDaSessao,
  sincronizarFilaComPartida,
  normalizarRelogioPartida,
  pausarPartida,
  registrarGolPartida,
  retomarPartida,
  type PartidaEmAndamentoCompleta,
} from '../db/partidasRepository'
import type { ConfiguracaoPeladaDB, TampinhaEmpateDB, FilaOperacionalDB } from '../db/database'

import {
  analisarListaPelada,
  type JogadorExtraidoLista,
  type ResultadoAnaliseLista,
} from '../utils/analisarListaPelada'

import {
  buscarJogadoresPorIdentificador,
  buscarSugestoesJogador,
  buscarJogadorPorId,
  cadastrarJogador,
  listarJogadores,
  type CorrespondenciaJogador,
  type SugestaoJogador,
} from '../db/jogadoresRepository'

import type { JogadorDB } from '../db/database'

import {
  criarSessao,
  descartarSessaoEmPreparacao,
  listarParticipantesSessao,
  listarSessoes,
  listarSorteioInicialGoleiros,
  registrarChegadaAtrasada,
  salvarParticipanteSessao,
  salvarSorteioInicialGoleiros,
  salvarParticipantesSessao,
} from '../db/sessoesRepository'

import './NovaPelada.css'

type StatusReconhecimento =
  | 'RECONHECIDO'
  | 'NAO_RECONHECIDO'
  | 'AMBIGUO'

type JogadorReconhecido = {
  nomeLista: string
  tipoLista: 'LINHA' | 'GOLEIRO'
  status: StatusReconhecimento
  jogador?: JogadorDB
  correspondencias: CorrespondenciaJogador[]

  // Indica que uma ambiguidade foi resolvida manualmente pelo operador.
  identificadoManualmente?: boolean
}

type ParticipantePresenca = {
  jogador: JogadorDB
  nomeLista: string
  funcaoHoje: 'LINHA' | 'GOLEIRO'
  presente: boolean
  chegouAtrasado?: boolean
  ordemChegada?: number
}

type ResultadoSorteioGoleiro = {
  jogador: JogadorDB
  numeroSorteado: number
  ordem: number
  corColete?: string
}

function hojeFormatoInput() {
  const agora = new Date()

  const ano = agora.getFullYear()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')

  return `${ano}-${mes}-${dia}`
}


type ResultadoSorteioLinha = {
  jogador: JogadorDB
  numeroSorteado: number
  grupo: number
  posicaoNoGrupo: number
  grupoCompleto: boolean
}

type CamisaColeteProps = {
  cor: string
}

/*
 * SVG próprio: a camisa recebe diretamente o HEX salvo nas configurações.
 * Assim qualquer nova cor funciona sem depender de emoji ou biblioteca.
 */
function CamisaColete({ cor }: CamisaColeteProps) {
  return (
    <svg
      className="camisa-colete-svg"
      viewBox="0 0 120 120"
      role="img"
      aria-label="Camisa do colete sorteado"
    >
      <path
        d="M39 18 50 12c3 7 17 7 20 0l11 6 22 10-12 27-13-6v55H42V49l-13 6-12-27 22-10Z"
        fill={cor}
        stroke="rgba(18, 46, 31, 0.72)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M50 12c2 10 18 10 20 0"
        fill="none"
        stroke="rgba(255,255,255,0.88)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M30 29 39 48M90 29 81 48"
        fill="none"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function NovaPelada() {
  const [configuracaoPelada, setConfiguracaoPelada] =
    useState<ConfiguracaoPeladaDB | null>(null)

  const [sorteandoLinha, setSorteandoLinha] = useState(false)
  const [resultadoSorteioLinha, setResultadoSorteioLinha] =
    useState<ResultadoSorteioLinha[]>([])

  const [iniciandoPartida, setIniciandoPartida] = useState(false)
  const [sessaoEmAndamentoId, setSessaoEmAndamentoId] =
    useState<number | null>(null)
  const [partidaEmAndamento, setPartidaEmAndamento] =
    useState<PartidaEmAndamentoCompleta | null>(null)
  const [agoraRelogio, setAgoraRelogio] = useState(Date.now())
  const [alterandoPausa, setAlterandoPausa] = useState(false)
  const [finalizandoPartida, setFinalizandoPartida] = useState(false)
  const [filaOperacionalAtual, setFilaOperacionalAtual] = useState<FilaOperacionalDB[]>([])
  // V13: projeção das formações atuais; a tela não depende mais de grupoOrigem.
  const [formacoesOperacionaisV13, setFormacoesOperacionaisV13] = useState<FormacaoOperacionalCompletaV13[]>([])
  const [diagnosticoFilaV13, setDiagnosticoFilaV13] = useState<DiagnosticoFilaV13 | null>(null)
  const [ultimosNumerosTampinhaV13, setUltimosNumerosTampinhaV13] = useState<UltimoNumeroTampinhaJogadorV13[]>([])
  const [iniciandoProximaPartida, setIniciandoProximaPartida] = useState(false)
  const [resultadoTampinhaEmpate, setResultadoTampinhaEmpate] = useState<TampinhaEmpateDB | null>(null)
  const [sorteandoTampinhaEmpate, setSorteandoTampinhaEmpate] = useState(false)
  const [confirmacaoEmpateAberta, setConfirmacaoEmpateAberta] = useState(false)
  // Resultado visual das tampinhas geradas pela entrada de um atrasado.
  const [resultadoCascataAtrasado, setResultadoCascataAtrasado] = useState<{
    jogadorChegando: string
    etapas: Array<{
      grupo: number
      numeros: Array<{ nome: string; numero: number }>
      jogadorSaindo: string
      jogadorEntrando: string
    }>
  } | null>(null)
  const [confirmacaoFinalizacao, setConfirmacaoFinalizacao] = useState<{
    nomeTime1: string
    nomeTime2: string
    placarTime1: number
    placarTime2: number
  } | null>(null)
  const [resultadoPartidaAberto, setResultadoPartidaAberto] = useState<{
    tipo: 'VITORIA' | 'EMPATE'
    placar: string
    vencedor?: string
    perdedor?: string
  } | null>(null)
  const [confirmacaoProximaPartida, setConfirmacaoProximaPartida] = useState<{
    numeroPartida: number
    grupo: number
    vencedor: string
    corEntrada: string
    jogadores: string[]
    goleiro: string
    descricaoGoleiro: string
    partidaId: number
    sessaoId: number
    goleiroId: number
    jogadoresLinhaIds: number[]
  } | null>(null)
  const [dadosConfirmacaoEmpate, setDadosConfirmacaoEmpate] = useState<{
    titulo: string
    subtitulo: string
    times: Array<{ titulo: string; jogadores: string[]; goleiro: string; detalheGoleiro?: string }>
    rodape: string
  } | null>(null)
  const [acaoConfirmacaoEmpate, setAcaoConfirmacaoEmpate] = useState<(() => Promise<void>) | null>(null)
  const [golAbertoLado, setGolAbertoLado] = useState<1 | 2 | null>(null)
  const [autorGolId, setAutorGolId] = useState<number | null>(null)
  const [salvandoGol, setSalvandoGol] = useState(false)
  const [erroGol, setErroGol] = useState('')
  const [organizacaoAberta, setOrganizacaoAberta] = useState(false)
  const [chegadaAtrasadaAberta, setChegadaAtrasadaAberta] = useState(false)
  const [jogadoresChegada, setJogadoresChegada] = useState<JogadorDB[]>([])
  const [jogadorChegadaId, setJogadorChegadaId] = useState<number | null>(null)
  const [buscaChegada, setBuscaChegada] = useState('')
  const [tipoChegada, setTipoChegada] = useState<'LINHA' | 'GOLEIRO'>('LINHA')
  const [salvandoChegada, setSalvandoChegada] = useState(false)
  const [erroChegada, setErroChegada] = useState('')
  const [cadastroChegadaAberto, setCadastroChegadaAberto] = useState(false)
  const [chegadaNomeCompleto, setChegadaNomeCompleto] = useState('')
  const [chegadaNomeExibicao, setChegadaNomeExibicao] = useState('')
  const [chegadaApelidos, setChegadaApelidos] = useState('')
  const [chegadaTipoPadrao, setChegadaTipoPadrao] = useState<'LINHA' | 'GOLEIRO'>('LINHA')

  const [dataPelada, setDataPelada] = useState(hojeFormatoInput())
  const [textoLista, setTextoLista] = useState('')

  const [resultadoLista, setResultadoLista] =
    useState<ResultadoAnaliseLista | null>(null)

  const [jogadoresReconhecidos, setJogadoresReconhecidos] = useState<
    JogadorReconhecido[]
  >([])

  const [identificando, setIdentificando] = useState(false)
  const [etapaReconhecimento, setEtapaReconhecimento] = useState(false)

  /*
   * Guarda qual nome está sendo resolvido manualmente.
   * O índice identifica exatamente a ocorrência dentro da lista atual.
   */
  const [indiceIdentificacao, setIndiceIdentificacao] =
    useState<number | null>(null)

  const [jogadorSelecionadoId, setJogadorSelecionadoId] =
    useState<number | null>(null)

  const [sugestoesIdentificacao, setSugestoesIdentificacao] = useState<
    SugestaoJogador[]
  >([])

  const [buscandoSugestoes, setBuscandoSugestoes] = useState(false)

  // Controla o formulário de cadastro rápido sem tirar o operador da Nova Pelada.
  const [cadastroRapidoAberto, setCadastroRapidoAberto] = useState(false)
  const [salvandoNovoJogador, setSalvandoNovoJogador] = useState(false)
  const [novoNomeCompleto, setNovoNomeCompleto] = useState('')
  const [novoNomeExibicao, setNovoNomeExibicao] = useState('')
  const [novosApelidos, setNovosApelidos] = useState('')
  const [novoTipoPadrao, setNovoTipoPadrao] = useState<'LINHA' | 'GOLEIRO'>('LINHA')

  // A presença é preparada somente depois que todos os nomes foram resolvidos.
  const [etapaPresenca, setEtapaPresenca] = useState(false)
  const [participantesPresenca, setParticipantesPresenca] = useState<ParticipantePresenca[]>([])
  const [salvandoSessao, setSalvandoSessao] = useState(false)
  const [descartandoSessao, setDescartandoSessao] = useState(false)
  const [sessaoCriadaId, setSessaoCriadaId] = useState<number | null>(null)
  const [sessaoRecuperada, setSessaoRecuperada] = useState(false)
  const [carregandoSessao, setCarregandoSessao] = useState(true)

  // O sorteio inicial dos goleiros é oficial: depois de salvo, F5 apenas recupera o resultado.
  const [sorteandoGoleiros, setSorteandoGoleiros] = useState(false)
  const [resultadoSorteioGoleiros, setResultadoSorteioGoleiros] = useState<
    ResultadoSorteioGoleiro[]
  >([])

  useEffect(() => {
    if (!partidaEmAndamento) return
    // O intervalo só redesenha; o tempo real vem dos timestamps persistidos.
    const intervalo = window.setInterval(() => setAgoraRelogio(Date.now()), 250)
    return () => window.clearInterval(intervalo)
  }, [partidaEmAndamento])

  useEffect(() => {
    async function carregarConfiguracao() {
      try {
        const cfg = await obterConfiguracaoPelada()
        setConfiguracaoPelada(cfg)
      } catch (erro) {
        console.error('Erro ao carregar configuração da pelada:', erro)
      }
    }

    carregarConfiguracao()
  }, [])

  useEffect(() => {
    async function recuperarSorteioLinha() {
      if (sessaoCriadaId === null || participantesPresenca.length === 0) {
        return
      }

      try {
        const salvos = await listarSorteioInicialLinha(sessaoCriadaId)

        if (salvos.length === 0) {
          setResultadoSorteioLinha([])
          return
        }

        const recuperados = salvos
          .map((salvo) => {
            const participante = participantesPresenca.find(
              (item) => item.jogador.id === salvo.jogadorId,
            )

            if (!participante) return null

            return {
              jogador: participante.jogador,
              numeroSorteado: salvo.numeroSorteado,
              grupo: salvo.grupo,
              posicaoNoGrupo: salvo.posicaoNoGrupo,
              grupoCompleto: salvo.grupoCompleto,
            }
          })
          .filter(
            (item): item is NonNullable<typeof item> => item !== null,
          )
          .sort((a, b) => a.numeroSorteado - b.numeroSorteado)

        setResultadoSorteioLinha(recuperados)
      } catch (erro) {
        console.error('Erro ao recuperar sorteio inicial da linha:', erro)
      }
    }

    recuperarSorteioLinha()
  }, [sessaoCriadaId, participantesPresenca])

  useEffect(() => {
    async function recuperarSessaoEmPreparacao() {
      try {
        /*
         * Após F5/fechar o navegador, o React perde o estado da tela.
         * A fonte de verdade passa a ser o IndexedDB: recuperamos a sessão
         * PREPARACAO mais recente e reconstruímos a conferência de presença.
         */
        const sessoes = await listarSessoes()
        /*
         * Uma sessão EM_ANDAMENTO tem prioridade absoluta. Depois que a partida
         * começou, Nova Pelada não pode oferecer uma nova lista como se nada
         * estivesse acontecendo.
         */
        const sessoesEmAndamento = sessoes
          .filter(
            (sessao) =>
              sessao.status === 'EM_ANDAMENTO' && sessao.id !== undefined,
          )
          .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))

        const sessaoAndamento = sessoesEmAndamento[0]

        if (sessaoAndamento?.id) {
          const partidaEmCurso = await buscarPartidaEmAndamentoCompleta(
            sessaoAndamento.id,
          )

          // Mantém a última partida finalizada visível após F5 até existir a próxima.
          const partida =
            partidaEmCurso ??
            (await buscarUltimaPartidaCompletaDaSessao(sessaoAndamento.id))

          if (partida) {
            /*
             * A partida e a organização usam a mesma sessão.
             * Por isso, ao recuperar uma pelada em andamento, também reconstruímos
             * participantes e sorteios. Assim a fila continua disponível após F5.
             */
            const participantesSalvos = await listarParticipantesSessao(
              sessaoAndamento.id,
            )

            const participantesRecuperados = await Promise.all(
              participantesSalvos.map(async (participante) => {
                const jogador = await buscarJogadorPorId(participante.jogadorId)
                if (!jogador) return null

                return {
                  jogador,
                  nomeLista: participante.nomeImportado,
                  funcaoHoje: participante.tipoSessao,
                  presente: participante.presente,
                  chegouAtrasado: participante.chegouAtrasado,
                  ordemChegada: participante.ordemChegada,
                } satisfies ParticipantePresenca
              }),
            )

            const participantesValidos = participantesRecuperados.filter(
              (item): item is NonNullable<typeof item> => item !== null,
            )

            const sorteioGoleirosSalvo = await listarSorteioInicialGoleiros(
              sessaoAndamento.id,
            )

            const goleirosRecuperados = await Promise.all(
              sorteioGoleirosSalvo.map(async (item) => {
                const jogador = await buscarJogadorPorId(item.jogadorId)
                if (!jogador) return null

                return {
                  jogador,
                  numeroSorteado: item.numeroSorteado,
                  ordem: item.ordem,
                  corColete: item.corColete,
                } satisfies ResultadoSorteioGoleiro
              }),
            )

            setDataPelada(sessaoAndamento.data)
            setSessaoEmAndamentoId(sessaoAndamento.id)
            setSessaoCriadaId(sessaoAndamento.id)
            setParticipantesPresenca(participantesValidos)
            setResultadoSorteioGoleiros(
              goleirosRecuperados
                .filter(
                  (item): item is NonNullable<typeof item> => item !== null,
                )
                .sort((a, b) => a.ordem - b.ordem),
            )
            await garantirFilaOperacionalAtual(partida)
            setPartidaEmAndamento(partida)

            if (
              partida.partida.id &&
              partida.partida.status === 'FINALIZADA' &&
              partida.partida.resultado === 'EMPATE'
            ) {
              const tampinhaSalva = await buscarTampinhaEmpate(partida.partida.id)
              setResultadoTampinhaEmpate(tampinhaSalva)

              /*
               * V13: F5 apenas reconstrói a projeção operacional a partir do
               * histórico persistido. Nenhuma tampinha nova é sorteada aqui.
               */
              if (tampinhaSalva) {
                const cfgAtual = await obterConfiguracaoPelada()
                const reconstrucao = await reconstruirFormacoesOperacionaisV13(
                  sessaoAndamento.id,
                  cfgAtual.jogadoresLinhaPorTime ?? 4,
                )
                setFormacoesOperacionaisV13(reconstrucao.formacoes)
                setUltimosNumerosTampinhaV13(
                  await listarUltimosNumerosTampinhaV13(sessaoAndamento.id),
                )
              }
            } else {
              setResultadoTampinhaEmpate(null)
            }

            return
          }
        }

        const sessoesEmPreparacao = sessoes
          .filter(
            (sessao) =>
              sessao.status === 'PREPARACAO' && sessao.id !== undefined,
          )
          .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))

        const sessao = sessoesEmPreparacao[0]

        if (!sessao?.id) return

        const participantesSalvos = await listarParticipantesSessao(sessao.id)

        if (participantesSalvos.length === 0) return

        const participantesRecuperados = await Promise.all(
          participantesSalvos.map(async (participante) => {
            const jogador = await buscarJogadorPorId(participante.jogadorId)

            if (!jogador) return null

            return {
              jogador,
              nomeLista: participante.nomeImportado,
              funcaoHoje: participante.tipoSessao,
              presente: participante.presente,
              chegouAtrasado: participante.chegouAtrasado,
              ordemChegada: participante.ordemChegada,
            } satisfies ParticipantePresenca
          }),
        )

        const participantesValidos = participantesRecuperados
          .filter((item): item is NonNullable<typeof item> => item !== null)
          .sort((a, b) =>
            a.jogador.nomeExibicao.localeCompare(b.jogador.nomeExibicao, 'pt-BR', {
              sensitivity: 'base',
            }),
          )

        if (participantesValidos.length === 0) return

        setDataPelada(sessao.data)
        setParticipantesPresenca(participantesValidos)
        setEtapaPresenca(true)
        setSessaoCriadaId(sessao.id)
        setSessaoRecuperada(true)

        const sorteioSalvo = await listarSorteioInicialGoleiros(sessao.id)

        if (sorteioSalvo.length > 0) {
          const sorteioRecuperado = await Promise.all(
            sorteioSalvo.map(async (item) => {
              const jogador = await buscarJogadorPorId(item.jogadorId)
              if (!jogador) return null

              return {
                jogador,
                numeroSorteado: item.numeroSorteado,
                ordem: item.ordem,
                corColete: item.corColete,
              } satisfies ResultadoSorteioGoleiro
            }),
          )

          setResultadoSorteioGoleiros(
            sorteioRecuperado
              .filter(
                (item): item is NonNullable<typeof item> => item !== null,
              )
              .sort((a, b) => a.ordem - b.ordem),
          )
        }
      } catch (erro) {
        console.error('Erro ao recuperar sessão em preparação:', erro)
      } finally {
        setCarregandoSessao(false)
      }
    }

    recuperarSessaoEmPreparacao()
  }, [])

  function analisarLista() {
    if (!textoLista.trim()) {
      alert('Cole a lista da pelada antes de analisar.')
      return
    }

    const resultado = analisarListaPelada(textoLista)

    if (resultado.total === 0) {
      alert(
        'Nenhum jogador foi identificado. Confira se a lista possui as seções de goleiros e jogadores.',
      )
      return
    }

    setResultadoLista(resultado)

    // Uma nova análise invalida reconhecimentos anteriores.
    setJogadoresReconhecidos([])
    setEtapaReconhecimento(false)
    setEtapaPresenca(false)
    setParticipantesPresenca([])
    setSessaoCriadaId(null)
    setSessaoRecuperada(false)
    setResultadoSorteioGoleiros([])
    fecharIdentificacao()
  }

  async function reconhecerJogador(
    jogadorLista: JogadorExtraidoLista,
  ): Promise<JogadorReconhecido> {
    const correspondencias = await buscarJogadoresPorIdentificador(
      jogadorLista.nome,
    )

    // Uma única correspondência permite reconhecimento automático.
    if (correspondencias.length === 1) {
      return {
        nomeLista: jogadorLista.nome,
        tipoLista: jogadorLista.tipo,
        status: 'RECONHECIDO',
        jogador: correspondencias[0].jogador,
        correspondencias,
      }
    }

    // Nenhuma correspondência precisará ser resolvida pelo operador.
    if (correspondencias.length === 0) {
      return {
        nomeLista: jogadorLista.nome,
        tipoLista: jogadorLista.tipo,
        status: 'NAO_RECONHECIDO',
        correspondencias: [],
      }
    }

    // Nunca escolhemos automaticamente quando há mais de uma possibilidade.
    return {
      nomeLista: jogadorLista.nome,
      tipoLista: jogadorLista.tipo,
      status: 'AMBIGUO',
      correspondencias,
    }
  }

  async function identificarJogadores() {
    if (!resultadoLista) return

    try {
      setIdentificando(true)

      /*
       * Cruza os nomes da lista com o cadastro permanente.
       * LINHA/GOLEIRO continua sendo a função informada para a pelada atual.
       */
      const resultados = await Promise.all(
        resultadoLista.jogadores.map((jogador) =>
          reconhecerJogador(jogador),
        ),
      )

      // Ordem alfabética facilita a conferência pelo operador.
      resultados.sort((a, b) =>
        a.nomeLista.localeCompare(b.nomeLista, 'pt-BR', {
          sensitivity: 'base',
        }),
      )

      setJogadoresReconhecidos(resultados)
      setEtapaReconhecimento(true)
    } catch (erro) {
      console.error('Erro ao identificar jogadores da lista:', erro)
      alert('Não foi possível identificar os jogadores da lista.')
    } finally {
      setIdentificando(false)
    }
  }

  async function abrirIdentificacao(indice: number) {
    const item = jogadoresReconhecidos[indice]

    setIndiceIdentificacao(indice)
    setJogadorSelecionadoId(null)
    setSugestoesIdentificacao([])
    setCadastroRapidoAberto(false)

    /*
     * Quando já existem correspondências exatas, elas são as melhores opções.
     * Não ampliamos a busca para evitar candidatos sem relação com o nome.
     */
    if (item.correspondencias.length > 0) {
      setSugestoesIdentificacao(
        item.correspondencias.map((correspondencia) => ({
          jogador: correspondencia.jogador,
          motivo:
            correspondencia.encontradoEm === 'NOME_COMPLETO'
              ? 'NOME'
              : correspondencia.encontradoEm,
          valorEncontrado: correspondencia.valorEncontrado,
        })),
      )

      return
    }

    try {
      setBuscandoSugestoes(true)

      // Para nomes desconhecidos, mostramos apenas candidatos plausíveis.
      const sugestoes = await buscarSugestoesJogador(item.nomeLista)
      setSugestoesIdentificacao(sugestoes)
    } catch (erro) {
      console.error('Erro ao buscar sugestões de jogadores:', erro)
      setSugestoesIdentificacao([])
    } finally {
      setBuscandoSugestoes(false)
    }
  }

  function fecharIdentificacao() {
    setIndiceIdentificacao(null)
    setJogadorSelecionadoId(null)
    setSugestoesIdentificacao([])
    setBuscandoSugestoes(false)
    setCadastroRapidoAberto(false)
    setSalvandoNovoJogador(false)
    setNovoNomeCompleto('')
    setNovoNomeExibicao('')
    setNovosApelidos('')
    setNovoTipoPadrao('LINHA')
  }

  function confirmarIdentificacao() {
    if (indiceIdentificacao === null) return

    if (jogadorSelecionadoId === null) {
      alert('Selecione um jogador antes de confirmar.')
      return
    }

    const sugestaoSelecionada = sugestoesIdentificacao.find(
      (item) => item.jogador.id === jogadorSelecionadoId,
    )

    if (!sugestaoSelecionada) {
      alert('Não foi possível localizar o jogador selecionado.')
      return
    }

    /*
     * A identificação manual vale somente para esta pelada.
     * Não criamos apelidos permanentes automaticamente a partir da lista.
     */
    setJogadoresReconhecidos((listaAtual) =>
      listaAtual.map((item, indice) => {
        if (indice !== indiceIdentificacao) return item

        return {
          ...item,
          status: 'RECONHECIDO',
          jogador: sugestaoSelecionada.jogador,
          identificadoManualmente: true,
        }
      }),
    )

    fecharIdentificacao()
  }

  function abrirCadastroRapido() {
    if (!jogadorEmIdentificacao) return

    /*
     * O nome vindo do WhatsApp é apenas uma sugestão inicial.
     * O operador pode corrigir o nome completo e o nome de exibição antes de salvar.
     */
    setNovoNomeCompleto(jogadorEmIdentificacao.nomeLista)
    setNovoNomeExibicao(jogadorEmIdentificacao.nomeLista)
    setNovosApelidos('')

    /*
     * A função de hoje serve como valor inicial da posição habitual,
     * mas continua sendo um dado editável do cadastro permanente.
     */
    setNovoTipoPadrao(jogadorEmIdentificacao.tipoLista)
    setCadastroRapidoAberto(true)
  }

  async function salvarNovoJogador() {
    if (indiceIdentificacao === null || !jogadorEmIdentificacao) return

    const nomeCompleto = novoNomeCompleto.trim()
    const nomeExibicao = novoNomeExibicao.trim()

    if (!nomeCompleto) {
      alert('Informe o nome completo do jogador.')
      return
    }

    if (!nomeExibicao) {
      alert('Informe o nome de exibição do jogador.')
      return
    }

    const apelidos = novosApelidos
      .split(',')
      .map((apelido) => apelido.trim())
      .filter(Boolean)

    try {
      setSalvandoNovoJogador(true)

      const novoId = await cadastrarJogador({
        nomeCompleto,
        nomeExibicao,
        apelidos,
        tipoPadrao: novoTipoPadrao,
      })

      const jogadorCriado = await buscarJogadorPorId(novoId)

      if (!jogadorCriado) {
        throw new Error('Jogador cadastrado, mas não foi possível relê-lo.')
      }

      /*
       * Depois de gravar no cadastro permanente, já vinculamos o novo jogador
       * à ocorrência atual da lista. O operador não precisa identificá-lo de novo.
       */
      setJogadoresReconhecidos((listaAtual) =>
        listaAtual.map((item, indice) => {
          if (indice !== indiceIdentificacao) return item

          return {
            ...item,
            status: 'RECONHECIDO',
            jogador: jogadorCriado,
            correspondencias: [],
            identificadoManualmente: true,
          }
        }),
      )

      fecharIdentificacao()
    } catch (erro) {
      console.error('Erro ao cadastrar jogador pela Nova Pelada:', erro)
      alert('Não foi possível cadastrar o jogador.')
    } finally {
      setSalvandoNovoJogador(false)
    }
  }

  function continuarParaPresenca() {
    if (!todosResolvidos) return

    /*
     * Todos começam como NÃO por segurança. Assim ninguém entra no sorteio
     * apenas por estar escrito na lista do WhatsApp.
     */
    const participantes = jogadoresReconhecidos
      .filter((item): item is JogadorReconhecido & { jogador: JogadorDB } =>
        item.status === 'RECONHECIDO' && Boolean(item.jogador),
      )
      .map((item) => ({
        jogador: item.jogador,
        nomeLista: item.nomeLista,
        funcaoHoje: item.tipoLista,
        presente: false,
      }))
      .sort((a, b) =>
        a.jogador.nomeExibicao.localeCompare(b.jogador.nomeExibicao, 'pt-BR', {
          sensitivity: 'base',
        }),
      )

    setParticipantesPresenca(participantes)
    setEtapaPresenca(true)
  }

  async function persistirParticipantesAlterados(
    participantes: ParticipantePresenca[],
  ) {
    if (sessaoCriadaId === null) return

    /* Depois que a sessão existe, toda mudança oficial é persistida imediatamente. */
    await Promise.all(
      participantes.map(async (participante) => {
        if (participante.jogador.id === undefined) return

        await salvarParticipanteSessao(sessaoCriadaId, {
          jogadorId: participante.jogador.id,
          nomeImportado: participante.nomeLista,
          presente: participante.presente,
          tipoSessao: participante.funcaoHoje,
        })
      }),
    )
  }

  async function alternarPresenca(jogadorId: number | undefined) {
    if (resultadoSorteioGoleiros.length > 0) {
      alert('O sorteio inicial dos goleiros já foi realizado. A presença não pode ser alterada nesta etapa.')
      return
    }

    if (!jogadorId) return
    const anterior = participantesPresenca.find((p) => p.jogador.id === jogadorId)
    if (!anterior) return
    const atualizado = { ...anterior, presente: !anterior.presente }
    setParticipantesPresenca((lista) => lista.map((p) => p.jogador.id === jogadorId ? atualizado : p))
    try {
      await persistirParticipantesAlterados([atualizado])
    } catch (erro) {
      console.error('Erro ao salvar alteração de presença:', erro)
      alert('Não foi possível salvar a alteração de presença.')
      setParticipantesPresenca((lista) => lista.map((p) => p.jogador.id === jogadorId ? anterior : p))
    }
  }

  async function definirPresencaTodos(presente: boolean) {
    if (resultadoSorteioGoleiros.length > 0) {
      alert('O sorteio inicial dos goleiros já foi realizado. A presença não pode ser alterada nesta etapa.')
      return
    }

    const anterior = participantesPresenca
    const atualizada = participantesPresenca.map((p) => ({ ...p, presente }))
    setParticipantesPresenca(atualizada)
    try {
      await persistirParticipantesAlterados(atualizada)
    } catch (erro) {
      console.error('Erro ao salvar presença em massa:', erro)
      alert('Não foi possível salvar a alteração de presença.')
      setParticipantesPresenca(anterior)
    }
  }

  async function alternarPresencaGrupo(funcaoHoje: 'LINHA' | 'GOLEIRO') {
    if (resultadoSorteioGoleiros.length > 0) {
      alert('O sorteio inicial dos goleiros já foi realizado. A presença não pode ser alterada nesta etapa.')
      return
    }

    const grupo = participantesPresenca.filter((p) => p.funcaoHoje === funcaoHoje)
    if (grupo.length === 0) return
    const todosPresentes = grupo.every((p) => p.presente)
    const anterior = participantesPresenca
    const atualizada = participantesPresenca.map((p) => p.funcaoHoje === funcaoHoje ? { ...p, presente: !todosPresentes } : p)
    setParticipantesPresenca(atualizada)
    try {
      await persistirParticipantesAlterados(atualizada.filter((p) => p.funcaoHoje === funcaoHoje))
    } catch (erro) {
      console.error('Erro ao salvar presença do grupo:', erro)
      alert('Não foi possível salvar a alteração de presença do grupo.')
      setParticipantesPresenca(anterior)
    }
  }

  async function confirmarPresenca() {
    if (totalPresentes === 0) {
      alert('Confirme pelo menos um jogador presente antes de continuar.')
      return
    }

    if (sessaoCriadaId !== null) {
      alert('A presença desta pelada já foi confirmada.')
      return
    }

    const participantesValidos = participantesPresenca.filter(
      (participante) => participante.jogador.id !== undefined,
    )

    try {
      setSalvandoSessao(true)

      /*
       * A sessão só é criada quando o operador confirma a presença.
       * Até aqui, alterações na tela ainda são apenas preparação.
       */
      const sessaoId = await criarSessao(dataPelada)

      await salvarParticipantesSessao(
        sessaoId,
        participantesValidos.map((participante) => ({
          jogadorId: participante.jogador.id!,
          nomeImportado: participante.nomeLista,
          presente: participante.presente,
          tipoSessao: participante.funcaoHoje,
        })),
      )

      setSessaoCriadaId(sessaoId)
      setSessaoRecuperada(false)
      alert(
        `Presença confirmada com sucesso. Sessão #${sessaoId} criada com ${totalPresentes} jogador(es) presente(s).`,
      )
    } catch (erro) {
      console.error('Erro ao confirmar presença da pelada:', erro)
      alert('Não foi possível salvar a sessão e a presença.')
    } finally {
      setSalvandoSessao(false)
    }
  }

  async function sortearGoleirosIniciais() {
    if (sessaoCriadaId === null) {
      alert('Confirme a presença antes de realizar o sorteio.')
      return
    }

    if (resultadoSorteioGoleiros.length > 0) {
      alert('O sorteio inicial dos goleiros desta pelada já foi realizado.')
      return
    }

    const goleirosPresentes = participantesPresenca.filter(
      (participante) =>
        participante.presente &&
        participante.funcaoHoje === 'GOLEIRO' &&
        participante.jogador.id !== undefined,
    )

    if (goleirosPresentes.length < 2) {
      alert('É necessário ter pelo menos 2 goleiros presentes para realizar o sorteio inicial.')
      return
    }

    try {
      setSorteandoGoleiros(true)

      /*
       * Cada goleiro recebe exatamente um número de 1 até a quantidade
       * de goleiros presentes. O embaralhamento é feito uma única vez;
       * depois disso o resultado oficial é persistido no IndexedDB.
       */
      const numeros = Array.from(
        { length: goleirosPresentes.length },
        (_, indice) => indice + 1,
      )

      for (let indice = numeros.length - 1; indice > 0; indice -= 1) {
        const indiceAleatorio = Math.floor(Math.random() * (indice + 1))
        ;[numeros[indice], numeros[indiceAleatorio]] = [
          numeros[indiceAleatorio],
          numeros[indice],
        ]
      }

      const resultados = goleirosPresentes
        .map((participante, indice) => ({
          jogador: participante.jogador,
          numeroSorteado: numeros[indice],
          ordem: numeros[indice],
          corColete: undefined as string | undefined,
        }))
        .sort((a, b) => a.ordem - b.ordem)

      /*
       * Um único clique define toda a preparação inicial dos goleiros.
       * #1 e #2 começam a primeira queda e recebem Verde/Laranja por sorteio.
       * #3 em diante mantêm apenas a ordem, sem cor até entrarem em quadra.
       */
      const configuracao =
        configuracaoPelada ?? (await obterConfiguracaoPelada())

      if (configuracao.coresColetes.length < 2) {
        alert(
          'Configure pelo menos 2 cores de colete antes de realizar o sorteio.',
        )
        return
      }

      /*
       * As cores não pertencem ao código da Pelada de Segunda.
       * Elas vêm da configuração da pelada atual. Embaralhamos todas as
       * cores cadastradas e usamos duas distintas para os times iniciais.
       */
      const coresDisponiveis = [...configuracao.coresColetes]

      for (let i = coresDisponiveis.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[coresDisponiveis[i], coresDisponiveis[j]] = [
          coresDisponiveis[j],
          coresDisponiveis[i],
        ]
      }

      if (resultados[0]) {
        resultados[0].corColete = coresDisponiveis[0].nome
      }

      if (resultados[1]) {
        resultados[1].corColete = coresDisponiveis[1].nome
      }

      await salvarSorteioInicialGoleiros(
        sessaoCriadaId,
        resultados.map((resultado) => ({
          jogadorId: resultado.jogador.id!,
          numeroSorteado: resultado.numeroSorteado,
          ordem: resultado.ordem,
          corColete: resultado.corColete,
        })),
      )

      setResultadoSorteioGoleiros(resultados)
    } catch (erro) {
      console.error('Erro ao realizar sorteio inicial dos goleiros:', erro)
      alert('Não foi possível realizar o sorteio inicial dos goleiros.')
    } finally {
      setSorteandoGoleiros(false)
    }
  }

  async function atualizarOrganizacaoOperacionalV13() {
    const sessaoId = sessaoEmAndamentoId ?? sessaoCriadaId
    if (sessaoId === null) return

    try {
      const cfg = configuracaoPelada ?? (await obterConfiguracaoPelada())
      const quantidadeLinha = cfg.jogadoresLinhaPorTime ?? 4
      const totalParticipantes = participantesPresenca.filter(
        (participante) => participante.presente,
      ).length

      /*
       * A partida em andamento define apenas quem está na quadra.
       * Todos os demais são reconstruídos imediatamente como fila futura.
       */
      await reconstruirFormacoesOperacionaisV13(sessaoId, quantidadeLinha)

      /*
       * Tudo que NÃO depende do resultado da partida atual é resolvido agora.
       * Ex.: Ciro sozinho antes de dois times completos dispara a cascata de
       * tampinhas e a última sobra vai para o final da fila.
       *
       * Goleiros que estão na partida atual continuam fora dessas formações e
       * só serão destinados quando o resultado da partida exigir essa decisão.
       */
      const normalizada = await normalizarFilaOperacionalV13(
        sessaoId,
        quantidadeLinha,
        totalParticipantes,
        cfg.menorNumeroSai ?? true,
      )

      setFormacoesOperacionaisV13(normalizada.formacoes)
      setFilaOperacionalAtual(await listarFilaOperacional(sessaoId))
      setUltimosNumerosTampinhaV13(
        await listarUltimosNumerosTampinhaV13(sessaoId),
      )
      setDiagnosticoFilaV13(await diagnosticarFilaOperacionalV13(sessaoId))

      if (normalizada.cascata.length > 0) {
        const nome = (id: number) =>
          participantesPresenca.find((p) => p.jogador.id === id)?.jogador
            .nomeExibicao ?? `Jogador #${id}`

        setResultadoCascataAtrasado({
          jogadorChegando: 'Fila operacional',
          etapas: normalizada.cascata.map((etapa) => ({
            grupo: etapa.grupo,
            numeros: etapa.numeros.map((item) => ({
              nome: nome(item.jogadorId),
              numero: item.numero,
            })),
            jogadorSaindo: nome(etapa.jogadorSaindoId),
            jogadorEntrando: nome(etapa.jogadorEntrandoId),
          })),
        })
      }
    } catch (erro) {
      console.error('Erro ao atualizar Organização/Fila:', erro)
      alert(
        erro instanceof Error
          ? erro.message
          : 'Não foi possível atualizar a Organização/Fila.',
      )
    }
  }


  async function sortearJogadoresLinhaIniciais() {
    if (sessaoCriadaId === null) {
      alert('Crie a sessão antes de realizar o sorteio dos jogadores de linha.')
      return
    }

    if (resultadoSorteioGoleiros.length < 2) {
      alert('Realize primeiro o sorteio inicial dos goleiros.')
      return
    }

    if (resultadoSorteioLinha.length > 0) {
      alert('O sorteio inicial dos jogadores de linha já foi realizado.')
      return
    }

    const jogadoresPresentes = participantesPresenca.filter(
      (item) =>
        item.presente &&
        item.funcaoHoje === 'LINHA' &&
        item.jogador.id !== undefined,
    )

    if (jogadoresPresentes.length === 0) {
      alert('Não existem jogadores de linha presentes para sortear.')
      return
    }

    try {
      setSorteandoLinha(true)

      const configuracao =
        configuracaoPelada ?? (await obterConfiguracaoPelada())

      const tamanhoGrupo = configuracao.jogadoresLinhaPorTime

      if (tamanhoGrupo < 1) {
        alert('A quantidade de jogadores por time está inválida nas configurações.')
        return
      }

      /*
       * Sorteio inicial: a sacola vai de 1 até o TOTAL DE JOGADORES DE LINHA
       * PRESENTES neste momento. Os números não se repetem.
       */
      const numeros = Array.from(
        { length: jogadoresPresentes.length },
        (_, indice) => indice + 1,
      )

      for (let i = numeros.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[numeros[i], numeros[j]] = [numeros[j], numeros[i]]
      }

      const resultados = jogadoresPresentes
        .map((participante, indice) => {
          const numeroSorteado = numeros[indice]
          const grupo = Math.ceil(numeroSorteado / tamanhoGrupo)
          const posicaoNoGrupo =
            ((numeroSorteado - 1) % tamanhoGrupo) + 1

          return {
            jogador: participante.jogador,
            numeroSorteado,
            grupo,
            posicaoNoGrupo,
            grupoCompleto: false,
          }
        })
        .sort((a, b) => a.numeroSorteado - b.numeroSorteado)

      const quantidadePorGrupo = new Map<number, number>()

      resultados.forEach((resultado) => {
        quantidadePorGrupo.set(
          resultado.grupo,
          (quantidadePorGrupo.get(resultado.grupo) ?? 0) + 1,
        )
      })

      const resultadosFinais = resultados.map((resultado) => ({
        ...resultado,
        grupoCompleto:
          quantidadePorGrupo.get(resultado.grupo) === tamanhoGrupo,
      }))

      await salvarSorteioInicialLinha(
        sessaoCriadaId,
        resultadosFinais.map((resultado) => ({
          jogadorId: resultado.jogador.id!,
          numeroSorteado: resultado.numeroSorteado,
          grupo: resultado.grupo,
          posicaoNoGrupo: resultado.posicaoNoGrupo,
          grupoCompleto: resultado.grupoCompleto,
        })),
      )

      setResultadoSorteioLinha(resultadosFinais)
    } catch (erro) {
      console.error('Erro ao realizar sorteio inicial da linha:', erro)
      alert('Não foi possível realizar o sorteio inicial dos jogadores de linha.')
    } finally {
      setSorteandoLinha(false)
    }
  }

  async function iniciarPrimeiraPartidaOficial() {
    if (sessaoCriadaId === null) {
      alert('A sessão da pelada não foi encontrada.')
      return
    }

    const time1 = resultadoSorteioLinha
      .filter((item) => item.grupo === 1)
      .sort((a, b) => a.numeroSorteado - b.numeroSorteado)

    const time2 = resultadoSorteioLinha
      .filter((item) => item.grupo === 2)
      .sort((a, b) => a.numeroSorteado - b.numeroSorteado)

    const goleiro1 = resultadoSorteioGoleiros.find((item) => item.ordem === 1)
    const goleiro2 = resultadoSorteioGoleiros.find((item) => item.ordem === 2)

    const time1Completo =
      time1.length > 0 && time1.every((item) => item.grupoCompleto)
    const time2Completo =
      time2.length > 0 && time2.every((item) => item.grupoCompleto)

    if (!time1Completo || !time2Completo || !goleiro1 || !goleiro2) {
      alert('A primeira partida ainda não possui dois times completos.')
      return
    }

    if (
      goleiro1.jogador.id === undefined ||
      goleiro2.jogador.id === undefined ||
      time1.some((item) => item.jogador.id === undefined) ||
      time2.some((item) => item.jogador.id === undefined)
    ) {
      alert('Existe jogador sem identificação válida na formação.')
      return
    }

    const confirmou = window.confirm(
      'Iniciar a primeira partida?\\n\\n' +
        'A formação atual será gravada como oficial e a pelada passará para EM ANDAMENTO.',
    )

    if (!confirmou) return

    try {
      setIniciandoPartida(true)

      /*
       * A tela envia um retrato da formação atual. O repository grava partida,
       * times, atletas e mudança de status da sessão na mesma transação.
       */
      const partidaId = await iniciarPrimeiraPartida(sessaoCriadaId, [
        {
          lado: 1,
          grupoOrigem: 1,
          goleiroId: goleiro1.jogador.id!,
          corColete: goleiro1.corColete,
          jogadoresLinhaIds: time1.map((item) => item.jogador.id!),
        },
        {
          lado: 2,
          grupoOrigem: 2,
          goleiroId: goleiro2.jogador.id!,
          corColete: goleiro2.corColete,
          jogadoresLinhaIds: time2.map((item) => item.jogador.id!),
        },
      ])

      /*
       * A gravação no IndexedDB não altera sozinha o estado do React.
       * Recarregamos imediatamente a partida oficial recém-criada para que
       * a tela operacional apareça sem precisar sair e entrar em Nova Pelada.
       */
      const partidaIniciada =
        await buscarPartidaEmAndamentoCompleta(sessaoCriadaId)

      if (!partidaIniciada) {
        throw new Error(
          'A partida foi criada, mas não foi possível carregá-la para a tela.',
        )
      }

      setSessaoEmAndamentoId(sessaoCriadaId)
      setPartidaEmAndamento(partidaIniciada)
      setAgoraRelogio(Date.now())

      alert(
        `Partida #${partidaId} iniciada e salva com sucesso. A pelada agora está EM ANDAMENTO.`,
      )
    } catch (erro) {
      console.error('Erro ao iniciar primeira partida:', erro)
      alert(
        erro instanceof Error
          ? erro.message
          : 'Não foi possível iniciar a primeira partida.',
      )
    } finally {
      setIniciandoPartida(false)
    }
  }

  async function alternarPausaPartida() {
    const id = partidaEmAndamento?.partida.id
    if (!id) return
    try {
      setAlterandoPausa(true)
      const atual = normalizarRelogioPartida(partidaEmAndamento.partida)
      const partida = atual.pausada ? await retomarPartida(id) : await pausarPartida(id)
      setPartidaEmAndamento((estado) => estado ? { ...estado, partida } : estado)
      setAgoraRelogio(Date.now())
    } catch (erro) {
      console.error('Erro ao alterar pausa:', erro)
      alert(erro instanceof Error ? erro.message : 'Não foi possível alterar a pausa.')
    } finally { setAlterandoPausa(false) }
  }

  function abrirRegistroGol(lado: 1 | 2) {
    if (!partidaEmAndamento?.partida.id) return
    if (partidaEmAndamento.partida.pausada) {
      alert('Retome a partida antes de registrar um gol.')
      return
    }
    setGolAbertoLado(lado)
    setAutorGolId(null)
    setErroGol('')
  }

  function fecharRegistroGol() {
    if (salvandoGol) return
    setGolAbertoLado(null)
    setAutorGolId(null)
    setErroGol('')
  }

  async function confirmarRegistroGol(golContra = false) {
    const partidaId = partidaEmAndamento?.partida.id
    const lado = golAbertoLado
    if (!partidaId || lado === null) return
    if (!golContra && autorGolId === null) {
      setErroGol('Selecione o autor do gol.')
      return
    }

    try {
      setSalvandoGol(true)
      setErroGol('')
      const resultado = await registrarGolPartida(partidaId, {
        ladoBeneficiado: lado,
        jogadorId: golContra ? undefined : autorGolId ?? undefined,
        golContra,
      })

      // A tela só muda depois que evento + placar foram confirmados no banco.
      setPartidaEmAndamento((estado) =>
        estado ? { ...estado, partida: resultado.partida } : estado,
      )
      setAgoraRelogio(Date.now())
      setGolAbertoLado(null)
      setAutorGolId(null)

      const limiteGols = configuracaoPelada?.limiteGols ?? 2
      const placarDoLado =
        lado === 1 ? resultado.partida.placarTime1 : resultado.partida.placarTime2
      if (limiteGols > 0 && placarDoLado >= limiteGols) {
        alert(
          `Limite de ${limiteGols} gol(s) atingido. O resultado já está salvo; a finalização oficial será ligada à rotação na próxima etapa.`,
        )
      }
    } catch (erro) {
      console.error('Erro ao registrar gol:', erro)
      setErroGol(
        erro instanceof Error ? erro.message : 'Não foi possível registrar o gol.',
      )
    } finally {
      setSalvandoGol(false)
    }
  }

  function finalizarPartidaAtual() {
    const atual = partidaEmAndamento
    if (!atual) return

    const partidaAtual = atual.partida
    if (!partidaAtual.id || partidaAtual.status !== 'EM_ANDAMENTO') return

    const time1 = atual.times.find((time) => time.lado === 1)
    const time2 = atual.times.find((time) => time.lado === 2)

    setConfirmacaoFinalizacao({
      nomeTime1: time1?.corColete ?? 'Time 1',
      nomeTime2: time2?.corColete ?? 'Time 2',
      placarTime1: partidaAtual.placarTime1,
      placarTime2: partidaAtual.placarTime2,
    })
  }

  async function confirmarFinalizacaoPartida() {
    const partidaAtual = partidaEmAndamento?.partida
    const partidaId = partidaAtual?.id
    const confirmacao = confirmacaoFinalizacao

    if (
      !partidaId ||
      !partidaAtual ||
      partidaAtual.status !== 'EM_ANDAMENTO' ||
      !confirmacao
    ) return

    const { nomeTime1, nomeTime2 } = confirmacao

    try {
      setFinalizandoPartida(true)
      const resultado = await finalizarPartida(partidaId, 'MANUAL')
      setConfirmacaoFinalizacao(null)

      setPartidaEmAndamento((estado) =>
        estado ? { ...estado, partida: resultado.partida } : estado,
      )
      setAgoraRelogio(Date.now())

      const placarFinal = `${nomeTime1} ${resultado.partida.placarTime1} × ${resultado.partida.placarTime2} ${nomeTime2}`

      if (resultado.partida.resultado === 'EMPATE') {
        setResultadoPartidaAberto({ tipo: 'EMPATE', placar: placarFinal })
        return
      }

      const vencedor =
        resultado.partida.ladoVencedor === 1 ? nomeTime1 : nomeTime2
      const perdedor =
        resultado.partida.ladoPerdedor === 1 ? nomeTime1 : nomeTime2

      setResultadoPartidaAberto({
        tipo: 'VITORIA',
        placar: placarFinal,
        vencedor,
        perdedor,
      })
    } catch (erro) {
      console.error('Erro ao finalizar partida:', erro)
      alert(
        erro instanceof Error
          ? erro.message
          : 'Não foi possível finalizar a partida.',
      )
    } finally {
      setFinalizandoPartida(false)
    }
  }

  async function garantirFilaOperacionalAtual(
    partidaAtual: NonNullable<typeof partidaEmAndamento>,
  ) {
    const sessaoId = partidaAtual.partida.sessaoId
    const idsQuadra = new Set(
      partidaAtual.jogadores.map((jogador) => jogador.jogadorId),
    )

    /*
     * Para sessões anteriores à versão 11 reconstruímos a fila a partir do
     * sorteio inicial, sem alterar o sorteio histórico.
     */
    const itensIniciais = [
      ...resultadoSorteioLinha
        .filter((item) => item.jogador.id !== undefined)
        .map((item) => ({
          jogadorId: item.jogador.id!,
          funcao: 'LINHA' as const,
          prioridade: 'NAO_JOGOU' as const,
          grupoOrigem: item.grupo,
          emQuadra: idsQuadra.has(item.jogador.id!),
        })),
      ...resultadoSorteioGoleiros
        .filter((item) => item.jogador.id !== undefined)
        .map((item) => ({
          jogadorId: item.jogador.id!,
          funcao: 'GOLEIRO' as const,
          prioridade: 'NAO_JOGOU' as const,
          grupoOrigem: item.ordem,
          emQuadra: idsQuadra.has(item.jogador.id!),
        })),
    ]

    await inicializarFilaOperacional(sessaoId, itensIniciais)

    /*
     * A fila não pode depender de resultadoSorteioLinha/resultadoSorteioGoleiros
     * já terem sido carregados no React. A sessão persistida é a fonte de verdade.
     */
    await garantirFilaOperacionalCompletaDaSessao(sessaoId)

    const timePorLado = new Map(
      partidaAtual.times.map((time) => [time.lado, time]),
    )

    await sincronizarFilaComPartida(
      sessaoId,
      partidaAtual.jogadores.map((jogador) => ({
        jogadorId: jogador.jogadorId,
        funcao: jogador.funcao,
        grupoOrigem: timePorLado.get(jogador.lado)?.grupoOrigem,
      })),
    )

    setFilaOperacionalAtual(await listarFilaOperacional(sessaoId))
  }

  async function realizarTampinhaDoEmpate() {
    const partida = partidaEmAndamento?.partida
    if (!partida?.id || partida.resultado !== 'EMPATE') return

    const totalParticipantes = participantesPresenca.filter(
      (participante) => participante.presente,
    ).length

    try {
      setSorteandoTampinhaEmpate(true)

      const resultado = await registrarTampinhaEmpate(
        partida.id,
        totalParticipantes,
        configuracaoPelada?.maiorNumeroVence ?? true,
      )

      setResultadoTampinhaEmpate(resultado)
    } catch (erro) {
      console.error('Erro na tampinha do empate:', erro)
      alert(
        erro instanceof Error
          ? erro.message
          : 'Não foi possível realizar a tampinha do empate.',
      )
    } finally {
      setSorteandoTampinhaEmpate(false)
    }
  }

  async function confirmarRotacaoAposEmpate() {
    const atual = partidaEmAndamento
    const partida = atual?.partida
    const tampinha = resultadoTampinhaEmpate

    if (!atual || !partida?.id || !tampinha || partida.resultado !== 'EMPATE') {
      return
    }

    const partidaFinalizadaId: number = partida.id
    const quantidadeLinha = configuracaoPelada?.jogadoresLinhaPorTime ?? 4

    try {
      setIniciandoProximaPartida(true)

      /*
       * V13: neste ponto a rotação já foi consolidada.
       * O botão CONTINUAR NÃO pode sortear, reconciliar ou deslocar ninguém.
       * Ele apenas lê a fotografia operacional persistida e monta a partida.
       */
      const reconstrucao = await reconstruirFormacoesOperacionaisV13(
        partida.sessaoId,
        quantidadeLinha,
      )
      setFormacoesOperacionaisV13(reconstrucao.formacoes)

      const formacoesProntas = reconstrucao.formacoes
        .filter(({ formacao, membros }) => {
          if (formacao.status !== 'AGUARDANDO') return false
          const linhas = membros.filter((m) => m.funcao === 'LINHA')
          const goleiros = membros.filter((m) => m.funcao === 'GOLEIRO')
          return linhas.length >= quantidadeLinha && goleiros.length >= 1
        })
        .sort((a, b) => a.formacao.ordem - b.formacao.ordem)

      if (formacoesProntas.length < 2) {
        alert(
          'A organização ainda não possui dois times completos e consolidados para a próxima partida.',
        )
        return
      }

      const nomeJogador = (id: number) =>
        participantesPresenca.find((p) => p.jogador.id === id)?.jogador
          .nomeExibicao ?? `Jogador #${id}`

      const montarTime = (item: FormacaoOperacionalCompletaV13) => {
        const linhas = item.membros
          .filter((m) => m.funcao === 'LINHA')
          .sort((a, b) => a.ordem - b.ordem)
          .slice(0, quantidadeLinha)
        const goleiro = item.membros
          .filter((m) => m.funcao === 'GOLEIRO')
          .sort((a, b) => a.ordem - b.ordem)[0]

        if (!goleiro) throw new Error('Formação consolidada sem goleiro.')

        return {
          grupo: item.formacao.grupoHistorico ?? item.formacao.ordem,
          jogadoresLinhaIds: linhas.map((m) => m.jogadorId),
          goleiroId: goleiro.jogadorId,
          nomesLinha: linhas.map((m) => nomeJogador(m.jogadorId)),
          nomeGoleiro: nomeJogador(goleiro.jogadorId),
        }
      }

      const primeiro = montarTime(formacoesProntas[0])
      const segundo = montarTime(formacoesProntas[1])

      setDadosConfirmacaoEmpate({
        titulo: 'DOIS NOVOS TIMES VÃO ENTRAR',
        subtitulo:
          'A rotação já está consolidada. Confira os dois times antes de iniciar.',
        times: [
          {
            titulo: `TIME / GRUPO ${primeiro.grupo}`,
            jogadores: primeiro.nomesLinha,
            goleiro: primeiro.nomeGoleiro,
            detalheGoleiro: 'Goleiro definido pela rotação consolidada',
          },
          {
            titulo: `TIME / GRUPO ${segundo.grupo}`,
            jogadores: segundo.nomesLinha,
            goleiro: segundo.nomeGoleiro,
            detalheGoleiro: 'Goleiro definido pela rotação consolidada',
          },
        ],
        rodape: `Partida ${partida.numero + 1} pronta para iniciar`,
      })

      setAcaoConfirmacaoEmpate(() => async () => {
        await iniciarPartidaComDoisTimesAposEmpate(
          partidaFinalizadaId,
          {
            grupoOrigem: primeiro.grupo,
            goleiroId: primeiro.goleiroId,
            jogadoresLinhaIds: primeiro.jogadoresLinhaIds,
          },
          {
            grupoOrigem: segundo.grupo,
            goleiroId: segundo.goleiroId,
            jogadoresLinhaIds: segundo.jogadoresLinhaIds,
          },
        )
      })
      setConfirmacaoEmpateAberta(true)
    } catch (erro) {
      console.error('Erro ao preparar próxima partida após empate:', erro)
      alert(
        erro instanceof Error
          ? erro.message
          : 'Não foi possível preparar a próxima partida após o empate.',
      )
    } finally {
      setIniciandoProximaPartida(false)
    }
  }


  async function confirmarModalEmpate() {
    if (!acaoConfirmacaoEmpate || !partidaEmAndamento) return
    try {
      setIniciandoProximaPartida(true)

      /*
       * Guardamos os grupos do empate antes de criar a nova partida.
       * Se os dois times saírem, a tampinha definirá a ordem entre os dois
       * retornos sem ultrapassar quem já estava esperando.
       */
      const sessaoId = partidaEmAndamento.partida.sessaoId
      const tampinha = resultadoTampinhaEmpate
      const grupoVencedorTampinha = tampinha
        ? partidaEmAndamento.times.find(
            (time) => time.lado === tampinha.ladoVencedor,
          )?.grupoOrigem
        : undefined
      const grupoPerdedorTampinha = tampinha
        ? partidaEmAndamento.times.find(
            (time) => time.lado === tampinha.ladoPerdedor,
          )?.grupoOrigem
        : undefined

      await acaoConfirmacaoEmpate()
      const novaPartida = await buscarPartidaEmAndamentoCompleta(sessaoId)
      if (!novaPartida) throw new Error('A próxima partida foi criada, mas não pôde ser carregada.')

      await garantirFilaOperacionalAtual(novaPartida)

      // Só reordena quando os DOIS times do empate realmente saíram da quadra.
      const gruposNovaPartida = new Set(
        novaPartida.times
          .map((time) => time.grupoOrigem)
          .filter((grupo): grupo is number => grupo !== undefined),
      )
      const ambosSairam =
        grupoVencedorTampinha !== undefined &&
        grupoPerdedorTampinha !== undefined &&
        !gruposNovaPartida.has(grupoVencedorTampinha) &&
        !gruposNovaPartida.has(grupoPerdedorTampinha)

      if (ambosSairam) {
        await ordenarRetornosDoEmpateNaFila(
          sessaoId,
          grupoVencedorTampinha,
          grupoPerdedorTampinha,
        )
        setFilaOperacionalAtual(await listarFilaOperacional(sessaoId))
      }

      setPartidaEmAndamento(novaPartida)
      setResultadoTampinhaEmpate(null)
      setAgoraRelogio(Date.now())
      setOrganizacaoAberta(false)
      setConfirmacaoEmpateAberta(false)
      setDadosConfirmacaoEmpate(null)
      setAcaoConfirmacaoEmpate(null)
    } catch (erro) {
      console.error('Erro ao confirmar rotação do empate:', erro)
      alert(erro instanceof Error ? erro.message : 'Não foi possível iniciar a próxima partida.')
    } finally {
      setIniciandoProximaPartida(false)
    }
  }

  async function confirmarProximaPartida() {
    const atual = partidaEmAndamento
    const partida = atual?.partida

    if (
      !atual ||
      !partida?.id ||
      partida.status !== 'FINALIZADA' ||
      !partida.ladoVencedor ||
      !partida.ladoPerdedor
    ) {
      return
    }

    if (partida.resultado === 'EMPATE') {
      alert('O empate precisa ser decidido pela tampinha antes da próxima partida.')
      return
    }

    const quantidadeLinha = configuracaoPelada?.jogadoresLinhaPorTime ?? 4

    /*
     * A partir daqui a fila operacional é a autoridade.
     * Ela preserva quem ainda não jogou e, depois, a ordem real dos retornos.
     */
    /*
     * Para escolher quem realmente entra, reconstruímos a fila pelo histórico
     * oficial. Isso também corrige sessões que começaram antes da fila v11.
     */
    /*
     * A formação atual vem da fila individual. Ela já incorpora atrasados,
     * substituições por tampinha e cascatas; o sorteio inicial fica histórico.
     */
    const formacoes = await listarFormacoesFilaOperacional(partida.sessaoId)
    const proximaFormacao = formacoes.find(
      (formacao) => formacao.jogadoresLinhaIds.length >= quantidadeLinha,
    )

    if (!proximaFormacao) {
      alert('Não existe um time completo aguardando na fila.')
      return
    }

    const numeroGrupo = proximaFormacao.grupo
    const jogadoresFila = proximaFormacao.jogadoresLinhaIds
      .slice(0, quantidadeLinha)
      .map((id) => participantesPresenca.find((p) => p.jogador.id === id)?.jogador)
      .filter((jogador): jogador is JogadorDB => Boolean(jogador))
    const goleiroProprioId = proximaFormacao.goleiroId

    const timePerdedor = atual.times.find(
      (time) => time.lado === partida.ladoPerdedor,
    )

    if (!timePerdedor) {
      alert('Não foi possível identificar o time perdedor.')
      return
    }

    /*
     * Regra da pelada:
     * - se o próximo grupo já tem goleiro, usa esse goleiro;
     * - se não tem, o goleiro do time perdedor continua e completa o time que entra.
     */
    const goleiroId = goleiroProprioId ?? timePerdedor.goleiroId
    const origemGoleiro = goleiroProprioId
      ? `Goleiro #${numeroGrupo} da fila`
      : 'Goleiro do time perdedor permanece'

    const vencedor = atual.times.find(
      (time) => time.lado === partida.ladoVencedor,
    )
    const corVencedor = vencedor?.corColete ?? `Time ${partida.ladoVencedor}`
    const corEntrada = timePerdedor.corColete ?? `Time ${partida.ladoPerdedor}`

    /*
     * Antes de criar a próxima partida, mostramos a escalação completa.
     * Assim o operador confirma visualmente quem entra e qual goleiro será usado.
     */
    const nomeGoleiro = goleiroProprioId
      ? participantesPresenca.find((p) => p.jogador.id === goleiroProprioId)?.jogador.nomeExibicao ?? `Goleiro #${goleiroProprioId}`
      : participantesPresenca.find(
          (participante) => participante.jogador.id === timePerdedor.goleiroId,
        )?.jogador.nomeExibicao ?? `Jogador #${timePerdedor.goleiroId}`

    const jogadoresSelecionados = jogadoresFila.slice(0, quantidadeLinha)
    const descricaoGoleiro = goleiroProprioId
      ? 'GOLEIRO DA FILA'
      : 'GOLEIRO DO TIME QUE ACABOU DE PERDER'

    setConfirmacaoProximaPartida({
      numeroPartida: partida.numero + 1,
      grupo: numeroGrupo,
      vencedor: corVencedor,
      corEntrada,
      jogadores: jogadoresSelecionados.map((jogador) => jogador.nomeExibicao),
      goleiro: nomeGoleiro,
      descricaoGoleiro,
      partidaId: partida.id,
      sessaoId: partida.sessaoId,
      goleiroId,
      jogadoresLinhaIds: jogadoresSelecionados
        .map((jogador) => jogador.id)
        .filter((id): id is number => id !== undefined),
    })
    return
  }

  async function iniciarProximaPartidaConfirmada() {
    const dados = confirmacaoProximaPartida
    if (!dados) return

    try {
      setIniciandoProximaPartida(true)

      await iniciarProximaPartida(dados.partidaId, {
        grupoOrigem: dados.grupo,
        goleiroId: dados.goleiroId,
        jogadoresLinhaIds: dados.jogadoresLinhaIds,
      })

      const novaPartida = await buscarPartidaEmAndamentoCompleta(dados.sessaoId)
      if (!novaPartida) {
        throw new Error(
          'A próxima partida foi criada, mas não foi possível carregá-la na tela.',
        )
      }

      await garantirFilaOperacionalAtual(novaPartida)
      setPartidaEmAndamento(novaPartida)
      setResultadoTampinhaEmpate(null)
      setAgoraRelogio(Date.now())
      setOrganizacaoAberta(false)
      setConfirmacaoProximaPartida(null)
    } catch (erro) {
      console.error('Erro ao iniciar próxima partida:', erro)
      alert(
        erro instanceof Error
          ? erro.message
          : 'Não foi possível iniciar a próxima partida.',
      )
    } finally {
      setIniciandoProximaPartida(false)
    }
  }

  async function recarregarParticipantesSessaoAtiva(sessaoId: number) {
    const registros = await listarParticipantesSessao(sessaoId)
    const participantes = await Promise.all(
      registros.map(async (participante) => {
        const jogador = await buscarJogadorPorId(participante.jogadorId)
        if (!jogador) return null

        return {
          jogador,
          nomeLista: participante.nomeImportado,
          funcaoHoje: participante.tipoSessao,
          presente: participante.presente,
          chegouAtrasado: participante.chegouAtrasado,
          ordemChegada: participante.ordemChegada,
        } satisfies ParticipantePresenca
      }),
    )

    setParticipantesPresenca(
      participantes.filter(
        (item): item is NonNullable<typeof item> => item !== null,
      ),
    )
  }

  async function abrirChegadaAtrasada() {
    setErroChegada('')
    setCadastroChegadaAberto(false)
    setJogadorChegadaId(null)
    setBuscaChegada('')
    setTipoChegada('LINHA')

    try {
      const jogadores = await listarJogadores()
      setJogadoresChegada(jogadores.filter((jogador) => jogador.ativo))
      setChegadaAtrasadaAberta(true)
    } catch (erro) {
      console.error('Erro ao carregar jogadores para chegada atrasada:', erro)
      window.alert('Não foi possível carregar os jogadores cadastrados.')
    }
  }

  function fecharChegadaAtrasada() {
    if (salvandoChegada) return
    setChegadaAtrasadaAberta(false)
    setCadastroChegadaAberto(false)
    setErroChegada('')
  }

  async function confirmarChegadaAtrasada() {
    if (sessaoEmAndamentoId === null || jogadorChegadaId === null) return

    const jogador = jogadoresChegada.find(
      (item) => item.id === jogadorChegadaId,
    )
    if (!jogador) return

    setSalvandoChegada(true)
    setErroChegada('')

    try {
      await registrarChegadaAtrasada(sessaoEmAndamentoId, {
        jogadorId: jogadorChegadaId,
        nomeImportado: jogador.nomeExibicao,
        tipoSessao: tipoChegada,
      })

      const totalParticipantes = participantesPresenca.filter((p) => p.presente).length + 1
      const organizacao = await organizarChegadaAtrasadaNaFila(
        sessaoEmAndamentoId,
        jogadorChegadaId,
        tipoChegada,
        configuracaoPelada?.jogadoresLinhaPorTime ?? 4,
        totalParticipantes,
        configuracaoPelada?.menorNumeroSai ?? true,
      )

      // Exibe a cascata dentro do padrão visual do app, sem alert nativo do navegador.
      if (organizacao.cascata.length > 0) {
        const nomes = (id: number) =>
          participantesPresenca.find((p) => p.jogador.id === id)?.jogador.nomeExibicao ??
          (id === jogadorChegadaId ? jogador.nomeExibicao : `Jogador #${id}`)

        setResultadoCascataAtrasado({
          jogadorChegando: jogador.nomeExibicao,
          etapas: organizacao.cascata.map((t) => ({
            grupo: t.grupo,
            numeros: t.numeros.map((n) => ({
              nome: nomes(n.jogadorId),
              numero: n.numero,
            })),
            jogadorSaindo: nomes(t.jogadorSaindoId),
            jogadorEntrando: nomes(t.jogadorEntrandoId),
          })),
        })
      }

      await recarregarParticipantesSessaoAtiva(sessaoEmAndamentoId)
      setFilaOperacionalAtual(await listarFilaOperacional(sessaoEmAndamentoId))
      await atualizarOrganizacaoOperacionalV13()
      setChegadaAtrasadaAberta(false)
      setJogadorChegadaId(null)
    } catch (erro) {
      console.error('Erro ao registrar chegada atrasada:', erro)
      setErroChegada(
        erro instanceof Error
          ? erro.message
          : 'Não foi possível registrar a chegada.',
      )
    } finally {
      setSalvandoChegada(false)
    }
  }

  async function cadastrarERegistrarChegada() {
    if (sessaoEmAndamentoId === null) return

    if (!chegadaNomeCompleto.trim() || !chegadaNomeExibicao.trim()) {
      setErroChegada('Informe o nome completo e o nome de exibição.')
      return
    }

    setSalvandoChegada(true)
    setErroChegada('')

    try {
      const novoId = await cadastrarJogador({
        nomeCompleto: chegadaNomeCompleto,
        nomeExibicao: chegadaNomeExibicao,
        apelidos: chegadaApelidos
          .split(',')
          .map((apelido) => apelido.trim())
          .filter(Boolean),
        tipoPadrao: chegadaTipoPadrao,
      })

      await registrarChegadaAtrasada(sessaoEmAndamentoId, {
        jogadorId: novoId,
        nomeImportado: chegadaNomeExibicao.trim(),
        tipoSessao: tipoChegada,
      })

      await organizarChegadaAtrasadaNaFila(
        sessaoEmAndamentoId,
        novoId,
        tipoChegada,
        configuracaoPelada?.jogadoresLinhaPorTime ?? 4,
        participantesPresenca.filter((p) => p.presente).length + 1,
        configuracaoPelada?.menorNumeroSai ?? true,
      )

      await recarregarParticipantesSessaoAtiva(sessaoEmAndamentoId)
      setFilaOperacionalAtual(await listarFilaOperacional(sessaoEmAndamentoId))
      await atualizarOrganizacaoOperacionalV13()
      setChegadaNomeCompleto('')
      setChegadaNomeExibicao('')
      setChegadaApelidos('')
      setChegadaAtrasadaAberta(false)
      setCadastroChegadaAberto(false)
    } catch (erro) {
      console.error('Erro ao cadastrar chegada atrasada:', erro)
      setErroChegada(
        erro instanceof Error
          ? erro.message
          : 'Não foi possível cadastrar o jogador.',
      )
    } finally {
      setSalvandoChegada(false)
    }
  }

  async function descartarPeladaEmPreparacao() {
    if (sessaoCriadaId === null) return

    const confirmou = window.confirm(
      `Descartar a sessão #${sessaoCriadaId} em preparação?\n\n` +
        'Serão apagados somente os participantes e os sorteios desta sessão. ' +
        'Jogadores cadastrados, configurações e outras sessões serão preservados.',
    )

    if (!confirmou) return

    try {
      setDescartandoSessao(true)

      /*
       * O repository valida novamente que a sessão ainda está em PREPARACAO.
       * Assim uma pelada iniciada/finalizada nunca pode ser apagada por este botão.
       */
      await descartarSessaoEmPreparacao(sessaoCriadaId)

      setSessaoCriadaId(null)
      setSessaoRecuperada(false)
      setResultadoSorteioGoleiros([])
      setResultadoSorteioLinha([])
      setParticipantesPresenca([])
      setJogadoresReconhecidos([])
      setResultadoLista(null)
      setTextoLista('')
      setEtapaPresenca(false)
      setEtapaReconhecimento(false)
      setDataPelada(hojeFormatoInput())

      alert('Sessão em preparação descartada. Você já pode preparar uma nova pelada.')
    } catch (erro) {
      console.error('Erro ao descartar sessão em preparação:', erro)
      alert(
        erro instanceof Error
          ? erro.message
          : 'Não foi possível descartar a sessão em preparação.',
      )
    } finally {
      setDescartandoSessao(false)
    }
  }

  async function alterarFuncaoHoje(
    jogadorId: number | undefined,
    funcaoHoje: 'LINHA' | 'GOLEIRO',
  ) {
    if (resultadoSorteioGoleiros.length > 0) {
      alert('O sorteio inicial dos goleiros já foi realizado. A função não pode ser alterada nesta etapa.')
      return
    }

    if (!jogadorId) return
    const anterior = participantesPresenca.find((p) => p.jogador.id === jogadorId)
    if (!anterior) return
    const atualizado = { ...anterior, funcaoHoje }

    /* A função vale só para esta sessão e não altera a posição habitual. */
    setParticipantesPresenca((lista) => lista.map((p) => p.jogador.id === jogadorId ? atualizado : p))
    try {
      await persistirParticipantesAlterados([atualizado])
    } catch (erro) {
      console.error('Erro ao salvar função do jogador na sessão:', erro)
      alert('Não foi possível salvar a alteração de função.')
      setParticipantesPresenca((lista) => lista.map((p) => p.jogador.id === jogadorId ? anterior : p))
    }
  }

  const goleirosOrdenados = useMemo(() => {
    if (!resultadoLista) return []

    return [...resultadoLista.goleiros].sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR', {
        sensitivity: 'base',
      }),
    )
  }, [resultadoLista])

  const linhaOrdenados = useMemo(() => {
    if (!resultadoLista) return []

    return [...resultadoLista.linha].sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR', {
        sensitivity: 'base',
      }),
    )
  }, [resultadoLista])

  const totalReconhecidos = jogadoresReconhecidos.filter(
    (item) => item.status === 'RECONHECIDO',
  ).length

  const totalNaoReconhecidos = jogadoresReconhecidos.filter(
    (item) => item.status === 'NAO_RECONHECIDO',
  ).length

  const totalAmbiguos = jogadoresReconhecidos.filter(
    (item) => item.status === 'AMBIGUO',
  ).length

  const jogadorEmIdentificacao =
    indiceIdentificacao !== null
      ? jogadoresReconhecidos[indiceIdentificacao]
      : null

  const todosResolvidos =
    jogadoresReconhecidos.length > 0 &&
    totalNaoReconhecidos === 0 &&
    totalAmbiguos === 0

  const presentes = participantesPresenca.filter((item) => item.presente)
  const totalPresentes = presentes.length
  const totalLinhaPresentes = presentes.filter((item) => item.funcaoHoje === 'LINHA').length
  const totalGoleirosPresentes = presentes.filter((item) => item.funcaoHoje === 'GOLEIRO').length

  const goleirosPresenca = participantesPresenca.filter((item) => item.funcaoHoje === 'GOLEIRO')
  const linhaPresenca = participantesPresenca.filter((item) => item.funcaoHoje === 'LINHA')

  return (
    <div className="nova-pelada-page">
      <section className="nova-pelada-cabecalho">
        <span>NOVA PELADA</span>

        <h1>Preparar pelada</h1>

        <p>
          Importe a lista do WhatsApp para preparar os participantes da
          pelada.
        </p>
      </section>

      {!carregandoSessao && partidaEmAndamento && sessaoEmAndamentoId !== null && (() => {
        const partida = normalizarRelogioPartida(partidaEmAndamento.partida)
        const time1 = partidaEmAndamento.times.find((t) => t.lado === 1)
        const time2 = partidaEmAndamento.times.find((t) => t.lado === 2)
        const hex = (nome?: string) => configuracaoPelada?.coresColetes.find((c) => c.nome.toLocaleLowerCase('pt-BR') === nome?.toLocaleLowerCase('pt-BR'))?.hex ?? '#777777'
        const inicio = new Date(partida.iniciadaEm).getTime()
        const referencia =
          partida.status === 'FINALIZADA' && partida.finalizadaEm
            ? new Date(partida.finalizadaEm).getTime()
            : partida.pausada && partida.pausadaEm
              ? new Date(partida.pausadaEm).getTime()
              : agoraRelogio
        const ms =
          partida.status === 'FINALIZADA' && partida.tempoFinalMs !== undefined
            ? partida.tempoFinalMs
            : Math.max(0, referencia - inicio - partida.totalPausadoMs)
        const total = Math.floor(ms / 1000)
        const limite = (configuracaoPelada?.tempoQuedaMinutos ?? 7) * 60
        const tempo = `${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}${total >= limite ? '+' : ''}`
        return (
          <section className="partida-operacional">
            <div className="partida-operacional-topo"><span>{partida.status === 'FINALIZADA' ? 'PARTIDA FINALIZADA' : 'PELADA EM ANDAMENTO'}</span><strong>PARTIDA {partida.numero}</strong></div>
            <div className="placar-operacional">
              <div className="placar-time placar-time-esquerda">
                <CamisaColete cor={hex(time1?.corColete)} />
                <span>{time1?.corColete ?? 'Time 1'}</span>
              </div>

              {/* O placar é uma unidade central: CAMISA 0 × 0 CAMISA. */}
              <div className="placar-resultado" aria-label={`Placar ${partida.placarTime1} a ${partida.placarTime2}`}>
                <strong>{partida.placarTime1}</strong>
                <span>×</span>
                <strong>{partida.placarTime2}</strong>
              </div>

              <div className="placar-time placar-time-direita">
                <span>{time2?.corColete ?? 'Time 2'}</span>
                <CamisaColete cor={hex(time2?.corColete)} />
              </div>
            </div>
            <div className={`cronometro-operacional ${total >= limite ? 'limite' : ''} ${partida.pausada ? 'pausado' : ''}`}>
              <small>{partida.pausada ? 'PARTIDA PAUSADA' : total >= limite ? 'TEMPO LIMITE ATINGIDO' : 'TEMPO DE JOGO'}</small><strong>{tempo}</strong>
            </div>
            {partida.status === 'EM_ANDAMENTO' ? (
              <>
                <div className="acoes-gol">
                  <button type="button" onClick={() => abrirRegistroGol(1)}><CamisaColete cor={hex(time1?.corColete)} /><span>GOL</span><small>{time1?.corColete ?? 'Time 1'}</small></button>
                  <button type="button" onClick={() => abrirRegistroGol(2)}><CamisaColete cor={hex(time2?.corColete)} /><span>GOL</span><small>{time2?.corColete ?? 'Time 2'}</small></button>
                </div>
                <button type="button" className={`btn-pausa-partida ${partida.pausada ? 'retomar' : ''}`} onClick={alternarPausaPartida} disabled={alterandoPausa || finalizandoPartida}>{alterandoPausa ? 'SALVANDO...' : partida.pausada ? '▶ RETOMAR PARTIDA' : 'Ⅱ PAUSAR PARTIDA'}</button>
                <button type="button" className="btn-finalizar-partida" onClick={finalizarPartidaAtual} disabled={finalizandoPartida}>{finalizandoPartida ? 'FINALIZANDO...' : 'FINALIZAR PARTIDA'}</button>
              </>
            ) : (
              <div className="resumo-sorteio">
                <strong>RESULTADO OFICIAL</strong>
                <p>
                  {partida.resultado === 'EMPATE'
                    ? `EMPATE — ${partida.placarTime1} × ${partida.placarTime2}.`
                    : `${partida.ladoVencedor === 1 ? (time1?.corColete ?? 'Time 1') : (time2?.corColete ?? 'Time 2')} venceu por ${partida.placarTime1} × ${partida.placarTime2}.`}
                </p>

                {partida.resultado === 'EMPATE' && (
                  <div className="organizacao-aviso">
                    {!resultadoTampinhaEmpate ? (
                      <>
                        <strong>TAMPINHA OBRIGATÓRIA</strong>
                        <span>
                          O empate continua como resultado oficial. A tampinha
                          define somente a prioridade operacional da rotação.
                        </span>
                        <button
                          type="button"
                          className="btn-finalizar-partida"
                          onClick={realizarTampinhaDoEmpate}
                          disabled={sorteandoTampinhaEmpate}
                        >
                          {sorteandoTampinhaEmpate
                            ? 'SORTEANDO...'
                            : 'SORTEAR TAMPINHA DO EMPATE'}
                        </button>
                      </>
                    ) : (
                      <div className="tampinha-resultado-destaque">
                        <div className="tampinha-titulo">
                          <small>RESULTADO DA TAMPINHA</small>
                          <strong>{resultadoTampinhaEmpate.ladoVencedor === 1 ? time1?.corColete ?? 'Time 1' : time2?.corColete ?? 'Time 2'} VENCEU</strong>
                        </div>
                        <div className="tampinha-numeros">
                          <div className={resultadoTampinhaEmpate.ladoVencedor === 1 ? 'tampinha-time vencedor' : 'tampinha-time'}>
                            <span>{time1?.corColete ?? 'Time 1'}</span><b>{resultadoTampinhaEmpate.numeroLado1}</b>
                            {resultadoTampinhaEmpate.ladoVencedor === 1 && <small>VENCEDOR</small>}
                          </div>
                          <div className="tampinha-versus">×</div>
                          <div className={resultadoTampinhaEmpate.ladoVencedor === 2 ? 'tampinha-time vencedor' : 'tampinha-time'}>
                            <span>{time2?.corColete ?? 'Time 2'}</span><b>{resultadoTampinhaEmpate.numeroLado2}</b>
                            {resultadoTampinhaEmpate.ladoVencedor === 2 && <small>VENCEDOR</small>}
                          </div>
                        </div>
                        <div className="tampinha-explicacao"><strong>O que este resultado define?</strong><span>Prioridade dos goleiros e ordem operacional da fila. A partida continua registrada como empate.</span></div>
                        <button type="button" className="btn-finalizar-partida" onClick={confirmarRotacaoAposEmpate} disabled={iniciandoProximaPartida}>
                          {iniciandoProximaPartida ? 'PREPARANDO PRÓXIMA PARTIDA...' : 'CONTINUAR PARA OS PRÓXIMOS TIMES'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {partida.resultado !== 'EMPATE' && (() => {
                  const quantidadeLinha =
                    configuracaoPelada?.jogadoresLinhaPorTime ?? 4

                  /*
                   * A tela mostra o mesmo próximo grupo que a fila operacional
                   * usará ao confirmar, evitando divergência entre UI e regra.
                   */
                  const linhasAguardando = filaOperacionalAtual.filter(
                    (item) =>
                      item.status === 'AGUARDANDO' &&
                      item.funcao === 'LINHA' &&
                      item.grupoOrigem !== undefined,
                  )
                  const gruposNaOrdem = Array.from(
                    new Set(linhasAguardando.map((item) => item.grupoOrigem!)),
                  )
                  const numeroGrupo =
                    gruposNaOrdem.find(
                      (grupo) =>
                        linhasAguardando.filter(
                          (item) => item.grupoOrigem === grupo,
                        ).length >= quantidadeLinha,
                    ) ?? 0

                  const jogadoresFila = numeroGrupo
                    ? linhasAguardando
                        .filter((item) => item.grupoOrigem === numeroGrupo)
                        .map((item) => {
                          const jogador = participantesPresenca.find(
                            (p) => p.jogador.id === item.jogadorId,
                          )?.jogador
                          return jogador ? { jogador } : null
                        })
                        .filter((item): item is { jogador: JogadorDB } => item !== null)
                    : []
                  const itemGoleiroFila = filaOperacionalAtual.find(
                    (item) =>
                      item.status === 'AGUARDANDO' &&
                      item.funcao === 'GOLEIRO' &&
                      item.grupoOrigem === numeroGrupo,
                  )
                  const goleiroFila = itemGoleiroFila
                    ? participantesPresenca.find(
                        (p) => p.jogador.id === itemGoleiroFila.jogadorId,
                      )
                    : undefined
                  const perdedor = partidaEmAndamento.times.find(
                    (time) => time.lado === partida.ladoPerdedor,
                  )
                  const timePronto =
                    jogadoresFila.length >= quantidadeLinha && Boolean(perdedor)

                  return (
                    <div className="proximo-time-destaque">
                      <div className="proximo-time-cabecalho">
                        <div>
                          <small>PRÓXIMO TIME</small>
                          <strong>{numeroGrupo ? `GRUPO ${numeroGrupo}` : 'AGUARDANDO FORMAÇÃO'}</strong>
                        </div>
                        <span className={timePronto ? 'pronto' : 'incompleto'}>
                          {timePronto ? 'PRONTO' : 'INCOMPLETO'}
                        </span>
                      </div>

                      <div className="proximo-time-jogadores">
                        {jogadoresFila.slice(0, quantidadeLinha).map((item, indice) => (
                          <div className="proximo-time-jogador" key={item.jogador.id}>
                            <b>{indice + 1}</b>
                            <span>{item.jogador.nomeExibicao}</span>
                          </div>
                        ))}
                      </div>

                      <div className="proximo-time-goleiro">
                        <span>🧤</span>
                        <div>
                          <small>GOLEIRO</small>
                          <strong>
                            {goleiroFila
                              ? goleiroFila.jogador.nomeExibicao
                              : 'Goleiro do time perdedor'}
                          </strong>
                          <em>
                            {goleiroFila
                              ? 'Aguardando com este grupo'
                              : 'Permanece para completar o time'}
                          </em>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn-finalizar-partida"
                        onClick={confirmarProximaPartida}
                        disabled={iniciandoProximaPartida}
                      >
                        {iniciandoProximaPartida
                          ? 'INICIANDO...'
                          : 'VER ESCALAÇÃO E INICIAR'}
                      </button>
                    </div>
                  )
                })()}
              </div>
            )}

            {(() => {
              /*
               * V13: a Organização/Fila consome a projeção operacional.
               * grupoOrigem fica apenas como compatibilidade/histórico.
               */
              const quantidadeLinha =
                configuracaoPelada?.jogadoresLinhaPorTime ?? 4

              const gruposOrganizacao = formacoesOperacionaisV13
                .filter(({ formacao }) => formacao.status === 'AGUARDANDO')
                .map(({ formacao, membros }) => {
                  const jogadores = membros
                    .filter((membro) => membro.funcao === 'LINHA')
                    .map((membro) => {
                      const jogador = participantesPresenca.find(
                        (p) => p.jogador.id === membro.jogadorId,
                      )?.jogador
                      return jogador ? { jogador } : null
                    })
                    .filter((item): item is { jogador: JogadorDB } => item !== null)

                  const membroGoleiro = membros.find(
                    (membro) => membro.funcao === 'GOLEIRO',
                  )
                  const jogadorGoleiro = membroGoleiro
                    ? participantesPresenca.find(
                        (p) => p.jogador.id === membroGoleiro.jogadorId,
                      )?.jogador
                    : undefined
                  const vagasLinha = Math.max(0, quantidadeLinha - jogadores.length)

                  return {
                    numeroGrupo: formacao.grupoHistorico ?? formacao.ordem,
                    ordemOperacional: formacao.ordem,
                    jogadores,
                    goleiro: jogadorGoleiro
                      ? { jogador: jogadorGoleiro, ordem: formacao.ordem }
                      : undefined,
                    vagasLinha,
                    completo: vagasLinha === 0 && Boolean(jogadorGoleiro),
                  }
                })

              const prontos = gruposOrganizacao.filter(
                (grupo) => grupo.completo,
              ).length

              const incompletos = gruposOrganizacao.length - prontos

              // Chegada atrasada só aparece como pendente enquanto ainda não
              // estiver materializada em nenhuma formação operacional v13.
              const jogadoresJaOrganizados = new Set(
                formacoesOperacionaisV13.flatMap(({ membros }) =>
                  membros.map((membro) => membro.jogadorId),
                ),
              )

              const filaAtrasados = participantesPresenca
                .filter(
                  (participante) =>
                    participante.presente &&
                    participante.chegouAtrasado &&
                    participante.jogador.id !== undefined &&
                    !jogadoresJaOrganizados.has(participante.jogador.id),
                )
                .sort(
                  (a, b) =>
                    (a.ordemChegada ?? Number.MAX_SAFE_INTEGER) -
                    (b.ordemChegada ?? Number.MAX_SAFE_INTEGER),
                )

              return (
                <div className="organizacao-operacional">
                  <button
                    type="button"
                    className={`btn-organizacao-fila ${
                      organizacaoAberta ? 'aberto' : ''
                    }`}
                    onClick={async () => {
                      const vaiAbrir = !organizacaoAberta
                      setOrganizacaoAberta(vaiAbrir)
                      if (vaiAbrir) await atualizarOrganizacaoOperacionalV13()
                    }}
                    aria-expanded={organizacaoAberta}
                  >
                    <span>
                      <strong>ORGANIZAÇÃO / FILA</strong>
                      <small>
                        {gruposOrganizacao.length === 0
                          ? 'Nenhum time futuro formado'
                          : `${prontos} pronto(s) • ${incompletos} incompleto(s)`}
                      </small>
                    </span>
                    <b>{organizacaoAberta ? '▲' : '▼'}</b>
                  </button>

                  {organizacaoAberta && (
                    <div className="organizacao-conteudo">
                      {diagnosticoFilaV13 && (
                        <div
                          style={{
                            padding: '10px 12px',
                            marginBottom: 10,
                            border: '1px solid #dce8e0',
                            borderRadius: 12,
                            background: '#fff',
                            fontSize: 13,
                            lineHeight: 1.45,
                          }}
                        >
                          <strong>DIAGNÓSTICO DA FILA</strong>
                          <div>
                            Fila: {diagnosticoFilaV13.totalFila} •
                            {' '}Linha: {diagnosticoFilaV13.linhaFila} •
                            {' '}Goleiros: {diagnosticoFilaV13.goleirosFila}
                          </div>
                          <div>
                            Em jogo: {diagnosticoFilaV13.jogadoresPartidaAtual} •
                            {' '}Linha: {diagnosticoFilaV13.linhaPartidaAtual} •
                            {' '}Goleiros: {diagnosticoFilaV13.goleirosPartidaAtual}
                          </div>
                          <div>
                            Fora: {diagnosticoFilaV13.aguardandoFila} •
                            {' '}Formações v13: {diagnosticoFilaV13.formacoesPersistidas} •
                            {' '}Membros v13: {diagnosticoFilaV13.membrosFormacoesPersistidas}
                          </div>
                          <div>
                            Grupos fora: {diagnosticoFilaV13.gruposAguardando
                              .map((grupo) => `${grupo.grupo}: ${grupo.linhas}L/${grupo.goleiros}G`)
                              .join(' • ') || 'nenhum'}
                          </div>
                        </div>
                      )}

                      <div className="organizacao-aviso">
                        <strong>Partida continua normalmente</strong>
                        <span>
                          Abrir esta área não pausa nem altera o cronômetro.
                        </span>
                      </div>

                      <div className="organizacao-acoes">
                        <button
                          type="button"
                          className="btn-chegada-atrasada"
                          onClick={abrirChegadaAtrasada}
                        >
                          + CHEGADA ATRASADA
                        </button>
                      </div>

                      {filaAtrasados.length > 0 && (
                        <div className="fila-atrasados">
                          <div className="fila-atrasados-titulo">
                            <strong>CHEGADAS ATRASADAS</strong>
                            <span>{filaAtrasados.length} aguardando organização</span>
                          </div>

                          {filaAtrasados.map((participante) => (
                            <div
                              className="fila-atrasado-item"
                              key={`atrasado-${participante.jogador.id}`}
                            >
                              <span>#{participante.ordemChegada}</span>
                              <strong>{participante.jogador.nomeExibicao}</strong>
                              <small>
                                {participante.funcaoHoje === 'GOLEIRO'
                                  ? 'Goleiro'
                                  : 'Linha'}
                              </small>
                            </div>
                          ))}

                          <p>
                            Nesta etapa a chegada é registrada e persistida. O
                            preenchimento de vagas e as tampinhas serão aplicados
                            na próxima regra operacional.
                          </p>
                        </div>
                      )}

                      {gruposOrganizacao.length === 0 ? (
                        <div className="organizacao-vazia">
                          <strong>Nenhum próximo time disponível.</strong>
                          <span>
                            Quando houver grupos seguintes, eles aparecerão aqui
                            na ordem da fila.
                          </span>
                        </div>
                      ) : (
                        <div className="organizacao-times-grid">
                          {gruposOrganizacao.map((grupo) => {
                            const letraTime = String.fromCharCode(
                              64 + grupo.numeroGrupo,
                            )

                            return (
                              <article
                                className={`organizacao-time ${
                                  grupo.completo ? 'completo' : 'incompleto'
                                }`}
                                key={`organizacao-grupo-${grupo.numeroGrupo}`}
                              >
                                <div className="organizacao-time-topo">
                                  <div>
                                    <span>
                                      TIME {letraTime} • GRUPO {grupo.numeroGrupo}
                                    </span>
                                    <strong>
                                      {grupo.completo
                                        ? 'PRONTO PARA JOGAR'
                                        : 'INCOMPLETO'}
                                    </strong>
                                  </div>

                                  <span
                                    className={`organizacao-status ${
                                      grupo.completo ? 'pronto' : 'pendente'
                                    }`}
                                  >
                                    {grupo.completo ? 'PRONTO' : 'AGUARDANDO'}
                                  </span>
                                </div>

                                <div className="organizacao-goleiro">
                                  <span>GOLEIRO</span>
                                  <strong>
                                    {grupo.goleiro
                                      ? grupo.goleiro.jogador.nomeExibicao
                                      : 'Aguardando goleiro'}
                                  </strong>
                                </div>

                                <div className="organizacao-jogadores">
                                  {grupo.jogadores.map(({ jogador }) => {
                                    const numeroUltimaTampinha = ultimosNumerosTampinhaV13.find(
                                      (item) => item.jogadorId === jogador.id,
                                    )?.numero
                                    const numeroInicial = resultadoSorteioLinha.find(
                                      (item) => item.jogador.id === jogador.id,
                                    )?.numeroSorteado
                                    const numeroExibicao = numeroUltimaTampinha ?? numeroInicial

                                    return (
                                      <div
                                        key={`organizacao-jogador-${jogador.id}`}
                                      >
                                        {numeroExibicao !== undefined ? (
                                          <>
                                            <span>#{numeroExibicao}</span>
                                            <strong>{jogador.nomeExibicao}</strong>
                                          </>
                                        ) : (
                                          <strong
                                            style={{
                                              gridColumn: '1 / -1',
                                              width: '100%',
                                              maxWidth: 'none',
                                              whiteSpace: 'normal',
                                              overflow: 'visible',
                                              textOverflow: 'clip',
                                              overflowWrap: 'anywhere',
                                            }}
                                          >
                                            {jogador.nomeExibicao}
                                          </strong>
                                        )}
                                      </div>
                                    )
                                  })}

                                  {Array.from(
                                    { length: grupo.vagasLinha },
                                    (_, indice) => (
                                      <div
                                        className="organizacao-vaga"
                                        key={`organizacao-vaga-${grupo.numeroGrupo}-${indice}`}
                                      >
                                        <span>+</span>
                                        <strong>Vaga disponível</strong>
                                      </div>
                                    ),
                                  )}
                                </div>

                                <div className="organizacao-time-rodape">
                                  <span>
                                    {grupo.jogadores.length}/{quantidadeLinha}{' '}
                                    jogadores de linha
                                  </span>
                                  <strong>
                                    {grupo.vagasLinha > 0
                                      ? `${grupo.vagasLinha} vaga(s)`
                                      : grupo.goleiro
                                        ? 'Formação completa'
                                        : 'Falta goleiro'}
                                  </strong>
                                </div>
                              </article>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            <p className="partida-operacional-rodape">Sessão #{sessaoEmAndamentoId} • relógio e pausa recuperáveis após F5</p>
          </section>
        )
      })()}

      {carregandoSessao && (
        <section className="nova-pelada-card">
          <div className="reconhecimento-sucesso">
            <strong>Verificando pelada em preparação...</strong>
          </div>
        </section>
      )}

      {!carregandoSessao && sessaoRecuperada && sessaoCriadaId !== null && etapaPresenca && (
        <section className="nova-pelada-card">
          <div className="reconhecimento-sucesso">
            <strong>Pelada em preparação recuperada.</strong>
            <p>
              Sessão #{sessaoCriadaId} restaurada do aparelho. A presença e a
              função dos jogadores foram recuperadas.
            </p>
          </div>
        </section>
      )}

      {!partidaEmAndamento && (
        <>
      <section className="nova-pelada-card">
        <div className="nova-pelada-etapa">
          <span>1</span>

          <div>
            <strong>Dados da pelada</strong>
            <small>Informe a data da sessão.</small>
          </div>
        </div>

        <div className="nova-pelada-campo">
          <label>Data da pelada</label>

          <input
            type="date"
            value={dataPelada}
            onChange={(event) => setDataPelada(event.target.value)}
          />
        </div>
      </section>

      <section className="nova-pelada-card">
        <div className="nova-pelada-etapa">
          <span>2</span>

          <div>
            <strong>Lista de jogadores</strong>

            <small>
              Cole exatamente como a lista está no WhatsApp. Não é necessário
              reorganizar ou corrigir os nomes.
            </small>
          </div>
        </div>

        <textarea
          className="nova-pelada-lista"
          value={textoLista}
          onChange={(event) => {
            setTextoLista(event.target.value)

            // Alterar a lista exige uma nova análise e identificação.
            setResultadoLista(null)
            setJogadoresReconhecidos([])
            setEtapaReconhecimento(false)
            setEtapaPresenca(false)
            setParticipantesPresenca([])
            setSessaoCriadaId(null)
            setSessaoRecuperada(false)
            setResultadoSorteioGoleiros([])
            fecharIdentificacao()
          }}
          placeholder="Cole aqui a lista da pelada..."
        />

        <button
          type="button"
          className="btn-analisar-pelada"
          onClick={analisarLista}
        >
          Analisar lista
        </button>
      </section>

      {resultadoLista && (
        <section className="nova-pelada-card">
          <div className="nova-pelada-etapa">
            <span>3</span>

            <div>
              <strong>Conferência da lista</strong>

              <small>
                Confira os atletas identificados antes de continuar.
              </small>
            </div>
          </div>

          <div className="nova-pelada-resumo">
            <div>
              <strong>{resultadoLista.total}</strong>
              <span>Previstos</span>
            </div>

            <div>
              <strong>{resultadoLista.linha.length}</strong>
              <span>Linha</span>
            </div>

            <div>
              <strong>{resultadoLista.goleiros.length}</strong>
              <span>Goleiros</span>
            </div>
          </div>

          <div className="nova-pelada-grupos">
            <div className="grupo-jogadores">
              <div className="grupo-jogadores-titulo">
                <strong>🧤 Goleiros</strong>
                <span>{goleirosOrdenados.length}</span>
              </div>

              {goleirosOrdenados.map((jogador, indice) => (
                <div
                  className="jogador-previsto"
                  key={`goleiro-${jogador.nome}-${indice}`}
                >
                  {jogador.nome}
                </div>
              ))}
            </div>

            <div className="grupo-jogadores">
              <div className="grupo-jogadores-titulo">
                <strong>⚽ Jogadores de linha</strong>
                <span>{linhaOrdenados.length}</span>
              </div>

              {linhaOrdenados.map((jogador, indice) => (
                <div
                  className="jogador-previsto"
                  key={`linha-${jogador.nome}-${indice}`}
                >
                  {jogador.nome}
                </div>
              ))}
            </div>
          </div>

          {!etapaReconhecimento && (
            <button
              type="button"
              className="btn-continuar-pelada"
              onClick={identificarJogadores}
              disabled={identificando}
            >
              {identificando
                ? 'Identificando jogadores...'
                : `Continuar com ${resultadoLista.total} jogadores`}
            </button>
          )}
        </section>
      )}

      {etapaReconhecimento && (
        <section className="nova-pelada-card">
          <div className="nova-pelada-etapa">
            <span>4</span>

            <div>
              <strong>Identificação dos jogadores</strong>

              <small>
                O sistema cruzou os nomes da lista com os jogadores
                cadastrados.
              </small>
            </div>
          </div>

          <div className="reconhecimento-resumo">
            <div className="reconhecimento-ok">
              <strong>{totalReconhecidos}</strong>
              <span>Reconhecidos</span>
            </div>

            <div className="reconhecimento-novo">
              <strong>{totalNaoReconhecidos}</strong>
              <span>Não reconhecidos</span>
            </div>

            <div className="reconhecimento-ambiguo">
              <strong>{totalAmbiguos}</strong>
              <span>Ambíguos</span>
            </div>
          </div>

          <div className="lista-reconhecimento">
            {jogadoresReconhecidos.map((item, indice) => (
              <div
                className={`item-reconhecimento ${item.status.toLowerCase()}`}
                key={`${item.nomeLista}-${indice}`}
              >
                <div className="reconhecimento-identidade">
                  <strong>{item.nomeLista}</strong>

                  <span>
                    {item.tipoLista === 'GOLEIRO'
                      ? '🧤 Goleiro hoje'
                      : '⚽ Linha hoje'}
                  </span>
                </div>

                {item.status === 'RECONHECIDO' && item.jogador && (
                  <div className="reconhecimento-resultado">
                    <span className="status-reconhecido">
                      {item.identificadoManualmente
                        ? '✓ Identificado'
                        : '✓ Reconhecido'}
                    </span>

                    <strong>{item.jogador.nomeExibicao}</strong>
                    <small>{item.jogador.nomeCompleto}</small>
                  </div>
                )}

                {item.status === 'NAO_RECONHECIDO' && (
                  <div className="reconhecimento-resultado">
                    <span className="status-nao-reconhecido">
                      Não reconhecido
                    </span>

                    <small>
                      Será necessário identificar ou cadastrar este jogador.
                    </small>

                    <button
                      type="button"
                      className="btn-identificar-jogador"
                      onClick={() => abrirIdentificacao(indice)}
                    >
                      Identificar
                    </button>
                  </div>
                )}

                {item.status === 'AMBIGUO' && (
                  <div className="reconhecimento-resultado">
                    <span className="status-ambiguo">
                      ⚠ Mais de uma possibilidade
                    </span>

                    <small>
                      {item.correspondencias.length} jogadores encontrados.
                    </small>

                    <button
                      type="button"
                      className="btn-identificar-jogador"
                      onClick={() => abrirIdentificacao(indice)}
                    >
                      Identificar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {!todosResolvidos && (
            <div className="reconhecimento-aviso">
              <strong>Existem nomes que precisam de atenção.</strong>

              <p>
                Resolva os jogadores não reconhecidos ou ambíguos antes de
                continuar.
              </p>
            </div>
          )}

          {todosResolvidos && (
            <>
              <div className="reconhecimento-sucesso">
                <strong>Todos os jogadores foram identificados.</strong>

                <p>
                  A lista está pronta para seguir para a conferência de
                  presença.
                </p>
              </div>

              {!etapaPresenca && (
                <button
                  type="button"
                  className="btn-continuar-pelada"
                  onClick={continuarParaPresenca}
                >
                  Continuar para presença
                </button>
              )}
            </>
          )}
        </section>
      )}

      {etapaPresenca && (
        <section className="nova-pelada-card presenca-card">
          <div className="nova-pelada-etapa">
            <span>5</span>

            <div>
              <strong>Conferência de presença</strong>
              <small>
                Marque somente quem realmente chegou. Todos começam como NÃO.
              </small>
            </div>
          </div>

          <div className="presenca-resumo">
            <div>
              <strong>{totalPresentes}</strong>
              <span>Presentes</span>
            </div>
            <div>
              <strong>{totalLinhaPresentes}</strong>
              <span>Linha</span>
            </div>
            <div>
              <strong>{totalGoleirosPresentes}</strong>
              <span>Goleiros</span>
            </div>
          </div>

          <div className="presenca-acoes-gerais">
            <button
              type="button"
              className="btn-presenca-todos"
              onClick={() => definirPresencaTodos(true)}
            >
              ✓ Marcar todos presentes
            </button>

            {totalPresentes > 0 && (
              <button
                type="button"
                className="btn-presenca-limpar"
                onClick={() => definirPresencaTodos(false)}
              >
                Desmarcar todos
              </button>
            )}
          </div>

          <div className="presenca-observacao">
            <strong>Função de hoje</strong>
            <p>
              Você pode trocar Linha/Goleiro nesta pelada sem alterar a posição
              habitual do cadastro permanente.
            </p>
          </div>

          <div className="presenca-grupos">
            <div className="presenca-grupo">
              <div className="presenca-grupo-titulo">
                <strong>🧤 Goleiros</strong>
                <span>{goleirosPresenca.length}</span>
              </div>

              {goleirosPresenca.length > 0 && (
                <button
                  type="button"
                  className="btn-presenca-grupo"
                  onClick={() => alternarPresencaGrupo('GOLEIRO')}
                >
                  {goleirosPresenca.every((item) => item.presente)
                    ? 'Desmarcar todos os goleiros'
                    : '✓ Marcar todos os goleiros presentes'}
                </button>
              )}

              {goleirosPresenca.length === 0 ? (
                <div className="presenca-vazio">Nenhum goleiro nesta função.</div>
              ) : (
                goleirosPresenca.map((participante) => (
                  <div className="presenca-jogador" key={participante.jogador.id}>
                    <div className="presenca-jogador-dados">
                      <strong>{participante.jogador.nomeExibicao}</strong>
                      <small>{participante.jogador.nomeCompleto}</small>
                    </div>

                    <div className="presenca-controles">
                      <select
                        className="presenca-funcao"
                        value={participante.funcaoHoje}
                        onChange={(event) =>
                          alterarFuncaoHoje(
                            participante.jogador.id,
                            event.target.value as 'LINHA' | 'GOLEIRO',
                          )
                        }
                        aria-label={`Função de ${participante.jogador.nomeExibicao} hoje`}
                      >
                        <option value="GOLEIRO">Goleiro</option>
                        <option value="LINHA">Linha</option>
                      </select>

                      <button
                        type="button"
                        className={`presenca-toggle ${participante.presente ? 'sim' : 'nao'}`}
                        onClick={() => alternarPresenca(participante.jogador.id)}
                      >
                        {participante.presente ? 'SIM' : 'NÃO'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="presenca-grupo">
              <div className="presenca-grupo-titulo">
                <strong>⚽ Jogadores de linha</strong>
                <span>{linhaPresenca.length}</span>
              </div>

              {linhaPresenca.length > 0 && (
                <button
                  type="button"
                  className="btn-presenca-grupo"
                  onClick={() => alternarPresencaGrupo('LINHA')}
                >
                  {linhaPresenca.every((item) => item.presente)
                    ? 'Desmarcar todos da linha'
                    : '✓ Marcar todos da linha presentes'}
                </button>
              )}

              {linhaPresenca.length === 0 ? (
                <div className="presenca-vazio">Nenhum jogador nesta função.</div>
              ) : (
                linhaPresenca.map((participante) => (
                  <div className="presenca-jogador" key={participante.jogador.id}>
                    <div className="presenca-jogador-dados">
                      <strong>{participante.jogador.nomeExibicao}</strong>
                      <small>{participante.jogador.nomeCompleto}</small>
                    </div>

                    <div className="presenca-controles">
                      <select
                        className="presenca-funcao"
                        value={participante.funcaoHoje}
                        onChange={(event) =>
                          alterarFuncaoHoje(
                            participante.jogador.id,
                            event.target.value as 'LINHA' | 'GOLEIRO',
                          )
                        }
                        aria-label={`Função de ${participante.jogador.nomeExibicao} hoje`}
                      >
                        <option value="LINHA">Linha</option>
                        <option value="GOLEIRO">Goleiro</option>
                      </select>

                      <button
                        type="button"
                        className={`presenca-toggle ${participante.presente ? 'sim' : 'nao'}`}
                        onClick={() => alternarPresenca(participante.jogador.id)}
                      >
                        {participante.presente ? 'SIM' : 'NÃO'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="presenca-rodape">
            <strong>{totalPresentes} jogador(es) confirmado(s)</strong>
            <span>
              Somente jogadores marcados como SIM participarão do sorteio inicial.
            </span>
          </div>

          {sessaoCriadaId === null ? (
            <button
              type="button"
              className="btn-continuar-pelada"
              onClick={confirmarPresenca}
              disabled={salvandoSessao || totalPresentes === 0}
            >
              {salvandoSessao
                ? 'Salvando presença...'
                : 'Confirmar presença e preparar sorteio'}
            </button>
          ) : (
            <>
              <div className="reconhecimento-sucesso">
                <strong>
                  {sessaoRecuperada
                    ? 'Pelada em preparação recuperada.'
                    : 'Presença salva com sucesso.'}
                </strong>
                <p>
                  {sessaoRecuperada
                    ? `Sessão #${sessaoCriadaId} recuperada. Alterações de presença e função são salvas automaticamente.`
                    : `Sessão #${sessaoCriadaId} criada. Alterações de presença e função passam a ser salvas automaticamente.`}
                </p>
              </div>

              <button
                type="button"
                className="btn-descartar-sessao"
                onClick={descartarPeladaEmPreparacao}
                disabled={descartandoSessao}
              >
                {descartandoSessao
                  ? 'Descartando sessão...'
                  : 'Descartar pelada em preparação'}
              </button>
            </>
          )}
        </section>
      )}

      {etapaPresenca && sessaoCriadaId !== null && (
        <section className="nova-pelada-card">
          <div className="nova-pelada-etapa">
            <span>6</span>

            <div>
              <strong>Sorteio inicial dos goleiros</strong>
              <small>
                Somente os goleiros presentes participam. Os números são únicos
                dentro deste sorteio.
              </small>
            </div>
          </div>

          <div className="presenca-resumo">
            <div>
              <strong>{totalGoleirosPresentes}</strong>
              <span>Goleiros presentes</span>
            </div>

            <div>
              <strong>
                {resultadoSorteioGoleiros.length > 0 ? 'REALIZADO' : 'PENDENTE'}
              </strong>
              <span>Sorteio</span>
            </div>
          </div>

          {resultadoSorteioGoleiros.length === 0 ? (
            <>
              <div className="presenca-observacao">
                <strong>Como funciona</strong>
                <p>
                  Cada goleiro presente receberá um número de 1 até{' '}
                  {totalGoleirosPresentes}. Os goleiros #1 e #2 começam a
                  primeira queda e recebem duas cores distintas dentre as
                  configuradas. Do #3 em diante ficam na ordem inicial externa.
                </p>
              </div>

              <button
                type="button"
                className="btn-continuar-pelada"
                onClick={sortearGoleirosIniciais}
                disabled={sorteandoGoleiros || totalGoleirosPresentes < 2}
              >
                {sorteandoGoleiros
                  ? 'Sorteando goleiros...'
                  : 'Sortear goleiros'}
              </button>

              {totalGoleirosPresentes < 2 && (
                <div className="reconhecimento-aviso">
                  <strong>São necessários pelo menos 2 goleiros presentes.</strong>
                  <p>
                    Ajuste a presença ou a função dos jogadores antes de realizar
                    o sorteio inicial.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="reconhecimento-sucesso">
                <strong>Sorteio dos goleiros realizado e salvo.</strong>
                <p>
                  Este resultado é oficial para a sessão #{sessaoCriadaId} e será
                  recuperado após atualizar ou reabrir a página.
                </p>
              </div>

              <div className="lista-reconhecimento">
                {resultadoSorteioGoleiros.map((resultado) => (
                  <div
                    className="item-reconhecimento reconhecido"
                    key={`sorteio-goleiro-${resultado.jogador.id}`}
                  >
                    <div className="reconhecimento-identidade">
                      <div className="sorteio-goleiro-linha">
                        <strong className="sorteio-goleiro-numero">
                          #{resultado.numeroSorteado}
                        </strong>

                        {resultado.numeroSorteado <= 2 &&
                          resultado.corColete && (
                            <div className="colete-sorteado-visual">
                              <CamisaColete
                                cor={
                                  configuracaoPelada?.coresColetes.find(
                                    (cor) =>
                                      cor.nome.toLocaleLowerCase('pt-BR') ===
                                      resultado.corColete?.toLocaleLowerCase(
                                        'pt-BR',
                                      ),
                                  )?.hex ?? '#777777'
                                }
                              />

                              <div>
                                <span>🧤 Começa a primeira queda</span>
                                <strong>
                                  COLETE {resultado.corColete.toUpperCase()}
                                </strong>
                              </div>
                            </div>
                          )}

                        {resultado.numeroSorteado > 2 && (
                          <span className="sorteio-goleiro-espera">
                            🕒 Ordem inicial externa
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="reconhecimento-resultado">
                      <strong>{resultado.jogador.nomeExibicao}</strong>
                      <small>{resultado.jogador.nomeCompleto}</small>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {resultadoSorteioGoleiros.length > 0 && (
        <section className="config-card sorteio-linha-card">
          <div className="config-card-titulo">
            <span>⚽</span>

            <div>
              <strong>Sorteio inicial dos jogadores de linha</strong>
              <small>
                A quantidade por grupo vem das configurações da pelada.
              </small>
            </div>
          </div>

          <div className="presenca-resumo">
            <div>
              <strong>
                {
                  participantesPresenca.filter(
                    (item) => item.presente && item.funcaoHoje === 'LINHA',
                  ).length
                }
              </strong>
              <span>Jogadores presentes</span>
            </div>

            <div>
              <strong>
                {configuracaoPelada?.jogadoresLinhaPorTime ?? '-'}
              </strong>
              <span>Jogadores por time</span>
            </div>

            <div>
              <strong>
                {resultadoSorteioLinha.length > 0 ? 'REALIZADO' : 'PENDENTE'}
              </strong>
              <span>Sorteio</span>
            </div>
          </div>

          {resultadoSorteioLinha.length === 0 ? (
            <>
              <div className="presenca-observacao">
                <strong>Como será formado</strong>
                <p>
                  A sacola vai de 1 até o total de jogadores de linha presentes.
                  Cada faixa de{' '}
                  {configuracaoPelada?.jogadoresLinhaPorTime ?? '...'} números
                  forma um grupo. Os primeiros grupos são ligados à ordem inicial
                  dos goleiros.
                </p>
              </div>

              <button
                type="button"
                className="btn-continuar-pelada"
                onClick={sortearJogadoresLinhaIniciais}
                disabled={sorteandoLinha || !configuracaoPelada}
              >
                {sorteandoLinha
                  ? 'Sorteando jogadores...'
                  : 'Sortear jogadores de linha'}
              </button>
            </>
          ) : (
            <>
              <div className="reconhecimento-sucesso">
                <strong>Sorteio dos jogadores realizado e salvo.</strong>
                <p>
                  Os grupos abaixo são oficiais para a sessão #{sessaoCriadaId}.
                </p>
              </div>

              <div className="grupos-sorteio-grid">
                {Array.from(
                  new Set(resultadoSorteioLinha.map((item) => item.grupo)),
                ).map((numeroGrupo) => {
                  const jogadoresGrupo = resultadoSorteioLinha.filter(
                    (item) => item.grupo === numeroGrupo,
                  )

                  const grupoCompleto = jogadoresGrupo.every(
                    (item) => item.grupoCompleto,
                  )

                  const goleiro = resultadoSorteioGoleiros.find(
                    (item) => item.ordem === numeroGrupo,
                  )

                  return (
                    <article
                      className={`grupo-sorteio ${
                        grupoCompleto ? '' : 'grupo-sorteio-incompleto'
                      }`}
                      key={`grupo-linha-${numeroGrupo}`}
                    >
                      <div className="grupo-sorteio-cabecalho">
                        <div>
                          <span>GRUPO {numeroGrupo}</span>
                          <strong>
                            {grupoCompleto
                              ? 'Time completo'
                              : 'Fila parcial'}
                          </strong>
                        </div>

                        {goleiro?.corColete && (
                          <CamisaColete
                            cor={
                              configuracaoPelada?.coresColetes.find(
                                (cor) =>
                                  cor.nome.toLocaleLowerCase('pt-BR') ===
                                  goleiro.corColete?.toLocaleLowerCase('pt-BR'),
                              )?.hex ?? '#777777'
                            }
                          />
                        )}
                      </div>

                      <div className="grupo-sorteio-goleiro">
                        <small>Goleiro</small>
                        <strong>
                          {goleiro
                            ? `#${goleiro.ordem} ${goleiro.jogador.nomeExibicao}`
                            : 'Aguardando goleiro'}
                        </strong>
                        {goleiro?.corColete && (
                          <span>
                            Colete {goleiro.corColete.toUpperCase()}
                          </span>
                        )}
                      </div>

                      <div className="grupo-sorteio-jogadores">
                        {jogadoresGrupo.map((item) => (
                          <div key={`linha-sorteada-${item.jogador.id}`}>
                            <strong>#{item.numeroSorteado}</strong>
                            <span>{item.jogador.nomeExibicao}</span>
                          </div>
                        ))}
                      </div>
                    </article>
                  )
                })}
              </div>
            </>
          )}
        </section>
      )}

      {resultadoSorteioLinha.length > 0 && (() => {
        /*
         * A primeira partida é apenas uma leitura do sorteio oficial já salvo.
         * Nenhum novo sorteio acontece aqui: Grupo 1 enfrenta Grupo 2 e cada
         * grupo usa o goleiro da mesma posição na ordem inicial.
         */
        const time1 = resultadoSorteioLinha.filter(
          (item) => item.grupo === 1,
        )
        const time2 = resultadoSorteioLinha.filter(
          (item) => item.grupo === 2,
        )

        const time1Completo =
          time1.length > 0 && time1.every((item) => item.grupoCompleto)
        const time2Completo =
          time2.length > 0 && time2.every((item) => item.grupoCompleto)

        const goleiro1 = resultadoSorteioGoleiros.find(
          (item) => item.ordem === 1,
        )
        const goleiro2 = resultadoSorteioGoleiros.find(
          (item) => item.ordem === 2,
        )

        const primeiraPartidaPronta =
          time1Completo && time2Completo && !!goleiro1 && !!goleiro2

        if (!primeiraPartidaPronta) {
          return (
            <section className="config-card primeira-partida-card">
              <div className="config-card-titulo">
                <span>🏟️</span>
                <div>
                  <strong>Primeira partida</strong>
                  <small>
                    Aguardando dois times completos e seus goleiros.
                  </small>
                </div>
              </div>

              <div className="reconhecimento-aviso">
                <strong>Primeira partida ainda não pode ser formada.</strong>
                <p>
                  Os Grupos 1 e 2 precisam estar completos e possuir os
                  goleiros #1 e #2 do sorteio inicial.
                </p>
              </div>
            </section>
          )
        }

        const corHex = (nome?: string) =>
          configuracaoPelada?.coresColetes.find(
            (cor) =>
              cor.nome.toLocaleLowerCase('pt-BR') ===
              nome?.toLocaleLowerCase('pt-BR'),
          )?.hex ?? '#777777'

        return (
          <section className="config-card primeira-partida-card">
            <div className="config-card-titulo">
              <span>🏟️</span>
              <div>
                <strong>Primeira partida</strong>
                <small>
                  Formação criada diretamente do sorteio inicial oficial.
                </small>
              </div>
            </div>

            <div className="primeira-partida-status">
              PRONTA PARA INICIAR
            </div>

            <div className="primeira-partida-confronto">
              <article className="primeira-partida-time">
                <div className="primeira-partida-time-cabecalho">
                  <CamisaColete cor={corHex(goleiro1.corColete)} />
                  <div>
                    <span>TIME 1</span>
                    <strong>
                      {goleiro1.corColete
                        ? `Colete ${goleiro1.corColete}`
                        : 'Colete não informado'}
                    </strong>
                  </div>
                </div>

                <div className="primeira-partida-goleiro">
                  <small>GOLEIRO</small>
                  <strong>🧤 {goleiro1.jogador.nomeExibicao}</strong>
                </div>

                <div className="primeira-partida-jogadores">
                  {time1
                    .sort((a, b) => a.numeroSorteado - b.numeroSorteado)
                    .map((item) => (
                      <div key={`partida-time1-${item.jogador.id}`}>
                        <strong>#{item.numeroSorteado}</strong>
                        <span>{item.jogador.nomeExibicao}</span>
                      </div>
                    ))}
                </div>
              </article>

              <div className="primeira-partida-versus">×</div>

              <article className="primeira-partida-time">
                <div className="primeira-partida-time-cabecalho">
                  <CamisaColete cor={corHex(goleiro2.corColete)} />
                  <div>
                    <span>TIME 2</span>
                    <strong>
                      {goleiro2.corColete
                        ? `Colete ${goleiro2.corColete}`
                        : 'Colete não informado'}
                    </strong>
                  </div>
                </div>

                <div className="primeira-partida-goleiro">
                  <small>GOLEIRO</small>
                  <strong>🧤 {goleiro2.jogador.nomeExibicao}</strong>
                </div>

                <div className="primeira-partida-jogadores">
                  {time2
                    .sort((a, b) => a.numeroSorteado - b.numeroSorteado)
                    .map((item) => (
                      <div key={`partida-time2-${item.jogador.id}`}>
                        <strong>#{item.numeroSorteado}</strong>
                        <span>{item.jogador.nomeExibicao}</span>
                      </div>
                    ))}
                </div>
              </article>
            </div>

            <button
              type="button"
              className="btn-iniciar-primeira-partida"
              onClick={iniciarPrimeiraPartidaOficial}
              disabled={iniciandoPartida}
            >
              {iniciandoPartida ? 'INICIANDO PARTIDA...' : 'INICIAR PARTIDA'}
            </button>

            <div className="primeira-partida-observacao">
              <strong>Formação pronta</strong>
              <span>
                Ao iniciar, esta formação será persistida como a Partida 1 oficial.
              </span>
            </div>
          </section>
        )
      })()}

        </>
      )}

      {golAbertoLado !== null && partidaEmAndamento && (() => {
        const timeGol = partidaEmAndamento.times.find((time) => time.lado === golAbertoLado)
        const jogadoresDoTime = partidaEmAndamento.jogadores
          .filter((item) => item.lado === golAbertoLado)
          .sort((a, b) => a.ordemFormacao - b.ordemFormacao)

        return (
          <div className="identificacao-overlay" onClick={fecharRegistroGol}>
            <div
              className="identificacao-modal chegada-atrasada-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="identificacao-modal-cabecalho">
                <div>
                  <span>PARTIDA {partidaEmAndamento.partida.numero}</span>
                  <h2>Registrar gol</h2>
                </div>
                <button
                  type="button"
                  className="btn-fechar-identificacao"
                  onClick={fecharRegistroGol}
                  aria-label="Fechar"
                  disabled={salvandoGol}
                >
                  ×
                </button>
              </div>

              <p className="identificacao-explicacao chegada-atrasada-intro">
                Gol para <strong>{timeGol?.corColete ?? `Time ${golAbertoLado}`}</strong>.
                Selecione quem marcou. O goleiro também pode ser escolhido.
              </p>

              <div className="chegada-lista-jogadores">
                {jogadoresDoTime.map((item) => {
                  const participante = participantesPresenca.find(
                    (p) => p.jogador.id === item.jogadorId,
                  )
                  const nome =
                    participante?.jogador.nomeExibicao ?? `Jogador #${item.jogadorId}`
                  const selecionado = autorGolId === item.jogadorId

                  return (
                    <button
                      key={`${item.lado}-${item.jogadorId}`}
                      type="button"
                      className={`chegada-jogador-card${selecionado ? ' selecionado' : ''}`}
                      onClick={() => {
                        setAutorGolId(item.jogadorId)
                        setErroGol('')
                      }}
                      disabled={salvandoGol}
                    >
                      <span className="chegada-jogador-avatar">
                        {nome.trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="chegada-jogador-dados">
                        <strong>{nome}</strong>
                        <small>{item.funcao === 'GOLEIRO' ? 'Goleiro' : 'Jogador de linha'}</small>
                      </span>
                      <span className="chegada-jogador-tipo">
                        {item.funcao === 'GOLEIRO' ? 'GOLEIRO' : 'LINHA'}
                      </span>
                      <span className="chegada-jogador-check" aria-hidden="true">
                        {selecionado ? '✓' : ''}
                      </span>
                    </button>
                  )
                })}
              </div>

              {erroGol && <div className="chegada-atrasada-erro">{erroGol}</div>}

              <div className="chegada-atrasada-acoes chegada-atrasada-acoes-principal">
                <button
                  type="button"
                  className="btn-chegada-novo"
                  onClick={() => confirmarRegistroGol(true)}
                  disabled={salvandoGol}
                >
                  GOL CONTRA
                </button>
                <button
                  type="button"
                  className="btn-confirmar-identificacao btn-confirmar-chegada"
                  onClick={() => confirmarRegistroGol(false)}
                  disabled={salvandoGol || autorGolId === null}
                >
                  {salvandoGol ? 'SALVANDO...' : 'CONFIRMAR GOL'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {chegadaAtrasadaAberta && (
        <div className="identificacao-overlay" onClick={fecharChegadaAtrasada}>
          <div
            className="identificacao-modal chegada-atrasada-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="identificacao-modal-cabecalho">
              <div>
                <span>ORGANIZAÇÃO / FILA</span>
                <h2>Chegada atrasada</h2>
              </div>
              <button
                type="button"
                className="btn-fechar-identificacao"
                onClick={fecharChegadaAtrasada}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            {!cadastroChegadaAberto ? (
              <>
                <p className="identificacao-explicacao chegada-atrasada-intro">
                  Selecione quem acabou de chegar. A chegada será registrada sem
                  alterar o sorteio inicial já realizado.
                </p>

                <div className="chegada-busca">
                  <label htmlFor="busca-chegada">BUSCAR JOGADOR</label>
                  <div className="chegada-busca-campo">
                    <span aria-hidden="true">⌕</span>
                    <input
                      id="busca-chegada"
                      type="text"
                      value={buscaChegada}
                      onChange={(event) => setBuscaChegada(event.target.value)}
                      placeholder="Digite o nome ou apelido..."
                      autoFocus
                    />
                  </div>
                </div>

                <div className="chegada-lista-jogadores">
                  {jogadoresChegada
                    .filter((jogador) => {
                      const jaPresente = participantesPresenca.some(
                        (participante) =>
                          participante.jogador.id === jogador.id && participante.presente,
                      )
                      if (jaPresente) return false

                      const termo = buscaChegada.trim().toLocaleLowerCase('pt-BR')
                      if (!termo) return true

                      return [
                        jogador.nomeExibicao,
                        jogador.nomeCompleto,
                        ...jogador.apelidos,
                      ].some((valor) =>
                        valor.toLocaleLowerCase('pt-BR').includes(termo),
                      )
                    })
                    .map((jogador) => {
                      const selecionado = jogadorChegadaId === jogador.id
                      return (
                        <button
                          key={jogador.id}
                          type="button"
                          className={`chegada-jogador-card${selecionado ? ' selecionado' : ''}`}
                          onClick={() => {
                            setJogadorChegadaId(jogador.id ?? null)
                            setTipoChegada(jogador.tipoPadrao)
                            setErroChegada('')
                          }}
                        >
                          <span className="chegada-jogador-avatar">
                            {jogador.nomeExibicao.trim().charAt(0).toUpperCase()}
                          </span>
                          <span className="chegada-jogador-dados">
                            <strong>{jogador.nomeExibicao}</strong>
                            <small>{jogador.nomeCompleto}</small>
                          </span>
                          <span className="chegada-jogador-tipo">
                            {jogador.tipoPadrao === 'GOLEIRO' ? 'GOLEIRO' : 'LINHA'}
                          </span>
                          <span className="chegada-jogador-check" aria-hidden="true">
                            {selecionado ? '✓' : ''}
                          </span>
                        </button>
                      )
                    })}

                  {jogadoresChegada.filter((jogador) => {
                    const jaPresente = participantesPresenca.some(
                      (participante) =>
                        participante.jogador.id === jogador.id && participante.presente,
                    )
                    if (jaPresente) return false
                    const termo = buscaChegada.trim().toLocaleLowerCase('pt-BR')
                    if (!termo) return true
                    return [jogador.nomeExibicao, jogador.nomeCompleto, ...jogador.apelidos]
                      .some((valor) => valor.toLocaleLowerCase('pt-BR').includes(termo))
                  }).length === 0 && (
                    <div className="chegada-lista-vazia">
                      <strong>Nenhum jogador disponível</strong>
                      <span>Confira a busca ou cadastre um novo jogador.</span>
                    </div>
                  )}
                </div>

                {jogadorChegadaId !== null && (
                  <div className="chegada-funcao-bloco">
                    <div className="chegada-funcao-titulo">
                      <strong>FUNÇÃO NESTA PELADA</strong>
                      <span>Escolha como ele vai participar hoje.</span>
                    </div>
                    <div className="chegada-funcao-opcoes">
                      <button
                        type="button"
                        className={tipoChegada === 'LINHA' ? 'selecionada' : ''}
                        onClick={() => setTipoChegada('LINHA')}
                      >
                        <span>⚽</span>
                        <strong>JOGADOR DE LINHA</strong>
                      </button>
                      <button
                        type="button"
                        className={tipoChegada === 'GOLEIRO' ? 'selecionada' : ''}
                        onClick={() => setTipoChegada('GOLEIRO')}
                      >
                        <span>🥅</span>
                        <strong>GOLEIRO</strong>
                      </button>
                    </div>
                  </div>
                )}

                {erroChegada && (
                  <div className="chegada-atrasada-erro">{erroChegada}</div>
                )}

                <div className="chegada-atrasada-acoes chegada-atrasada-acoes-principal">
                  <button
                    type="button"
                    className="btn-chegada-novo"
                    onClick={() => {
                      setCadastroChegadaAberto(true)
                      setErroChegada('')
                    }}
                    disabled={salvandoChegada}
                  >
                    + JOGADOR NÃO CADASTRADO
                  </button>
                  <button
                    type="button"
                    className="btn-confirmar-identificacao btn-confirmar-chegada"
                    onClick={confirmarChegadaAtrasada}
                    disabled={salvandoChegada || jogadorChegadaId === null}
                  >
                    {salvandoChegada ? 'SALVANDO...' : 'CONFIRMAR CHEGADA'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="chegada-cadastro-cabecalho">
                  <strong>NOVO JOGADOR</strong>
                  <span>Cadastre e registre a chegada sem sair da pelada.</span>
                </div>

                <div className="nova-pelada-campo">
                  <label>Nome completo</label>
                  <input
                    type="text"
                    value={chegadaNomeCompleto}
                    onChange={(event) => setChegadaNomeCompleto(event.target.value)}
                    autoFocus
                  />
                </div>
                <div className="nova-pelada-campo">
                  <label>Nome de exibição</label>
                  <input
                    type="text"
                    value={chegadaNomeExibicao}
                    onChange={(event) => setChegadaNomeExibicao(event.target.value)}
                  />
                </div>
                <div className="nova-pelada-campo">
                  <label>Apelidos</label>
                  <input
                    type="text"
                    value={chegadaApelidos}
                    onChange={(event) => setChegadaApelidos(event.target.value)}
                    placeholder="Separe por vírgula"
                  />
                </div>

                <div className="chegada-funcao-bloco chegada-funcao-cadastro">
                  <div className="chegada-funcao-titulo">
                    <strong>POSIÇÃO HABITUAL</strong>
                  </div>
                  <div className="chegada-funcao-opcoes">
                    <button
                      type="button"
                      className={chegadaTipoPadrao === 'LINHA' ? 'selecionada' : ''}
                      onClick={() => setChegadaTipoPadrao('LINHA')}
                    >
                      <span>⚽</span><strong>LINHA</strong>
                    </button>
                    <button
                      type="button"
                      className={chegadaTipoPadrao === 'GOLEIRO' ? 'selecionada' : ''}
                      onClick={() => setChegadaTipoPadrao('GOLEIRO')}
                    >
                      <span>🥅</span><strong>GOLEIRO</strong>
                    </button>
                  </div>
                </div>

                <div className="chegada-funcao-bloco chegada-funcao-cadastro">
                  <div className="chegada-funcao-titulo">
                    <strong>FUNÇÃO NESTA PELADA</strong>
                  </div>
                  <div className="chegada-funcao-opcoes">
                    <button
                      type="button"
                      className={tipoChegada === 'LINHA' ? 'selecionada' : ''}
                      onClick={() => setTipoChegada('LINHA')}
                    >
                      <span>⚽</span><strong>LINHA</strong>
                    </button>
                    <button
                      type="button"
                      className={tipoChegada === 'GOLEIRO' ? 'selecionada' : ''}
                      onClick={() => setTipoChegada('GOLEIRO')}
                    >
                      <span>🥅</span><strong>GOLEIRO</strong>
                    </button>
                  </div>
                </div>

                {erroChegada && (
                  <div className="chegada-atrasada-erro">{erroChegada}</div>
                )}

                <div className="identificacao-acoes chegada-atrasada-acoes">
                  <button
                    type="button"
                    className="btn-cancelar-identificacao"
                    onClick={() => setCadastroChegadaAberto(false)}
                    disabled={salvandoChegada}
                  >
                    VOLTAR
                  </button>
                  <button
                    type="button"
                    className="btn-confirmar-identificacao"
                    onClick={cadastrarERegistrarChegada}
                    disabled={
                      salvandoChegada ||
                      !chegadaNomeCompleto.trim() ||
                      !chegadaNomeExibicao.trim()
                    }
                  >
                    {salvandoChegada ? 'SALVANDO...' : 'CADASTRAR E REGISTRAR'}
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

      {jogadorEmIdentificacao && (
        <div
          className="identificacao-overlay"
          onClick={fecharIdentificacao}
        >
          <div
            className="identificacao-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="identificacao-modal-cabecalho">
              <div>
                <span>IDENTIFICAR JOGADOR</span>
                <h2>{jogadorEmIdentificacao.nomeLista}</h2>
              </div>

              <button
                type="button"
                className="btn-fechar-identificacao"
                onClick={fecharIdentificacao}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            {cadastroRapidoAberto ? (
              <>
                <p className="identificacao-explicacao">
                  Cadastre o atleta sem sair da preparação da pelada. Depois de
                  salvar, ele será identificado automaticamente nesta lista.
                </p>

                <div className="nova-pelada-campo">
                  <label>Nome completo</label>
                  <input
                    type="text"
                    value={novoNomeCompleto}
                    onChange={(event) => setNovoNomeCompleto(event.target.value)}
                    placeholder="Ex.: Roberto Silva"
                    autoFocus
                  />
                </div>

                <div className="nova-pelada-campo">
                  <label>Nome de exibição</label>
                  <input
                    type="text"
                    value={novoNomeExibicao}
                    onChange={(event) => setNovoNomeExibicao(event.target.value)}
                    placeholder="Ex.: Robinho"
                  />
                </div>

                <div className="nova-pelada-campo">
                  <label>Apelidos para reconhecimento</label>
                  <input
                    type="text"
                    value={novosApelidos}
                    onChange={(event) => setNovosApelidos(event.target.value)}
                    placeholder="Separe por vírgula. Ex.: Binho, R10"
                  />
                </div>

                <div className="nova-pelada-campo">
                  <label>Posição habitual</label>
                  <select
                    value={novoTipoPadrao}
                    onChange={(event) =>
                      setNovoTipoPadrao(
                        event.target.value as 'LINHA' | 'GOLEIRO',
                      )
                    }
                  >
                    <option value="LINHA">Jogador de linha</option>
                    <option value="GOLEIRO">Goleiro</option>
                  </select>
                </div>

                <div className="identificacao-sem-opcoes">
                  <strong>
                    Função nesta pelada:{' '}
                    {jogadorEmIdentificacao.tipoLista === 'GOLEIRO'
                      ? 'Goleiro'
                      : 'Linha'}
                  </strong>
                  <p>
                    A posição habitual pertence ao cadastro permanente. A função
                    desta pelada continua sendo a informada pela lista e poderá ser
                    ajustada depois na conferência de presença.
                  </p>
                </div>

                <div className="identificacao-acoes">
                  <button
                    type="button"
                    className="btn-cancelar-identificacao"
                    onClick={() => setCadastroRapidoAberto(false)}
                    disabled={salvandoNovoJogador}
                  >
                    Voltar
                  </button>

                  <button
                    type="button"
                    className="btn-confirmar-identificacao"
                    onClick={salvarNovoJogador}
                    disabled={
                      salvandoNovoJogador ||
                      !novoNomeCompleto.trim() ||
                      !novoNomeExibicao.trim()
                    }
                  >
                    {salvandoNovoJogador ? 'Salvando...' : 'Salvar jogador'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {buscandoSugestoes ? (
                  <div className="identificacao-sem-opcoes">
                    <strong>Procurando possíveis jogadores...</strong>
                    <p>
                      O sistema está comparando o nome informado com os jogadores
                      cadastrados.
                    </p>
                  </div>
                ) : sugestoesIdentificacao.length > 0 ? (
                  <>
                    <p className="identificacao-explicacao">
                      Encontramos possíveis jogadores para{' '}
                      <strong>"{jogadorEmIdentificacao.nomeLista}"</strong>.
                      Selecione a pessoa correta.
                    </p>

                    <div className="identificacao-opcoes">
                      {sugestoesIdentificacao.map((sugestao) => {
                        const jogador = sugestao.jogador
                        const selecionado =
                          jogador.id === jogadorSelecionadoId

                        return (
                          <button
                            type="button"
                            key={jogador.id}
                            className={`identificacao-opcao ${
                              selecionado ? 'selecionada' : ''
                            }`}
                            onClick={() =>
                              setJogadorSelecionadoId(jogador.id ?? null)
                            }
                          >
                            <span className="identificacao-radio">
                              {selecionado ? '●' : '○'}
                            </span>

                            <span className="identificacao-dados">
                              <strong>{jogador.nomeExibicao}</strong>
                              <small>{jogador.nomeCompleto}</small>

                              {jogador.apelidos.length > 0 && (
                                <small>
                                  Apelidos: {jogador.apelidos.join(', ')}
                                </small>
                              )}

                              <small className="identificacao-motivo">
                                Encontrado por: {sugestao.valorEncontrado}
                              </small>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <div className="identificacao-sem-opcoes">
                    <strong>Nenhum jogador parecido foi encontrado.</strong>
                    <p>
                      Se este atleta ainda não possui cadastro, adicione-o como
                      novo jogador.
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  className="btn-adicionar-novo-identificacao"
                  onClick={abrirCadastroRapido}
                >
                  + Adicionar novo jogador
                </button>

                <div className="identificacao-acoes">
                  
                  <button
                  type="button"
                  className="btn-cancelar-identificacao"
                  onClick={fecharIdentificacao}
                  >
                  Cancelar
                </button>

                  {sugestoesIdentificacao.length > 0 && (
                    <button
                      type="button"
                      className="btn-confirmar-identificacao"
                      onClick={confirmarIdentificacao}
                      disabled={jogadorSelecionadoId === null}
                    >
                      Confirmar
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {confirmacaoProximaPartida && (
        <div className="proxima-partida-overlay">
          <div className="proxima-partida-modal" role="dialog" aria-modal="true">
            <div className="proxima-partida-topo">
              <span>PRÓXIMA PARTIDA</span>
              <strong>PARTIDA {confirmacaoProximaPartida.numeroPartida}</strong>
            </div>

            <div className="proxima-partida-permanece">
              <small>TIME QUE PERMANECE</small>
              <strong>{confirmacaoProximaPartida.vencedor}</strong>
            </div>

            <div className="proxima-partida-entra">
              <small>TIME QUE VAI ENTRAR</small>
              <h2>GRUPO {confirmacaoProximaPartida.grupo}</h2>
              <span>COLETE {confirmacaoProximaPartida.corEntrada}</span>
            </div>

            <div className="proxima-partida-lista">
              <small>JOGADORES DE LINHA</small>
              {confirmacaoProximaPartida.jogadores.map((nome, indice) => (
                <div key={`${nome}-${indice}`}>
                  <b>{indice + 1}</b>
                  <strong>{nome}</strong>
                </div>
              ))}
            </div>

            <div className="proxima-partida-goleiro">
              <span>🧤</span>
              <div>
                <small>GOLEIRO</small>
                <strong>{confirmacaoProximaPartida.goleiro}</strong>
                <em>{confirmacaoProximaPartida.descricaoGoleiro}</em>
              </div>
            </div>

            <div className="proxima-partida-acoes">
              <button
                type="button"
                className="proxima-partida-voltar"
                onClick={() => setConfirmacaoProximaPartida(null)}
                disabled={iniciandoProximaPartida}
              >
                VOLTAR
              </button>
              <button
                type="button"
                className="proxima-partida-confirmar"
                onClick={iniciarProximaPartidaConfirmada}
                disabled={iniciandoProximaPartida}
              >
                {iniciandoProximaPartida ? 'INICIANDO...' : 'CONFIRMAR E INICIAR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmacaoFinalizacao && (
        <div
          className="confirmar-finalizacao-overlay"
          onClick={() => {
            if (!finalizandoPartida) setConfirmacaoFinalizacao(null)
          }}
        >
          <div
            className="confirmar-finalizacao-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-confirmar-finalizacao"
            onClick={(evento) => evento.stopPropagation()}
          >
            <div className="confirmar-finalizacao-icone">🏁</div>
            <span className="confirmar-finalizacao-etiqueta">FINALIZAR PARTIDA</span>
            <h2 id="titulo-confirmar-finalizacao">Confirmar resultado?</h2>
            <p className="confirmar-finalizacao-texto">
              Confira o placar antes de gravar o resultado oficial.
            </p>

            <div className="confirmar-finalizacao-placar">
              <div className="confirmar-finalizacao-time">
                <small>TIME 1</small>
                <strong>{confirmacaoFinalizacao.nomeTime1}</strong>
              </div>

              <span className="confirmar-finalizacao-numero">
                {confirmacaoFinalizacao.placarTime1}
              </span>
              <span className="confirmar-finalizacao-x">×</span>
              <span className="confirmar-finalizacao-numero">
                {confirmacaoFinalizacao.placarTime2}
              </span>

              <div className="confirmar-finalizacao-time">
                <small>TIME 2</small>
                <strong>{confirmacaoFinalizacao.nomeTime2}</strong>
              </div>
            </div>

            <div className="confirmar-finalizacao-aviso">
              O resultado será gravado como oficial.
            </div>

            <div className="confirmar-finalizacao-acoes">
              <button
                type="button"
                className="confirmar-finalizacao-cancelar"
                onClick={() => setConfirmacaoFinalizacao(null)}
                disabled={finalizandoPartida}
              >
                VOLTAR
              </button>
              <button
                type="button"
                className="confirmar-finalizacao-confirmar"
                onClick={confirmarFinalizacaoPartida}
                disabled={finalizandoPartida}
              >
                {finalizandoPartida ? 'FINALIZANDO...' : 'CONFIRMAR RESULTADO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {resultadoPartidaAberto && (
        <div className="resultado-partida-overlay">
          <div className="resultado-partida-modal" role="dialog" aria-modal="true">
            <div className="resultado-partida-icone">
              {resultadoPartidaAberto.tipo === 'VITORIA' ? '🏆' : '🤝'}
            </div>
            <span className="resultado-partida-etiqueta">PARTIDA FINALIZADA</span>
            <h2>
              {resultadoPartidaAberto.tipo === 'VITORIA'
                ? `${resultadoPartidaAberto.vencedor} VENCEU`
                : 'EMPATE'}
            </h2>
            <div className="resultado-partida-placar">{resultadoPartidaAberto.placar}</div>

            {resultadoPartidaAberto.tipo === 'VITORIA' ? (
              <>
                <div className="resultado-partida-vencedor">
                  <small>VENCEDOR</small>
                  <strong>{resultadoPartidaAberto.vencedor}</strong>
                </div>
                <p>
                  <strong>{resultadoPartidaAberto.perdedor}</strong> retorna para a
                  organização da fila. O resultado já está salvo.
                </p>
              </>
            ) : (
              <p>
                O empate foi registrado oficialmente. Agora faremos a tampinha
                para definir a prioridade operacional da rotação.
              </p>
            )}

            <button
              type="button"
              className="resultado-partida-continuar"
              onClick={() => setResultadoPartidaAberto(null)}
            >
              CONTINUAR
            </button>
          </div>
        </div>
      )}

      {resultadoCascataAtrasado && (
        <div className="cascata-atrasado-overlay" role="presentation">
          <div className="cascata-atrasado-modal" role="dialog" aria-modal="true" aria-labelledby="titulo-cascata-atrasado">
            <div className="cascata-atrasado-topo">
              <span className="cascata-atrasado-icone">🎲</span>
              <div>
                <small>CHEGADA ATRASADA</small>
                <h2 id="titulo-cascata-atrasado">Rotação realizada</h2>
                <p>
                  {resultadoCascataAtrasado.jogadorChegando === 'Fila operacional'
                    ? 'A fila foi normalizada. Confira abaixo todas as tampinhas realizadas.'
                    : <><strong>{resultadoCascataAtrasado.jogadorChegando}</strong> entrou na organização da fila.</>}
                </p>
              </div>
            </div>

            <div className="cascata-atrasado-etapas">
              {resultadoCascataAtrasado.etapas.map((etapa, indice) => (
                <section className="cascata-atrasado-card" key={`${etapa.grupo}-${indice}`}>
                  <div className="cascata-atrasado-card-topo">
                    <span>ETAPA {indice + 1}</span>
                    <strong>GRUPO {etapa.grupo}</strong>
                  </div>

                  <div className="cascata-atrasado-numeros">
                    {etapa.numeros.map((item) => {
                      const saiu = item.nome === etapa.jogadorSaindo
                      return (
                        <div className={`cascata-atrasado-numero ${saiu ? 'saiu' : ''}`} key={`${item.nome}-${item.numero}`}>
                          <b>{item.numero}</b>
                          <span>{item.nome}</span>
                          {saiu && <small>SAI</small>}
                        </div>
                      )
                    })}
                  </div>

                  <div className="cascata-atrasado-troca">
                    <div><small>SAI</small><strong>{etapa.jogadorSaindo}</strong></div>
                    <span>→</span>
                    <div><small>ENTRA</small><strong>{etapa.jogadorEntrando}</strong></div>
                  </div>
                </section>
              ))}
            </div>

            {resultadoCascataAtrasado.etapas.length > 1 && (
              <div className="cascata-atrasado-aviso">
                <strong>Cascata de rotação concluída</strong>
                <span>Quem saiu de um time foi encaminhado para a formação seguinte conforme a ordem da fila.</span>
              </div>
            )}

            <button type="button" className="cascata-atrasado-continuar" onClick={() => setResultadoCascataAtrasado(null)}>
              ENTENDI • CONTINUAR
            </button>
          </div>
        </div>
      )}

      {confirmacaoEmpateAberta && dadosConfirmacaoEmpate && (
        <div className="modal-overlay modal-rotacao-overlay">
          <div className="modal-rotacao-empate" role="dialog" aria-modal="true">
            <div className="modal-rotacao-topo"><small>PRÓXIMA PARTIDA</small><h2>{dadosConfirmacaoEmpate.titulo}</h2><p>{dadosConfirmacaoEmpate.subtitulo}</p></div>
            <div className="modal-rotacao-times">
              {dadosConfirmacaoEmpate.times.map((time) => (
                <section className="modal-time-card" key={time.titulo}>
                  <h3>{time.titulo}</h3>
                  <div className="modal-time-linhas"><small>JOGADORES DE LINHA</small>
                    {time.jogadores.map((nome, indice) => <div className="modal-jogador-linha" key={`${time.titulo}-${nome}-${indice}`}><span>{indice + 1}</span><strong>{nome}</strong></div>)}
                  </div>
                  <div className="modal-goleiro-destaque"><span>🥅</span><div><small>GOLEIRO</small><strong>{time.goleiro}</strong>{time.detalheGoleiro && <p>{time.detalheGoleiro}</p>}</div></div>
                </section>
              ))}
            </div>
            <div className="modal-rotacao-rodape-info"><strong>{dadosConfirmacaoEmpate.rodape}</strong></div>
            <div className="modal-rotacao-acoes">
              <button type="button" className="btn-modal-cancelar" onClick={() => {setConfirmacaoEmpateAberta(false);setDadosConfirmacaoEmpate(null);setAcaoConfirmacaoEmpate(null);setIniciandoProximaPartida(false)}} disabled={iniciandoProximaPartida}>VOLTAR</button>
              <button type="button" className="btn-modal-iniciar" onClick={confirmarModalEmpate} disabled={iniciandoProximaPartida}>{iniciandoProximaPartida ? 'INICIANDO...' : 'CONFIRMAR E INICIAR PARTIDA'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`

        .cascata-atrasado-overlay{position:fixed;inset:0;z-index:1400;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(10,25,18,.72);box-sizing:border-box}
        .cascata-atrasado-modal{width:min(100%,620px);min-width:0;max-height:calc(100dvh - 36px);overflow-y:auto;padding:0;border-radius:22px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.3);box-sizing:border-box}
        .cascata-atrasado-topo{display:flex;align-items:flex-start;gap:13px;padding:22px;background:#edf8f2;border-bottom:1px solid #dce8e0}.cascata-atrasado-icone{display:grid;place-items:center;flex:0 0 48px;height:48px;border-radius:14px;background:#16834f;font-size:25px}.cascata-atrasado-topo>div{min-width:0}.cascata-atrasado-topo small{display:block;font-size:10px;font-weight:900;letter-spacing:1.2px;color:#16834f}.cascata-atrasado-topo h2{margin:3px 0 4px;font-size:26px;line-height:1.08;color:#173f2d}.cascata-atrasado-topo p{margin:0;color:#5b6c63;line-height:1.35}.cascata-atrasado-etapas{display:flex;flex-direction:column;gap:12px;padding:16px}.cascata-atrasado-card{min-width:0;border:1px solid #dce8e0;border-radius:16px;overflow:hidden;background:#fff}.cascata-atrasado-card-topo{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 13px;background:#f6faf7}.cascata-atrasado-card-topo span{font-size:9px;font-weight:900;letter-spacing:1px;color:#718078}.cascata-atrasado-card-topo strong{font-size:14px;color:#173f2d}.cascata-atrasado-numeros{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;padding:12px}.cascata-atrasado-numero{position:relative;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:82px;padding:8px 4px;border:1px solid #dce8e0;border-radius:12px;background:#f9fbfa;text-align:center}.cascata-atrasado-numero b{font-size:26px;line-height:1;color:#173f2d}.cascata-atrasado-numero span{max-width:100%;font-size:11px;font-weight:800;overflow-wrap:anywhere}.cascata-atrasado-numero.saiu{border:2px solid #c75858;background:#fff5f5}.cascata-atrasado-numero.saiu b{color:#a83d3d}.cascata-atrasado-numero small{position:absolute;top:5px;right:5px;padding:2px 5px;border-radius:999px;background:#a83d3d;color:#fff;font-size:7px;font-weight:900}.cascata-atrasado-troca{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:9px;padding:12px;border-top:1px solid #edf2ee;background:#fff}.cascata-atrasado-troca>div{min-width:0;display:flex;flex-direction:column;padding:10px;border-radius:11px;background:#f7f9f8}.cascata-atrasado-troca>div:last-child{background:#edf8f2}.cascata-atrasado-troca small{font-size:8px;font-weight:900;letter-spacing:1px;color:#718078}.cascata-atrasado-troca strong{font-size:15px;overflow-wrap:anywhere}.cascata-atrasado-troca>span{font-size:22px;font-weight:900;color:#16834f}.cascata-atrasado-aviso{display:flex;flex-direction:column;gap:3px;margin:0 16px 16px;padding:12px;border-radius:12px;background:#f6faf7;border:1px solid #dce8e0}.cascata-atrasado-aviso strong{font-size:13px;color:#173f2d}.cascata-atrasado-aviso span{font-size:12px;line-height:1.35;color:#5b6c63}.cascata-atrasado-continuar{width:calc(100% - 32px);min-height:52px;margin:0 16px 18px;border:0;border-radius:14px;background:#16834f;color:#fff;font-size:14px;font-weight:900;cursor:pointer}
        @media(max-width:600px){.cascata-atrasado-overlay{align-items:flex-end;padding:0}.cascata-atrasado-modal{width:100%;max-width:none;max-height:94dvh;border-radius:22px 22px 0 0}.cascata-atrasado-topo{padding:18px 16px 15px}.cascata-atrasado-topo h2{font-size:23px}.cascata-atrasado-numeros{grid-template-columns:repeat(2,minmax(0,1fr));padding:10px}.cascata-atrasado-numero{min-height:72px}.cascata-atrasado-continuar{position:sticky;bottom:0;width:100%;margin:0;padding-bottom:env(safe-area-inset-bottom);border-radius:0;min-height:58px}.cascata-atrasado-etapas{padding:12px}.cascata-atrasado-aviso{margin:0 12px 12px}}

        .proximo-time-destaque{width:100%;min-width:0;padding:16px;border:2px solid #16834f;border-radius:18px;background:#f4fbf7;box-sizing:border-box}
        .proximo-time-cabecalho{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
        .proximo-time-cabecalho>div{display:flex;flex-direction:column;min-width:0}
        .proximo-time-cabecalho small,.proximo-time-jogadores+small{font-size:10px;font-weight:900;letter-spacing:1px;color:#16834f}
        .proximo-time-cabecalho strong{font-size:24px;line-height:1.05}
        .proximo-time-cabecalho>span{padding:7px 10px;border-radius:999px;font-size:10px;font-weight:900}.proximo-time-cabecalho>span.pronto{background:#16834f;color:#fff}.proximo-time-cabecalho>span.incompleto{background:#f3e4e4;color:#9b3434}
        .proximo-time-jogadores{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:12px}
        .proximo-time-jogador{display:flex;align-items:center;gap:8px;min-width:0;padding:10px;border:1px solid #dce8e0;border-radius:12px;background:#fff}
        .proximo-time-jogador b{display:grid;place-items:center;flex:0 0 25px;height:25px;border-radius:50%;background:#e6f4ec;color:#16834f;font-size:12px}.proximo-time-jogador span{min-width:0;font-weight:800;overflow-wrap:anywhere}
        .proximo-time-goleiro{display:flex;align-items:center;gap:10px;margin-bottom:14px;padding:11px;border-radius:12px;background:#eaf5ef}.proximo-time-goleiro>span{font-size:25px}.proximo-time-goleiro>div{display:flex;flex-direction:column;min-width:0}.proximo-time-goleiro small{font-size:9px;font-weight:900;letter-spacing:1px;color:#16834f}.proximo-time-goleiro strong{overflow-wrap:anywhere}.proximo-time-goleiro em{font-size:11px;color:#65756c;font-style:normal}
        .proxima-partida-overlay{position:fixed;inset:0;z-index:1250;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(10,25,18,.72);box-sizing:border-box}
        .proxima-partida-modal{width:min(100%,540px);min-width:0;max-height:calc(100dvh - 36px);overflow-y:auto;padding:22px;border-radius:22px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.3);box-sizing:border-box}
        .proxima-partida-topo{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px}.proxima-partida-topo span{font-size:11px;font-weight:900;letter-spacing:1px;color:#16834f}.proxima-partida-topo strong{font-size:13px}
        .proxima-partida-permanece{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;border-radius:13px;background:#f1f5f2}.proxima-partida-permanece small{font-size:10px;font-weight:900;color:#66736c}.proxima-partida-permanece strong{font-size:20px;overflow-wrap:anywhere}
        .proxima-partida-entra{text-align:center;margin:12px 0;padding:15px;border:2px solid #16834f;border-radius:16px;background:#edf8f2}.proxima-partida-entra small{font-size:10px;font-weight:900;letter-spacing:1px;color:#16834f}.proxima-partida-entra h2{margin:3px 0;font-size:30px}.proxima-partida-entra span{font-size:12px;font-weight:900}
        .proxima-partida-lista{display:flex;flex-direction:column;gap:7px;margin:14px 0}.proxima-partida-lista>small{font-size:10px;font-weight:900;letter-spacing:1px;color:#65756c}.proxima-partida-lista>div{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #dce8e0;border-radius:11px}.proxima-partida-lista b{display:grid;place-items:center;flex:0 0 27px;height:27px;border-radius:50%;background:#16834f;color:#fff;font-size:12px}.proxima-partida-lista strong{font-size:16px;overflow-wrap:anywhere}
        .proxima-partida-goleiro{display:flex;align-items:center;gap:12px;padding:13px;border-radius:13px;background:#eaf5ef}.proxima-partida-goleiro>span{font-size:30px}.proxima-partida-goleiro>div{display:flex;flex-direction:column;min-width:0}.proxima-partida-goleiro small{font-size:9px;font-weight:900;letter-spacing:1px;color:#16834f}.proxima-partida-goleiro strong{font-size:18px;overflow-wrap:anywhere}.proxima-partida-goleiro em{font-size:11px;color:#65756c;font-style:normal}
        .proxima-partida-acoes{display:grid;grid-template-columns:1fr 2fr;gap:10px;margin-top:18px;position:sticky;bottom:-22px;padding:10px 0 0;background:#fff}.proxima-partida-acoes button{min-height:50px;border-radius:13px;font-weight:900}.proxima-partida-voltar{border:1px solid #cad8cf;background:#fff;color:#405048}.proxima-partida-confirmar{border:0;background:#16834f;color:#fff}
        @media(max-width:600px){.proximo-time-jogadores{grid-template-columns:1fr}.proxima-partida-overlay{align-items:flex-end;padding:0}.proxima-partida-modal{width:100%;max-width:none;max-height:92dvh;border-radius:22px 22px 0 0;padding:20px 16px calc(16px + env(safe-area-inset-bottom))}.proxima-partida-acoes{bottom:calc(-16px - env(safe-area-inset-bottom));padding-bottom:calc(10px + env(safe-area-inset-bottom))}}

        .confirmar-finalizacao-overlay{position:fixed;inset:0;z-index:1250;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(10,25,18,.68);box-sizing:border-box}
        .confirmar-finalizacao-modal{width:min(100%,500px);min-width:0;padding:28px 22px 22px;border-radius:22px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.28);text-align:center;box-sizing:border-box}
        .confirmar-finalizacao-icone{font-size:42px;line-height:1;margin-bottom:10px}
        .confirmar-finalizacao-etiqueta{display:inline-block;margin-bottom:8px;font-size:12px;font-weight:900;letter-spacing:1.2px;color:#16834f}
        .confirmar-finalizacao-modal h2{margin:0;font-size:clamp(27px,7vw,38px);line-height:1.08;color:#17231d}
        .confirmar-finalizacao-texto{margin:10px 0 18px;color:#617067;line-height:1.4}
        .confirmar-finalizacao-placar{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto minmax(0,1fr);align-items:center;gap:10px;margin:0 0 14px;padding:16px 12px;border:1px solid #dce8e0;border-radius:16px;background:#f7faf8;box-sizing:border-box}
        .confirmar-finalizacao-time{min-width:0;display:flex;flex-direction:column;gap:3px}
        .confirmar-finalizacao-time small{font-size:10px;font-weight:900;letter-spacing:.8px;color:#7a8b81}
        .confirmar-finalizacao-time strong{font-size:14px;overflow-wrap:anywhere;text-transform:uppercase}
        .confirmar-finalizacao-numero{font-size:34px;font-weight:950;line-height:1;color:#17231d}
        .confirmar-finalizacao-x{font-size:20px;font-weight:900;color:#839087}
        .confirmar-finalizacao-aviso{margin-bottom:18px;padding:11px 12px;border-radius:12px;background:#edf8f2;color:#286044;font-size:13px;font-weight:800}
        .confirmar-finalizacao-acoes{display:grid;grid-template-columns:1fr 1.35fr;gap:10px}
        .confirmar-finalizacao-acoes button{min-width:0;min-height:52px;border-radius:14px;font-size:13px;font-weight:900;cursor:pointer;box-sizing:border-box}
        .confirmar-finalizacao-cancelar{border:1px solid #cfdcd4;background:#fff;color:#405048}
        .confirmar-finalizacao-confirmar{border:0;background:#16834f;color:#fff}
        .confirmar-finalizacao-acoes button:disabled{opacity:.6;cursor:not-allowed}
        @media(max-width:600px){.confirmar-finalizacao-overlay{align-items:flex-end;padding:0}.confirmar-finalizacao-modal{width:100%;max-width:none;border-radius:22px 22px 0 0;padding:24px 18px calc(18px + env(safe-area-inset-bottom))}.confirmar-finalizacao-placar{grid-template-columns:minmax(0,1fr) auto auto auto minmax(0,1fr);gap:7px;padding:15px 9px}.confirmar-finalizacao-numero{font-size:31px}.confirmar-finalizacao-time strong{font-size:12px}.confirmar-finalizacao-acoes{grid-template-columns:1fr}.confirmar-finalizacao-confirmar{order:-1}}
        .resultado-partida-overlay{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(10,25,18,.68);box-sizing:border-box}
        .resultado-partida-modal{width:min(100%,480px);min-width:0;padding:28px 22px 22px;border-radius:22px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.28);text-align:center;box-sizing:border-box}
        .resultado-partida-icone{font-size:46px;line-height:1;margin-bottom:12px}
        .resultado-partida-etiqueta{display:inline-block;margin-bottom:8px;font-size:12px;font-weight:900;letter-spacing:1.2px;color:#16834f}
        .resultado-partida-modal h2{margin:0;font-size:clamp(28px,7vw,40px);line-height:1.05;overflow-wrap:anywhere}
        .resultado-partida-placar{margin:18px 0;padding:14px 12px;border:1px solid #dce8e0;border-radius:15px;background:#f7faf8;font-size:clamp(18px,5vw,24px);font-weight:900;overflow-wrap:anywhere}
        .resultado-partida-vencedor{display:flex;flex-direction:column;gap:4px;margin:0 auto 14px;padding:14px;border:2px solid #16834f;border-radius:15px;background:#edf8f2}
        .resultado-partida-vencedor small{font-size:11px;font-weight:900;letter-spacing:1px;color:#16834f}
        .resultado-partida-vencedor strong{font-size:24px;overflow-wrap:anywhere}
        .resultado-partida-modal p{margin:14px 0 20px;color:#53625a;line-height:1.45}
        .resultado-partida-continuar{width:100%;min-height:52px;border:0;border-radius:14px;background:#16834f;color:#fff;font-size:15px;font-weight:900;cursor:pointer}
        @media(max-width:600px){.resultado-partida-overlay{align-items:flex-end;padding:0}.resultado-partida-modal{width:100%;max-width:none;border-radius:22px 22px 0 0;padding:24px 18px calc(18px + env(safe-area-inset-bottom))}}
        .tampinha-resultado-destaque{width:100%;display:flex;flex-direction:column;gap:16px}.tampinha-titulo{text-align:center}.tampinha-titulo small{display:block;font-size:12px;font-weight:900;letter-spacing:1.4px;color:#537062}.tampinha-titulo strong{display:block;font-size:clamp(22px,5vw,32px);color:#103f2b}
        .tampinha-numeros{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:9px;align-items:center}.tampinha-time{min-width:0;min-height:126px;border:2px solid #d8e5dc;border-radius:16px;background:#fff;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:12px 7px}.tampinha-time.vencedor{border:3px solid #16834f;background:#edf8f1;box-shadow:0 6px 18px rgba(22,131,79,.14)}.tampinha-time>span{font-size:14px;font-weight:900;text-transform:uppercase}.tampinha-time>b{font-size:clamp(40px,10vw,62px);line-height:1;margin:7px 0;color:#183e2d}.tampinha-time.vencedor>b{color:#16834f}.tampinha-time>small{font-size:11px;font-weight:900;color:#16834f}.tampinha-versus{font-size:24px;font-weight:900;color:#789083}.tampinha-explicacao{border-radius:12px;padding:12px 14px;background:#f6faf7;border:1px solid #dce8e0}.tampinha-explicacao strong,.tampinha-explicacao span{display:block}.tampinha-explicacao span{font-size:14px;line-height:1.4;color:#4d6559}
        .modal-rotacao-overlay{padding:18px;overflow-y:auto;align-items:center}.modal-rotacao-empate{width:min(100%,760px);max-height:calc(100vh - 36px);overflow-y:auto;background:#fff;border-radius:18px;box-shadow:0 22px 60px rgba(8,37,24,.28)}.modal-rotacao-topo{padding:22px;background:#f2f8f4;border-bottom:1px solid #dce8e0;text-align:center}.modal-rotacao-topo small{font-size:11px;font-weight:900;letter-spacing:1.5px;color:#16834f}.modal-rotacao-topo h2{margin:5px 0 7px;font-size:clamp(21px,5vw,29px);color:#173f2d}.modal-rotacao-topo p{margin:0;font-size:15px;color:#5a6d63}.modal-rotacao-times{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:18px}.modal-time-card{min-width:0;border:1px solid #dce8e0;border-radius:15px;overflow:hidden}.modal-time-card h3{margin:0;padding:13px;background:#173f2d;color:#fff;font-size:16px;text-align:center}.modal-time-linhas{padding:14px}.modal-time-linhas>small{font-size:10px;font-weight:900;letter-spacing:1px;color:#718078}.modal-jogador-linha{display:flex;align-items:center;gap:9px;min-height:42px;border-bottom:1px solid #edf2ee}.modal-jogador-linha span{flex:0 0 28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#edf5f0;color:#16834f;font-size:12px;font-weight:900}.modal-jogador-linha strong{font-size:16px;color:#273b31}.modal-goleiro-destaque{margin:0 14px 14px;padding:12px;border-radius:12px;background:#edf8f1;border:1px solid #cce5d5;display:flex;align-items:center;gap:11px}.modal-goleiro-destaque>span{font-size:28px}.modal-goleiro-destaque small,.modal-goleiro-destaque strong,.modal-goleiro-destaque p{display:block;margin:0}.modal-goleiro-destaque strong{font-size:18px;color:#103f2b}.modal-goleiro-destaque p{font-size:12px;color:#557064}.modal-rotacao-rodape-info{margin:0 18px;padding:12px;border-radius:11px;background:#f7f9f8;text-align:center}.modal-rotacao-acoes{display:grid;grid-template-columns:.7fr 1.3fr;gap:10px;padding:16px 18px 18px}.btn-modal-cancelar,.btn-modal-iniciar{min-width:0;min-height:52px;border-radius:12px;padding:10px;font-size:14px;font-weight:900}.btn-modal-cancelar{border:1px solid #ccd8d0;background:#fff;color:#52645a}.btn-modal-iniciar{border:0;background:#16834f;color:#fff}
        @media(max-width:620px){.modal-rotacao-overlay{padding:0;align-items:flex-end}.modal-rotacao-empate{width:100%;max-height:94vh;border-radius:18px 18px 0 0}.modal-rotacao-topo{padding:18px 16px 14px}.modal-rotacao-times{grid-template-columns:1fr;padding:12px}.modal-rotacao-rodape-info{margin:0 12px}.modal-rotacao-acoes{position:sticky;bottom:0;background:#fff;padding:12px;border-top:1px solid #e5ece7;grid-template-columns:.65fr 1.35fr}.btn-modal-cancelar,.btn-modal-iniciar{min-height:54px;font-size:13px}.tampinha-numeros{gap:6px}.tampinha-time{min-height:116px;padding:10px 5px}.tampinha-time>span{font-size:12px}}
      `}</style>

    </div>
  )
}