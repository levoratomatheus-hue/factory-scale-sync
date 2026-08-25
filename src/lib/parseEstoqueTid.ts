// src/lib/parseEstoqueTid.ts
//
// Leitor do relatório de estoque de matéria-prima exportado do TID.
// Formato do arquivo (confirmado no arquivo real):
//   - Encoding: Windows-1252 / ISO-8859-1 (latin-1)
//   - Separador: ";"
//   - SEM cabeçalho
//   - 14 colunas por linha
//
// Colunas relevantes (índice 0-based):
//   col[0]  = código TID          (ex.: "000141")
//   col[1]  = nome da matéria-prima
//   col[4]  = unidade             (ex.: "KG")
//   col[9]  = SALDO ATUAL em kg   (ex.: "1.076,291")  ← coluna-chave
//
// Números vêm no formato brasileiro: "." separa milhar e "," separa decimal.

export interface EstoqueTidItem {
  codTid: string;
  materiaPrima: string;
  unidade: string;
  saldoKg: number;
  linhaOriginal: number;
}

export interface ParseEstoqueTidResult {
  itens: EstoqueTidItem[];
  ignoradas: number;
  totalLinhas: number;
}

/** Converte um número no formato brasileiro ("9.148,47") para float (9148.47). */
export function parseNumeroBR(valor: string): number {
  if (!valor) return 0;
  const limpo = valor.trim().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(limpo);
  return Number.isNaN(n) ? 0 : n;
}

/** Faz o parse a partir do texto já decodificado. */
export function parseEstoqueTidTexto(texto: string): ParseEstoqueTidResult {
  const linhas = texto.split(/\r?\n/);
  const itens: EstoqueTidItem[] = [];
  let ignoradas = 0;

  linhas.forEach((linha, idx) => {
    if (!linha.trim()) return; // linha vazia

    const cols = linha.split(";");
    // precisa ter pelo menos até a coluna de saldo (índice 9)
    if (cols.length < 10) {
      ignoradas++;
      return;
    }

    const codTid = (cols[0] || "").trim();
    const materiaPrima = (cols[1] || "").trim();
    const unidade = (cols[4] || "").trim();
    const saldoKg = parseNumeroBR(cols[9] || "");

    if (!codTid) {
      ignoradas++;
      return;
    }

    itens.push({
      codTid,
      materiaPrima,
      unidade,
      saldoKg,
      linhaOriginal: idx + 1,
    });
  });

  return { itens, ignoradas, totalLinhas: linhas.length };
}

/** Lê o arquivo (File) decodificando em Windows-1252 e faz o parse. */
export async function parseEstoqueTidFile(
  file: File
): Promise<ParseEstoqueTidResult> {
  const buffer = await file.arrayBuffer();
  // O TID exporta em latin-1; windows-1252 é o superset correto para PT-BR.
  const texto = new TextDecoder("windows-1252").decode(buffer);
  return parseEstoqueTidTexto(texto);
}

/**
 * Normaliza um código TID para casamento tolerante a zeros à esquerda.
 * Ex.: "000141" e "141" viram ambos "141".
 */
export function normalizarCodTid(cod: string): string {
  return (cod || "").trim().replace(/^0+/, "") || "0";
}
