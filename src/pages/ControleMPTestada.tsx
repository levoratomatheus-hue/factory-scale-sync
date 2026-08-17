import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Loader2, Plus, Search, Download, Edit2, Trash2,
  ChevronUp, ChevronDown, ChevronsUpDown, X, FlaskConical,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

// ── Dark mode ─────────────────────────────────────────────────────────────────

function buildPalette(dark: boolean) {
  return {
    page:        dark ? "#111827" : "#f8fafc",
    card:        dark ? "#1f2937" : "#ffffff",
    cardAlt:     dark ? "#374151" : "#f1f5f9",
    border:      dark ? "#374151" : "#e2e8f0",
    text:        dark ? "#f1f5f9" : "#0f172a",
    muted:       dark ? "#94a3b8" : "#64748b",
    input:       dark ? "#374151" : "#ffffff",
    inputBorder: dark ? "#4b5563" : "#cbd5e1",
    row:         dark ? "#1f2937" : "#ffffff",
    rowAlt:      dark ? "#1a2535" : "#f8fafc",
    rowHover:    dark ? "#2d3748" : "#f1f5f9",
    th:          dark ? "#111827" : "#f1f5f9",
    thText:      dark ? "#94a3b8" : "#64748b",
  };
}
type Palette = ReturnType<typeof buildPalette>;

function card(D: Palette, extra?: React.CSSProperties): React.CSSProperties {
  return { background: D.card, border: `1px solid ${D.border}`, borderRadius: "0.75rem", ...extra };
}
function inp(D: Palette, extra?: React.CSSProperties): React.CSSProperties {
  return {
    padding: "0.4rem 0.65rem", borderRadius: "0.5rem", border: `1px solid ${D.inputBorder}`,
    background: D.input, color: D.text, fontSize: 13, width: "100%",
    boxSizing: "border-box" as const, outline: "none", ...extra,
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Situacao = "aprovado" | "reprovado" | "observacao" | "aguardando";

interface MpTestada {
  id: string;
  pigmento_zc: string;
  codigo_cliente: string | null;
  fornecedor: string | null;
  data_teste: string | null;
  lote: string | null;
  situacao: Situacao;
  motivo: string | null;
  criado_por: string | null;
  criado_em: string;
}

interface FormState {
  pigmento_zc: string;
  codigo_cliente: string;
  fornecedor: string;
  data_teste: string;
  lote: string;
  situacao: Situacao;
  motivo: string;
}

type SortCol = "pigmento_zc" | "fornecedor" | "data_teste";

// ── Situação config ────────────────────────────────────────────────────────────

const SITUACAO_CONFIG: Record<Situacao, { label: string; bg: string; color: string; darkBg: string; darkColor: string }> = {
  aprovado:   { label: "Aprovado",   bg: "#d1fae5", color: "#065f46", darkBg: "#06340233", darkColor: "#34d399" },
  reprovado:  { label: "Reprovado",  bg: "#fee2e2", color: "#991b1b", darkBg: "#7f1d1d33", darkColor: "#f87171" },
  observacao: { label: "Observação", bg: "#fef3c7", color: "#92400e", darkBg: "#78350f33", darkColor: "#fbbf24" },
  aguardando: { label: "Aguardando", bg: "#dbeafe", color: "#1e40af", darkBg: "#1e3a8a33", darkColor: "#60a5fa" },
};

function SituacaoBadge({ s, dark }: { s: Situacao; dark: boolean }) {
  const cfg = SITUACAO_CONFIG[s];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 10px", borderRadius: 9999, fontSize: 11, fontWeight: 600,
      background: dark ? cfg.darkBg : cfg.bg,
      color: dark ? cfg.darkColor : cfg.color,
    }}>
      {cfg.label}
    </span>
  );
}

// ── Autocomplete input ────────────────────────────────────────────────────────

function AutocompleteInput({
  value, onChange, sugestoes, placeholder, D,
}: {
  value: string;
  onChange: (v: string) => void;
  sugestoes: string[];
  placeholder?: string;
  D: Palette;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => !value.trim()
      ? sugestoes.slice(0, 8)
      : sugestoes.filter(s => s.toLowerCase().includes(value.toLowerCase())).slice(0, 8),
    [value, sugestoes],
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={inp(D)}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
          background: D.card, border: `1px solid ${D.border}`,
          borderRadius: "0.5rem", marginTop: 2, overflow: "hidden",
          boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
        }}>
          {filtered.map(s => (
            <div
              key={s}
              onMouseDown={() => { onChange(s); setOpen(false); }}
              style={{
                padding: "6px 10px", fontSize: 13, cursor: "pointer",
                color: D.text,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = D.cardAlt)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sortable header ────────────────────────────────────────────────────────────

function Th({
  label, col, sortCol, sortDir, onSort, D, style,
}: {
  label: string;
  col: SortCol | null;
  sortCol: SortCol;
  sortDir: "asc" | "desc";
  onSort: (c: SortCol) => void;
  D: Palette;
  style?: React.CSSProperties;
}) {
  const active = col === sortCol;
  return (
    <th
      onClick={col ? () => onSort(col) : undefined}
      style={{
        padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600,
        letterSpacing: "0.05em", textTransform: "uppercase" as const,
        background: D.th, color: D.thText,
        cursor: col ? "pointer" : "default",
        userSelect: "none" as const, whiteSpace: "nowrap" as const,
        borderBottom: `1px solid ${D.border}`,
        ...style,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        {col && (
          active
            ? (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
            : <ChevronsUpDown size={12} style={{ opacity: 0.4 }} />
        )}
      </span>
    </th>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtData(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function exportarCSV(rows: MpTestada[]) {
  const header = ["Pigmento ZC", "Código Cliente", "Fornecedor", "Data", "Lote", "Situação", "Motivo"];
  const lines = rows.map(r => [
    r.pigmento_zc,
    r.codigo_cliente ?? "",
    r.fornecedor ?? "",
    fmtData(r.data_teste),
    r.lote ?? "",
    SITUACAO_CONFIG[r.situacao]?.label ?? r.situacao,
    r.motivo ?? "",
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(";"));
  const csv = "\uFEFF" + [header.join(";"), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mp_testadas_${hoje()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Modal de cadastro / edição ────────────────────────────────────────────────

function ModalTeste({
  inicial, pigmentos, fornecedores, onSalvar, onFechar, salvando, dark,
}: {
  inicial: FormState;
  pigmentos: string[];
  fornecedores: string[];
  onSalvar: (f: FormState) => void;
  onFechar: () => void;
  salvando: boolean;
  dark: boolean;
}) {
  const D = buildPalette(dark);
  const [f, setF] = useState<FormState>(inicial);

  useEffect(() => { setF(inicial); }, [inicial]);

  const set = (k: keyof FormState) => (v: string) => setF(prev => ({ ...prev, [k]: v }));

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.5)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: "1rem",
    }}>
      <div style={{ ...card(D), width: "100%", maxWidth: 520, padding: "1.5rem" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: D.text }}>
            {inicial.pigmento_zc ? "Editar teste" : "Novo teste"}
          </span>
          <button onClick={onFechar} style={{ background: "none", border: "none", cursor: "pointer", color: D.muted }}>
            <X size={18} />
          </button>
        </div>

        {/* Campos */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: D.muted, display: "block", marginBottom: 4 }}>
              Pigmento ZC <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <AutocompleteInput value={f.pigmento_zc} onChange={set("pigmento_zc")} sugestoes={pigmentos} placeholder="Ex.: AMARELO PY 13" D={D} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: D.muted, display: "block", marginBottom: 4 }}>Código do Cliente</label>
              <input value={f.codigo_cliente} onChange={e => set("codigo_cliente")(e.target.value)} placeholder="Ex.: YELLOW 1222 K" style={inp(D)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: D.muted, display: "block", marginBottom: 4 }}>Lote</label>
              <input value={f.lote} onChange={e => set("lote")(e.target.value)} placeholder="Lote testado" style={inp(D)} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: D.muted, display: "block", marginBottom: 4 }}>Fornecedor</label>
            <AutocompleteInput value={f.fornecedor} onChange={set("fornecedor")} sugestoes={fornecedores} placeholder="Nome do fornecedor" D={D} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: D.muted, display: "block", marginBottom: 4 }}>Data do teste</label>
              <input type="date" value={f.data_teste} onChange={e => set("data_teste")(e.target.value)} style={inp(D)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: D.muted, display: "block", marginBottom: 4 }}>Situação</label>
              <select value={f.situacao} onChange={e => set("situacao")(e.target.value as Situacao)} style={inp(D)}>
                <option value="aprovado">Aprovado</option>
                <option value="reprovado">Reprovado</option>
                <option value="observacao">Observação</option>
                <option value="aguardando">Aguardando</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: D.muted, display: "block", marginBottom: 4 }}>
              Motivo <span style={{ fontSize: 11, fontWeight: 400 }}>(principalmente em reprovações)</span>
            </label>
            <textarea
              value={f.motivo}
              onChange={e => set("motivo")(e.target.value)}
              rows={2}
              placeholder="Descreva o motivo, se houver"
              style={{ ...inp(D), resize: "vertical" as const }}
            />
          </div>
        </div>

        {/* Botões */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1.25rem" }}>
          <button
            onClick={onFechar}
            style={{
              padding: "0.45rem 1rem", borderRadius: "0.5rem", border: `1px solid ${D.border}`,
              background: D.cardAlt, color: D.text, fontSize: 13, cursor: "pointer", fontWeight: 500,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={() => onSalvar(f)}
            disabled={salvando || !f.pigmento_zc.trim()}
            style={{
              padding: "0.45rem 1.1rem", borderRadius: "0.5rem", border: "none",
              background: salvando || !f.pigmento_zc.trim() ? "#94a3b8" : "#2563eb",
              color: "#fff", fontSize: 13, cursor: salvando || !f.pigmento_zc.trim() ? "not-allowed" : "pointer",
              fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {salvando && <Loader2 size={13} className="animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirmação de exclusão ───────────────────────────────────────────────────

function ModalExcluir({ texto, onConfirmar, onCancelar, excluindo, dark }: {
  texto: string; onConfirmar: () => void; onCancelar: () => void; excluindo: boolean; dark: boolean;
}) {
  const D = buildPalette(dark);
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 110,
      background: "rgba(0,0,0,0.5)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: "1rem",
    }}>
      <div style={{ ...card(D), width: "100%", maxWidth: 380, padding: "1.5rem" }}>
        <p style={{ color: D.text, fontSize: 14, marginBottom: "1rem" }}>
          Excluir o teste de <strong>{texto}</strong>? Esta ação não pode ser desfeita.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button
            onClick={onCancelar}
            style={{
              padding: "0.4rem 0.9rem", borderRadius: "0.5rem",
              border: `1px solid ${D.border}`, background: D.cardAlt, color: D.text,
              fontSize: 13, cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            disabled={excluindo}
            style={{
              padding: "0.4rem 0.9rem", borderRadius: "0.5rem", border: "none",
              background: "#ef4444", color: "#fff", fontSize: 13,
              cursor: excluindo ? "not-allowed" : "pointer", fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {excluindo && <Loader2 size={13} className="animate-spin" />}
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────

interface Props {
  perfilNome: string;
  papel: string;
}

const FORM_VAZIO: FormState = {
  pigmento_zc: "", codigo_cliente: "", fornecedor: "",
  data_teste: hoje(), lote: "", situacao: "aguardando", motivo: "",
};

export default function ControleMPTestada({ perfilNome, papel }: Props) {
  const canEdit = papel === 'gestor' || papel === 'desenvolvimento';
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const D = buildPalette(dark);

  // ── Dados ────────────────────────────────────────────────────────────────────
  const [registros, setRegistros] = useState<MpTestada[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRegistros = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("mp_testadas")
      .select("*")
      .order("data_teste", { ascending: false, nullsFirst: false })
      .order("criado_em", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar registros", description: error.message, variant: "destructive" });
    } else {
      setRegistros((data ?? []) as MpTestada[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRegistros(); }, [fetchRegistros]);

  // ── Filtros e ordenação ──────────────────────────────────────────────────────
  const [busca, setBusca] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState<Situacao | "todos">("todos");
  const [filtroFornecedor, setFiltroFornecedor] = useState("");
  const [sortCol, setSortCol] = useState<SortCol>("data_teste");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fornecedoresDistintos = useMemo(
    () => [...new Set(registros.map(r => r.fornecedor).filter(Boolean) as string[])].sort(),
    [registros],
  );
  const pigmentosDistintos = useMemo(
    () => [...new Set(registros.map(r => r.pigmento_zc))].sort(),
    [registros],
  );

  const handleSort = useCallback((col: SortCol) => {
    setSortCol(prev => {
      if (prev === col) { setSortDir(d => d === "asc" ? "desc" : "asc"); return col; }
      setSortDir("asc");
      return col;
    });
  }, []);

  const filtrado = useMemo(() => {
    const q = busca.toLowerCase();
    let rows = registros.filter(r => {
      if (filtroSituacao !== "todos" && r.situacao !== filtroSituacao) return false;
      if (filtroFornecedor && r.fornecedor !== filtroFornecedor) return false;
      if (q) {
        const hay = [r.pigmento_zc, r.codigo_cliente, r.fornecedor, r.lote]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    rows = [...rows].sort((a, b) => {
      let va = "", vb = "";
      if (sortCol === "pigmento_zc")  { va = a.pigmento_zc; vb = b.pigmento_zc; }
      if (sortCol === "fornecedor")   { va = a.fornecedor ?? ""; vb = b.fornecedor ?? ""; }
      if (sortCol === "data_teste")   { va = a.data_teste ?? ""; vb = b.data_teste ?? ""; }
      const cmp = va.localeCompare(vb, "pt-BR");
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [registros, busca, filtroSituacao, filtroFornecedor, sortCol, sortDir]);

  // ── Stats ────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:      filtrado.length,
    aprovado:   filtrado.filter(r => r.situacao === "aprovado").length,
    reprovado:  filtrado.filter(r => r.situacao === "reprovado").length,
    observacao: filtrado.filter(r => r.situacao === "observacao").length,
    aguardando: filtrado.filter(r => r.situacao === "aguardando").length,
  }), [filtrado]);

  // ── Modal novo/editar ────────────────────────────────────────────────────────
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<MpTestada | null>(null);
  const [salvando, setSalvando] = useState(false);

  const formInicial: FormState = useMemo(() => editando
    ? {
        pigmento_zc:    editando.pigmento_zc,
        codigo_cliente: editando.codigo_cliente ?? "",
        fornecedor:     editando.fornecedor ?? "",
        data_teste:     editando.data_teste ?? hoje(),
        lote:           editando.lote ?? "",
        situacao:       editando.situacao,
        motivo:         editando.motivo ?? "",
      }
    : FORM_VAZIO,
  [editando]);

  const abrirNovo = () => { setEditando(null); setModalAberto(true); };
  const abrirEditar = (r: MpTestada) => { setEditando(r); setModalAberto(true); };
  const fecharModal = () => { setModalAberto(false); setEditando(null); };

  const handleSalvar = useCallback(async (f: FormState) => {
    if (!f.pigmento_zc.trim()) return;
    setSalvando(true);

    const payload = {
      pigmento_zc:    f.pigmento_zc.trim().toUpperCase(),
      codigo_cliente: f.codigo_cliente.trim() || null,
      fornecedor:     f.fornecedor.trim() || null,
      data_teste:     f.data_teste || null,
      lote:           f.lote.trim() || null,
      situacao:       f.situacao,
      motivo:         f.motivo.trim() || null,
    };

    let error;
    if (editando) {
      ({ error } = await (supabase as any).from("mp_testadas").update(payload).eq("id", editando.id));
    } else {
      ({ error } = await (supabase as any).from("mp_testadas").insert({ ...payload, criado_por: perfilNome }));
    }

    setSalvando(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editando ? "Teste atualizado" : "Teste cadastrado" });
    fecharModal();
    fetchRegistros();
  }, [editando, perfilNome, fetchRegistros]);

  // ── Excluir ──────────────────────────────────────────────────────────────────
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const handleExcluir = useCallback(async () => {
    if (!excluindoId) return;
    setExcluindo(true);
    const { error } = await (supabase as any).from("mp_testadas").delete().eq("id", excluindoId);
    setExcluindo(false);
    setExcluindoId(null);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Teste excluído" });
    fetchRegistros();
  }, [excluindoId, fetchRegistros]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: D.page, minHeight: "100vh", padding: "0 0 2rem" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <FlaskConical size={20} color="#2563eb" />
          <span style={{ fontSize: 18, fontWeight: 700, color: D.text }}>Controle de MP Testada</span>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => exportarCSV(filtrado)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "0.4rem 0.9rem", borderRadius: "0.5rem",
              border: `1px solid ${D.border}`, background: D.card,
              color: D.text, fontSize: 13, cursor: "pointer", fontWeight: 500,
            }}
          >
            <Download size={14} /> Exportar CSV
          </button>
          {canEdit && (
            <button
              onClick={abrirNovo}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "0.4rem 0.9rem", borderRadius: "0.5rem",
                border: "none", background: "#2563eb",
                color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 600,
              }}
            >
              <Plus size={14} /> Novo teste
            </button>
          )}
        </div>
      </div>

      {/* ── Resumo ── */}
      <div style={{ ...card(D), padding: "0.85rem 1rem", marginBottom: "1rem", display: "flex", flexWrap: "wrap", gap: "0.5rem 1.5rem", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: D.muted }}>
          <strong style={{ color: D.text }}>{stats.total}</strong> testes no total
        </span>
        <span style={{ color: D.border }}>·</span>
        <span style={{ fontSize: 13, color: "#059669" }}>
          <strong>{stats.aprovado}</strong> aprovados
        </span>
        <span style={{ color: D.border }}>·</span>
        <span style={{ fontSize: 13, color: "#dc2626" }}>
          <strong>{stats.reprovado}</strong> reprovados
        </span>
        {stats.observacao > 0 && (
          <>
            <span style={{ color: D.border }}>·</span>
            <span style={{ fontSize: 13, color: "#d97706" }}>
              <strong>{stats.observacao}</strong> em observação
            </span>
          </>
        )}
        {stats.aguardando > 0 && (
          <>
            <span style={{ color: D.border }}>·</span>
            <span style={{ fontSize: 13, color: "#2563eb" }}>
              <strong>{stats.aguardando}</strong> aguardando
            </span>
          </>
        )}
      </div>

      {/* ── Filtros ── */}
      <div style={{ ...card(D), padding: "0.85rem 1rem", marginBottom: "1rem", display: "flex", flexWrap: "wrap", gap: "0.65rem", alignItems: "center" }}>
        {/* Busca */}
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
          <Search size={14} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: D.muted, pointerEvents: "none" }} />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por pigmento, fornecedor, lote…"
            style={{ ...inp(D), paddingLeft: 30 }}
          />
        </div>

        {/* Situação */}
        <select
          value={filtroSituacao}
          onChange={e => setFiltroSituacao(e.target.value as Situacao | "todos")}
          style={{ ...inp(D), width: "auto", minWidth: 140 }}
        >
          <option value="todos">Todas situações</option>
          <option value="aprovado">Aprovado</option>
          <option value="reprovado">Reprovado</option>
          <option value="observacao">Observação</option>
          <option value="aguardando">Aguardando</option>
        </select>

        {/* Fornecedor */}
        <select
          value={filtroFornecedor}
          onChange={e => setFiltroFornecedor(e.target.value)}
          style={{ ...inp(D), width: "auto", minWidth: 180, maxWidth: 260 }}
        >
          <option value="">Todos fornecedores</option>
          {fornecedoresDistintos.map(f => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        {/* Limpar filtros */}
        {(busca || filtroSituacao !== "todos" || filtroFornecedor) && (
          <button
            onClick={() => { setBusca(""); setFiltroSituacao("todos"); setFiltroFornecedor(""); }}
            style={{
              display: "flex", alignItems: "center", gap: 4, padding: "0.4rem 0.7rem",
              borderRadius: "0.5rem", border: `1px solid ${D.border}`,
              background: "none", color: D.muted, fontSize: 12, cursor: "pointer",
            }}
          >
            <X size={12} /> Limpar
          </button>
        )}

        <span style={{ fontSize: 12, color: D.muted, marginLeft: "auto" }}>
          {filtrado.length} resultado{filtrado.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Tabela ── */}
      <div style={{ ...card(D), overflow: "hidden", padding: 0 }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
            <Loader2 className="animate-spin" color={D.muted} size={28} />
          </div>
        ) : filtrado.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 180, color: D.muted, gap: 8 }}>
            <FlaskConical size={32} strokeWidth={1.5} />
            <span style={{ fontSize: 14 }}>Nenhum teste encontrado</span>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <Th label="Pigmento ZC"       col="pigmento_zc" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} D={D} />
                  <Th label="Código Cliente"     col={null}        sortCol={sortCol} sortDir={sortDir} onSort={handleSort} D={D} />
                  <Th label="Fornecedor"         col="fornecedor"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} D={D} />
                  <Th label="Data"               col="data_teste"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} D={D} style={{ minWidth: 90 }} />
                  <Th label="Lote"               col={null}        sortCol={sortCol} sortDir={sortDir} onSort={handleSort} D={D} />
                  <Th label="Situação"           col={null}        sortCol={sortCol} sortDir={sortDir} onSort={handleSort} D={D} style={{ minWidth: 110 }} />
                  <Th label="Motivo"             col={null}        sortCol={sortCol} sortDir={sortDir} onSort={handleSort} D={D} />
                  {canEdit && (
                    <th style={{
                      padding: "10px 12px", background: D.th,
                      borderBottom: `1px solid ${D.border}`, width: 72,
                    }} />
                  )}
                </tr>
              </thead>
              <tbody>
                {filtrado.map((r, i) => (
                  <tr
                    key={r.id}
                    style={{ background: i % 2 === 0 ? D.row : D.rowAlt }}
                    onMouseEnter={e => (e.currentTarget.style.background = D.rowHover)}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? D.row : D.rowAlt)}
                  >
                    <td style={{ padding: "9px 12px", fontSize: 13, color: D.text, fontWeight: 600, borderBottom: `1px solid ${D.border}` }}>
                      {r.pigmento_zc}
                    </td>
                    <td style={{ padding: "9px 12px", fontSize: 13, color: D.muted, borderBottom: `1px solid ${D.border}` }}>
                      {r.codigo_cliente || "—"}
                    </td>
                    <td style={{ padding: "9px 12px", fontSize: 13, color: D.text, borderBottom: `1px solid ${D.border}` }}>
                      {r.fornecedor || "—"}
                    </td>
                    <td style={{ padding: "9px 12px", fontSize: 13, color: D.muted, borderBottom: `1px solid ${D.border}`, whiteSpace: "nowrap" }}>
                      {fmtData(r.data_teste)}
                    </td>
                    <td style={{ padding: "9px 12px", fontSize: 13, color: D.muted, borderBottom: `1px solid ${D.border}` }}>
                      {r.lote || "—"}
                    </td>
                    <td style={{ padding: "9px 12px", borderBottom: `1px solid ${D.border}` }}>
                      <SituacaoBadge s={r.situacao} dark={dark} />
                    </td>
                    <td style={{ padding: "9px 12px", fontSize: 12, color: D.muted, borderBottom: `1px solid ${D.border}`, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.motivo || "—"}
                    </td>
                    {canEdit && (
                      <td style={{ padding: "9px 10px", borderBottom: `1px solid ${D.border}` }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                          <button
                            onClick={() => abrirEditar(r)}
                            title="Editar"
                            style={{ background: "none", border: "none", cursor: "pointer", color: D.muted, padding: 4, borderRadius: 4 }}
                            onMouseEnter={e => (e.currentTarget.style.color = "#2563eb")}
                            onMouseLeave={e => (e.currentTarget.style.color = D.muted)}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => setExcluindoId(r.id)}
                            title="Excluir"
                            style={{ background: "none", border: "none", cursor: "pointer", color: D.muted, padding: 4, borderRadius: 4 }}
                            onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                            onMouseLeave={e => (e.currentTarget.style.color = D.muted)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal novo/editar ── */}
      {modalAberto && (
        <ModalTeste
          inicial={formInicial}
          pigmentos={pigmentosDistintos}
          fornecedores={fornecedoresDistintos}
          onSalvar={handleSalvar}
          onFechar={fecharModal}
          salvando={salvando}
          dark={dark}
        />
      )}

      {/* ── Modal excluir ── */}
      {excluindoId && (
        <ModalExcluir
          texto={registros.find(r => r.id === excluindoId)?.pigmento_zc ?? ""}
          onConfirmar={handleExcluir}
          onCancelar={() => setExcluindoId(null)}
          excluindo={excluindo}
          dark={dark}
        />
      )}
    </div>
  );
}
