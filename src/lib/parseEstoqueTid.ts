/**
 * parseEstoqueTid.ts
 * Parsing do relatório de estoque exportado pelo TID (ERP).
 *
 * Formato: Windows-1252, separador ";", sem cabeçalho, 14+ colunas.
 *   col[0] = código TID   (ex.: "000141")
 *   col[1] = nome da MP
 *   col[4] = unidade       (ex.: "KG")
 *   col[9] = saldo atual   (formato BR: "1.076,291")
 */

export interface TidItem {
  cod_tid: string;  // raw, ex.: "000141"
  nome: string;
  unidade: string;
  saldo_kg: number;
}

/** Converte número no formato pt-BR para float. "9.148,47" → 9148.47 */
function parseBrNumber(s: string): number {
  const v = parseFloat(s.trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : 0;
}

/**
 * Remove zeros à esquerda para comparação tolerante.
 * "000141" → "141"   |   "5500" → "5500"
 */
export function normalizeCod(cod: string): string {
  const trimmed = cod.trim();
  const n = parseInt(trimmed, 10);
  return Number.isNaN(n) ? trimmed : String(n);
}

/**
 * Parseia o buffer do arquivo .txt do TID (encoding Windows-1252).
 * Retorna apenas linhas com unidade "KG" e com pelo menos 10 colunas.
 */
export function parseEstoqueTid(buffer: ArrayBuffer): TidItem[] {
  const text = new TextDecoder('windows-1252').decode(buffer);
  const items: TidItem[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const cols = line.split(';');
    if (cols.length < 10) continue;

    const codTid  = (cols[0] ?? '').trim();
    const nome    = (cols[1] ?? '').trim();
    const unidade = (cols[4] ?? '').trim().toUpperCase();

    if (!codTid || unidade !== 'KG') continue;

    items.push({
      cod_tid: codTid,
      nome,
      unidade,
      saldo_kg: parseBrNumber(cols[9] ?? '0'),
    });
  }

  return items;
}
