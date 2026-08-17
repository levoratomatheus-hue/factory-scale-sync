import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, Plus, Search, Download, Edit2, Trash2, Palette, X, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useTheme } from "@/hooks/useTheme";
import { deltaE2000, labToRgbString, classificarDeltaE, DELTA_CONFIG, type Lab } from "@/lib/colorUtils";

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

interface CorFormula {
  id: string;
  formula_id: string | null;
  produto: string;
  lab_l: number;
  lab_a: number;
  lab_b: number;
  observacao: string | null;
  aplicacao: string | null;
  criado_por: string | null;
  criado_em: string;
}

interface BuscaResult extends CorFormula {
  deltaE: number;
  deltaL: number;
  deltaA: number;
  deltaB: number;
}

interface FormulaSugestao {
  formula_id: string;
  produto: string | null;
}

// ── Swatch ────────────────────────────────────────────────────────────────────

function ColorSwatch({ L, a, b, size = 40 }: { L: number; a: number; b: number; size?: number }) {
  const isValid = !isNaN(L) && !isNaN(a) && !isNaN(b) && L >= 0 && L <= 100;
  const color = isValid ? labToRgbString(L, a, b) : "transparent";
  return (
    <div
      title={isValid ? `L*=${L.toFixed(2)} a*=${a.toFixed(2)} b*=${b.toFixed(2)}` : "Valores inválidos"}
      style={{
        width: size, height: size, borderRadius: 8, flexShrink: 0,
        background: isValid ? color : "repeating-linear-gradient(45deg,#ccc,#ccc 3px,#f0f0f0 3px,#f0f0f0 9px)",
        border: "1.5px solid rgba(0,0,0,0.15)",
      }}
    />
  );
}

function DeltaBadge({ de, dark }: { de: number; dark: boolean }) {
  const cls = classificarDeltaE(de);
  const cfg = DELTA_CONFIG[cls];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 10px", borderRadius: 9999, fontSize: 11, fontWeight: 600,
      background: dark ? cfg.darkBg : cfg.bg,
      color: dark ? cfg.darkColor : cfg.color,
      whiteSpace: "nowrap",
    }}>
      {cfg.label}
    </span>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────

function downloadCsv(rows: (string | number)[][], filename: string) {
  const csv = "\ufeff" + rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props { perfilNome: string }

export default function ControleCor({ perfilNome }: Props) {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const D = buildPalette(dark);

  const [activeTab, setActiveTab] = useState<"cadastro" | "busca">("cadastro");

  // ── Dados ─────────────────────────────────────────────────────────────────
  const [cores, setCores] = useState<CorFormula[]>([]);
  const [loadingCores, setLoadingCores] = useState(false);

  const loadCores = useCallback(async () => {
    setLoadingCores(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("cores_formulas")
      .select("*")
      .order("criado_em", { ascending: false });
    setLoadingCores(false);
    if (error) {
      toast({ title: "Erro ao carregar cores", description: error.message, variant: "destructive" });
      return;
    }
    setCores(data ?? []);
  }, []);

  useEffect(() => { loadCores(); }, [loadCores]);

  // ═══════════════════════════════════════════════════════════════════════════
  // ABA CADASTRO
  // ═══════════════════════════════════════════════════════════════════════════

  const [editingId, setEditingId] = useState<string | null>(null);
  const [produto, setProduto] = useState("");
  const [formulaId, setFormulaId] = useState("");
  const [labL, setLabL] = useState("");
  const [labA, setLabA] = useState("");
  const [labB, setLabB] = useState("");
  const [observacao, setObservacao] = useState("");
  const [aplicacao, setAplicacao] = useState("");
  const [saving, setSaving] = useState(false);

  // Autocomplete fórmulas
  const [formulaQuery, setFormulaQuery] = useState("");
  const [sugestoes, setSugestoes] = useState<FormulaSugestao[]>([]);
  const [showSugestoes, setShowSugestoes] = useState(false);
  const formulaTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const autocompleteRef = useRef<HTMLDivElement>(null);

  // Filtro da lista
  const [listSearch, setListSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const buscarFormulas = useCallback(async (q: string) => {
    if (q.length < 3) { setSugestoes([]); setShowSugestoes(false); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("formulas")
      .select("formula_id, produto")
      .or(`formula_id.ilike.%${q}%,produto.ilike.%${q}%`)
      .limit(50);
    if (!data) return;
    const seen = new Set<string>();
    const unique: FormulaSugestao[] = (data as FormulaSugestao[])
      .filter((r) => {
        if (!r.formula_id || seen.has(r.formula_id)) return false;
        seen.add(r.formula_id);
        return true;
      })
      .slice(0, 10);
    setSugestoes(unique);
    setShowSugestoes(unique.length > 0);
  }, []);

  useEffect(() => {
    clearTimeout(formulaTimerRef.current);
    formulaTimerRef.current = setTimeout(() => buscarFormulas(formulaQuery), 300);
    return () => clearTimeout(formulaTimerRef.current);
  }, [formulaQuery, buscarFormulas]);

  // Fechar autocomplete ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node)) {
        setShowSugestoes(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selecionarFormula(s: FormulaSugestao) {
    setFormulaId(s.formula_id);
    setProduto(s.produto ?? s.formula_id);
    setFormulaQuery(`${s.formula_id}${s.produto ? " — " + s.produto : ""}`);
    setShowSugestoes(false);
  }

  function resetForm() {
    setEditingId(null);
    setProduto(""); setFormulaId("");
    setLabL(""); setLabA(""); setLabB(""); setObservacao(""); setAplicacao("");
    setFormulaQuery(""); setSugestoes([]);
  }

  function iniciarEdicao(c: CorFormula) {
    setEditingId(c.id);
    setProduto(c.produto); setFormulaId(c.formula_id ?? "");
    setLabL(String(c.lab_l)); setLabA(String(c.lab_a)); setLabB(String(c.lab_b));
    setObservacao(c.observacao ?? "");
    setAplicacao(c.aplicacao ?? "");
    setFormulaQuery(c.formula_id
      ? `${c.formula_id}${c.produto && c.produto !== c.formula_id ? " — " + c.produto : ""}`
      : "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvarCor() {
    if (!produto.trim()) { toast({ title: "Produto obrigatório", variant: "destructive" }); return; }
    const L = parseFloat(labL), a = parseFloat(labA), b = parseFloat(labB);
    if (isNaN(L) || isNaN(a) || isNaN(b)) {
      toast({ title: "Valores L*, a*, b* inválidos", variant: "destructive" }); return;
    }
    setSaving(true);
    const payload = {
      produto: produto.trim(),
      formula_id: formulaId.trim() || null,
      lab_l: L, lab_a: a, lab_b: b,
      observacao: observacao.trim() || null,
      aplicacao: aplicacao.trim() || null,
      criado_por: perfilNome,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    const { error } = editingId
      ? await client.from("cores_formulas").update(payload).eq("id", editingId)
      : await client.from("cores_formulas").insert(payload);
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingId ? "Cor atualizada" : "Cor cadastrada" });
    resetForm();
    loadCores();
  }

  async function deletarCor(id: string) {
    setDeletingId(id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("cores_formulas").delete().eq("id", id);
    setDeletingId(null);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Cor excluída" });
    loadCores();
  }

  function exportarCadastro() {
    const rows: (string | number)[][] = [
      ["Produto", "Fórmula", "L*", "a*", "b*", "Observação", "Aplicação", "Cadastrado por", "Data"],
      ...coresFiltradas.map((c) => [
        c.produto, c.formula_id ?? "", c.lab_l, c.lab_a, c.lab_b,
        c.observacao ?? "", c.aplicacao ?? "", c.criado_por ?? "",
        new Date(c.criado_em).toLocaleDateString("pt-BR"),
      ]),
    ];
    downloadCsv(rows, "cadastro_cores.csv");
  }

  const coresFiltradas = cores.filter((c) => {
    const q = listSearch.toLowerCase();
    return !q
      || c.produto.toLowerCase().includes(q)
      || (c.formula_id ?? "").toLowerCase().includes(q)
      || (c.aplicacao ?? "").toLowerCase().includes(q);
  });

  // Prévia ao vivo (cadastro)
  const liveL = parseFloat(labL), liveA = parseFloat(labA), liveB = parseFloat(labB);
  const liveValido = !isNaN(liveL) && !isNaN(liveA) && !isNaN(liveB) && liveL >= 0 && liveL <= 100;

  // ═══════════════════════════════════════════════════════════════════════════
  // ABA BUSCA
  // ═══════════════════════════════════════════════════════════════════════════

  const [buscaL, setBuscaL] = useState("");
  const [buscaA, setBuscaA] = useState("");
  const [buscaB, setBuscaB] = useState("");
  const [tolerancia, setTolerancia] = useState("2.5");
  const [topN, setTopN] = useState("10");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<BuscaResult[] | null>(null);
  const [mostrarDistantes, setMostrarDistantes] = useState(false);

  async function buscarCores() {
    const L = parseFloat(buscaL), a = parseFloat(buscaA), b = parseFloat(buscaB);
    if (isNaN(L) || isNaN(a) || isNaN(b)) {
      toast({ title: "Informe L*, a* e b* de referência", variant: "destructive" }); return;
    }
    setBuscando(true);
    setMostrarDistantes(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("cores_formulas").select("*");
    setBuscando(false);
    if (error) { toast({ title: "Erro na busca", description: error.message, variant: "destructive" }); return; }
    const ref: Lab = { L, a, b };
    const scored: BuscaResult[] = (data ?? []).map((c: CorFormula) => ({
      ...c,
      deltaE: deltaE2000(ref, { L: c.lab_l, a: c.lab_a, b: c.lab_b }),
      deltaL: c.lab_l - L,
      deltaA: c.lab_a - a,
      deltaB: c.lab_b - b,
    }));
    scored.sort((x, y) => x.deltaE - y.deltaE);
    setResultados(scored);
  }

  const buscaValida = !isNaN(parseFloat(buscaL)) && !isNaN(parseFloat(buscaA)) && !isNaN(parseFloat(buscaB));
  const bRefL = parseFloat(buscaL), bRefA = parseFloat(buscaA), bRefB = parseFloat(buscaB);
  const tolVal = parseFloat(tolerancia) || 2.5;
  const topNVal = parseInt(topN) || 10;

  const dentroDaTolerance = resultados?.filter((r) => r.deltaE <= tolVal) ?? [];
  const temDentro = dentroDaTolerance.length > 0;

  let resultadosExibidos: BuscaResult[];
  if (resultados === null) {
    resultadosExibidos = [];
  } else if (mostrarDistantes) {
    resultadosExibidos = resultados.slice(0, topNVal);
  } else if (temDentro) {
    resultadosExibidos = dentroDaTolerance.slice(0, topNVal);
  } else {
    // fallback: top 5 mesmo fora da tolerância
    resultadosExibidos = resultados.slice(0, 5);
  }

  function exportarBusca() {
    if (!resultadosExibidos.length) return;
    const rows: (string | number)[][] = [
      ["Posição", "Produto", "Fórmula", "L*", "a*", "b*", "ΔL", "Δa", "Δb", "ΔE", "Classificação"],
      ...resultadosExibidos.map((r, i) => [
        i + 1, r.produto, r.formula_id ?? "", r.lab_l, r.lab_a, r.lab_b,
        (r.deltaL >= 0 ? "+" : "") + r.deltaL.toFixed(2),
        (r.deltaA >= 0 ? "+" : "") + r.deltaA.toFixed(2),
        (r.deltaB >= 0 ? "+" : "") + r.deltaB.toFixed(2),
        r.deltaE.toFixed(2),
        DELTA_CONFIG[classificarDeltaE(r.deltaE)].label,
      ]),
    ];
    downloadCsv(rows, "busca_cor.csv");
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: D.page, color: D.text, fontFamily: "inherit", padding: "0 0 40px" }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <Palette style={{ color: "#7c3aed" }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Controle de Cor (CIELAB)</div>
          <div style={{ fontSize: 12, color: D.muted }}>Banco de cores Lab* por fórmula — busca por Delta E CIE2000</div>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `2px solid ${D.border}` }}>
        {(["cadastro", "busca"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "8px 20px", fontSize: 13, fontWeight: 600, border: "none",
              background: "transparent", cursor: "pointer",
              color: activeTab === tab ? "#7c3aed" : D.muted,
              borderBottom: activeTab === tab ? "2px solid #7c3aed" : "2px solid transparent",
              marginBottom: -2, transition: "all 0.15s",
            }}
          >
            {tab === "cadastro" ? "Cadastro de Cor" : "Buscar Cor"}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ABA CADASTRO                                                         */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "cadastro" && (
        <div>
          {/* Formulário */}
          <div style={{ ...card(D), padding: "20px 24px", marginBottom: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <Plus size={16} />
              {editingId ? "Editar cor" : "Cadastrar nova cor"}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Produto */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: D.muted }}>Produto / Cor *</label>
                <input
                  style={inp(D)}
                  value={produto}
                  onChange={(e) => setProduto(e.target.value)}
                  placeholder="Nome do produto ou cor"
                />
              </div>

              {/* Fórmula (autocomplete) */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, position: "relative" }} ref={autocompleteRef}>
                <label style={{ fontSize: 12, fontWeight: 600, color: D.muted }}>Fórmula (opcional)</label>
                <div style={{ position: "relative" }}>
                  <input
                    style={inp(D, { paddingRight: formulaId ? 28 : undefined })}
                    value={formulaQuery}
                    onChange={(e) => { setFormulaQuery(e.target.value); if (!e.target.value) setFormulaId(""); }}
                    onFocus={() => { if (sugestoes.length) setShowSugestoes(true); }}
                    placeholder="Digite 3+ caracteres para buscar..."
                  />
                  {formulaId && (
                    <button
                      onClick={() => { setFormulaId(""); setFormulaQuery(""); setSugestoes([]); }}
                      style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: D.muted, padding: 2 }}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                {formulaId && (
                  <div style={{ fontSize: 11, color: "#7c3aed", marginTop: 2 }}>
                    Vinculada: <strong>{formulaId}</strong>
                  </div>
                )}
                {showSugestoes && sugestoes.length > 0 && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
                    background: D.card, border: `1px solid ${D.border}`, borderRadius: 8,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.12)", overflow: "hidden", marginTop: 2,
                  }}>
                    {sugestoes.map((s) => (
                      <button
                        key={s.formula_id}
                        onMouseDown={() => selecionarFormula(s)}
                        style={{
                          display: "block", width: "100%", textAlign: "left",
                          padding: "8px 12px", background: "none", border: "none",
                          cursor: "pointer", color: D.text, fontSize: 13,
                          borderBottom: `1px solid ${D.border}`,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = D.rowAlt)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                      >
                        <span style={{ fontWeight: 600, color: "#7c3aed" }}>{s.formula_id}</span>
                        {s.produto && <span style={{ color: D.muted }}> — {s.produto}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* L* */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: D.muted }}>L* (0–100) *</label>
                <input
                  type="number" step="0.01" min="0" max="100"
                  style={inp(D)} value={labL}
                  onChange={(e) => setLabL(e.target.value)}
                  placeholder="ex.: 65.40"
                />
              </div>

              {/* a* */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: D.muted }}>a* *</label>
                <input
                  type="number" step="0.01"
                  style={inp(D)} value={labA}
                  onChange={(e) => setLabA(e.target.value)}
                  placeholder="ex.: −12.30 (pode ser negativo)"
                />
              </div>

              {/* b* */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: D.muted }}>b* *</label>
                <input
                  type="number" step="0.01"
                  style={inp(D)} value={labB}
                  onChange={(e) => setLabB(e.target.value)}
                  placeholder="ex.: 28.75 (pode ser negativo)"
                />
              </div>

              {/* Observação */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: D.muted }}>Observação</label>
                <input
                  style={inp(D)} value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="ex.: substrato PVC, lote 230412"
                />
              </div>

              {/* Aplicação */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: D.muted }}>Aplicação</label>
                <input
                  style={inp(D)} value={aplicacao}
                  onChange={(e) => setAplicacao(e.target.value)}
                  placeholder="ex.: embalagem, tinta automotiva, plástico injetado"
                />
              </div>
            </div>

            {/* Prévia visual */}
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
              <ColorSwatch L={liveL} a={liveA} b={liveB} size={52} />
              <div style={{ fontSize: 12, color: D.muted }}>
                {liveValido
                  ? <>Prévia aproximada da cor<br /><span style={{ color: D.text, fontWeight: 600 }}>L*={liveL.toFixed(2)} a*={liveA.toFixed(2)} b*={liveB.toFixed(2)}</span></>
                  : "Prévia aparece após informar L*, a* e b*"}
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                {editingId && (
                  <button
                    onClick={resetForm}
                    style={{
                      padding: "7px 16px", borderRadius: 7, border: `1px solid ${D.inputBorder}`,
                      background: D.cardAlt, color: D.text, fontSize: 13, fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Cancelar
                  </button>
                )}
                <button
                  onClick={salvarCor}
                  disabled={saving}
                  style={{
                    padding: "7px 22px", borderRadius: 7, border: "none",
                    background: "#7c3aed", color: "#fff", fontSize: 13, fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6,
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {editingId ? "Atualizar" : "Salvar cor"}
                </button>
              </div>
            </div>
          </div>

          {/* Lista de cores cadastradas */}
          <div style={card(D, { overflow: "hidden" })}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${D.border}`, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>
                Cores cadastradas ({coresFiltradas.length})
              </span>
              <div style={{ position: "relative", width: 220 }}>
                <Search size={13} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: D.muted }} />
                <input
                  style={inp(D, { paddingLeft: 28 })}
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder="Buscar produto, fórmula ou aplicação..."
                />
              </div>
              <button
                onClick={exportarCadastro}
                disabled={!coresFiltradas.length}
                style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "6px 14px",
                  borderRadius: 7, border: `1px solid ${D.inputBorder}`, background: D.cardAlt,
                  color: D.text, fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                <Download size={13} /> CSV
              </button>
            </div>

            {loadingCores ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                <Loader2 className="animate-spin" style={{ color: "#7c3aed" }} />
              </div>
            ) : coresFiltradas.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: D.muted, fontSize: 13 }}>
                {listSearch ? "Nenhuma cor encontrada para o filtro." : "Nenhuma cor cadastrada ainda. Use o formulário acima para começar."}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: D.th }}>
                      {["Cor", "Produto", "Fórmula", "L*", "a*", "b*", "Observação", "Aplicação", "Data", "Ações"].map((h) => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: D.thText, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {coresFiltradas.map((c, i) => (
                      <tr
                        key={c.id}
                        style={{ background: i % 2 === 0 ? D.row : D.rowAlt, borderBottom: `1px solid ${D.border}` }}
                      >
                        <td style={{ padding: "8px 12px" }}>
                          <ColorSwatch L={c.lab_l} a={c.lab_a} b={c.lab_b} size={32} />
                        </td>
                        <td style={{ padding: "8px 12px", fontWeight: 600 }}>{c.produto}</td>
                        <td style={{ padding: "8px 12px", color: c.formula_id ? "#7c3aed" : D.muted, fontFamily: "monospace" }}>
                          {c.formula_id ?? "—"}
                        </td>
                        <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{c.lab_l.toFixed(2)}</td>
                        <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{c.lab_a.toFixed(2)}</td>
                        <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{c.lab_b.toFixed(2)}</td>
                        <td style={{ padding: "8px 12px", color: D.muted, maxWidth: 180 }}>{c.observacao ?? "—"}</td>
                        <td style={{ padding: "8px 12px", color: D.muted, maxWidth: 200 }}>{c.aplicacao ?? "—"}</td>
                        <td style={{ padding: "8px 12px", color: D.muted, whiteSpace: "nowrap" }}>
                          {new Date(c.criado_em).toLocaleDateString("pt-BR")}
                        </td>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                          <button
                            onClick={() => iniciarEdicao(c)}
                            title="Editar"
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#7c3aed", padding: "3px 6px" }}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => deletarCor(c.id)}
                            disabled={deletingId === c.id}
                            title="Excluir"
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "3px 6px" }}
                          >
                            {deletingId === c.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ABA BUSCA                                                            */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "busca" && (
        <div>
          {/* Painel de busca */}
          <div style={{ ...card(D), padding: "20px 24px", marginBottom: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <Search size={16} />
              Buscar cor mais próxima
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr) auto", gap: 16, alignItems: "end" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: D.muted }}>L* de referência *</label>
                <input
                  type="number" step="0.01" min="0" max="100"
                  style={inp(D)} value={buscaL}
                  onChange={(e) => setBuscaL(e.target.value)}
                  placeholder="ex.: 65.40"
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: D.muted }}>a* de referência *</label>
                <input
                  type="number" step="0.01"
                  style={inp(D)} value={buscaA}
                  onChange={(e) => setBuscaA(e.target.value)}
                  placeholder="ex.: −12.30"
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: D.muted }}>b* de referência *</label>
                <input
                  type="number" step="0.01"
                  style={inp(D)} value={buscaB}
                  onChange={(e) => setBuscaB(e.target.value)}
                  placeholder="ex.: 28.75"
                />
              </div>

              {/* Prévia da cor de referência */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: D.muted }}>Prévia</label>
                <ColorSwatch L={bRefL} a={bRefA} b={bRefB} size={44} />
              </div>
            </div>

            {/* Controles avançados */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 16, marginTop: 16, alignItems: "end" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: D.muted }}>
                  Tolerância ΔE máx. (padrão: 2,50)
                </label>
                <input
                  type="number" step="0.1" min="0"
                  style={inp(D)} value={tolerancia}
                  onChange={(e) => setTolerancia(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: D.muted }}>
                  Máximo de resultados
                </label>
                <input
                  type="number" step="1" min="1" max="100"
                  style={inp(D)} value={topN}
                  onChange={(e) => setTopN(e.target.value)}
                />
              </div>
              <button
                onClick={buscarCores}
                disabled={buscando || !buscaValida || cores.length === 0}
                style={{
                  padding: "8px 24px", borderRadius: 7, border: "none",
                  background: "#7c3aed", color: "#fff", fontSize: 13, fontWeight: 600,
                  cursor: (buscando || !buscaValida || cores.length === 0) ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                  opacity: (buscando || !buscaValida || cores.length === 0) ? 0.6 : 1,
                }}
              >
                {buscando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Buscar mais próximas
              </button>
            </div>

            {cores.length === 0 && !loadingCores && (
              <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: dark ? "#1e293b" : "#f1f5f9", color: D.muted, fontSize: 12 }}>
                O banco de cores ainda está vazio. Cadastre cores na aba "Cadastro de Cor" para usar a busca.
              </div>
            )}
          </div>

          {/* Resultados */}
          {resultados !== null && (
            <div style={card(D, { overflow: "hidden" })}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${D.border}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>
                  {resultados.length === 0
                    ? "Nenhuma cor no banco"
                    : `${resultadosExibidos.length} resultado${resultadosExibidos.length !== 1 ? "s" : ""}`}
                </span>

                {/* Cor referência */}
                {buscaValida && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: D.muted }}>
                    <ColorSwatch L={bRefL} a={bRefA} b={bRefB} size={26} />
                    Referência
                  </div>
                )}

                {/* Expandir distantes */}
                {resultados.length > 0 && (
                  <button
                    onClick={() => setMostrarDistantes((v) => !v)}
                    style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "5px 12px",
                      borderRadius: 7, border: `1px solid ${D.inputBorder}`,
                      background: mostrarDistantes ? "#7c3aed22" : D.cardAlt,
                      color: mostrarDistantes ? "#7c3aed" : D.text,
                      fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    {mostrarDistantes ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {mostrarDistantes ? "Ocultar distantes" : "Ver mais próximas (fora da tolerância)"}
                  </button>
                )}

                <button
                  onClick={exportarBusca}
                  disabled={!resultadosExibidos.length}
                  style={{
                    display: "flex", alignItems: "center", gap: 5, padding: "5px 14px",
                    borderRadius: 7, border: `1px solid ${D.inputBorder}`, background: D.cardAlt,
                    color: D.text, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  <Download size={13} /> CSV
                </button>
              </div>

              {/* Aviso fallback */}
              {resultados.length > 0 && !temDentro && !mostrarDistantes && (
                <div style={{
                  margin: "12px 16px 0",
                  padding: "10px 14px", borderRadius: 8,
                  background: dark ? "#78350f22" : "#fef3c7",
                  color: dark ? "#fbbf24" : "#92400e",
                  fontSize: 12, fontWeight: 500, border: `1px solid ${dark ? "#78350f55" : "#fcd34d"}`,
                }}>
                  Nenhuma cor dentro da tolerância (ΔE ≤ {tolVal.toFixed(2)}). Mostrando as {resultadosExibidos.length} mais próximas cadastradas.
                </div>
              )}

              {resultados.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: D.muted, fontSize: 13 }}>
                  Banco de cores vazio.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: D.th }}>
                        {["#", "Cor", "Referência", "Produto", "Fórmula", "L*", "a*", "b*", "ΔL", "Δa", "Δb", "ΔE", "Classificação"].map((h) => (
                          <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: D.thText, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {resultadosExibidos.map((r, i) => (
                        <tr key={r.id} style={{ background: i % 2 === 0 ? D.row : D.rowAlt, borderBottom: `1px solid ${D.border}` }}>
                          <td style={{ padding: "10px 12px", fontWeight: 700, color: D.muted }}>{i + 1}</td>
                          {/* Swatch do resultado */}
                          <td style={{ padding: "10px 12px" }}>
                            <ColorSwatch L={r.lab_l} a={r.lab_a} b={r.lab_b} size={34} />
                          </td>
                          {/* Swatch de referência (para comparação) */}
                          <td style={{ padding: "10px 12px" }}>
                            <ColorSwatch L={bRefL} a={bRefA} b={bRefB} size={34} />
                          </td>
                          <td style={{ padding: "10px 12px", fontWeight: 600 }}>{r.produto}</td>
                          <td style={{ padding: "10px 12px", color: r.formula_id ? "#7c3aed" : D.muted, fontFamily: "monospace" }}>
                            {r.formula_id ?? "—"}
                          </td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{r.lab_l.toFixed(2)}</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{r.lab_a.toFixed(2)}</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{r.lab_b.toFixed(2)}</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: r.deltaL > 0 ? "#16a34a" : r.deltaL < 0 ? "#dc2626" : D.muted }}>
                            {(r.deltaL >= 0 ? "+" : "") + r.deltaL.toFixed(2)}
                          </td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: r.deltaA > 0 ? "#16a34a" : r.deltaA < 0 ? "#dc2626" : D.muted }}>
                            {(r.deltaA >= 0 ? "+" : "") + r.deltaA.toFixed(2)}
                          </td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: r.deltaB > 0 ? "#16a34a" : r.deltaB < 0 ? "#dc2626" : D.muted }}>
                            {(r.deltaB >= 0 ? "+" : "") + r.deltaB.toFixed(2)}
                          </td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", fontWeight: 800, fontSize: 15,
                            color: dark
                              ? DELTA_CONFIG[classificarDeltaE(r.deltaE)].darkColor
                              : DELTA_CONFIG[classificarDeltaE(r.deltaE)].color,
                          }}>
                            {r.deltaE.toFixed(2)}
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <DeltaBadge de={r.deltaE} dark={dark} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Legenda ΔE */}
              <div style={{ padding: "12px 16px", borderTop: `1px solid ${D.border}`, display: "flex", gap: 16, flexWrap: "wrap" }}>
                {(["aceitavel", "sugestao", "distante"] as const).map((cls) => {
                  const cfg = DELTA_CONFIG[cls];
                  const faixas = cls === "aceitavel" ? "ΔE ≤ 1,50" : cls === "sugestao" ? "1,50 < ΔE ≤ 2,50" : "ΔE > 2,50";
                  return (
                    <div key={cls} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                      <span style={{
                        padding: "1px 8px", borderRadius: 9999, fontWeight: 600,
                        background: dark ? cfg.darkBg : cfg.bg,
                        color: dark ? cfg.darkColor : cfg.color,
                      }}>{cfg.label}</span>
                      <span style={{ color: D.muted }}>{faixas}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
