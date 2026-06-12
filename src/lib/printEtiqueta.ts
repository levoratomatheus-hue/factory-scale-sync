import { jsPDF } from "jspdf";
import { ANTON_FONT_BASE64 } from "./antonFont";

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

const fmtKg0 = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export async function imprimirEtiqueta(data: EtiquetaData) {
  // Zebra ZD220: 106 × 65 mm
  const W = 106;
  const H = 65;
  const PAD = 2;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [106, 65] });

  doc.addFileToVFS("Anton-Regular.ttf", ANTON_FONT_BASE64);
  doc.addFont("Anton-Regular.ttf", "Anton", "normal");


  const dataProd =
    data.dataProd ??
    new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const nBateladas =
    data.tamanhoBatelada && data.tamanhoBatelada > 0
      ? Math.round(data.quantidade / data.tamanhoBatelada)
      : null;

  // ── Fundo branco ─────────────────────────────────────────────────────────
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, "F");

  // ── Faixa superior (marca) ───────────────────────────────────────────────
  const headerH = 19;

  if (data.marca === "Pigma") {
    doc.setFillColor(253, 242, 248);
    doc.rect(0, 0, W, headerH, "F");

    doc.setFontSize(18);
    doc.setFont("Anton", "normal");
    doc.setTextColor(190, 24, 93);
    doc.text("PIGMA", W / 2, 12, { align: "center" });

    doc.setFontSize(6);
    doc.setFont("Anton", "normal");
    doc.setTextColor(157, 64, 120);
    doc.text("Pigmentos de Alta Performance", W / 2, 17, { align: "center" });

    doc.setDrawColor(236, 72, 153);
    doc.setLineWidth(0.4);
    doc.line(0, headerH, W, headerH);

  } else if (data.marca === "Zan Collor") {
    doc.setFillColor(245, 243, 255);
    doc.rect(0, 0, W, headerH, "F");

    doc.setFontSize(18);
    doc.setFont("Anton", "normal");
    const zanPart = "ZAN ";
    const colPart = "COIIOR";
    const totalTW = doc.getTextWidth(zanPart + colPart);
    const startX = (W - totalTW) / 2;
    doc.setTextColor(109, 40, 217);
    doc.text(zanPart, startX, 12);
    doc.setTextColor(29, 78, 216);
    doc.text(colPart, startX + doc.getTextWidth(zanPart), 12);

    doc.setFontSize(6);
    doc.setFont("Anton", "normal");
    doc.setTextColor(99, 80, 180);
    doc.text("masterbatches", W / 2, 17, { align: "center" });

    doc.setDrawColor(124, 58, 237);
    doc.setLineWidth(0.4);
    doc.line(0, headerH, W, headerH);

  } else {
    doc.setFillColor(245, 245, 245);
    doc.rect(0, 0, W, headerH, "F");

    doc.setFontSize(16);
    doc.setFont("Anton", "normal");
    doc.setTextColor(30, 30, 30);
    doc.text(data.marca ?? "", W / 2, 13, { align: "center" });

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.4);
    doc.line(0, headerH, W, headerH);
  }

  // ── Produto ──────────────────────────────────────────────────────────────
  doc.setFontSize(13);
  doc.setFont("Anton", "normal");
  doc.setTextColor(15, 15, 15);
  const prodLines = doc.splitTextToSize(data.produto, W - PAD * 2) as string[];
  const prodY = headerH + 7;
  doc.text(prodLines, W / 2, prodY, { align: "center" });
  const prodBottom = prodY + (prodLines.length - 1) * 5;

  // ── Separador ────────────────────────────────────────────────────────────
  const sepY = prodBottom + 3;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(PAD, sepY, W - PAD, sepY);

  // ── Campos de dados: 2 colunas × 2 linhas ────────────────────────────────
  // Esquerda: LOTE (cima) + QUANTIDADE (baixo)
  // Direita:  BATELADAS (cima) + PRODUÇÃO (baixo)
  const colMid = W / 2;
  const leftX  = PAD + (colMid - PAD) / 2;
  const rightX = colMid + (W - PAD - colMid) / 2;

  const rowTopLabelY = sepY + 5;
  const rowTopValueY = rowTopLabelY + 7;
  const rowBotLabelY = rowTopValueY + 9;
  const rowBotValueY = rowBotLabelY + 7;

  const drawCell = (label: string, value: string, cx: number, labelY: number, valueY: number) => {
    doc.setFontSize(10);
    doc.setFont("Anton", "normal");
    doc.setTextColor(110, 110, 110);
    doc.text(label, cx, labelY, { align: "center" });

    doc.setFontSize(15);
    doc.setFont("Anton", "normal");
    doc.setTextColor(10, 10, 10);
    doc.text(value, cx, valueY, { align: "center" });
  };

  // Linha divisória vertical entre colunas
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(colMid, sepY + 2, colMid, H - PAD);

  drawCell("LOTE",       String(data.lote),                leftX,  rowTopLabelY, rowTopValueY);
  drawCell("QUANTIDADE", `${fmtKg0(data.quantidade)} kg`,  leftX,  rowBotLabelY, rowBotValueY);

  const batValue = nBateladas && data.tamanhoBatelada
    ? `${nBateladas}× ${fmtKg0(data.tamanhoBatelada)} kg`
    : "---";
  drawCell("BATELADAS", batValue, rightX, rowTopLabelY, rowTopValueY);
  drawCell("PRODUÇÃO",  dataProd, rightX, rowBotLabelY, rowBotValueY);

  // ── Borda geral ──────────────────────────────────────────────────────────
  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.4);
  doc.roundedRect(0.5, 0.5, W - 1, H - 1, 1, 1, "S");

  doc.output("dataurlnewwindow");
}

// ── Etiqueta de Liberação — ZPL para Zebra ZD220 (106×65mm / 832×512 dots) ──

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
function sanitizeZpl(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[~^]/g, "");
}

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

  // Coluna direita: itens de produção empilhados a partir de Y=280
  // Espaçamento 52 dots por linha com fonte 45×45 → caem 4-5 itens até Y=495
  const KG_X = 400;
  const KG_Y_START = 280;
  const KG_LINE_H = 52;
  const KG_MAX_Y = 460;

  const kgLines: string[] = [];

  // Cabeçalho "KG" na coluna direita
  kgLines.push(`^FO${KG_X},${KG_Y_START - 55}^A0N,35,35^FDKG^FS`);

  // Linha separadora vertical entre colunas
  kgLines.push(`^FO395,130^GB2,375,2^FS`);

  if (allItems.length === 0) {
    kgLines.push(`^FO${KG_X},${KG_Y_START}^A0N,45,45^FD---^FS`);
  } else {
    allItems.forEach((it, i) => {
      const y = KG_Y_START + i * KG_LINE_H;
      if (y <= KG_MAX_Y) {
        kgLines.push(
          `^FO${KG_X},${y}^A0N,45,45^FD${it.qty}x ${fmtPeso(it.peso)} kg^FS`
        );
      }
    });
    // Total apenas quando há mais de um item
    if (allItems.length > 1) {
      const totalY = Math.min(KG_Y_START + allItems.length * KG_LINE_H + 6, 470);
      kgLines.push(
        `^FO${KG_X},${totalY}^A0N,38,38^FDTOTAL: ${fmtPeso(totalKg)} kg^FS`
      );
    }
  }

  const lines: string[] = [
    "^XA",
    "^PW832",
    "^LL512",
    // ── Cabeçalho preto ──────────────────────────────────────
    "^FO0,0^GB832,120,120^FS",
    // Texto branco (^FR = field reverse)
    `^FO20,20^A0N,55,55^FR^FDZan Collor Masterbatches^FS`,
    // ── Coluna esquerda ──────────────────────────────────────
    `^FO20,140^A0N,40,40^FDCod.: ${formulaSafe}^FS`,
    `^FO20,190^A0N,40,40^FDProd: ${prodSafe}^FS`,
    `^FO20,240^A0N,40,40^FDLote: ${loteSafe}   24 MESES^FS`,
    `^FO20,300^A0N,35,35^FD${dateFmt}^FS`,
    // ── Coluna direita (KG) ───────────────────────────────────
    ...kgLines,
    "^XZ",
  ];

  return lines.join("\n");
}

// ── Etiqueta de Balança/Mistura — ZPL para Zebra ZD220 (106×65mm / 832×512 dots) ──

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
