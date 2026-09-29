import { Link, Route, Routes } from 'react-router-dom'
import './App.css'

import Peladas from './pages/Peladas'
import Jogadores from './pages/Jogadores'
import Financeiro from './pages/Financeiro'
import Estatisticas from './pages/Estatisticas'
import Administradores from './pages/Administradores'
import Configuracoes from './pages/Configuracoes'
import NovaPelada from './pages/NovaPelada'

function Home() {
  return (
    <div className="app">
      <header className="topo">
        <div>
          <span className="marca">GERENCIADOR DE PELADA</span>
          <h1>Bem-vindo 👋</h1>
          <p>Organize sua pelada de forma rápida e simples.</p>
        </div>
      </header>

      <main className="conteudo">
        <section className="card destaque">
          <div>
            <span className="etiqueta">PELADA</span>
            <h2>Pelada de Segunda</h2>
            <p>Nenhuma pelada em andamento.</p>
          </div>

          <Link className="botao-principal" to="/nova-pelada">
            Iniciar nova pelada
          </Link>
        </section>

        <h3 className="titulo-secao">Gerenciamento</h3>

        <section className="grade">
          <Link className="card-menu" to="/peladas">
            <span className="icone">⚽</span>
            <strong>Peladas</strong>
            <small>Histórico e partidas</small>
          </Link>

          <Link className="card-menu" to="/jogadores">
            <span className="icone">👥</span>
            <strong>Jogadores</strong>
            <small>Cadastro e presença</small>
          </Link>

          <Link className="card-menu" to="/financeiro">
            <span className="icone">💰</span>
            <strong>Financeiro</strong>
            <small>Cobranças e caixa</small>
          </Link>

          <Link className="card-menu" to="/estatisticas">
            <span className="icone">📊</span>
            <strong>Estatísticas</strong>
            <small>Desempenho e rankings</small>
          </Link>

          <Link className="card-menu" to="/administradores">
            <span className="icone">👤</span>
            <strong>Administradores</strong>
            <small>Acessos da pelada</small>
          </Link>

          <Link className="card-menu" to="/configuracoes">
            <span className="icone">⚙️</span>
            <strong>Configurações</strong>
            <small>Regras, sons e coletes</small>
          </Link>
        </section>
      </main>
    </div>
  )
}

function Pagina({ children }: { children: React.ReactNode }) {
  return (
    <div className="pagina">
      <div className="pagina-topo">
        <Link to="/" className="voltar">
          ← Voltar
        </Link>

        <span>GERENCIADOR DE PELADA</span>
      </div>

      <main className="pagina-conteudo">
        {children}
      </main>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />

      <Route
        path="/peladas"
        element={
          <Pagina>
            <Peladas />
          </Pagina>
        }
      />

      <Route
        path="/jogadores"
        element={
          <Pagina>
            <Jogadores />
          </Pagina>
        }
      />

      <Route
        path="/financeiro"
        element={
          <Pagina>
            <Financeiro />
          </Pagina>
        }
      />

      <Route
        path="/estatisticas"
        element={
          <Pagina>
            <Estatisticas />
          </Pagina>
        }
      />

      <Route
        path="/administradores"
        element={
          <Pagina>
            <Administradores />
          </Pagina>
        }
      />

      <Route
        path="/configuracoes"
        element={
          <Pagina>
            <Configuracoes />
          </Pagina>
        }
      />

      <Route
        path="/nova-pelada"
        element={
          <Pagina>
            <NovaPelada />
          </Pagina>
        }
      />
    </Routes>
  )
}

export default App