import {
  obterBanco,
  type ConfiguracaoPeladaDB,
} from './database'

/*
 * Padrão inicial usado somente quando esta pelada ainda não possui
 * configuração salva. Depois do primeiro salvamento, as telas consultam
 * sempre o registro persistido.
 */
export const CONFIGURACAO_PADRAO_PELADA: ConfiguracaoPeladaDB = {
  id: 'principal',

  jogadoresLinhaPorTime: 4,
  tempoQuedaMinutos: 7,
  limiteGols: 2,

  goleiroParticipaSorteio: false,
  aguardarSaidaBola: true,

  tampinhaEmpate: true,
  maiorNumeroVence: true,
  menorNumeroSai: true,
  doisTimesSaemEmpate: true,

  permaneceMantemColete: true,
  primeiraBolaPermanece: true,
  primeiraBolaPrioridade: true,

  somInicio: true,
  somGol: true,
  somPausa: true,
  somRetomada: true,
  somTempoLimite: false,
  somFinalizacao: true,
  vibrarTempoLimite: true,

  coresColetes: [
    { id: 'verde', nome: 'Verde', hex: '#22a447' },
    { id: 'laranja', nome: 'Laranja', hex: '#f28c28' },
  ],

  atualizadoEm: '',
}

export async function obterConfiguracaoPelada(): Promise<ConfiguracaoPeladaDB> {
  const db = await obterBanco()
  const salva = await db.get('configuracoes', 'principal')

  if (salva) {
    return salva
  }

  return {
    ...CONFIGURACAO_PADRAO_PELADA,
    coresColetes: CONFIGURACAO_PADRAO_PELADA.coresColetes.map((cor) => ({
      ...cor,
    })),
  }
}

export async function salvarConfiguracaoPelada(
  configuracao: Omit<ConfiguracaoPeladaDB, 'id' | 'atualizadoEm'>,
): Promise<void> {
  if (configuracao.jogadoresLinhaPorTime < 1) {
    throw new Error('Informe pelo menos 1 jogador de linha por time.')
  }

  if (configuracao.tempoQuedaMinutos < 1) {
    throw new Error('O tempo da queda deve ser maior que zero.')
  }

  if (configuracao.limiteGols < 1) {
    throw new Error('O limite de gols deve ser maior que zero.')
  }

  const coresValidas = configuracao.coresColetes
    .map((cor) => ({
      ...cor,
      nome: cor.nome.trim(),
    }))
    .filter((cor) => cor.nome.length > 0)

  /*
   * O modelo atual possui dois times simultaneamente em quadra.
   * Por isso precisamos de pelo menos duas cores distintas disponíveis.
   */
  if (coresValidas.length < 2) {
    throw new Error('Cadastre pelo menos 2 cores de colete.')
  }

  const nomes = coresValidas.map((cor) => cor.nome.toLocaleLowerCase('pt-BR'))
  if (new Set(nomes).size !== nomes.length) {
    throw new Error('As cores dos coletes não podem ter nomes repetidos.')
  }

  const db = await obterBanco()

  await db.put('configuracoes', {
    ...configuracao,
    id: 'principal',
    coresColetes: coresValidas,
    atualizadoEm: new Date().toISOString(),
  })
}
