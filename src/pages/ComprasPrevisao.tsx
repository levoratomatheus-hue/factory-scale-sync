import { useState, useEffect, useMemo, useCallback, memo, createContext, useContext } from "react";
import { Loader2, Download, AlertTriangle, X, TrendingUp } from "lucide-react";
import { formatKg } from "@/lib/utils";
import { useComprasPrevisao } from "@/hooks/useCompras";
import type { LinhaPrevisao, OpDetalhe } from "@/hooks/useCompras";

// ── Theme palette ─────────────────────────────────────────────────────────────

function buildPalette(dark: boolean) {
  return {
    page:    dark ? "#111827" : "#f8fafc",
    card:    dark ? "#1f2937" : "#ffffff",
    cardAlt: dark ? "#374151" : "#f1f5f9",
    border:  dark ? "#374151" : "#e2e8f0",
    text:    dark ? "#f1f5f9" : "#0f172a",
    muted:   dark ? "#94a3b8" : "#64748b",
    cyan:    "#0891b2",
    amber:   "#d97706",
    amberBg: dark ? "#78350f22" : "#fef3c7",
    amberBorder: dark ? "#92400e" : "#f59e0b",
    emerald: "#059669",
    blue:    "#3b82f6",
  };
}

type Palette = ReturnType<typeof buildPalette>;
const PaletteCtx = createContext<Palette>(buildPalette(false));

function makeCardStyle(d: Palette) {
  return {
    background: d.card,
    border: `1px solid ${d.border}`,
    borderRadius: "0.75rem",
    padding: "1rem",
  };
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pendente:              { bg: "#6b72801a", text: "#6b7280" },
  aguardando_liberacao:  { bg: "#6b72801a", text: "#6b7280" },
  em_pesagem:            { bg: "#3b82f61a", text: "#3b82f6" },
  aguardando_mistura:    { bg: "#8b5cf61a", text: "#8b5cf6" },
  em_mistura:            { bg: "#8b5cf61a", text: "#8b5cf6" },
  aguardando_linha:      { bg: "#f59e0b1a", text: "#f59e0b" },
  em_linha:              { bg: "#10b9811a", text: "#10b981" },
};

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? { bg: "#6b72801a", text: "#6b7280" };
  const label = status.replace(/_/g, " ");
  return (
    <span style={{
      display: "inline-block",
      padding: "0.15rem 0.5rem",
      borderRadius: "9999px",
      fontSize: 11,
      fontWeight: 600,
      background: colors.bg,
      color: colors.text,
      textTransform: "capitalize",
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

// ── Atalhos ───────────────────────────────────────────────────────────────────

type Atalho = "7d" | "15d" | "mes" | null;

function toStr(d: Date) {
  return d.toISOString().split("T")[0];
}

function calcAtalho(id: Atalho): { inicio: string; fim: string } {
  const hoje = new Date();
  switch (id) {
    case "7d": {
      const fim = new Date(hoje);
      fim.setDate(hoje.getDate() + 6);
      return { inicio: toStr(hoje), fim: toStr(fim) };
    }
    case "15d": {
      const fim = new Date(hoje);
      fim.setDate(hoje.getDate() + 14);
      return { inicio: toStr(hoje), fim: toStr(fim) };
    }
    case "mes": {
      const primeiro = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
      const ultimo = new Date(hoje.getFullYear(), hoje.getMonth() + 2, 0);
      return { inicio: toStr(primeiro), fim: toStr(ultimo) };
    }
    default:
      return { inicio: toStr(hoje), fim: toStr(hoje) };
  }
}

const ATALHOS: { id: Atalho; label: string }[] = [
  { id: "7d", label: "Próximos 7 dias" },
  { id: "15d", label: "Próximos 15 dias" },
  { id: "mes", label: "Próximo mês" },
];

// ── SummaryCard ───────────────────────────────────────────────────────────────

const SummaryCard = memo(function SummaryCard({ label, value }: { label: string; value: string }) {
  const D = useContext(PaletteCtx);
  return (
    <div style={makeCardStyle(D)}>
      <p style={{ fontSize: 11, fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
        {label}
      </p>
      <p style={{ fontSize: 22, fontWeight: 700, color: D.text, margin: "0.25rem 0 0" }}>
        {value}
      </p>
    </div>
  );
});

// ── Modal ─────────────────────────────────────────────────────────────────────

const Modal = memo(function Modal({
  linha,
  onClose,
}: {
  linha: LinhaPrevisao;
  onClose: () => void;
}) {
  const D = useContext(PaletteCtx);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: D.card,
          border: `1px solid ${D.border}`,
          borderRadius: "1rem",
          width: "100%",
          maxWidth: 680,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          padding: "1rem 1.25rem",
          borderBottom: `1px solid ${D.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
              OPs em aberto
            </p>
            <p style={{ fontSize: 15, fontWeight: 700, color: D.text, margin: "0.2rem 0 0" }}>
              {linha.materia_prima}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: D.muted, padding: "0.25rem" }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: D.cardAlt }}>
                {["Lote", "Produto", "Data Prog.", "Status", "kg MP"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "0.5rem 0.75rem",
                      textAlign: h === "kg MP" ? "right" : "left",
                      fontWeight: 600,
                      color: D.muted,
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      borderBottom: `1px solid ${D.border}`,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linha.ops.map((op: OpDetalhe, i) => (
                <tr
                  key={op.id}
                  style={{ background: i % 2 === 0 ? "transparent" : D.cardAlt }}
                >
                  <td style={{ padding: "0.5rem 0.75rem", color: D.text, fontFamily: "monospace" }}>
                    {op.lote}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", color: D.text, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {op.produto}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", color: D.muted }}>
                    {op.data ? op.data.split("T")[0].split("-").reverse().join("/") : "—"}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>
                    {op.status ? <StatusBadge status={op.status} /> : <span style={{ color: D.muted }}>—</span>}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", color: D.text, textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>
                    {formatKg(op.kg_mp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ComprasPrevisao() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const D = buildPalette(dark);

  const defaultRange = useMemo(() => calcAtalho("15d"), []);

  const [atalhoAtivo, setAtalhoAtivo] = useState<Atalho>("15d");
  const [dataInicio, setDataInicio] = useState(defaultRange.inicio);
  const [dataFim, setDataFim] = useState(defaultRange.fim);
  const [modalLinha, setModalLinha] = useState<LinhaPrevisao | null>(null);

  const { resultado, loading, refetch } = useComprasPrevisao(dataInicio, dataFim);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const aplicarAtalho = useCallback((id: Atalho) => {
    setAtalhoAtivo(id);
    const { inicio, fim } = calcAtalho(id);
    setDataInicio(inicio);
    setDataFim(fim);
  }, []);

  const exportarCSV = useCallback(() => {
    if (!resultado) return;
    const header = "Matéria-Prima;Total kg;Em Produção kg;Não Iniciada kg";
    const rows = resultado.linhas.map((l) => [
      `"${l.materia_prima.replace(/"/g, '""')}"`,
      String(l.total_kg.toFixed(3)).replace(".", ","),
      String(l.em_producao_kg.toFixed(3)).replace(".", ","),
      String(l.nao_iniciada_kg.toFixed(3)).replace(".", ","),
    ].join(";"));
    const csv = "\ufeff" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `previsao_compra_${dataInicio}_${dataFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [resultado, dataInicio, dataFim]);

  const aviso = resultado?.aviso;
  const temAviso = aviso && (
    aviso.sem_formula > 0 ||
    aviso.sem_itens > 0 ||
    aviso.kg_excluidos > 0
  );

  return (
    <PaletteCtx.Provider value={D}>
      <div style={{ background: D.page, minHeight: "100%", padding: "1.5rem", fontFamily: "inherit" }}>
        {/* Header */}
        <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: D.text, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <TrendingUp size={20} style={{ color: D.cyan }} />
              Previsão de Compra
            </h1>
            <p style={{ fontSize: 13, color: D.muted, margin: "0.25rem 0 0" }}>
              Necessidade teórica das OPs em aberto
            </p>
          </div>
          <button
            onClick={exportarCSV}
            disabled={!resultado || resultado.linhas.length === 0}
            style={{
              display: "flex", alignItems: "center", gap: "0.375rem",
              padding: "0.5rem 1rem",
              background: D.cyan,
              color: "#fff",
              border: "none",
              borderRadius: "0.5rem",
              fontSize: 13,
              fontWeight: 600,
              cursor: resultado && resultado.linhas.length > 0 ? "pointer" : "not-allowed",
              opacity: resultado && resultado.linhas.length > 0 ? 1 : 0.5,
            }}
          >
            <Download size={14} />
            Exportar CSV
          </button>
        </div>

        {/* Atalhos */}
        <div style={{ marginBottom: "1rem", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          {ATALHOS.map((a) => (
            <button
              key={a.id}
              onClick={() => aplicarAtalho(a.id)}
              style={{
                padding: "0.3rem 0.75rem",
                borderRadius: "9999px",
                fontSize: 12,
                fontWeight: 600,
                border: `1px solid ${atalhoAtivo === a.id ? D.cyan : D.border}`,
                background: atalhoAtivo === a.id ? D.cyan : "transparent",
                color: atalhoAtivo === a.id ? "#fff" : D.muted,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* Date inputs */}
        <div style={{ marginBottom: "1rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => { setDataInicio(e.target.value); setAtalhoAtivo(null); }}
              style={{
                padding: "0.4rem 0.6rem",
                borderRadius: "0.5rem",
                border: `1px solid ${D.border}`,
                background: D.card,
                color: D.text,
                fontSize: 13,
              }}
            />
            <span style={{ color: D.muted, fontSize: 13 }}>até</span>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => { setDataFim(e.target.value); setAtalhoAtivo(null); }}
              style={{
                padding: "0.4rem 0.6rem",
                borderRadius: "0.5rem",
                border: `1px solid ${D.border}`,
                background: D.card,
                color: D.text,
                fontSize: 13,
              }}
            />
            <button
              onClick={refetch}
              disabled={loading}
              style={{
                padding: "0.4rem 0.9rem",
                borderRadius: "0.5rem",
                border: `1px solid ${D.border}`,
                background: D.card,
                color: D.text,
                fontSize: 13,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
              }}
            >
              {loading && <Loader2 size={13} className="animate-spin" />}
              Calcular
            </button>
          </div>
        </div>

        {/* Aviso de cobertura */}
        {temAviso && aviso && (
          <div style={{
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
            borderRadius: "0.5rem",
            background: D.amberBg,
            border: `1px solid ${D.amberBorder}`,
            display: "flex",
            alignItems: "flex-start",
            gap: "0.5rem",
          }}>
            <AlertTriangle size={15} style={{ color: D.amber, flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12, color: D.text }}>
              <strong style={{ color: D.amber }}>Cobertura parcial:</strong>{" "}
              {aviso.ops_calculadas} de {aviso.total_ops} OPs consideradas no cálculo.
              {aviso.sem_formula > 0 && ` ${aviso.sem_formula} sem fórmula cadastrada.`}
              {aviso.sem_itens > 0 && ` ${aviso.sem_itens} com fórmula inexistente na tabela.`}
              {aviso.kg_excluidos > 0 && ` Total excluído: ~${Math.round(aviso.kg_excluidos).toLocaleString("pt-BR")} kg.`}
            </div>
          </div>
        )}

        {/* Summary cards */}
        {resultado && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem", marginBottom: "1.25rem" }}>
            <SummaryCard label="Total necessário (kg)" value={formatKg(resultado.total_kg)} />
            <SummaryCard label="MPs distintas" value={String(resultado.linhas.length)} />
            <SummaryCard label="OPs no horizonte" value={String(resultado.aviso.ops_calculadas)} />
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "3rem", color: D.muted }}>
            <Loader2 size={28} className="animate-spin" />
          </div>
        )}

        {/* Table */}
        {!loading && resultado && resultado.linhas.length > 0 && (
          <div style={{ ...makeCardStyle(D), padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: D.cardAlt }}>
                  {[
                    { label: "Matéria-Prima", align: "left" },
                    { label: "Necessidade total (kg)", align: "right" },
                    { label: "Em produção (kg)", align: "right" },
                    { label: "Não iniciada (kg)", align: "right" },
                    { label: "Nº OPs", align: "right" },
                  ].map((h) => (
                    <th
                      key={h.label}
                      style={{
                        padding: "0.6rem 1rem",
                        textAlign: h.align as "left" | "right",
                        fontWeight: 600,
                        color: D.muted,
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        borderBottom: `1px solid ${D.border}`,
                      }}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resultado.linhas.map((l, i) => (
                  <tr
                    key={l.materia_prima}
                    onClick={() => setModalLinha(l)}
                    style={{
                      background: i % 2 === 0 ? "transparent" : D.cardAlt,
                      cursor: "pointer",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = dark ? "#374151" : "#e2e8f0")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? "transparent" : D.cardAlt)}
                  >
                    <td style={{ padding: "0.55rem 1rem", color: D.text, fontWeight: 500 }}>
                      {l.materia_prima}
                    </td>
                    <td style={{ padding: "0.55rem 1rem", color: D.text, textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>
                      {formatKg(l.total_kg)}
                    </td>
                    <td style={{ padding: "0.55rem 1rem", color: D.blue, textAlign: "right", fontFamily: "monospace" }}>
                      {formatKg(l.em_producao_kg)}
                    </td>
                    <td style={{ padding: "0.55rem 1rem", color: D.muted, textAlign: "right", fontFamily: "monospace" }}>
                      {formatKg(l.nao_iniciada_kg)}
                    </td>
                    <td style={{ padding: "0.55rem 1rem", color: D.muted, textAlign: "right" }}>
                      {l.n_ops}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && resultado && resultado.linhas.length === 0 && (
          <div style={{ textAlign: "center", color: D.muted, padding: "3rem", fontSize: 14 }}>
            Nenhuma OP em aberto para o período selecionado.
          </div>
        )}

        {!loading && !resultado && (
          <div style={{ textAlign: "center", color: D.muted, padding: "3rem", fontSize: 14 }}>
            Clique em <strong>Calcular</strong> para carregar os dados.
          </div>
        )}

        {/* Footer */}
        <p style={{ marginTop: "1.5rem", fontSize: 11, color: D.muted, fontStyle: "italic" }}>
          * Consumo teórico com base nas fórmulas cadastradas. Não considera perdas, sobras ou ajustes de produção.
        </p>
      </div>

      {/* Modal */}
      {modalLinha && (
        <Modal linha={modalLinha} onClose={() => setModalLinha(null)} />
      )}
    </PaletteCtx.Provider>
  );
}
