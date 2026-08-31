// Geração de etiquetas ZPL para impressoras Zebra — sem dependência de jsPDF.
// As funções de impressão PDF (imprimirEtiqueta) ficam em printEtiqueta.ts
// e devem ser carregadas via dynamic import apenas quando necessário.

export interface EtiquetaData {
  ordemId: string;
  produto: string;
  marca: string | null | undefined;
  lote: number | string;
  quantidade: number;
  formulaId?: string | null | undefined;
  tamanhoBatelada: number | null | undefined;
  itens?: { sequencia: number | null; materia_prima: string; quantidade_kg: number }[];
  obs?: string | null | undefined;
  dataProd?: string;
}

export interface EtiquetaLiberacaoData {
  produto: string;
  lote: string | number;
  formula_id?: string | null;
  data_conclusao?: string | null;
  registros: Array<{
    registro_producao: Array<{ qty: number; peso: number }> | null | undefined;
  }>;
}

// Transliterar acentos e remover caracteres ZPL especiais
export function sanitizeZpl(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[~^]/g, "");
}

// ── Etiqueta de Liberação — ZPL para Zebra ZD220 (106×65mm / 832×512 dots) ──
export function gerarZplLiberacao(params: EtiquetaLiberacaoData): string {
  const { produto, lote, formula_id, data_conclusao, registros } = params;

  const allItems: Array<{ qty: number; peso: number }> = [];
  registros.forEach((r) => {
    const items = Array.isArray(r.registro_producao) ? r.registro_producao : [];
    items.filter((it) => (it.qty ?? 0) > 0 || (it.peso ?? 0) > 0).forEach((it) => allItems.push(it));
  });

  const totalKg = allItems.reduce((s, it) => s + (it.qty || 0) * (it.peso || 0), 0);

  const fmtPeso = (n: number) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  const dateFmt = data_conclusao
    ? new Date(data_conclusao).toLocaleDateString("pt-BR")
    : new Date().toLocaleDateString("pt-BR");

  const prodSafe    = sanitizeZpl(produto);
  const formulaSafe = formula_id ? sanitizeZpl(String(formula_id)) : "---";
  const loteSafe    = sanitizeZpl(String(lote));

  const KG_X = 400;
  const KG_Y_START = 280;
  const KG_LINE_H = 52;
  const KG_MAX_Y = 460;

  const kgLines: string[] = [];
  kgLines.push(`^FO${KG_X},${KG_Y_START - 55}^A0N,35,35^FDKG^FS`);
  kgLines.push(`^FO395,130^GB2,375,2^FS`);

  if (allItems.length === 0) {
    kgLines.push(`^FO${KG_X},${KG_Y_START}^A0N,45,45^FD---^FS`);
  } else {
    allItems.forEach((it, i) => {
      const y = KG_Y_START + i * KG_LINE_H;
      if (y <= KG_MAX_Y) {
        kgLines.push(`^FO${KG_X},${y}^A0N,45,45^FD${it.qty}x ${fmtPeso(it.peso)} kg^FS`);
      }
    });
    if (allItems.length > 1) {
      const totalY = Math.min(KG_Y_START + allItems.length * KG_LINE_H + 6, 470);
      kgLines.push(`^FO${KG_X},${totalY}^A0N,38,38^FDTOTAL: ${fmtPeso(totalKg)} kg^FS`);
    }
  }

  const lines: string[] = [
    "^XA",
    "^PW832",
    "^LL512",
    "^FO0,0^GB832,120,120^FS",
    `^FO20,20^A0N,55,55^FR^FDZan Collor Masterbatches^FS`,
    `^FO20,140^A0N,40,40^FDCod.: ${formulaSafe}^FS`,
    `^FO20,190^A0N,40,40^FDProd: ${prodSafe}^FS`,
    `^FO20,240^A0N,40,40^FDLote: ${loteSafe}   24 MESES^FS`,
    `^FO20,300^A0N,35,35^FD${dateFmt}^FS`,
    ...kgLines,
    "^XZ",
  ];

  return lines.join("\n");
}

// ── Etiqueta de Balança/Mistura — ZPL para Zebra ZD220 ──
export function gerarZplBalancaMistura(data: EtiquetaData): string {
  const dataProd =
    data.dataProd ??
    new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const nBateladas =
    data.tamanhoBatelada && data.tamanhoBatelada > 0
      ? Math.round(data.quantidade / data.tamanhoBatelada)
      : null;

  const marcaSafe = sanitizeZpl(
    data.marca === "Zan Collor" ? "Zan Collor Masterbatches" : data.marca ? data.marca : "---"
  );
  const prodSafe    = sanitizeZpl(data.produto);
  const formulaSafe = data.formulaId ? sanitizeZpl(String(data.formulaId)) : "---";
  const loteSafe    = sanitizeZpl(String(data.lote));
  const batStr      = nBateladas && data.tamanhoBatelada
    ? `${nBateladas}x ${data.tamanhoBatelada} kg`
    : "---";

  const lines: string[] = [
    "^XA",
    "^PW832",
    "^LL512",
    "^FO0,0^GB832,120,120^FS",
    `^FO20,20^A0N,55,55^FR^FD${marcaSafe}^FS`,
    `^FO20,140^A0N,40,40^FDCod.: ${formulaSafe}^FS`,
    `^FO20,190^A0N,40,40^FDProd: ${prodSafe}^FS`,
    `^FO20,240^A0N,40,40^FDLote: ${loteSafe}   24 MESES^FS`,
    `^FO20,300^A0N,35,35^FD${dataProd}^FS`,
    `^FO400,225^A0N,35,35^FDKG^FS`,
    `^FO395,130^GB2,375,2^FS`,
    `^FO400,280^A0N,45,45^FD${batStr}^FS`,
    "^XZ",
  ];

  return lines.join("\n");
}
