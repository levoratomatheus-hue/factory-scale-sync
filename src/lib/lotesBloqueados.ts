/**
 * Lotes permanentemente bloqueados do sistema.
 * Mesmo que venham no arquivo de importação do TI Soft, serão ignorados/deletados.
 * Para bloquear um novo lote, basta adicionar o número aqui.
 */
export const LOTES_BLOQUEADOS = new Set<number>([
  31536,
]);

export const isLoteBloqueado = (lote: number): boolean =>
  LOTES_BLOQUEADOS.has(lote);
