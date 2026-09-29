import { useEffect, useMemo, useState } from 'react'
import './Jogadores.css'

import { executarCargaInicialJogadores } from '../db/cargaInicialJogadores'

import type { JogadorDB, TipoJogador } from '../db/database'

import {
  analisarListaPelada,
  type ResultadoAnaliseLista,
} from '../utils/analisarListaPelada'

import {
  alterarStatusJogador,
  atualizarJogador,
  cadastrarJogador,
  listarJogadores,
} from '../db/jogadoresRepository'

export default function Jogadores() {
  const [jogadores, setJogadores] = useState<JogadorDB[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const [mostrarImportacao, setMostrarImportacao] = useState(false)
const [textoLista, setTextoLista] = useState('')
const [resultadoLista, setResultadoLista] =
  useState<ResultadoAnaliseLista | null>(null)

  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<
    'TODOS' | 'LINHA' | 'GOLEIRO' | 'INATIVOS'
  >('TODOS')

  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [jogadorEditando, setJogadorEditando] = useState<JogadorDB | null>(
    null,
  )

  const [nomeCompleto, setNomeCompleto] = useState('')
  const [nomeExibicao, setNomeExibicao] = useState('')
  const [tipoPadrao, setTipoPadrao] = useState<TipoJogador>('LINHA')
  const [apelidos, setApelidos] = useState<string[]>(['', '', ''])

  useEffect(() => {
    carregarJogadores()
  }, [])

  async function carregarJogadores() {
    try {
      setCarregando(true)

      const dados = await listarJogadores()

      setJogadores(dados)
    } catch (erro) {
      console.error('Erro ao carregar jogadores:', erro)
      alert('Não foi possível carregar os jogadores.')
    } finally {
      setCarregando(false)
    }
  }

  const jogadoresFiltrados = useMemo(() => {
    const texto = busca.trim().toLowerCase()

    return jogadores
      .filter((jogador) => {
        if (filtro === 'LINHA') {
          return jogador.ativo && jogador.tipoPadrao === 'LINHA'
        }

        if (filtro === 'GOLEIRO') {
          return jogador.ativo && jogador.tipoPadrao === 'GOLEIRO'
        }

        if (filtro === 'INATIVOS') {
          return !jogador.ativo
        }

        return jogador.ativo
      })
      .filter((jogador) => {
        if (!texto) return true

        const encontrouApelido = jogador.apelidos.some((apelido) =>
          apelido.toLowerCase().includes(texto),
        )

        return (
          jogador.nomeCompleto.toLowerCase().includes(texto) ||
          jogador.nomeExibicao.toLowerCase().includes(texto) ||
          encontrouApelido
        )
      })
      .sort((a, b) =>
        a.nomeExibicao.localeCompare(b.nomeExibicao, 'pt-BR', {
          sensitivity: 'base',
        }),
      )
  }, [busca, filtro, jogadores])

  const totalLinha = jogadores.filter(
    (jogador) => jogador.ativo && jogador.tipoPadrao === 'LINHA',
  ).length

  const totalGoleiros = jogadores.filter(
    (jogador) => jogador.ativo && jogador.tipoPadrao === 'GOLEIRO',
  ).length

  async function executarCargaInicial() {
  const confirmar = window.confirm(
    'Deseja cadastrar os jogadores da carga inicial?',
  )

  if (!confirmar) return

  try {
    const resultado = await executarCargaInicialJogadores()

    // Recarrega a tela para exibir imediatamente os novos jogadores.
    await carregarJogadores()

    alert(
      `Carga concluída!\n\n` +
        `Cadastrados: ${resultado.cadastrados}\n` +
        `Já existentes: ${resultado.jaExistentes}`,
    )
  } catch (erro) {
    console.error('Erro ao executar carga inicial:', erro)

    alert('Não foi possível executar a carga inicial.')
  }
}

  function analisarLista() {
  if (!textoLista.trim()) {
    alert('Cole a lista da pelada antes de analisar.')
    return
  }

  const resultado = analisarListaPelada(textoLista)

  setResultadoLista(resultado)
}

  function alterarApelido(indice: number, valor: string) {
    setApelidos((atuais) =>
      atuais.map((apelido, i) => (i === indice ? valor : apelido)),
    )
  }

  function adicionarCampoApelido() {
    setApelidos((atuais) => [...atuais, ''])
  }

  function removerApelido(indice: number) {
    setApelidos((atuais) => {
      const novos = atuais.filter((_, i) => i !== indice)

      if (novos.length < 3) {
        return [...novos, ...Array(3 - novos.length).fill('')]
      }

      return novos
    })
  }

  async function mudarStatus(jogador: JogadorDB) {
  if (!jogador.id) return

  const novoStatus = !jogador.ativo

  const mensagem = novoStatus
    ? `Deseja reativar ${jogador.nomeExibicao}?`
    : `Deseja inativar ${jogador.nomeExibicao}?\n\nO histórico do jogador será preservado.`

  if (!window.confirm(mensagem)) {
    return
  }

  try {
    await alterarStatusJogador(jogador.id, novoStatus)
    await carregarJogadores()
  } catch (erro) {
    console.error('Erro ao alterar status do jogador:', erro)
    alert('Não foi possível alterar o status do jogador.')
  }
}

  function limparFormulario() {
    setNomeCompleto('')
    setNomeExibicao('')
    setTipoPadrao('LINHA')
    setApelidos(['', '', ''])
    setJogadorEditando(null)
  }

  function abrirNovoJogador() {
    limparFormulario()
    setMostrarFormulario(true)
  }

  function abrirEdicao(jogador: JogadorDB) {
    setJogadorEditando(jogador)
    setNomeCompleto(jogador.nomeCompleto)
    setNomeExibicao(jogador.nomeExibicao)
    setTipoPadrao(jogador.tipoPadrao)

    const apelidosExistentes = [...jogador.apelidos]

    while (apelidosExistentes.length < 3) {
      apelidosExistentes.push('')
    }

    setApelidos(apelidosExistentes)
    setMostrarFormulario(true)

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  function cancelarCadastro() {
    limparFormulario()
    setMostrarFormulario(false)
  }

  async function salvarJogador() {
    const nome = nomeCompleto.trim()
    const exibicao = nomeExibicao.trim()

    if (!nome) {
      alert('Informe o nome completo do jogador.')
      return
    }

    if (!exibicao) {
      alert('Informe o nome de exibição do jogador.')
      return
    }

    const apelidosValidos = apelidos
      .map((apelido) => apelido.trim())
      .filter((apelido) => apelido.length > 0)

    try {
      setSalvando(true)

      if (jogadorEditando) {
        await atualizarJogador({
          ...jogadorEditando,
          nomeCompleto: nome,
          nomeExibicao: exibicao,
          apelidos: apelidosValidos,
          tipoPadrao,
        })
      } else {
        await cadastrarJogador({
          nomeCompleto: nome,
          nomeExibicao: exibicao,
          apelidos: apelidosValidos,
          tipoPadrao,
        })
      }

      await carregarJogadores()

      limparFormulario()
      setMostrarFormulario(false)
    } catch (erro) {
      console.error('Erro ao salvar jogador:', erro)
      alert('Não foi possível salvar o jogador.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="jogadores-page">
      <section className="jogadores-cabecalho">

        {mostrarImportacao && (
  <section className="importacao-lista-card">
    <div className="cadastro-jogador-titulo">
      <div>
        <span>IMPORTAÇÃO INTELIGENTE</span>
        <h2>Lista da pelada</h2>
      </div>

      <button
  type="button"
  className="btn-importar-lista"
  onClick={executarCargaInicial}
>
  Carga inicial
</button>

      <button
        type="button"
        className="btn-fechar-cadastro"
        onClick={() => {
          setMostrarImportacao(false)
          setTextoLista('')
          setResultadoLista(null)
        }}
      >
        ×
      </button>
    </div>

    <p className="importacao-explicacao">
      Cole abaixo a lista exatamente como recebeu ou enviou pelo WhatsApp.
      Não é necessário reorganizar os nomes.
    </p>

    <textarea
      className="textarea-lista"
      value={textoLista}
      onChange={(event) => {
        setTextoLista(event.target.value)
        setResultadoLista(null)
      }}
      placeholder="Cole aqui a lista da pelada..."
    />

    <button
      type="button"
      className="btn-analisar-lista"
      onClick={analisarLista}
    >
      Analisar lista
    </button>

    {resultadoLista && (
      <div className="resultado-importacao">
        <div className="resultado-numeros">
          <div>
            <strong>{resultadoLista.total}</strong>
            <span>Total previsto</span>
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

        <div className="resultado-grupos">
          <div>
            <h3>🧤 Goleiros</h3>

            {resultadoLista.goleiros.length === 0 ? (
              <p>Nenhum goleiro identificado.</p>
            ) : (
              <ul>
                {[...resultadoLista.goleiros]
                  .sort((a, b) =>
                    a.nome.localeCompare(b.nome, 'pt-BR', {
                      sensitivity: 'base',
                    }),
                  )
                  .map((jogador, indice) => (
                    <li key={`${jogador.nome}-${indice}`}>
                      {jogador.nome}
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <div>
            <h3>⚽ Jogadores de linha</h3>

            {resultadoLista.linha.length === 0 ? (
              <p>Nenhum jogador de linha identificado.</p>
            ) : (
              <ul>
                {[...resultadoLista.linha]
                  .sort((a, b) =>
                    a.nome.localeCompare(b.nome, 'pt-BR', {
                      sensitivity: 'base',
                    }),
                  )
                  .map((jogador, indice) => (
                    <li key={`${jogador.nome}-${indice}`}>
                      {jogador.nome}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>

        <div className="importacao-aviso">
          <strong>Somente conferência</strong>
          <p>
            Nesta etapa nenhum jogador será cadastrado ou alterado.
          </p>
        </div>
      </div>
    )}
  </section>
)}
        <div>
          <span className="jogadores-etiqueta">CADASTROS</span>

          <h1>Jogadores</h1>

          <p>
            Cadastre os atletas e os nomes que podem aparecer nas listas da
            pelada.
          </p>
        </div>

        
        <div className="acoes-cabecalho-jogadores">
  <button
    className="btn-importar-lista"
    type="button"
    onClick={() => {
      setMostrarImportacao(true)
      setResultadoLista(null)
    }}
  >
    Importar lista  
  </button>

  <button
    className="btn-novo-jogador"
    type="button"
    onClick={abrirNovoJogador}
  >
    + Novo jogador
  </button>
</div>

      </section>

      {mostrarFormulario && (
        <section className="cadastro-jogador-card">
          <div className="cadastro-jogador-titulo">
            <div>
              <span>
                {jogadorEditando ? 'EDITAR JOGADOR' : 'NOVO JOGADOR'}
              </span>

              <h2>
                {jogadorEditando
                  ? jogadorEditando.nomeExibicao
                  : 'Cadastro do atleta'}
              </h2>
            </div>

            <button
              type="button"
              className="btn-fechar-cadastro"
              onClick={cancelarCadastro}
            >
              ×
            </button>
          </div>

          <div className="campo-jogador">
            <label>Nome completo *</label>

            <input
              type="text"
              value={nomeCompleto}
              onChange={(event) => setNomeCompleto(event.target.value)}
              placeholder="Ex.: Fabiano Souza"
            />
          </div>

          <div className="campo-jogador">
            <label>Nome de exibição *</label>

            <input
              type="text"
              value={nomeExibicao}
              onChange={(event) => setNomeExibicao(event.target.value)}
              placeholder="Ex.: Fabiano"
            />

            <small>
              Este será o nome mostrado nas partidas, estatísticas e
              financeiro.
            </small>
          </div>

          <div className="campo-jogador">
            <label>Posição habitual</label>

            <div className="tipo-jogador-opcoes">
              <button
                type="button"
                className={tipoPadrao === 'LINHA' ? 'selecionado' : ''}
                onClick={() => setTipoPadrao('LINHA')}
              >
                ⚽ Linha
              </button>

              <button
                type="button"
                className={tipoPadrao === 'GOLEIRO' ? 'selecionado' : ''}
                onClick={() => setTipoPadrao('GOLEIRO')}
              >
                🧤 Goleiro
              </button>
            </div>

            <small>
              Esta é apenas a posição habitual. Na pelada do dia o jogador
              poderá atuar em outra função.
            </small>
          </div>

          <div className="apelidos-area">
            <div className="apelidos-cabecalho">
              <div>
                <label>Outros nomes usados nas listas</label>

                <small>
                  Servem para reconhecer automaticamente o jogador nas listas
                  importadas.
                </small>
              </div>
            </div>

            <div className="apelidos-lista">
              {apelidos.map((apelido, indice) => (
                <div className="campo-apelido campo-apelido-com-remover" key={indice}>
                  <span>{indice + 1}</span>

                  <input
                    type="text"
                    value={apelido}
                    onChange={(event) =>
                      alterarApelido(indice, event.target.value)
                    }
                    placeholder={`Apelido ${indice + 1}`}
                  />

                  <button
                    type="button"
                    className="btn-remover-apelido"
                    onClick={() => removerApelido(indice)}
                    title="Remover apelido"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="btn-adicionar-apelido"
              onClick={adicionarCampoApelido}
            >
              + Adicionar outro apelido
            </button>
          </div>

          <div className="exemplo-reconhecimento">
            <strong>Como funcionará na importação</strong>

            <p>
              O nome completo, nome de exibição e os apelidos poderão ser
              usados para reconhecer automaticamente este jogador.
            </p>
          </div>

          <div className="cadastro-jogador-acoes">
            <button
              type="button"
              className="btn-cancelar-jogador"
              onClick={cancelarCadastro}
              disabled={salvando}
            >
              Cancelar
            </button>

            <button
              type="button"
              className="btn-salvar-jogador"
              onClick={salvarJogador}
              disabled={salvando}
            >
              {salvando
                ? 'Salvando...'
                : jogadorEditando
                  ? 'Salvar alterações'
                  : 'Salvar jogador'}
            </button>
          </div>
        </section>
      )}

      <section className="jogadores-resumo">
        <div className="resumo-jogador-card">
          <strong>{totalLinha + totalGoleiros}</strong>
          <span>Ativos</span>
        </div>

        <div className="resumo-jogador-card">
          <strong>{totalLinha}</strong>
          <span>Linha</span>
        </div>

        <div className="resumo-jogador-card">
          <strong>{totalGoleiros}</strong>
          <span>Goleiros</span>
        </div>
      </section>

      <section className="jogadores-controles">
        <input
          className="jogadores-busca"
          type="text"
          placeholder="Buscar por nome ou apelido..."
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
        />

        <div className="jogadores-filtros">
          <button
            type="button"
            className={filtro === 'TODOS' ? 'ativo' : ''}
            onClick={() => setFiltro('TODOS')}
          >
            Todos
          </button>

          <button
            type="button"
            className={filtro === 'LINHA' ? 'ativo' : ''}
            onClick={() => setFiltro('LINHA')}
          >
            Linha
          </button>

          <button
            type="button"
            className={filtro === 'GOLEIRO' ? 'ativo' : ''}
            onClick={() => setFiltro('GOLEIRO')}
          >
            Goleiros
          </button>

          <button
            type="button"
            className={filtro === 'INATIVOS' ? 'ativo' : ''}
            onClick={() => setFiltro('INATIVOS')}
          >
            Inativos
          </button>
        </div>
      </section>

      <section className="lista-jogadores">
        {carregando ? (
          <div className="jogadores-vazio">
            <strong>Carregando jogadores...</strong>
          </div>
        ) : jogadoresFiltrados.length === 0 ? (
          <div className="jogadores-vazio">
            <strong>Nenhum jogador encontrado.</strong>

            <span>
              Cadastre um novo jogador ou altere a busca/filtro selecionado.
            </span>
          </div>
        ) : (
          jogadoresFiltrados.map((jogador) => (
            <article className="jogador-item" key={jogador.id}>
              <div className="jogador-avatar">
                {jogador.nomeExibicao.charAt(0).toUpperCase()}
              </div>

              <div className="jogador-dados">
                <strong>{jogador.nomeExibicao}</strong>

                <span>{jogador.nomeCompleto}</span>

                {jogador.apelidos.length > 0 && (
                  <small>
                    Também reconhece: {jogador.apelidos.join(', ')}
                  </small>
                )}
              </div>

              <span
                className={`jogador-tipo ${
                  jogador.tipoPadrao === 'GOLEIRO' ? 'goleiro' : 'linha'
                }`}
              >
                {jogador.tipoPadrao === 'GOLEIRO' ? 'GOLEIRO' : 'LINHA'}
              </span>

              <div className="jogador-acoes">
  <button
    className="btn-editar-jogador"
    type="button"
    onClick={() => abrirEdicao(jogador)}
  >
    Editar
  </button>

  <button
    className={
      jogador.ativo
        ? 'btn-status-jogador inativar'
        : 'btn-status-jogador reativar'
    }
    type="button"
    onClick={() => mudarStatus(jogador)}
  >
    {jogador.ativo ? 'Inativar' : 'Reativar'}
  </button>
</div>


            </article>
          ))
        )}
      </section>
    </div>
  )
}