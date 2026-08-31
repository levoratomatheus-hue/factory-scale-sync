// Impressão de etiqueta PDF via jsPDF — carregue este módulo via dynamic import()
// para não incluir jsPDF e a fonte Anton (~593 KB) no bundle inicial.
//
// As funções ZPL (sem dependências pesadas) ficam em printZpl.ts e podem
// ser importadas normalmente.

import { jsPDF } from "jspdf";
import { ANTON_FONT_BASE64 } from "./antonFont";

export type { EtiquetaData, EtiquetaLiberacaoData } from "./printZpl";
export { gerarZplLiberacao, gerarZplBalancaMistura, sanitizeZpl } from "./printZpl";
import type { EtiquetaData } from "./printZpl";

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

    doc.setFontSize(20);
    doc.setFont("Anton", "normal");
    doc.setTextColor(190, 24, 93);
    doc.text("PIGMA", W / 2, 12, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("Anton", "normal");
    doc.setTextColor(190, 24, 93);
    doc.text("Pigmentos de Alta Performance", W / 2, 17.5, { align: "center" });

    doc.setDrawColor(236, 72, 153);
    doc.setLineWidth(0.4);
    doc.line(0, headerH, W, headerH);

  } else if (data.marca === "Zan Collor") {
    doc.setFillColor(245, 243, 255);
    doc.rect(0, 0, W, headerH, "F");

    doc.setFontSize(20);
    doc.setFont("Anton", "normal");
    const zanPart = "ZAN ";
    const colPart = "COLLOR";
    const totalTW = doc.getTextWidth(zanPart + colPart);
    const startX = (W - totalTW) / 2;
    doc.setTextColor(109, 40, 217);
    doc.text(zanPart, startX, 12);
    doc.setTextColor(29, 78, 216);
    doc.text(colPart, startX + doc.getTextWidth(zanPart), 12);

    doc.setFontSize(8);
    doc.setFont("Anton", "normal");
    doc.setTextColor(109, 40, 217);
    doc.text("masterbatches", W / 2, 17.5, { align: "center" });

    doc.setDrawColor(124, 58, 237);
    doc.setLineWidth(0.4);
    doc.line(0, headerH, W, headerH);

  } else {
    doc.setFillColor(245, 245, 245);
    doc.rect(0, 0, W, headerH, "F");

    doc.setFontSize(18);
    doc.setFont("Anton", "normal");
    doc.setTextColor(30, 30, 30);
    doc.text(data.marca ?? "", W / 2, 13, { align: "center" });

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.4);
    doc.line(0, headerH, W, headerH);
  }

  // ── Produto ──────────────────────────────────────────────────────────────
  doc.setFontSize(14);
  doc.setFont("Anton", "normal");
  doc.setTextColor(15, 15, 15);
  const prodLines = doc.splitTextToSize(data.produto, W - PAD * 2) as string[];
  const prodY = headerH + 8;
  doc.text(prodLines, W / 2, prodY, { align: "center" });
  const prodBottom = prodY + (prodLines.length - 1) * 5.5;

  // ── Separador ────────────────────────────────────────────────────────────
  const sepY = prodBottom + 3;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(PAD, sepY, W - PAD, sepY);

  // ── Campos de dados: 2 colunas × 2 linhas ────────────────────────────────
  const colMid = W / 2;
  const leftX  = PAD + (colMid - PAD) / 2;
  const rightX = colMid + (W - PAD - colMid) / 2;

  const rowTopLabelY = sepY + 5;
  const rowTopValueY = rowTopLabelY + 7;
  const rowBotLabelY = rowTopValueY + 10;
  const rowBotValueY = rowBotLabelY + 7;

  const drawCell = (label: string, value: string, cx: number, labelY: number, valueY: number) => {
    doc.setFontSize(10);
    doc.setFont("Anton", "normal");
    doc.setTextColor(10, 10, 10);
    doc.text(label, cx, labelY, { align: "center" });

    doc.setFontSize(16);
    doc.setFont("Anton", "normal");
    doc.setTextColor(10, 10, 10);
    doc.text(value, cx, valueY, { align: "center" });
  };

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
