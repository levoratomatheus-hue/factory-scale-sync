import {
  useState, useEffect, useMemo, useCallback, memo,
  createContext, useContext, useRef,
} from "react";
import {
  Loader2, Download, AlertTriangle, X, Recycle, Plus, Trash2,
  ChevronLeft, Check, RotateCcw, Search, Edit2, Info,
} from "lucide-react";
import { formatKg } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

// ── Palette ───────────────────────────────────────────────────────────────────

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
    green:       "#059669",
    greenBg:     dark ? "#06340222" : "#d1fae5",
    greenBorder: dark ? "#065f46" : "#6ee7b7",
    red:         "#dc2626",
    redBg:       dark ? "#7f1d1d22" : "#fee2e2",
    redBorder:   dark ? "#991b1b" : "#fca5a5",
    input:       dark ? "#374151" : "#ffffff",
    inputBorder: dark ? "#4b5563" : "#cbd5e1",
  };
}

type Palette = ReturnType<typeof buildPalette>;
const PaletteCtx = createContext<Palette>(buildPalette(false));

function makeCard(D: Palette, extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: D.card,
    border: `1px solid ${D.border}`,
    borderRadius: "0.75rem",
    padding: "1rem",
    ...extra,
  };
}

function inputStyle(D: Palette, extra?: React.CSSProperties): React.CSSProperties {
  return {
    padding: "0.4rem 0.6rem",
    borderRadius: "0.5rem",
    border: `1px solid ${D.inputBorder}`,
    background: D.input,
    color: D.text,
    fontSize: 13,
    width: "100%",
    boxSizing: "border-box" as const,
    ...extra,
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Reaprov = {
  id: string;
  codigo: string;
  produto_destino: string;
  formula_id_destino: string | null;
  produto_origem: string | null;
  formula_id_origem: string | null;
  quantidade_kg: number;
  quantidade_utilizada: number | null;
  percentual_reaproveitado: number | null;
  status: "pendente" | "utilizado";
  observacao: string | null;
  criado_por: string;
  criado_em: string;
  utilizado_em: string | null;
  utilizado_por: string | null;
};

type ReaprovItem = {
  id: string;
  reaproveitamento_id: string;
  sequencia: number;
  materia_prima: string;
  cod_mp_excel: string | null;
  percentual: number;
  material_reaproveitado: boolean;
};

type ReaprovFull = Reaprov & { itens: ReaprovItem[] };

type ItemForm = {
  _key: string;
  materia_prima: string;
  cod_mp_excel: string | null;
  percentual: string;
};

type MpSug = { cod_excel: string; cod_tid: string | null; descricao: string };
type ProdutoSug = { formula_id: string; produto: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.split("T")[0].split("-").reverse().join("/");
}

/** Produção final = quantidade_utilizada ÷ (percentual_reaproveitado / 100) */
function calcProducaoPrevista(sdr: Pick<Reaprov, "quantidade_kg" | "quantidade_utilizada" | "percentual_reaproveitado">): number | null {
  const qtd = sdr.quantidade_utilizada ?? sdr.quantidade_kg;
  const pct = sdr.percentual_reaproveitado;
  if (!pct || pct <= 0 || !qtd || qtd <= 0) return null;
  return qtd / (pct / 100);
}

function calcProducaoPrevistaForm(qtdUtilizada: number, percReaprov: number): number | null {
  if (!percReaprov || percReaprov <= 0 || !qtdUtilizada || qtdUtilizada <= 0) return null;
  return qtdUtilizada / (percReaprov / 100);
}

let _keyCounter = 0;
function newKey() { return String(++_keyCounter); }

function newItem(): ItemForm {
  return { _key: newKey(), materia_prima: "", cod_mp_excel: null, percentual: "" };
}

// ── SummaryCard ───────────────────────────────────────────────────────────────

const SummaryCard = memo(function SummaryCard({
  label, value, sub, highlight,
}: { label: string; value: string; sub?: string; highlight?: boolean }) {
  const D = useContext(PaletteCtx);
  return (
    <div style={{ ...makeCard(D), outline: highlight ? `2px solid ${D.cyan}` : "none" }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
        {label}
      </p>
      <p style={{ fontSize: 22, fontWeight: 700, color: highlight ? D.cyan : D.text, margin: "0.25rem 0 0" }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 11, color: D.muted, margin: "0.15rem 0 0" }}>{sub}</p>}
    </div>
  );
});

// ── ProdutoInput ──────────────────────────────────────────────────────────────

function ProdutoInput({
  value, formulaId, onChange, disabled,
}: {
  value: string;
  formulaId: string | null;
  onChange: (produto: string, formulaId: string | null) => void;
  disabled?: boolean;
}) {
  const D = useContext(PaletteCtx);
  const [sugestoes, setSugestoes] = useState<ProdutoSug[]>([]);
  const [show, setShow] = useState(false);
  const [loadingSug, setLoadingSug] = useState(false);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setShow(false);
    }
    document.addEventListener("mousedown", onClickOut);
    return () => document.removeEventListener("mousedown", onClickOut);
  }, []);

  function handleChange(v: string) {
    onChange(v, null);
    if (debRef.current) clearTimeout(debRef.current);
    if (v.trim().length < 3) { setSugestoes([]); setShow(false); return; }
    debRef.current = setTimeout(async () => {
      setLoadingSug(true);
      const { data } = await (supabase as any)
        .from("formulas")
        .select("formula_id, produto")
        .ilike("produto", `%${v.trim()}%`)
        .order("produto")
        .limit(20);
      // deduplicate by formula_id
      const seen = new Set<string>();
      const unique: ProdutoSug[] = [];
      for (const r of (data ?? [])) {
        if (!seen.has(r.formula_id)) { seen.add(r.formula_id); unique.push(r); }
      }
      setSugestoes(unique);
      setShow(unique.length > 0);
      setLoadingSug(false);
    }, 300);
  }

  function select(s: ProdutoSug) {
    onChange(s.produto, s.formula_id);
    setSugestoes([]);
    setShow(false);
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => { if (sugestoes.length > 0) setShow(true); }}
        placeholder="Digite o produto (mín. 3 caracteres)…"
        disabled={disabled}
        style={inputStyle(D)}
      />
      {loadingSug && (
        <Loader2 size={12} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: D.muted }} className="animate-spin" />
      )}
      {show && sugestoes.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 100,
          background: D.card, border: `1px solid ${D.border}`, borderRadius: "0.5rem",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)", maxHeight: 200, overflowY: "auto",
        }}>
          {sugestoes.map((s) => (
            <button
              key={s.formula_id}
              type="button"
              onMouseDown={() => select(s)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "0.45rem 0.75rem", fontSize: 13, color: D.text,
                background: "none", border: "none", cursor: "pointer",
                borderBottom: `1px solid ${D.border}`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = D.cardAlt)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <span style={{ fontWeight: 600 }}>{s.produto}</span>
              <span style={{ fontSize: 11, color: D.muted, marginLeft: 6 }}>({s.formula_id})</span>
            </button>
          ))}
        </div>
      )}
      {formulaId && (
        <p style={{ fontSize: 11, color: D.muted, marginTop: 2 }}>fórmula: {formulaId}</p>
      )}
    </div>
  );
}

// ── MpInput ───────────────────────────────────────────────────────────────────

function MpInput({
  materia_prima, cod_mp_excel, onChange, disabled,
}: {
  materia_prima: string;
  cod_mp_excel: string | null;
  onChange: (mp: string, cod: string | null) => void;
  disabled?: boolean;
}) {
  const D = useContext(PaletteCtx);
  const [sugestoes, setSugestoes] = useState<MpSug[]>([]);
  const [show, setShow] = useState(false);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setShow(false);
    }
    document.addEventListener("mousedown", onClickOut);
    return () => document.removeEventListener("mousedown", onClickOut);
  }, []);

  function handleChange(v: string) {
    onChange(v, null);
    if (debRef.current) clearTimeout(debRef.current);
    if (v.trim().length < 2) { setSugestoes([]); setShow(false); return; }
    debRef.current = setTimeout(async () => {
      const { data } = await (supabase as any)
        .from("mp_depara")
        .select("cod_excel, cod_tid, descricao")
        .or(`descricao.ilike.%${v.trim()}%,cod_excel.ilike.%${v.trim()}%`)
        .order("descricao")
        .limit(15);
      setSugestoes(data ?? []);
      setShow((data ?? []).length > 0);
    }, 250);
  }

  function select(s: MpSug) {
    onChange(s.descricao, s.cod_excel);
    setSugestoes([]);
    setShow(false);
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        type="text"
        value={materia_prima}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => { if (sugestoes.length > 0) setShow(true); }}
        placeholder="Nome ou código (texto livre aceito)"
        disabled={disabled}
        style={inputStyle(D, { fontSize: 12 })}
      />
      {show && sugestoes.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, zIndex: 100,
          background: D.card, border: `1px solid ${D.border}`, borderRadius: "0.5rem",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)", maxHeight: 180, overflowY: "auto",
        }}>
          {sugestoes.map((s) => (
            <button
              key={s.cod_excel}
              type="button"
              onMouseDown={() => select(s)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "0.35rem 0.6rem", fontSize: 12, color: D.text,
                background: "none", border: "none", cursor: "pointer",
                borderBottom: `1px solid ${D.border}`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = D.cardAlt)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <span style={{ fontWeight: 500 }}>{s.descricao}</span>
              <span style={{ fontSize: 10, color: D.muted, marginLeft: 6 }}>
                {s.cod_excel}{s.cod_tid ? ` · ${s.cod_tid}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── DetalheModal ──────────────────────────────────────────────────────────────

const DetalheModal = memo(function DetalheModal({
  sdr,
  onClose,
  onMarcar,
  onDesfazer,
  onEditar,
  onExcluir,
  saving,
}: {
  sdr: ReaprovFull;
  onClose: () => void;
  onMarcar: (id: string) => void;
  onDesfazer: (id: string) => void;
  onEditar: (sdr: ReaprovFull) => void;
  onExcluir: (id: string) => void;
  saving: boolean;
}) {
  const D = useContext(PaletteCtx);
  const producao = calcProducaoPrevista(sdr);
  const usandoParte = sdr.quantidade_utilizada !== null && sdr.quantidade_utilizada < sdr.quantidade_kg;
  const qtdUtil = sdr.quantidade_utilizada ?? sdr.quantidade_kg;
  const somaItens = sdr.itens.reduce((s, i) => s + i.percentual, 0);
  const somaTotal = (sdr.percentual_reaproveitado ?? 0) + somaItens;

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
      onClick={onClose}
    >
      <div
        style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: "1rem", width: "100%", maxWidth: 640, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${D.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: D.text, margin: 0 }}>{sdr.codigo}</p>
              <StatusBadgeInline status={sdr.status} />
            </div>
            {sdr.produto_origem && (
              <p style={{ fontSize: 12, color: D.muted, margin: "0.2rem 0 0" }}>
                <span style={{ fontWeight: 600, color: D.text }}>Origem:</span> {sdr.produto_origem}
                {sdr.formula_id_origem && <span style={{ fontSize: 10, color: D.muted, marginLeft: 4 }}>({sdr.formula_id_origem})</span>}
              </p>
            )}
            <p style={{ fontSize: 13, color: D.text, margin: "0.2rem 0 0", fontWeight: 500 }}>
              <span style={{ fontSize: 11, color: D.muted, fontWeight: 400 }}>Destino: </span>{sdr.produto_destino}
            </p>
            {sdr.formula_id_destino && <p style={{ fontSize: 11, color: D.muted, margin: "0.1rem 0 0" }}>Fórmula destino: {sdr.formula_id_destino}</p>}
            <p style={{ fontSize: 11, color: D.muted, margin: "0.25rem 0 0" }}>
              Material: <strong style={{ color: D.text }}>
                {usandoParte ? `${formatKg(qtdUtil)} de ${formatKg(sdr.quantidade_kg)}` : formatKg(sdr.quantidade_kg)}
              </strong>
              {sdr.percentual_reaproveitado && (
                <> · entra a <strong style={{ color: D.text }}>{sdr.percentual_reaproveitado}%</strong></>
              )}
              {producao !== null && <> · Produção prevista: <strong style={{ color: D.text }}>{formatKg(producao)}</strong></>}
            </p>
            <p style={{ fontSize: 11, color: D.muted, margin: "0.1rem 0 0" }}>
              Criado por {sdr.criado_por} em {fmtDate(sdr.criado_em)}
              {sdr.utilizado_em && <> · Utilizado por {sdr.utilizado_por} em {fmtDate(sdr.utilizado_em)}</>}
            </p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: D.muted, padding: "0.25rem", flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        {/* Table */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: D.cardAlt }}>
                {["Matéria-prima", "Cód.", "%", "kg", ""].map((h, i) => (
                  <th key={i} style={{ padding: "0.5rem 0.75rem", textAlign: i >= 2 ? "right" : "left", fontWeight: 600, color: D.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${D.border}` }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Linha do material reaproveitado */}
              {sdr.percentual_reaproveitado != null && (
                <tr style={{ background: D.amberBg }}>
                  <td style={{ padding: "0.45rem 0.75rem", color: D.amber, fontWeight: 600 }}>
                    Material reaproveitado
                    <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: D.amber, padding: "1px 5px", borderRadius: 4, border: `1px solid ${D.amberBorder}` }}>REAPR.</span>
                  </td>
                  <td style={{ padding: "0.45rem 0.75rem", color: D.muted, fontFamily: "monospace", fontSize: 11 }}>—</td>
                  <td style={{ padding: "0.45rem 0.75rem", textAlign: "right", color: D.amber, fontFamily: "monospace", fontWeight: 700 }}>{sdr.percentual_reaproveitado.toFixed(2)}%</td>
                  <td style={{ padding: "0.45rem 0.75rem", textAlign: "right", color: D.amber, fontFamily: "monospace", fontWeight: 600 }}>{formatKg(qtdUtil)}</td>
                  <td style={{ padding: "0.45rem 0.75rem", width: 20 }} />
                </tr>
              )}
              {sdr.itens.sort((a, b) => a.sequencia - b.sequencia).map((item, i) => {
                const kgItem = producao !== null ? (item.percentual / 100) * producao : null;
                return (
                  <tr key={item.id} style={{ background: i % 2 === 0 ? "transparent" : D.cardAlt }}>
                    <td style={{ padding: "0.45rem 0.75rem", color: D.text }}>{item.materia_prima}</td>
                    <td style={{ padding: "0.45rem 0.75rem", color: D.muted, fontFamily: "monospace", fontSize: 11 }}>{item.cod_mp_excel ?? "—"}</td>
                    <td style={{ padding: "0.45rem 0.75rem", textAlign: "right", color: D.text, fontFamily: "monospace" }}>{item.percentual.toFixed(2)}%</td>
                    <td style={{ padding: "0.45rem 0.75rem", textAlign: "right", color: D.text, fontFamily: "monospace", fontWeight: 600 }}>
                      {kgItem !== null ? formatKg(kgItem) : "—"}
                    </td>
                    <td style={{ padding: "0.45rem 0.75rem", width: 20 }} />
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: D.cardAlt }}>
                <td colSpan={2} style={{ padding: "0.45rem 0.75rem", fontWeight: 600, color: D.muted, fontSize: 12 }}>Total</td>
                <td style={{ padding: "0.45rem 0.75rem", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: Math.abs(somaTotal - 100) > 0.1 ? D.amber : D.green }}>
                  {somaTotal.toFixed(2)}%
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>

          {sdr.observacao && (
            <div style={{ padding: "0.75rem 1rem", borderTop: `1px solid ${D.border}` }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: D.muted, textTransform: "uppercase", margin: "0 0 0.25rem" }}>Observação</p>
              <p style={{ fontSize: 13, color: D.text, margin: 0, whiteSpace: "pre-wrap" }}>{sdr.observacao}</p>
            </div>
          )}
        </div>

        {/* Actions footer */}
        <div style={{ padding: "0.75rem 1rem", borderTop: `1px solid ${D.border}`, display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {sdr.status === "pendente" ? (
            <button
              onClick={() => onMarcar(sdr.id)}
              disabled={saving}
              style={{ display: "flex", alignItems: "center", gap: "0.375rem", padding: "0.45rem 1rem", background: D.green, color: "#fff", border: "none", borderRadius: "0.5rem", fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Marcar como utilizado
            </button>
          ) : (
            <button
              onClick={() => onDesfazer(sdr.id)}
              disabled={saving}
              style={{ display: "flex", alignItems: "center", gap: "0.375rem", padding: "0.45rem 1rem", background: D.cardAlt, color: D.text, border: `1px solid ${D.border}`, borderRadius: "0.5rem", fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}
            >
              <RotateCcw size={13} />
              Desfazer utilização
            </button>
          )}
          <button
            onClick={() => onEditar(sdr)}
            style={{ display: "flex", alignItems: "center", gap: "0.375rem", padding: "0.45rem 1rem", background: D.cardAlt, color: D.text, border: `1px solid ${D.border}`, borderRadius: "0.5rem", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            <Edit2 size={13} />
            {sdr.status === "utilizado" ? "Editar observação" : "Editar"}
          </button>
          {sdr.status === "pendente" && (
            <button
              onClick={() => onExcluir(sdr.id)}
              disabled={saving}
              style={{ display: "flex", alignItems: "center", gap: "0.375rem", padding: "0.45rem 1rem", background: D.redBg, color: D.red, border: `1px solid ${D.redBorder}`, borderRadius: "0.5rem", fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}
            >
              <Trash2 size={13} />
              Excluir
            </button>
          )}
          <button
            onClick={onClose}
            style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.25rem", padding: "0.45rem 0.9rem", background: "none", color: D.muted, border: `1px solid ${D.border}`, borderRadius: "0.5rem", fontSize: 13, cursor: "pointer" }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
});

// ── StatusBadgeInline ─────────────────────────────────────────────────────────

function StatusBadgeInline({ status }: { status: "pendente" | "utilizado" }) {
  const D = useContext(PaletteCtx);
  const isUtilizado = status === "utilizado";
  return (
    <span style={{
      display: "inline-block",
      padding: "0.15rem 0.6rem",
      borderRadius: "9999px",
      fontSize: 11,
      fontWeight: 700,
      background: isUtilizado ? D.greenBg : D.amberBg,
      color: isUtilizado ? D.green : D.amber,
      border: `1px solid ${isUtilizado ? D.greenBorder : D.amberBorder}`,
      textTransform: "uppercase",
      letterSpacing: "0.03em",
    }}>
      {isUtilizado ? "Utilizado" : "Pendente"}
    </span>
  );
}

// ── ResultPanel ───────────────────────────────────────────────────────────────

function ResultPanel({ qtdUtilizada, percReaproveitado, itens }: { qtdUtilizada: number; percReaproveitado: number; itens: ItemForm[] }) {
  const D = useContext(PaletteCtx);
  const somaItens = itens.reduce((s, i) => s + (parseFloat(i.percentual) || 0), 0);
  const somaTotal = percReaproveitado + somaItens;
  const producao = calcProducaoPrevistaForm(qtdUtilizada, percReaproveitado);
  const diffPerc = Math.abs(somaTotal - 100);
  const naoFecha = somaTotal > 0 && diffPerc > 0.1;

  return (
    <div style={{ ...makeCard(D, { marginTop: "1rem" }) }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 0.5rem" }}>
        Resultado em tempo real
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem" }}>
        <div>
          <p style={{ fontSize: 11, color: D.muted, margin: 0 }}>Produção final prevista</p>
          <p style={{ fontSize: 20, fontWeight: 700, color: D.cyan, margin: "0.1rem 0 0" }}>
            {producao !== null ? formatKg(producao) : "—"}
          </p>
          {producao !== null && (
            <p style={{ fontSize: 11, color: D.muted, margin: "0.1rem 0 0" }}>
              {formatKg(qtdUtilizada)} ÷ {percReaproveitado}%
            </p>
          )}
        </div>
        <div>
          <p style={{ fontSize: 11, color: D.muted, margin: 0 }}>Soma total (reapr. + itens)</p>
          <p style={{ fontSize: 20, fontWeight: 700, color: naoFecha ? D.amber : D.green, margin: "0.1rem 0 0" }}>
            {somaTotal.toFixed(2)}%
          </p>
          {naoFecha && (
            <p style={{ fontSize: 11, color: D.amber, margin: "0.1rem 0 0", display: "flex", alignItems: "center", gap: 3 }}>
              <AlertTriangle size={11} /> {diffPerc.toFixed(2)}% de diferença para 100%
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Reaproveitamento({ perfilNome }: { perfilNome: string }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  const D = buildPalette(dark);

  // ── List state ──────────────────────────────────────────────────────────────
  const [lista, setLista] = useState<ReaprovFull[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState<"pendentes" | "utilizados" | "todos">("pendentes");
  const [busca, setBusca] = useState("");
  const [detalhe, setDetalhe] = useState<ReaprovFull | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [view, setView] = useState<"list" | "form">("list");
  const [editando, setEditando] = useState<ReaprovFull | null>(null); // null = novo
  const [fProdutoOrigem, setFProdutoOrigem] = useState("");
  const [fFormulaIdOrigem, setFFormulaIdOrigem] = useState<string | null>(null);
  const [fProdutoDestino, setFProdutoDestino] = useState("");
  const [fFormulaIdDestino, setFFormulaIdDestino] = useState<string | null>(null);
  const [fQtdKg, setFQtdKg] = useState("");
  const [fUsoOpcao, setFUsoOpcao] = useState<"tudo" | "parte">("tudo");
  const [fQtdUtilizada, setFQtdUtilizada] = useState("");
  const [fPercReaprov, setFPercReaprov] = useState("");
  const [fObs, setFObs] = useState("");
  const [fItens, setFItens] = useState<ItemForm[]>([newItem()]);
  const [formSaving, setFormSaving] = useState(false);

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchLista = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("reaproveitamentos")
      .select("*, reaproveitamentos_itens(*)")
      .order("criado_em", { ascending: false });
    if (error) { toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" }); }
    else {
      setLista((data ?? []).map((r: any) => ({ ...r, itens: r.reaproveitamentos_itens ?? [] })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchLista(); }, [fetchLista]);

  // ── Filtered list ───────────────────────────────────────────────────────────
  const listaFiltrada = useMemo(() => {
    let l = lista;
    if (filtro === "pendentes") l = l.filter((r) => r.status === "pendente");
    else if (filtro === "utilizados") l = l.filter((r) => r.status === "utilizado");
    const q = busca.trim().toLowerCase();
    if (q) l = l.filter((r) =>
      r.codigo.toLowerCase().includes(q) ||
      r.produto_destino.toLowerCase().includes(q) ||
      (r.produto_origem ?? "").toLowerCase().includes(q),
    );
    return l;
  }, [lista, filtro, busca]);

  const resumo = useMemo(() => {
    const pendentes = lista.filter((r) => r.status === "pendente");
    return {
      qtdPendentes: pendentes.length,
      kgPendentes: pendentes.reduce((s, r) => s + r.quantidade_kg, 0),
    };
  }, [lista]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleMarcar = useCallback(async (id: string) => {
    setSaving(true);
    const { error } = await (supabase as any)
      .from("reaproveitamentos")
      .update({ status: "utilizado", utilizado_em: new Date().toISOString(), utilizado_por: perfilNome })
      .eq("id", id);
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Marcado como utilizado" });
    setDetalhe(null);
    fetchLista();
  }, [perfilNome, fetchLista]);

  const handleDesfazer = useCallback(async (id: string) => {
    setSaving(true);
    const { error } = await (supabase as any)
      .from("reaproveitamentos")
      .update({ status: "pendente", utilizado_em: null, utilizado_por: null })
      .eq("id", id);
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Utilização desfeita — SDR voltou para pendente" });
    setDetalhe(null);
    fetchLista();
  }, [fetchLista]);

  const handleExcluir = useCallback(async (id: string) => {
    if (!window.confirm("Excluir este SDR e todos os seus itens?")) return;
    setSaving(true);
    const { error } = await (supabase as any).from("reaproveitamentos").delete().eq("id", id);
    setSaving(false);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); return; }
    toast({ title: "SDR excluído" });
    setDetalhe(null);
    fetchLista();
  }, [fetchLista]);

  // ── Open form ────────────────────────────────────────────────────────────────
  function abrirNovo() {
    setEditando(null);
    setFProdutoOrigem(""); setFFormulaIdOrigem(null);
    setFProdutoDestino(""); setFFormulaIdDestino(null);
    setFQtdKg(""); setFUsoOpcao("tudo"); setFQtdUtilizada(""); setFPercReaprov(""); setFObs("");
    setFItens([newItem()]);
    setView("form");
  }

  function abrirEditar(sdr: ReaprovFull) {
    setDetalhe(null);
    setEditando(sdr);
    setFProdutoOrigem(sdr.produto_origem ?? "");
    setFFormulaIdOrigem(sdr.formula_id_origem ?? null);
    setFProdutoDestino(sdr.produto_destino);
    setFFormulaIdDestino(sdr.formula_id_destino ?? null);
    setFQtdKg(String(sdr.quantidade_kg));
    const parcial = sdr.quantidade_utilizada !== null && sdr.quantidade_utilizada < sdr.quantidade_kg;
    setFUsoOpcao(parcial ? "parte" : "tudo");
    setFQtdUtilizada(sdr.quantidade_utilizada !== null ? String(sdr.quantidade_utilizada) : "");
    setFPercReaprov(sdr.percentual_reaproveitado !== null ? String(sdr.percentual_reaproveitado) : "");
    setFObs(sdr.observacao ?? "");
    setFItens(
      sdr.itens.sort((a, b) => a.sequencia - b.sequencia).map((i) => ({
        _key: newKey(),
        materia_prima: i.materia_prima,
        cod_mp_excel: i.cod_mp_excel,
        percentual: String(i.percentual),
      }))
    );
    setView("form");
  }

  // ── Save form ────────────────────────────────────────────────────────────────
  async function handleSalvar() {
    const qtd = parseFloat(fQtdKg);
    const percReaprov = parseFloat(fPercReaprov);
    const qtdUtil = fUsoOpcao === "parte" ? parseFloat(fQtdUtilizada) : qtd;

    if (!fProdutoDestino.trim()) { toast({ title: "Informe o produto de destino", variant: "destructive" }); return; }
    if (!qtd || qtd <= 0) { toast({ title: "Quantidade de material inválida", variant: "destructive" }); return; }
    if (!percReaprov || percReaprov <= 0 || percReaprov > 100) { toast({ title: "Percentual na fórmula deve ser maior que 0 e até 100", variant: "destructive" }); return; }
    if (fUsoOpcao === "parte") {
      if (!qtdUtil || qtdUtil <= 0) { toast({ title: "Informe a quantidade a utilizar", variant: "destructive" }); return; }
      if (qtdUtil > qtd) { toast({ title: "Quantidade a utilizar não pode ser maior que o total", variant: "destructive" }); return; }
    }
    if (fItens.length === 0) { toast({ title: "Adicione pelo menos um item à fórmula", variant: "destructive" }); return; }
    const itensComErro = fItens.filter((i) => !i.materia_prima.trim() || !parseFloat(i.percentual) || parseFloat(i.percentual) <= 0);
    if (itensComErro.length > 0) { toast({ title: "Todos os itens precisam de nome e percentual maior que zero", variant: "destructive" }); return; }

    // Utilizado: só salva observação
    if (editando?.status === "utilizado") {
      setFormSaving(true);
      const { error } = await (supabase as any)
        .from("reaproveitamentos")
        .update({ observacao: fObs.trim() || null })
        .eq("id", editando.id);
      setFormSaving(false);
      if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Observação atualizada" });
      setView("list");
      fetchLista();
      return;
    }

    const headerPayload = {
      produto_destino: fProdutoDestino.trim(),
      formula_id_destino: fFormulaIdDestino ?? null,
      produto_origem: fProdutoOrigem.trim() || null,
      formula_id_origem: fFormulaIdOrigem ?? null,
      quantidade_kg: qtd,
      quantidade_utilizada: qtdUtil,
      percentual_reaproveitado: percReaprov,
      observacao: fObs.trim() || null,
    };

    const buildItens = (reaprovId: string) => fItens.map((it, idx) => ({
      reaproveitamento_id: reaprovId,
      sequencia: idx + 1,
      materia_prima: it.materia_prima.trim(),
      cod_mp_excel: it.cod_mp_excel ?? null,
      percentual: parseFloat(it.percentual),
      material_reaproveitado: false,
    }));

    setFormSaving(true);
    if (editando) {
      const { error: errH } = await (supabase as any)
        .from("reaproveitamentos")
        .update(headerPayload)
        .eq("id", editando.id);
      if (errH) { setFormSaving(false); toast({ title: "Erro ao salvar", description: errH.message, variant: "destructive" }); return; }
      await (supabase as any).from("reaproveitamentos_itens").delete().eq("reaproveitamento_id", editando.id);
      const { error: errI } = await (supabase as any).from("reaproveitamentos_itens").insert(buildItens(editando.id));
      setFormSaving(false);
      if (errI) { toast({ title: "Cabeçalho salvo mas erro nos itens", description: errI.message, variant: "destructive" }); return; }
      toast({ title: `${editando.codigo} atualizado` });
    } else {
      const { data: newRec, error: errH } = await (supabase as any)
        .from("reaproveitamentos")
        .insert({ ...headerPayload, criado_por: perfilNome })
        .select("id, codigo")
        .single();
      if (errH) { setFormSaving(false); toast({ title: "Erro ao criar SDR", description: errH.message, variant: "destructive" }); return; }
      const { error: errI } = await (supabase as any).from("reaproveitamentos_itens").insert(buildItens(newRec.id));
      setFormSaving(false);
      if (errI) { toast({ title: `${newRec.codigo} criado mas erro nos itens`, description: errI.message, variant: "destructive" }); return; }
      toast({ title: `${newRec.codigo} criado com sucesso!` });
    }
    setView("list");
    fetchLista();
  }

  // ── CSV export ───────────────────────────────────────────────────────────────
  function exportarCSV() {
    if (listaFiltrada.length === 0) return;
    const header = "Código;Produto origem;Fórmula origem;Produto destino;Fórmula destino;Material total (kg);Qtd. utilizada (kg);% na fórmula;Produção prevista (kg);Status;Criado por;Criado em;Utilizado por;Utilizado em";
    const rows = listaFiltrada.map((r) => {
      const prod = calcProducaoPrevista(r);
      const qtdUtil = r.quantidade_utilizada ?? r.quantidade_kg;
      return [
        r.codigo,
        `"${(r.produto_origem ?? "").replace(/"/g, '""')}"`,
        r.formula_id_origem ?? "",
        `"${r.produto_destino.replace(/"/g, '""')}"`,
        r.formula_id_destino ?? "",
        r.quantidade_kg.toFixed(3).replace(".", ","),
        qtdUtil.toFixed(3).replace(".", ","),
        r.percentual_reaproveitado !== null ? String(r.percentual_reaproveitado).replace(".", ",") : "",
        prod !== null ? prod.toFixed(3).replace(".", ",") : "",
        r.status,
        r.criado_por,
        fmtDate(r.criado_em),
        r.utilizado_por ?? "",
        fmtDate(r.utilizado_em),
      ].join(";");
    });
    const csv = "\ufeff" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `reaproveitamentos_${filtro}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Item helpers ─────────────────────────────────────────────────────────────
  function addItem() { setFItens((prev) => [...prev, newItem()]); }

  function removeItem(key: string) { setFItens((prev) => prev.filter((i) => i._key !== key)); }

  function updateItem(key: string, patch: Partial<ItemForm>) {
    setFItens((prev) => prev.map((i) => i._key === key ? { ...i, ...patch } : i));
  }

  const qtdNum = parseFloat(fQtdKg) || 0;
  const qtdUtilNum = fUsoOpcao === "parte" ? (parseFloat(fQtdUtilizada) || 0) : qtdNum;
  const percReaprovNum = parseFloat(fPercReaprov) || 0;
  const isUtilizadoEdit = editando?.status === "utilizado";

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <PaletteCtx.Provider value={D}>
      <div style={{ background: D.page, minHeight: "100%", padding: "1.5rem", fontFamily: "inherit" }}>

        {/* ── FORM VIEW ─────────────────────────────────────────────────────── */}
        {view === "form" && (
          <>
            {/* Form header */}
            <div style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <button
                onClick={() => setView("list")}
                style={{ display: "flex", alignItems: "center", gap: "0.25rem", background: "none", border: "none", cursor: "pointer", color: D.muted, fontSize: 13, padding: 0 }}
              >
                <ChevronLeft size={16} /> Voltar
              </button>
              <h1 style={{ fontSize: "1.1rem", fontWeight: 700, color: D.text, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Recycle size={18} style={{ color: D.cyan }} />
                {editando ? `Editar ${editando.codigo}` : "Novo Reaproveitamento"}
              </h1>
              {!editando && (
                <span style={{ fontSize: 12, color: D.muted, background: D.cardAlt, padding: "0.2rem 0.6rem", borderRadius: 6, border: `1px solid ${D.border}` }}>
                  Código: gerado automaticamente
                </span>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem", maxWidth: 760 }}>

              {/* Produto de origem (opcional) */}
              <div style={makeCard(D)}>
                <p style={{ fontSize: 11, fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 0.25rem" }}>
                  Produto de origem <span style={{ fontSize: 10, fontWeight: 400, textTransform: "none" }}>(opcional)</span>
                </p>
                <p style={{ fontSize: 11, color: D.muted, margin: "0 0 0.5rem" }}>Produto do qual o material é proveniente</p>
                {isUtilizadoEdit ? (
                  <p style={{ fontSize: 14, color: D.text, margin: 0 }}>{fProdutoOrigem || <span style={{ color: D.muted, fontStyle: "italic" }}>Não informado</span>}</p>
                ) : (
                  <ProdutoInput value={fProdutoOrigem} formulaId={fFormulaIdOrigem} onChange={(p, f) => { setFProdutoOrigem(p); setFFormulaIdOrigem(f); }} />
                )}
              </div>

              {/* Produto de destino */}
              <div style={makeCard(D)}>
                <p style={{ fontSize: 11, fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 0.25rem" }}>Produto de destino</p>
                <p style={{ fontSize: 11, color: D.muted, margin: "0 0 0.5rem" }}>Produto que será produzido com este material reaproveitado</p>
                {isUtilizadoEdit ? (
                  <p style={{ fontSize: 14, color: D.text, margin: 0 }}>{fProdutoDestino}</p>
                ) : (
                  <ProdutoInput value={fProdutoDestino} formulaId={fFormulaIdDestino} onChange={(p, f) => { setFProdutoDestino(p); setFFormulaIdDestino(f); }} />
                )}
              </div>

              {/* Quantidade + uso parcial + percentual */}
              <div style={makeCard(D)}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", alignItems: "start" }}>
                  {/* Quantidade total */}
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 0.5rem" }}>Quantidade total de material (kg)</p>
                    {isUtilizadoEdit ? (
                      <p style={{ fontSize: 14, color: D.text, margin: 0 }}>{formatKg(parseFloat(fQtdKg) || 0)}</p>
                    ) : (
                      <input
                        type="number" min="0.001" step="0.001"
                        value={fQtdKg}
                        onChange={(e) => setFQtdKg(e.target.value)}
                        placeholder="Ex.: 500.000"
                        style={inputStyle(D, { maxWidth: 200 })}
                      />
                    )}
                  </div>
                  {/* Percentual na fórmula */}
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 0.5rem" }}>Entra na fórmula a (%)</p>
                    {isUtilizadoEdit ? (
                      <p style={{ fontSize: 14, color: D.text, margin: 0 }}>{fPercReaprov}%</p>
                    ) : (
                      <input
                        type="number" min="0.001" max="100" step="0.001"
                        value={fPercReaprov}
                        onChange={(e) => setFPercReaprov(e.target.value)}
                        placeholder="Ex.: 20"
                        style={inputStyle(D, { maxWidth: 120 })}
                      />
                    )}
                  </div>
                </div>

                {/* Opção de uso */}
                {!isUtilizadoEdit && (
                  <div style={{ marginTop: "0.75rem" }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 0.4rem" }}>Opção de uso</p>
                    <div style={{ display: "flex", gap: "1rem" }}>
                      {(["tudo", "parte"] as const).map((op) => (
                        <label key={op} style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: 13, color: D.text }}>
                          <input
                            type="radio" name="uso_opcao"
                            checked={fUsoOpcao === op}
                            onChange={() => setFUsoOpcao(op)}
                            style={{ accentColor: D.cyan, width: 15, height: 15 }}
                          />
                          {op === "tudo" ? "Usar tudo" : "Usar parte"}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quantidade a utilizar (quando parte) */}
                {fUsoOpcao === "parte" && (
                  <div style={{ marginTop: "0.75rem" }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 0.4rem" }}>Quantidade a utilizar (kg)</p>
                    {isUtilizadoEdit ? (
                      <p style={{ fontSize: 14, color: D.text, margin: 0 }}>{formatKg(parseFloat(fQtdUtilizada) || 0)} de {formatKg(parseFloat(fQtdKg) || 0)}</p>
                    ) : (
                      <input
                        type="number" min="0.001" step="0.001"
                        value={fQtdUtilizada}
                        onChange={(e) => setFQtdUtilizada(e.target.value)}
                        placeholder="Menor ou igual ao total"
                        style={inputStyle(D, { maxWidth: 200, borderColor: (parseFloat(fQtdUtilizada) > parseFloat(fQtdKg)) ? D.red : D.inputBorder })}
                      />
                    )}
                    {parseFloat(fQtdUtilizada) > parseFloat(fQtdKg) && (
                      <p style={{ fontSize: 11, color: D.red, marginTop: 4, display: "flex", alignItems: "center", gap: 3 }}>
                        <AlertTriangle size={11} /> Não pode ser maior que o total ({formatKg(parseFloat(fQtdKg) || 0)})
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Fórmula */}
              <div style={makeCard(D, { padding: 0, overflow: "hidden" })}>
                <div style={{ padding: "0.75rem 1rem", borderBottom: `1px solid ${D.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>Fórmula do reaproveitamento</p>
                  {!isUtilizadoEdit && (
                    <button
                      onClick={addItem}
                      style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.3rem 0.7rem", background: D.cyan, color: "#fff", border: "none", borderRadius: "0.4rem", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                    >
                      <Plus size={12} /> Adicionar item
                    </button>
                  )}
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: D.cardAlt }}>
                        <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, color: D.muted, fontSize: 11, textTransform: "uppercase" }}>Matéria-prima adicional</th>
                        <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600, color: D.muted, fontSize: 11, textTransform: "uppercase", width: 90 }}>%</th>
                        <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600, color: D.muted, fontSize: 11, textTransform: "uppercase", width: 110 }}>kg (calc.)</th>
                        {!isUtilizadoEdit && <th style={{ width: 36 }} />}
                      </tr>
                    </thead>
                    <tbody>
                      {fItens.map((item, i) => {
                        const pct = parseFloat(item.percentual) || 0;
                        const producao = calcProducaoPrevistaForm(qtdUtilNum, percReaprovNum);
                        const kgCalc = producao !== null && pct > 0 ? (pct / 100) * producao : null;
                        return (
                          <tr key={item._key} style={{ background: i % 2 === 0 ? "transparent" : D.cardAlt, borderBottom: `1px solid ${D.border}` }}>
                            <td style={{ padding: "0.4rem 0.6rem", minWidth: 220 }}>
                              {isUtilizadoEdit ? (
                                <span style={{ color: D.text }}>{item.materia_prima}</span>
                              ) : (
                                <MpInput
                                  materia_prima={item.materia_prima}
                                  cod_mp_excel={item.cod_mp_excel}
                                  onChange={(mp, cod) => updateItem(item._key, { materia_prima: mp, cod_mp_excel: cod })}
                                />
                              )}
                            </td>
                            <td style={{ padding: "0.4rem 0.6rem" }}>
                              {isUtilizadoEdit ? (
                                <span style={{ color: D.text, display: "block", textAlign: "right" }}>{item.percentual}%</span>
                              ) : (
                                <input
                                  type="number" min="0.001" step="0.001"
                                  value={item.percentual}
                                  onChange={(e) => updateItem(item._key, { percentual: e.target.value })}
                                  style={inputStyle(D, { textAlign: "right", width: 80 })}
                                />
                              )}
                            </td>
                            <td style={{ padding: "0.4rem 0.6rem", textAlign: "right", fontFamily: "monospace", color: D.text, fontWeight: 600 }}>
                              {kgCalc !== null ? formatKg(kgCalc) : "—"}
                            </td>
                            {!isUtilizadoEdit && (
                              <td style={{ padding: "0.4rem 0.3rem" }}>
                                <button
                                  onClick={() => removeItem(item._key)}
                                  style={{ background: "none", border: "none", cursor: "pointer", color: D.muted, padding: "0.2rem", display: "flex", borderRadius: "0.25rem" }}
                                  onMouseEnter={(e) => (e.currentTarget.style.color = D.red)}
                                  onMouseLeave={(e) => (e.currentTarget.style.color = D.muted)}
                                  title="Remover item"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {!isUtilizadoEdit && fItens.length === 0 && (
                  <p style={{ padding: "1.5rem", textAlign: "center", color: D.muted, fontSize: 13 }}>
                    Nenhum item. Clique em "Adicionar item".
                  </p>
                )}
              </div>

              {/* Result panel — only show when there are items */}
              {!isUtilizadoEdit && percReaprovNum > 0 && qtdUtilNum > 0 && (
                <ResultPanel qtdUtilizada={qtdUtilNum} percReaproveitado={percReaprovNum} itens={fItens} />
              )}

              {/* Observação */}
              <div style={makeCard(D)}>
                <p style={{ fontSize: 11, fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 0.5rem" }}>Observação (opcional)</p>
                <textarea
                  value={fObs}
                  onChange={(e) => setFObs(e.target.value)}
                  rows={3}
                  placeholder="Notas adicionais sobre este reaproveitamento…"
                  style={{ ...inputStyle(D), resize: "vertical" }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "0.5rem", paddingBottom: "1rem" }}>
                <button
                  onClick={handleSalvar}
                  disabled={formSaving}
                  style={{ display: "flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1.25rem", background: D.cyan, color: "#fff", border: "none", borderRadius: "0.5rem", fontSize: 13, fontWeight: 600, cursor: formSaving ? "not-allowed" : "pointer", opacity: formSaving ? 0.6 : 1 }}
                >
                  {formSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  {isUtilizadoEdit ? "Salvar observação" : editando ? "Salvar alterações" : "Criar SDR"}
                </button>
                <button
                  onClick={() => setView("list")}
                  style={{ padding: "0.5rem 1rem", background: D.cardAlt, color: D.text, border: `1px solid ${D.border}`, borderRadius: "0.5rem", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── LIST VIEW ─────────────────────────────────────────────────────── */}
        {view === "list" && (
          <>
            {/* Header */}
            <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
              <div>
                <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: D.text, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Recycle size={20} style={{ color: D.cyan }} />
                  Reaproveitamento de Material
                </h1>
                <p style={{ fontSize: 13, color: D.muted, margin: "0.25rem 0 0" }}>
                  SDRs — controle de material parado aguardando reaproveitamento
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  onClick={exportarCSV}
                  disabled={listaFiltrada.length === 0}
                  style={{ display: "flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1rem", background: D.cardAlt, color: D.text, border: `1px solid ${D.border}`, borderRadius: "0.5rem", fontSize: 13, fontWeight: 600, cursor: listaFiltrada.length === 0 ? "not-allowed" : "pointer", opacity: listaFiltrada.length === 0 ? 0.5 : 1 }}
                >
                  <Download size={14} /> Exportar CSV
                </button>
                <button
                  onClick={abrirNovo}
                  style={{ display: "flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1rem", background: D.cyan, color: "#fff", border: "none", borderRadius: "0.5rem", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  <Plus size={14} /> Novo SDR
                </button>
              </div>
            </div>

            {/* Summary cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem", marginBottom: "1.25rem" }}>
              <SummaryCard label="SDRs pendentes" value={String(resumo.qtdPendentes)} highlight />
              <SummaryCard label="Material em espera" value={formatKg(resumo.kgPendentes)} sub="soma dos SDRs pendentes" />
              <SummaryCard label="Total de SDRs" value={String(lista.length)} />
            </div>

            {/* Filtros */}
            <div style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              {(["pendentes", "utilizados", "todos"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltro(f)}
                  style={{
                    padding: "0.3rem 0.9rem", borderRadius: "9999px", fontSize: 12, fontWeight: 600,
                    border: `1px solid ${filtro === f ? D.cyan : D.border}`,
                    background: filtro === f ? D.cyan : "transparent",
                    color: filtro === f ? "#fff" : D.muted,
                    cursor: "pointer", transition: "all 0.15s",
                    textTransform: "capitalize",
                  }}
                >
                  {f}
                </button>
              ))}

              {/* Search */}
              <div style={{ position: "relative", marginLeft: "auto" }}>
                <Search size={13} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: D.muted, pointerEvents: "none" }} />
                <input
                  type="text"
                  placeholder="Buscar código ou produto…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  style={inputStyle(D, { paddingLeft: "1.75rem", width: 240 })}
                />
                {busca && (
                  <button onClick={() => setBusca("")} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: D.muted, padding: 0, display: "flex" }}>
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Loading */}
            {loading && (
              <div style={{ display: "flex", justifyContent: "center", padding: "3rem", color: D.muted }}>
                <Loader2 size={28} className="animate-spin" />
              </div>
            )}

            {/* Table */}
            {!loading && listaFiltrada.length > 0 && (
              <div style={{ ...makeCard(D, { padding: 0, overflow: "hidden" }) }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: D.cardAlt }}>
                        {["Código", "Produto origem", "Produto destino", "Material (kg)", "Produção prevista (kg)", "Status", "Criado em", "Utilizado em", ""].map((h, i) => (
                          <th key={i} style={{ padding: "0.6rem 1rem", textAlign: i >= 3 && i <= 5 ? "right" : i === 6 || i === 7 ? "center" : "left", fontWeight: 600, color: D.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${D.border}`, whiteSpace: "nowrap" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {listaFiltrada.map((r, i) => {
                        const producao = calcProducaoPrevista(r);
                        const qtdUtil = r.quantidade_utilizada ?? r.quantidade_kg;
                        const usandoParte = r.quantidade_utilizada !== null && r.quantidade_utilizada < r.quantidade_kg;
                        return (
                          <tr
                            key={r.id}
                            onClick={() => setDetalhe(r)}
                            style={{ background: i % 2 === 0 ? "transparent" : D.cardAlt, cursor: "pointer", transition: "background 0.1s" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = dark ? "#374151" : "#e2e8f0")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? "transparent" : D.cardAlt)}
                          >
                            <td style={{ padding: "0.55rem 1rem", color: D.cyan, fontWeight: 700, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                              {r.codigo}
                            </td>
                            <td style={{ padding: "0.55rem 1rem", color: D.muted, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>
                              {r.produto_origem ?? <span style={{ fontStyle: "italic" }}>—</span>}
                            </td>
                            <td style={{ padding: "0.55rem 1rem", color: D.text, fontWeight: 500, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {r.produto_destino}
                            </td>
                            <td style={{ padding: "0.55rem 1rem", textAlign: "right", fontFamily: "monospace" }}>
                              <span style={{ color: D.text }}>
                                {usandoParte ? `${formatKg(qtdUtil)}` : formatKg(r.quantidade_kg)}
                              </span>
                              {usandoParte && (
                                <span style={{ display: "block", fontSize: 10, color: D.muted }}>de {formatKg(r.quantidade_kg)}</span>
                              )}
                            </td>
                            <td style={{ padding: "0.55rem 1rem", color: D.text, textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>
                              {producao !== null ? formatKg(producao) : "—"}
                            </td>
                            <td style={{ padding: "0.55rem 1rem", textAlign: "right" }}>
                              <StatusBadgeInline status={r.status} />
                            </td>
                            <td style={{ padding: "0.55rem 1rem", color: D.muted, textAlign: "center", whiteSpace: "nowrap" }}>
                              {fmtDate(r.criado_em)}
                            </td>
                            <td style={{ padding: "0.55rem 1rem", color: D.muted, textAlign: "center", whiteSpace: "nowrap" }}>
                              {fmtDate(r.utilizado_em)}
                            </td>
                            <td style={{ padding: "0.55rem 0.75rem" }} onClick={(e) => e.stopPropagation()}>
                              <div style={{ display: "flex", gap: "0.25rem", justifyContent: "flex-end" }}>
                                {r.status === "pendente" ? (
                                  <button
                                    onClick={() => handleMarcar(r.id)}
                                    disabled={saving}
                                    title="Marcar como utilizado"
                                    style={{ display: "flex", alignItems: "center", padding: "0.25rem 0.5rem", background: D.greenBg, color: D.green, border: `1px solid ${D.greenBorder}`, borderRadius: "0.375rem", fontSize: 11, fontWeight: 600, cursor: "pointer", gap: "0.2rem", whiteSpace: "nowrap" }}
                                  >
                                    <Check size={11} /> Marcar
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleDesfazer(r.id)}
                                    disabled={saving}
                                    title="Desfazer utilização"
                                    style={{ display: "flex", alignItems: "center", padding: "0.25rem 0.5rem", background: D.cardAlt, color: D.muted, border: `1px solid ${D.border}`, borderRadius: "0.375rem", fontSize: 11, fontWeight: 600, cursor: "pointer", gap: "0.2rem" }}
                                  >
                                    <RotateCcw size={11} />
                                  </button>
                                )}
                                <button
                                  onClick={() => abrirEditar(r)}
                                  title="Editar"
                                  style={{ display: "flex", alignItems: "center", padding: "0.25rem 0.4rem", background: D.cardAlt, color: D.muted, border: `1px solid ${D.border}`, borderRadius: "0.375rem", cursor: "pointer" }}
                                >
                                  <Edit2 size={11} />
                                </button>
                                {r.status === "pendente" && (
                                  <button
                                    onClick={() => handleExcluir(r.id)}
                                    title="Excluir"
                                    style={{ display: "flex", alignItems: "center", padding: "0.25rem 0.4rem", background: D.redBg, color: D.red, border: `1px solid ${D.redBorder}`, borderRadius: "0.375rem", cursor: "pointer" }}
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!loading && listaFiltrada.length === 0 && (
              <div style={{ textAlign: "center", color: D.muted, padding: "4rem 2rem", fontSize: 14 }}>
                {busca ? (
                  <>Nenhum SDR encontrado para <strong style={{ color: D.text }}>"{busca}"</strong>.</>
                ) : filtro === "pendentes" ? (
                  <>Nenhum SDR pendente. <button onClick={abrirNovo} style={{ color: D.cyan, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Criar o primeiro.</button></>
                ) : (
                  "Nenhum SDR no período."
                )}
              </div>
            )}

            <p style={{ marginTop: "1.5rem", fontSize: 11, color: D.muted, fontStyle: "italic" }}>
              * Produção prevista = quantidade utilizada ÷ (% na fórmula). Percentuais gravados; kg sempre calculados na exibição.
            </p>
          </>
        )}
      </div>

      {/* Detail modal */}
      {detalhe && (
        <DetalheModal
          sdr={detalhe}
          onClose={() => setDetalhe(null)}
          onMarcar={handleMarcar}
          onDesfazer={handleDesfazer}
          onEditar={abrirEditar}
          onExcluir={handleExcluir}
          saving={saving}
        />
      )}
    </PaletteCtx.Provider>
  );
}
