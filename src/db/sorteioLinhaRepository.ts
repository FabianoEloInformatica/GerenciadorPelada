import {
  obterBanco,
  type SorteioLinhaInicialDB,
} from './database'

export async function listarSorteioInicialLinha(
  sessaoId: number,
): Promise<SorteioLinhaInicialDB[]> {
  const db = await obterBanco()

  const registros = await db.getAllFromIndex(
    'sorteio_linha_inicial',
    'por-sessao',
    sessaoId,
  )

  return registros.sort((a, b) => a.numeroSorteado - b.numeroSorteado)
}

export async function salvarSorteioInicialLinha(
  sessaoId: number,
  resultados: Array<{
    jogadorId: number
    numeroSorteado: number
    grupo: number
    posicaoNoGrupo: number
    grupoCompleto: boolean
  }>,
): Promise<void> {
  const db = await obterBanco()
  const tx = db.transaction('sorteio_linha_inicial', 'readwrite')
  const store = tx.objectStore('sorteio_linha_inicial')

  /*
   * O sorteio é oficial: gravamos todos os jogadores na mesma transação.
   * A interface só mostra o resultado depois que a transação concluir.
   */
  for (const resultado of resultados) {
    await store.add({
      sessaoId,
      ...resultado,
      criadoEm: new Date().toISOString(),
    })
  }

  await tx.done
}
