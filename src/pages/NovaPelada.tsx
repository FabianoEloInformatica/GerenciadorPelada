import { useEffect, useMemo, useState } from 'react'
import { obterConfiguracaoPelada } from '../db/configuracoesRepository'
import {
  listarSorteioInicialLinha,
  salvarSorteioInicialLinha,
} from '../db/sorteioLinhaRepository'
import {
  buscarPartidaEmAndamentoCompleta,
  iniciarPrimeiraPartida,
  normalizarRelogioPartida,
  pausarPartida,
  retomarPartida,
  type PartidaEmAndamentoCompleta,
} from '../db/partidasRepository'
import type { ConfiguracaoPeladaDB } from '../db/database'

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
          const partida = await buscarPartidaEmAndamentoCompleta(
            sessaoAndamento.id,
          )

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
            setPartidaEmAndamento(partida)
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

  function eventoGolEmBreve(lado: 1 | 2) {
    const cor = partidaEmAndamento?.times.find((t) => t.lado === lado)?.corColete ?? `Time ${lado}`
    alert(`GOL ${cor}: na próxima etapa vamos abrir a escolha do autor do gol.`)
  }

  function finalizarPartidaEmBreve() {
    alert('A finalização será ligada junto das regras de vitória, empate e rotação.')
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

      await recarregarParticipantesSessaoAtiva(sessaoEmAndamentoId)
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

      await recarregarParticipantesSessaoAtiva(sessaoEmAndamentoId)
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
        const referencia = partida.pausada && partida.pausadaEm ? new Date(partida.pausadaEm).getTime() : agoraRelogio
        const ms = Math.max(0, referencia - inicio - partida.totalPausadoMs)
        const total = Math.floor(ms / 1000)
        const limite = (configuracaoPelada?.tempoQuedaMinutos ?? 7) * 60
        const tempo = `${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}${total >= limite ? '+' : ''}`
        return (
          <section className="partida-operacional">
            <div className="partida-operacional-topo"><span>PELADA EM ANDAMENTO</span><strong>PARTIDA {partida.numero}</strong></div>
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
            <div className="acoes-gol">
              <button type="button" onClick={() => eventoGolEmBreve(1)}><CamisaColete cor={hex(time1?.corColete)} /><span>GOL</span><small>{time1?.corColete ?? 'Time 1'}</small></button>
              <button type="button" onClick={() => eventoGolEmBreve(2)}><CamisaColete cor={hex(time2?.corColete)} /><span>GOL</span><small>{time2?.corColete ?? 'Time 2'}</small></button>
            </div>
            <button type="button" className={`btn-pausa-partida ${partida.pausada ? 'retomar' : ''}`} onClick={alternarPausaPartida} disabled={alterandoPausa}>{alterandoPausa ? 'SALVANDO...' : partida.pausada ? '▶ RETOMAR PARTIDA' : 'Ⅱ PAUSAR PARTIDA'}</button>
            <button type="button" className="btn-finalizar-partida" onClick={finalizarPartidaEmBreve}>FINALIZAR PARTIDA</button>

            {(() => {
              /*
               * Grupos 1 e 2 estão na partida atual. A organização mostra somente
               * os grupos seguintes, preservando a ordem oficial do sorteio inicial.
               */
              const numerosGrupos = Array.from(
                new Set(resultadoSorteioLinha.map((item) => item.grupo)),
              )
                .filter((grupo) => grupo > 2)
                .sort((a, b) => a - b)

              const quantidadeLinha =
                configuracaoPelada?.jogadoresLinhaPorTime ?? 4

              const gruposOrganizacao = numerosGrupos.map((numeroGrupo) => {
                const jogadores = resultadoSorteioLinha
                  .filter((item) => item.grupo === numeroGrupo)
                  .sort((a, b) => a.posicaoNoGrupo - b.posicaoNoGrupo)

                const goleiro = resultadoSorteioGoleiros.find(
                  (item) => item.ordem === numeroGrupo,
                )

                const vagasLinha = Math.max(
                  0,
                  quantidadeLinha - jogadores.length,
                )

                return {
                  numeroGrupo,
                  jogadores,
                  goleiro,
                  vagasLinha,
                  completo: vagasLinha === 0 && Boolean(goleiro),
                }
              })

              const prontos = gruposOrganizacao.filter(
                (grupo) => grupo.completo,
              ).length

              const incompletos = gruposOrganizacao.length - prontos

              const filaAtrasados = participantesPresenca
                .filter(
                  (participante) =>
                    participante.presente && participante.chegouAtrasado,
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
                    onClick={() => setOrganizacaoAberta((aberta) => !aberta)}
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
                                  {grupo.jogadores.map((jogador) => (
                                    <div
                                      key={`organizacao-jogador-${jogador.jogador.id}`}
                                    >
                                      <span>
                                        #{jogador.numeroSorteado}
                                      </span>
                                      <strong>
                                        {jogador.jogador.nomeExibicao}
                                      </strong>
                                    </div>
                                  ))}

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
    </div>
  )
}