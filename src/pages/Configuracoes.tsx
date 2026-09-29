import { useEffect, useState } from 'react'
import './Configuracoes.css'
import {
  obterConfiguracaoPelada,
  salvarConfiguracaoPelada,
} from '../db/configuracoesRepository'
import type { CorColeteConfiguracao } from '../db/database'

function Configuracoes() {
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  const [jogadoresLinha, setJogadoresLinha] = useState(4)
  const [tempoQueda, setTempoQueda] = useState(7)
  const [limiteGols, setLimiteGols] = useState(2)

  const [goleiroSorteio, setGoleiroSorteio] = useState(false)
  const [aguardarSaidaBola, setAguardarSaidaBola] = useState(true)

  const [tampinhaEmpate, setTampinhaEmpate] = useState(true)
  const [maiorNumeroVence, setMaiorNumeroVence] = useState(true)
  const [menorNumeroSai, setMenorNumeroSai] = useState(true)
  const [doisTimesSaem, setDoisTimesSaem] = useState(true)

  const [permaneceMantemColete, setPermaneceMantemColete] =
    useState(true)

  const [primeiraBolaPermanece, setPrimeiraBolaPermanece] =
    useState(true)

  const [primeiraBolaPrioridade, setPrimeiraBolaPrioridade] =
    useState(true)

  const [somInicio, setSomInicio] = useState(true)
  const [somGol, setSomGol] = useState(true)
  const [somPausa, setSomPausa] = useState(true)
  const [somRetomada, setSomRetomada] = useState(true)
  const [somTempoLimite, setSomTempoLimite] = useState(false)
  const [somFinalizacao, setSomFinalizacao] = useState(true)

  const [vibrarTempoLimite, setVibrarTempoLimite] =
    useState(true)

  const [coresColetes, setCoresColetes] = useState<CorColeteConfiguracao[]>([
    { id: 'verde', nome: 'Verde', hex: '#22a447' },
    { id: 'laranja', nome: 'Laranja', hex: '#f28c28' },
  ])

  useEffect(() => {
    async function carregar() {
      try {
        const cfg = await obterConfiguracaoPelada()

        setJogadoresLinha(cfg.jogadoresLinhaPorTime)
        setTempoQueda(cfg.tempoQuedaMinutos)
        setLimiteGols(cfg.limiteGols)
        setGoleiroSorteio(cfg.goleiroParticipaSorteio)
        setAguardarSaidaBola(cfg.aguardarSaidaBola)
        setTampinhaEmpate(cfg.tampinhaEmpate)
        setMaiorNumeroVence(cfg.maiorNumeroVence)
        setMenorNumeroSai(cfg.menorNumeroSai)
        setDoisTimesSaem(cfg.doisTimesSaemEmpate)
        setPermaneceMantemColete(cfg.permaneceMantemColete)
        setPrimeiraBolaPermanece(cfg.primeiraBolaPermanece)
        setPrimeiraBolaPrioridade(cfg.primeiraBolaPrioridade)
        setSomInicio(cfg.somInicio)
        setSomGol(cfg.somGol)
        setSomPausa(cfg.somPausa)
        setSomRetomada(cfg.somRetomada)
        setSomTempoLimite(cfg.somTempoLimite)
        setSomFinalizacao(cfg.somFinalizacao)
        setVibrarTempoLimite(cfg.vibrarTempoLimite)
        setCoresColetes(cfg.coresColetes)
      } catch (erro) {
        console.error('Erro ao carregar configurações:', erro)
        setMensagem('Não foi possível carregar as configurações.')
      } finally {
        setCarregando(false)
      }
    }

    carregar()
  }, [])

  function adicionarCor() {
    setCoresColetes((atuais) => [
      ...atuais,
      {
        id: `cor-${Date.now()}`,
        nome: `Cor ${atuais.length + 1}`,
        hex: '#777777',
      },
    ])
  }

  function alterarCor(
    id: string,
    campo: 'nome' | 'hex',
    valor: string,
  ) {
    setCoresColetes((atuais) =>
      atuais.map((cor) =>
        cor.id === id ? { ...cor, [campo]: valor } : cor,
      ),
    )
  }

  function removerCor(id: string) {
    if (coresColetes.length <= 2) {
      setMensagem('A pelada precisa ter pelo menos 2 cores de colete.')
      return
    }

    setCoresColetes((atuais) => atuais.filter((cor) => cor.id !== id))
    setMensagem('')
  }

  async function salvar() {
    try {
      setSalvando(true)
      setMensagem('')

      await salvarConfiguracaoPelada({
        jogadoresLinhaPorTime: jogadoresLinha,
        tempoQuedaMinutos: tempoQueda,
        limiteGols,
        goleiroParticipaSorteio: goleiroSorteio,
        aguardarSaidaBola,
        tampinhaEmpate,
        maiorNumeroVence,
        menorNumeroSai,
        doisTimesSaemEmpate: doisTimesSaem,
        permaneceMantemColete,
        primeiraBolaPermanece,
        primeiraBolaPrioridade,
        somInicio,
        somGol,
        somPausa,
        somRetomada,
        somTempoLimite,
        somFinalizacao,
        vibrarTempoLimite,
        coresColetes,
      })

      setMensagem('Configurações salvas com sucesso.')
    } catch (erro) {
      console.error('Erro ao salvar configurações:', erro)
      setMensagem(
        erro instanceof Error
          ? erro.message
          : 'Não foi possível salvar as configurações.',
      )
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return (
      <div className="configuracoes">
        <div className="config-card">
          <strong>Carregando configurações...</strong>
        </div>
      </div>
    )
  }

  return (
    <div className="configuracoes">
      <div className="config-cabecalho">
        <div>
          <span className="config-etiqueta">
            PELADA DE SEGUNDA
          </span>

          <h1>Configurações</h1>

          <p>
            Defina as regras e o funcionamento desta pelada.
          </p>
        </div>

        <button
          type="button"
          className="salvar-config"
          onClick={salvar}
          disabled={salvando}
        >
          {salvando ? 'Salvando...' : 'Salvar configurações'}
        </button>
      </div>

      {mensagem && (
        <div className="info-regra">
          <strong>{mensagem}</strong>
        </div>
      )}

      {/* REGRAS DA PARTIDA */}

      <section className="config-card">
        <div className="config-card-titulo">
          <span>⚽</span>

          <div>
            <h2>Regras da partida</h2>
            <p>
              Configurações utilizadas durante cada queda.
            </p>
          </div>
        </div>

        <div className="config-grid">
          <label className="campo">
            <span>Jogadores de linha por time</span>

            <input
              type="number"
              min="1"
              value={jogadoresLinha}
              onChange={(e) =>
                setJogadoresLinha(Number(e.target.value))
              }
            />
          </label>

          <label className="campo">
            <span>Tempo da queda (minutos)</span>

            <input
              type="number"
              min="1"
              value={tempoQueda}
              onChange={(e) =>
                setTempoQueda(Number(e.target.value))
              }
            />
          </label>

          <label className="campo">
            <span>Gols para finalizar</span>

            <input
              type="number"
              min="1"
              value={limiteGols}
              onChange={(e) =>
                setLimiteGols(Number(e.target.value))
              }
            />
          </label>
        </div>

        <div className="opcoes">
          <Opcao
            titulo="Goleiro participa do sorteio"
            descricao="Inclui o goleiro nos sorteios de jogadores."
            ativo={goleiroSorteio}
            alterar={setGoleiroSorteio}
          />

          <Opcao
            titulo="Aguardar saída da bola ao atingir o tempo"
            descricao="O cronômetro continua após o limite até o operador finalizar."
            ativo={aguardarSaidaBola}
            alterar={setAguardarSaidaBola}
          />
        </div>
      </section>

      {/* SORTEIOS */}

      <section className="config-card">
        <div className="config-card-titulo">
          <span>🎲</span>

          <div>
            <h2>Sorteios e tampinha</h2>
            <p>
              Regras utilizadas para desempates e rotações.
            </p>
          </div>
        </div>

        <div className="info-regra">
          <strong>🪙 Sacola virtual</strong>

          <p>
            Os números disponíveis serão de 1 até o total de
            atletas participantes da pelada naquele dia.
          </p>

          <small>
            Exemplo: 23 atletas = tampinhas de 1 a 23.
            Os números são sorteados novamente em cada
            sorteio.
          </small>
        </div>

        <div className="opcoes">
          <Opcao
            titulo="Tampinha obrigatória em todo empate"
            descricao="Todo empate será decidido na tampinha para definir permanência ou prioridade de fila."
            ativo={tampinhaEmpate}
            alterar={setTampinhaEmpate}
          />

          <Opcao
            titulo="Maior número vence a tampinha"
            descricao="Entre times, quem retirar o maior número recebe a preferência."
            ativo={maiorNumeroVence}
            alterar={setMaiorNumeroVence}
          />

          <Opcao
            titulo="Menores números saem na rotação"
            descricao="Quando jogadores precisam sair para entrada da fila, os menores números deixam o time."
            ativo={menorNumeroSai}
            alterar={setMenorNumeroSai}
          />
        </div>
      </section>

      {/* ROTAÇÃO */}

      <section className="config-card">
        <div className="config-card-titulo">
          <span>🔄</span>

          <div>
            <h2>Rotação e fila</h2>

            <p>
              Define como os próximos jogadores entram em quadra.
            </p>
          </div>
        </div>

        <div className="info-regra">
          <strong>
            Time completo = {jogadoresLinha} jogadores de linha
          </strong>

          <p>
            O sistema utilizará essa quantidade para saber
            quando já é possível preparar os próximos times
            durante a queda atual.
          </p>
        </div>

        <div className="opcoes">
          <Opcao
            titulo="Dois times completos aguardando fazem os dois times atuais saírem após empate"
            descricao={`Com ${
              jogadoresLinha * 2
            } jogadores de linha ou mais prontos para entrar, os dois times que empataram deixam a quadra.`}
            ativo={doisTimesSaem}
            alterar={setDoisTimesSaem}
          />
        </div>
      </section>

      {/* PRIMEIRA BOLA */}

      <section className="config-card">
        <div className="config-card-titulo">
          <span>⚽</span>

          <div>
            <h2>Primeira bola</h2>

            <p>
              Define qual time inicia a próxima queda com a bola.
            </p>
          </div>
        </div>

        <div className="opcoes">
          <Opcao
            titulo="Time que permanece começa com a bola"
            descricao="Quando um time permanece em quadra, ele terá a primeira saída da próxima queda."
            ativo={primeiraBolaPermanece}
            alterar={setPrimeiraBolaPermanece}
          />

          <Opcao
            titulo="Usar prioridade da fila quando entrarem dois times"
            descricao="Quando dois novos times entrarem, começa com a bola o time que possuía maior prioridade na fila."
            ativo={primeiraBolaPrioridade}
            alterar={setPrimeiraBolaPrioridade}
          />
        </div>
      </section>

      {/* AVISOS */}

      <section className="config-card">
        <div className="config-card-titulo">
          <span>🔊</span>

          <div>
            <h2>Avisos da partida</h2>

            <p>
              Escolha em quais eventos o sistema emitirá aviso
              sonoro.
            </p>
          </div>
        </div>

        <div className="lista-avisos">
          <Aviso
            nome="Início da partida"
            descricao="Ao iniciar o cronômetro da queda."
            ativo={somInicio}
            alterar={setSomInicio}
          />

          <Aviso
            nome="Gol"
            descricao="Quando GOL A ou GOL B for registrado."
            ativo={somGol}
            alterar={setSomGol}
          />

          <Aviso
            nome="Parar tempo"
            descricao="Quando o cronômetro for paralisado."
            ativo={somPausa}
            alterar={setSomPausa}
          />

          <Aviso
            nome="Retomar tempo"
            descricao="Quando o cronômetro voltar a correr."
            ativo={somRetomada}
            alterar={setSomRetomada}
          />

          <Aviso
            nome="Tempo limite atingido"
            descricao={`Quando o cronômetro atingir ${tempoQueda}:00.`}
            ativo={somTempoLimite}
            alterar={setSomTempoLimite}
          />

          <Aviso
            nome="Finalização da partida"
            descricao="Quando o operador finalizar a queda."
            ativo={somFinalizacao}
            alterar={setSomFinalizacao}
          />
        </div>

        <label className="opcao-linha vibracao">
          <div>
            <strong>
              📳 Vibrar ao atingir o tempo limite
            </strong>

            <small>
              Alerta discreto para o operador sem emitir som.
            </small>
          </div>

          <input
            type="checkbox"
            checked={vibrarTempoLimite}
            onChange={(e) =>
              setVibrarTempoLimite(e.target.checked)
            }
          />
        </label>
      </section>

      {/* COLETES */}

      <section className="config-card">
        <div className="config-card-titulo">
          <span>👕</span>

          <div>
            <h2>Coletes</h2>
            <p>Cores disponíveis nesta pelada.</p>
          </div>
        </div>

        <div className="coletes">
          {coresColetes.map((cor) => (
            <div className="colete-item" key={cor.id}>
              <input
                type="color"
                className="cor-colete"
                value={cor.hex}
                onChange={(e) => alterarCor(cor.id, 'hex', e.target.value)}
                aria-label={`Cor de ${cor.nome}`}
              />

              <input
                type="text"
                value={cor.nome}
                onChange={(e) => alterarCor(cor.id, 'nome', e.target.value)}
                aria-label="Nome da cor do colete"
              />

              <button
                type="button"
                onClick={() => removerCor(cor.id)}
                disabled={coresColetes.length <= 2}
              >
                Remover
              </button>
            </div>
          ))}

          <button
            type="button"
            className="adicionar-colete"
            onClick={adicionarCor}
          >
            + Adicionar cor
          </button>
        </div>

        <div className="opcoes">
          <Opcao
            titulo="Time que permanece mantém o colete"
            descricao="Quem vencer no placar ou permanecer após a tampinha continua utilizando a mesma cor."
            ativo={permaneceMantemColete}
            alterar={setPermaneceMantemColete}
          />
        </div>
      </section>

      {/* RESUMO */}

      <section className="config-card resumo-config">
        <h2>Configuração atual</h2>

        <div className="resumo-grid">
          <div>
            <small>Formação</small>
            <strong>
              {jogadoresLinha} linha + goleiro
            </strong>
          </div>

          <div>
            <small>Tempo</small>
            <strong>{tempoQueda} minutos</strong>
          </div>

          <div>
            <small>Limite</small>
            <strong>{limiteGols} gols</strong>
          </div>

          <div>
            <small>Após o tempo</small>

            <strong>
              {aguardarSaidaBola
                ? 'Aguardar saída da bola'
                : 'Finalizar imediatamente'}
            </strong>
          </div>

          <div>
            <small>Empate</small>

            <strong>
              {tampinhaEmpate
                ? 'Tampinha obrigatória'
                : 'Sem tampinha obrigatória'}
            </strong>
          </div>

          <div>
            <small>Coletes</small>

            <strong>
              {coresColetes.map((cor) => cor.nome).join(', ')}
              {' • '}
              {permaneceMantemColete
                ? 'Vencedor mantém'
                : 'Nova definição'}
            </strong>
          </div>
        </div>
      </section>
    </div>
  )
}

type OpcaoProps = {
  titulo: string
  descricao: string
  ativo: boolean
  alterar: (valor: boolean) => void
}

function Opcao({
  titulo,
  descricao,
  ativo,
  alterar,
}: OpcaoProps) {
  return (
    <label className="opcao-linha">
      <div>
        <strong>{titulo}</strong>
        <small>{descricao}</small>
      </div>

      <input
        type="checkbox"
        checked={ativo}
        onChange={(e) => alterar(e.target.checked)}
      />
    </label>
  )
}

type AvisoProps = {
  nome: string
  descricao: string
  ativo: boolean
  alterar: (valor: boolean) => void
}

function Aviso({
  nome,
  descricao,
  ativo,
  alterar,
}: AvisoProps) {
  return (
    <label className="aviso-item">
      <div>
        <strong>{nome}</strong>
        <small>{descricao}</small>
      </div>

      <input
        type="checkbox"
        checked={ativo}
        onChange={(e) => alterar(e.target.checked)}
      />
    </label>
  )
}

export default Configuracoes