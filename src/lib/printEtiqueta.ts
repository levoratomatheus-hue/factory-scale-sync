import { jsPDF } from "jspdf";

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

// A5 landscape: 210 × 148 mm
const W = 210;
const H = 148;
const PAD = 14;

const fmtKg0 = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export async function imprimirEtiqueta(data: EtiquetaData) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a5" });

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
  const headerH = 34;

  if (data.marca === "Pigma") {
    // Faixa rosa claro
    doc.setFillColor(253, 242, 248);
    doc.rect(0, 0, W, headerH, "F");

    doc.setFontSize(30);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(190, 24, 93); // rosa escuro
    doc.text("PIGMA", W / 2, 21, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(157, 64, 120);
    doc.text("Pigmentos de Alta Performance", W / 2, 29, { align: "center" });

    // Linha divisória rosa
    doc.setDrawColor(236, 72, 153);
    doc.setLineWidth(0.5);
    doc.line(0, headerH, W, headerH);

  } else if (data.marca === "Zan Collor") {
    // Faixa azul/roxo muito claro
    doc.setFillColor(245, 243, 255);
    doc.rect(0, 0, W, headerH, "F");

    doc.setFontSize(30);
    doc.setFont("helvetica", "bold");
    const zanPart = "ZAN ";
    const colPart = "COIIOR";
    const totalW = doc.getTextWidth(zanPart + colPart);
    const startX = (W - totalW) / 2;
    doc.setTextColor(109, 40, 217); // roxo
    doc.text(zanPart, startX, 21);
    doc.setTextColor(29, 78, 216); // azul
    doc.text(colPart, startX + doc.getTextWidth(zanPart), 21);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(99, 80, 180);
    doc.text("masterbatches", W / 2, 29, { align: "center" });

    // Linha divisória roxa
    doc.setDrawColor(124, 58, 237);
    doc.setLineWidth(0.5);
    doc.line(0, headerH, W, headerH);

  } else {
    doc.setFillColor(245, 245, 245);
    doc.rect(0, 0, W, headerH, "F");

    doc.setFontSize(26);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(data.marca ?? "", W / 2, 22, { align: "center" });

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.4);
    doc.line(0, headerH, W, headerH);
  }

  // ── Produto ──────────────────────────────────────────────────────────────
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 15, 15);
  const prodLines = doc.splitTextToSize(data.produto, W - PAD * 2) as string[];
  const prodY = headerH + 13;
  doc.text(prodLines, W / 2, prodY, { align: "center" });
  const prodBottom = prodY + (prodLines.length - 1) * 7.5;

  // ── Separador ────────────────────────────────────────────────────────────
  const sepY = prodBottom + 7;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(PAD, sepY, W - PAD, sepY);

  // ── Campos de dados ──────────────────────────────────────────────────────
  const campos: { label: string; value: string }[] = [
    { label: "LOTE", value: String(data.lote) },
    { label: "QUANTIDADE", value: `${fmtKg0(data.quantidade)} kg` },
    ...(nBateladas && data.tamanhoBatelada
      ? [{ label: "BATELADAS", value: `${nBateladas}× ${fmtKg0(data.tamanhoBatelada)} kg` }]
      : []),
    { label: "PRODUÇÃO", value: dataProd },
  ];

  const fieldsY = sepY + 10;
  const colW = (W - PAD * 2) / campos.length;

  campos.forEach(({ label, value }, i) => {
    const cx = PAD + colW * i + colW / 2;

    // Separador vertical entre campos
    if (i > 0) {
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.line(PAD + colW * i, sepY + 4, PAD + colW * i, H - PAD);
    }

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(130, 130, 130);
    doc.text(label, cx, fieldsY, { align: "center" });

    doc.setFontSize(17);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 15, 15);
    doc.text(value, cx, fieldsY + 10, { align: "center" });
  });

  // ── Borda geral ──────────────────────────────────────────────────────────
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.4);
  doc.roundedRect(1, 1, W - 2, H - 2, 2, 2, "S");

  doc.output("dataurlnewwindow");
}

// ── Etiqueta de Liberação — layout ZanCollor (HTML para window.print) ───────

export interface EtiquetaLiberacaoData {
  produto: string;
  lote: string | number;
  formula_id?: string | null;
  data_conclusao?: string | null;
  registros: Array<{
    registro_producao: Array<{ qty: number; peso: number }> | null | undefined;
  }>;
}

export function imprimirEtiquetaLiberacao(params: EtiquetaLiberacaoData) {
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

  const itensHTML = allItems.length > 0
    ? allItems.map((it) => `<div class="kg-item">${it.qty}&times;&nbsp;${fmtPeso(it.peso)}&nbsp;kg</div>`).join("")
    : '<div class="kg-item">&mdash;</div>';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: A5 landscape; margin: 6mm; }
    body { font-family: Arial, Helvetica, sans-serif; }
    .etiqueta {
      width: 100%;
      min-height: calc(148mm - 12mm);
      border: 1.5px solid #222;
      border-radius: 3px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .header {
      background: #000;
      color: #fff;
      text-align: center;
      padding: 8px 10px;
      font-size: 26pt;
      font-weight: 900;
      letter-spacing: 4px;
      line-height: 1;
    }
    .body {
      flex: 1;
      padding: 9px 14px;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .row { display: flex; align-items: baseline; gap: 10px; }
    .lbl { font-size: 7pt; font-weight: bold; color: #666; text-transform: uppercase; min-width: 34px; flex-shrink: 0; }
    .val { font-size: 13pt; font-weight: bold; color: #111; line-height: 1.1; }
    .val-big { font-size: 17pt; font-weight: 900; color: #000; line-height: 1.1; }
    .val-sm { font-size: 11pt; font-weight: bold; color: #111; }
    .validity {
      display: inline-block;
      margin-left: 12px;
      font-size: 9pt;
      font-weight: bold;
      color: #333;
      border: 1.5px solid #666;
      border-radius: 3px;
      padding: 1px 7px;
    }
    .divider { border: none; border-top: 1px solid #ccc; margin: 4px 0; }
    .kg-section { margin-top: 2px; }
    .kg-lbl { font-size: 7pt; font-weight: bold; color: #666; text-transform: uppercase; margin-bottom: 3px; }
    .kg-item { font-size: 12pt; font-weight: bold; color: #000; font-family: 'Courier New', monospace; line-height: 1.4; }
    .kg-total {
      font-size: 13pt; font-weight: 900; color: #000;
      border-top: 1.5px solid #999;
      margin-top: 5px; padding-top: 4px;
      font-family: 'Courier New', monospace;
    }
  </style>
</head>
<body>
  <div class="etiqueta">
    <div class="header">ZAN COLLOR</div>
    <div class="body">
      <div class="row">
        <span class="lbl">C&oacute;d.</span>
        <span class="val-sm">${formula_id ? String(formula_id) : "&mdash;"}</span>
      </div>
      <div class="row">
        <span class="lbl">Prod.</span>
        <span class="val-big">${produto}</span>
      </div>
      <hr class="divider"/>
      <div class="row">
        <span class="lbl">Lote</span>
        <span class="val">${lote}</span>
        <span class="validity">24 MESES</span>
      </div>
      <div class="row">
        <span class="lbl">Data</span>
        <span class="val-sm">${dateFmt}</span>
      </div>
      <hr class="divider"/>
      <div class="kg-section">
        <div class="kg-lbl">KG</div>
        ${itensHTML}
        ${totalKg > 0 ? `<div class="kg-total">Total: ${fmtPeso(totalKg)}&nbsp;kg</div>` : ""}
      </div>
    </div>
  </div>
  <script>
    window.onload = function() {
      window.print();
      window.onafterprint = function() { window.close(); };
    };
  </script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=650");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
