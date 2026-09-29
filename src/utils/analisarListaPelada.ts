export type TipoListaJogador = 'LINHA' | 'GOLEIRO'

export type JogadorExtraidoLista = {
  nome: string
  tipo: TipoListaJogador
}

export type ResultadoAnaliseLista = {
  jogadores: JogadorExtraidoLista[]
  goleiros: JogadorExtraidoLista[]
  linha: JogadorExtraidoLista[]
  total: number
}

function limparLinhaJogador(linha: string): string {
  return linha
    // Remove marcações que possam ter vindo do WhatsApp.
    .replace(/[✅✔️☑️]/g, '')
    // Remove marcadores comuns.
    .replace(/^[•\-–—]\s*/, '')
    // Remove número inicial:
    // "1 JP", "1. JP", "1 - JP", "8Juninho"
    .replace(/^\s*\d+\s*[.)\-:]?\s*/, '')
    .trim()
}

function identificarCabecalho(linha: string): TipoListaJogador | null {
  const texto = linha
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

  if (
    texto === 'goleiro' ||
    texto === 'goleiros' ||
    texto === 'gol' ||
    texto.includes('🧤')
  ) {
    return 'GOLEIRO'
  }

  if (
    texto === 'linha' ||
    texto === 'jogadores' ||
    texto.includes('jogadores de linha') ||
    texto.includes('jogadores linha') ||
    texto.includes('jogadores de 🧵') ||
    texto.includes('🧵')
  ) {
    return 'LINHA'
  }

  return null
}

function pareceObservacao(linha: string): boolean {
  const texto = linha.toLowerCase()

  return (
    texto.includes('pix') ||
    texto.includes('pagamento') ||
    texto.includes('favor ') ||
    texto.includes('lista da pelada') ||
    texto.includes('efetuar ') ||
    texto.includes('r$')
  )
}

export function analisarListaPelada(
  textoOriginal: string,
): ResultadoAnaliseLista {
  const jogadores: JogadorExtraidoLista[] = []

  let secaoAtual: TipoListaJogador | null = null

  const linhas = textoOriginal.split(/\r?\n/)

  for (const linhaOriginal of linhas) {
    const linha = linhaOriginal.trim()

    if (!linha) {
      continue
    }

    const cabecalho = identificarCabecalho(linha)

    if (cabecalho) {
      secaoAtual = cabecalho
      continue
    }

    if (!secaoAtual) {
      continue
    }

    if (pareceObservacao(linha)) {
      continue
    }

    const nome = limparLinhaJogador(linha)

    // Linhas como "3" ou "4" representam vagas vazias.
    if (!nome) {
      continue
    }

    // Evita importar uma linha que sobrou apenas com símbolos.
    if (!/[a-zA-ZÀ-ÿ]/.test(nome)) {
      continue
    }

    jogadores.push({
      nome,
      tipo: secaoAtual,
    })
  }

  const goleiros = jogadores.filter(
    (jogador) => jogador.tipo === 'GOLEIRO',
  )

  const linha = jogadores.filter(
    (jogador) => jogador.tipo === 'LINHA',
  )

  return {
    jogadores,
    goleiros,
    linha,
    total: jogadores.length,
  }
}