import { useState, useEffect, useMemo, useCallback, memo, createContext, useContext, useRef } from "react";
import { Loader2, Download, AlertTriangle, X, CalendarDays, Search } from "lucide-react";
import { formatKg } from "@/lib/utils";
import { useComprasConsumo } from "@/hooks/useCompras";
import type { LinhaMP, OpDetalhe } from "@/hooks/useCompras";

// ── Theme palette ─────────────────────────────────────────────────────────────

function buildPalette(dark: boolean) {
  return {
    page:        dark ? "#111827" : "#f8fafc",
    card:        dark ? "#1f2937" : "#ffffff",
    cardAlt:     dark ? "#374151" : "#f1f5f9",
    border:      dark ? "#374151" : "#e2e8f0",
    text:        dark ? "#f1f5f9" : "#0f172a",
    muted:       dark ? "#94a3b8" : "#64748b",
    cyan:        "#0891b2",
    amber:       "#d97706",
    amberBg:     dark ? "#78350f22" : "#fef3c7",
    amberBorder: dark ? "#92400e" : "#f59e0b",
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function toStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Conta meses de calendário distintos entre duas datas YYYY-MM-DD (inclusive). */
function calcNMeses(dataInicio: string, dataFim: string): number {
  if (!dataInicio || !dataFim) return 1;
  const [iy, im] = dataInicio.split("-").map(Number);
  const [fy, fm] = dataFim.split("-").map(Number);
  return Math.max(1, (fy - iy) * 12 + (fm - im) + 1);
}

// ── Atalhos ───────────────────────────────────────────────────────────────────

type AtalhoId = "3m" | "6m" | "12m" | "ano";

function calcAtalho(id: AtalhoId): { inicio: string; fim: string } {
  const hoje = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (id) {
    case "3m": {
      const s = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1);
      return { inicio: toStr(s), fim: toStr(hoje) };
    }
    case "6m": {
      const s = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);
      return { inicio: toStr(s), fim: toStr(hoje) };
    }
    case "12m": {
      const s = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
      return { inicio: toStr(s), fim: toStr(hoje) };
    }
    case "ano":
      return { inicio: `${hoje.getFullYear()}-01-01`, fim: toStr(hoje) };
    default:
      return { inicio: `${hoje.getFullYear()}-01-01`, fim: toStr(hoje) };
  }
}

const ATALHOS: { id: AtalhoId; label: string }[] = [
  { id: "3m",  label: "Últimos 3 meses"  },
  { id: "6m",  label: "Últimos 6 meses"  },
  { id: "12m", label: "Últimos 12 meses" },
  { id: "ano", label: "Este ano"          },
];

// ── SummaryCard ───────────────────────────────────────────────────────────────

const SummaryCard = memo(function SummaryCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  const D = useContext(PaletteCtx);
  return (
    <div style={{ ...makeCardStyle(D), outline: highlight ? `2px solid ${D.cyan}` : "none" }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
        {label}
      </p>
      <p style={{ fontSize: 22, fontWeight: 700, color: highlight ? D.cyan : D.text, margin: "0.25rem 0 0" }}>
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: 11, color: D.muted, margin: "0.15rem 0 0" }}>{sub}</p>
      )}
    </div>
  );
});

// ── Modal ─────────────────────────────────────────────────────────────────────

const Modal = memo(function Modal({
  linha,
  nMeses,
  onClose,
}: {
  linha: LinhaMP;
  nMeses: number;
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
          background: D.card, border: `1px solid ${D.border}`,
          borderRadius: "1rem", width: "100%", maxWidth: 620,
          maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          padding: "1rem 1.25rem", borderBottom: `1px solid ${D.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
              Detalhes por OP
            </p>
            <p style={{ fontSize: 15, fontWeight: 700, color: D.text, margin: "0.2rem 0 0" }}>
              {linha.materia_prima}
              {linha.cod_mp && (
                <span style={{ fontSize: 12, fontWeight: 400, color: D.muted, marginLeft: "0.5rem" }}>
                  ({linha.cod_mp})
                </span>
              )}
            </p>
            <p style={{ fontSize: 12, color: D.muted, margin: "0.1rem 0 0" }}>
              Total período: {formatKg(linha.total_kg)} · Média: {formatKg(linha.total_kg / nMeses)}/mês
            </p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: D.muted, padding: "0.25rem" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: D.cardAlt }}>
                {["Lote", "Produto", "Data criação", "kg MP"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "0.5rem 0.75rem",
                      textAlign: h === "kg MP" ? "right" : "left",
                      fontWeight: 600, color: D.muted, fontSize: 11,
                      textTransform: "uppercase", letterSpacing: "0.04em",
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
                <tr key={op.id} style={{ background: i % 2 === 0 ? "transparent" : D.cardAlt }}>
                  <td style={{ padding: "0.5rem 0.75rem", color: D.text, fontFamily: "monospace" }}>
                    {op.lote}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", color: D.text, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {op.produto}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", color: D.muted }}>
                    {op.data ? op.data.split("T")[0].split("-").reverse().join("/") : "—"}
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

export default function ComprasMediaMensal() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const D = buildPalette(dark);

  const init6m = useMemo(() => calcAtalho("6m"), []);
  const [atalhoAtivo, setAtalhoAtivo] = useState<AtalhoId | null>("6m");
  const [dataInicio, setDataInicio] = useState(init6m.inicio);
  const [dataFim, setDataFim]       = useState(init6m.fim);
  const [buscaMP, setBuscaMP]       = useState("");
  const [modalLinha, setModalLinha] = useState<LinhaMP | null>(null);
  const buscaRef = useRef<HTMLInputElement>(null);

  const { resultado, loading, refetch } = useComprasConsumo(dataInicio, dataFim, undefined);

  useEffect(() => { refetch(); }, [refetch]);

  // Reset busca when new data arrives
  useEffect(() => { setBuscaMP(""); }, [resultado]);

  const aplicarAtalho = useCallback((id: AtalhoId) => {
    setAtalhoAtivo(id);
    const { inicio, fim } = calcAtalho(id);
    setDataInicio(inicio);
    setDataFim(fim);
  }, []);

  // Número de meses do período
  const nMeses = useMemo(() => calcNMeses(dataInicio, dataFim), [dataInicio, dataFim]);

  // Filtro em memória
  const linhasFiltradas = useMemo(() => {
    if (!resultado) return [];
    const q = normalize(buscaMP.trim());
    if (!q) return resultado.linhas;
    return resultado.linhas.filter(
      (l) =>
        normalize(l.materia_prima).includes(q) ||
        (l.cod_mp ? normalize(l.cod_mp).includes(q) : false),
    );
  }, [resultado, buscaMP]);

  const buscaAtiva = buscaMP.trim().length > 0;

  const exportarCSV = useCallback(() => {
    if (linhasFiltradas.length === 0) return;
    const header = "Matéria-Prima;Cód. TID;Média Mensal (kg);Total Período (kg)";
    const rows = linhasFiltradas.map((l) => {
      const media = (l.total_kg / nMeses).toFixed(3).replace(".", ",");
      const total = l.total_kg.toFixed(3).replace(".", ",");
      return `"${l.materia_prima.replace(/"/g, '""')}";${l.cod_mp ?? ""};${media};${total}`;
    });
    const csv = "\ufeff" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `media_mensal_mp_${dataInicio}_${dataFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [linhasFiltradas, nMeses, dataInicio, dataFim]);

  const aviso = resultado?.aviso;
  const temAviso = aviso && (aviso.sem_formula > 0 || aviso.sem_itens > 0 || aviso.kg_excluidos > 0);
  const canExport = linhasFiltradas.length > 0;

  return (
    <PaletteCtx.Provider value={D}>
      <div style={{ background: D.page, minHeight: "100%", padding: "1.5rem", fontFamily: "inherit" }}>

        {/* Header */}
        <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: D.text, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <CalendarDays size={20} style={{ color: D.cyan }} />
              Consumo Médio Mensal de MP
            </h1>
            <p style={{ fontSize: 13, color: D.muted, margin: "0.25rem 0 0" }}>
              Consumo teórico médio por mês — calculado pelas fórmulas das OPs registradas no período
            </p>
          </div>
          <button
            onClick={exportarCSV}
            disabled={!canExport}
            style={{
              display: "flex", alignItems: "center", gap: "0.375rem",
              padding: "0.5rem 1rem",
              background: D.cyan, color: "#fff",
              border: "none", borderRadius: "0.5rem",
              fontSize: 13, fontWeight: 600,
              cursor: canExport ? "pointer" : "not-allowed",
              opacity: canExport ? 1 : 0.5,
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
                fontSize: 12, fontWeight: 600,
                border: `1px solid ${atalhoAtivo === a.id ? D.cyan : D.border}`,
                background: atalhoAtivo === a.id ? D.cyan : "transparent",
                color: atalhoAtivo === a.id ? "#fff" : D.muted,
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* Date inputs */}
        <div style={{ marginBottom: "1rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => { setDataInicio(e.target.value); setAtalhoAtivo(null); }}
              style={{
                padding: "0.4rem 0.6rem", borderRadius: "0.5rem",
                border: `1px solid ${D.border}`, background: D.card, color: D.text, fontSize: 13,
              }}
            />
            <span style={{ color: D.muted, fontSize: 13 }}>até</span>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => { setDataFim(e.target.value); setAtalhoAtivo(null); }}
              style={{
                padding: "0.4rem 0.6rem", borderRadius: "0.5rem",
                border: `1px solid ${D.border}`, background: D.card, color: D.text, fontSize: 13,
              }}
            />
          </div>
          <button
            onClick={refetch}
            disabled={loading}
            style={{
              padding: "0.4rem 0.9rem", borderRadius: "0.5rem",
              border: `1px solid ${D.border}`, background: D.card, color: D.text,
              fontSize: 13, fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: "0.375rem",
            }}
          >
            {loading && <Loader2 size={13} className="animate-spin" />}
            Calcular
          </button>
          {/* Período em meses (preview) */}
          {dataInicio && dataFim && (
            <span style={{ fontSize: 12, color: D.muted }}>
              ({nMeses} {nMeses === 1 ? "mês" : "meses"} no período)
            </span>
          )}
        </div>

        {/* Aviso de cobertura */}
        {temAviso && aviso && (
          <div style={{
            marginBottom: "1rem", padding: "0.75rem 1rem",
            borderRadius: "0.5rem", background: D.amberBg, border: `1px solid ${D.amberBorder}`,
            display: "flex", alignItems: "flex-start", gap: "0.5rem",
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
            <SummaryCard
              label="Meses no período"
              value={String(nMeses)}
              sub={`${dataInicio.split("-").reverse().slice(1).join("/")} → ${dataFim.split("-").reverse().slice(1).join("/")}`}
            />
            <SummaryCard
              label={buscaAtiva ? "MPs encontradas" : "MPs distintas"}
              value={String(linhasFiltradas.length)}
              highlight={buscaAtiva}
              sub={buscaAtiva ? `Total período: ${resultado.linhas.length}` : undefined}
            />
            <SummaryCard label="OPs consideradas" value={String(resultado.aviso.ops_calculadas)} />
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "3rem", color: D.muted }}>
            <Loader2 size={28} className="animate-spin" />
          </div>
        )}

        {/* Search bar */}
        {!loading && resultado && resultado.linhas.length > 0 && (
          <div style={{ marginBottom: "0.75rem", position: "relative", maxWidth: 360 }}>
            <Search
              size={14}
              style={{
                position: "absolute", left: "0.65rem", top: "50%",
                transform: "translateY(-50%)", color: D.muted, pointerEvents: "none",
              }}
            />
            <input
              ref={buscaRef}
              type="text"
              placeholder="Buscar matéria-prima ou cód. TID…"
              value={buscaMP}
              onChange={(e) => setBuscaMP(e.target.value)}
              style={{
                width: "100%",
                padding: "0.45rem 2rem 0.45rem 2rem",
                borderRadius: "0.5rem",
                border: `1px solid ${buscaAtiva ? D.cyan : D.border}`,
                background: D.card, color: D.text, fontSize: 13,
                outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
              }}
            />
            {buscaAtiva && (
              <button
                onClick={() => { setBuscaMP(""); buscaRef.current?.focus(); }}
                style={{
                  position: "absolute", right: "0.5rem", top: "50%",
                  transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  color: D.muted, padding: "0.1rem", display: "flex",
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        )}

        {/* Table */}
        {!loading && resultado && resultado.linhas.length > 0 && linhasFiltradas.length > 0 && (
          <div style={{ ...makeCardStyle(D), padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: D.cardAlt }}>
                  {["Matéria-Prima", "Cód. TID", `Média Mensal (kg)`, "Nº de OPs"].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        padding: "0.6rem 1rem",
                        textAlign: i === 0 ? "left" : "right",
                        fontWeight: 600, color: D.muted, fontSize: 11,
                        textTransform: "uppercase", letterSpacing: "0.04em",
                        borderBottom: `1px solid ${D.border}`,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhasFiltradas.map((l, i) => {
                  const media = l.total_kg / nMeses;
                  return (
                    <tr
                      key={l.cod_mp ?? l.materia_prima}
                      onClick={() => setModalLinha(l)}
                      style={{
                        background: i % 2 === 0 ? "transparent" : D.cardAlt,
                        cursor: "pointer", transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = dark ? "#374151" : "#e2e8f0")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? "transparent" : D.cardAlt)}
                    >
                      <td style={{ padding: "0.55rem 1rem", color: D.text, fontWeight: 500 }}>
                        {l.materia_prima}
                      </td>
                      <td style={{ padding: "0.55rem 1rem", color: D.muted, textAlign: "right", fontFamily: "monospace" }}>
                        {l.cod_mp ?? "—"}
                      </td>
                      <td style={{ padding: "0.55rem 1rem", color: D.text, textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>
                        {formatKg(media)}
                      </td>
                      <td style={{ padding: "0.55rem 1rem", color: D.muted, textAlign: "right" }}>
                        {l.n_ops}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Busca sem resultado */}
        {!loading && resultado && resultado.linhas.length > 0 && linhasFiltradas.length === 0 && (
          <div style={{ textAlign: "center", color: D.muted, padding: "3rem", fontSize: 14 }}>
            Nenhuma matéria-prima encontrada para <strong style={{ color: D.text }}>"{buscaMP}"</strong>.
          </div>
        )}

        {/* Período sem resultado */}
        {!loading && resultado && resultado.linhas.length === 0 && (
          <div style={{ textAlign: "center", color: D.muted, padding: "3rem", fontSize: 14 }}>
            Nenhum resultado para o período selecionado.
          </div>
        )}

        {!loading && !resultado && (
          <div style={{ textAlign: "center", color: D.muted, padding: "3rem", fontSize: 14 }}>
            Clique em <strong>Calcular</strong> para carregar os dados.
          </div>
        )}

        {/* Footer */}
        <p style={{ marginTop: "1.5rem", fontSize: 11, color: D.muted, fontStyle: "italic" }}>
          * Consumo teórico com base nas fórmulas cadastradas dividido pelo número de meses do período. Não considera perdas, sobras ou ajustes de produção.
        </p>
      </div>

      {/* Modal */}
      {modalLinha && (
        <Modal linha={modalLinha} nMeses={nMeses} onClose={() => setModalLinha(null)} />
      )}
    </PaletteCtx.Provider>
  );
}
