import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatKg } from "@/lib/utils";
import {
  Loader2, Recycle, BarChart2, CalendarRange, AlertTriangle,
  TrendingDown, ArrowDownToLine, Download,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

// ── Palette ───────────────────────────────────────────────────────────────────
function buildPalette(dark: boolean) {
  return {
    page:    dark ? "#111827" : "#faf9f7",
    card:    dark ? "#1f2937" : "#ffffff",
    cardAlt: dark ? "#374151" : "#e4ecf4",
    border:  dark ? "#374151" : "#a8b8c8",
    text:    dark ? "#f1f5f9" : "#0f172a",
    muted:   dark ? "#94a3b8" : "#64748b",
    cyan:    "#0891b2",
    emerald: "#059669",
    amber:   "#d97706",
    red:     "#dc2626",
    violet:  "#7c3aed",
    grid:    dark ? "#374151" : "#c8d3de",
  };
}

let D = buildPalette(false);

function makeCardStyle(d: ReturnType<typeof buildPalette>): React.CSSProperties {
  return {
    background: d.card,
    border: `1px solid ${d.border}`,
    borderRadius: "0.75rem",
    padding: "1.25rem",
  };
}

function makeTooltipStyle(d: ReturnType<typeof buildPalette>): React.CSSProperties {
  return {
    borderRadius: "0.5rem",
    border: `1px solid ${d.border}`,
    background: d.cardAlt,
    color: d.text,
    fontSize: 12,
    padding: "8px 12px",
  };
}

let cardStyle = makeCardStyle(D);
let tooltipStyle = makeTooltipStyle(D);

// ── Types ─────────────────────────────────────────────────────────────────────
type TipoErro = "producao" | "comercial" | null;

/** Material de origem — fonte da verdade para cálculos de produção e ranking */
type ReaprovMaterial = {
  id: string;
  reaproveitamento_id: string;
  sequencia: number;
  produto_origem: string;
  formula_id_origem: string | null;
  quantidade_material: number;
  quantidade_utilizada: number | null;
  percentual_reaproveitado: number;
};

type Reaprov = {
  id: string;
  codigo: string;
  produto_destino: string;
  // Campos legados (mantidos para compat) — usar materiais[] como fonte de verdade
  produto_origem: string | null;
  quantidade_material: number;
  quantidade_utilizada: number | null;
  percentual_reaproveitado: number | null;
  status: "pendente" | "utilizado";
  tipo_erro: TipoErro;
  criado_em: string;
  materiais: ReaprovMaterial[];
};

type AtalhoId = "hoje" | "semana" | "mes" | "ano" | null;

const ATALHOS: { id: Exclude<AtalhoId, null>; label: string }[] = [
  { id: "hoje",   label: "Hoje" },
  { id: "semana", label: "Esta semana" },
  { id: "mes",    label: "Este mês" },
  { id: "ano",    label: "Este ano" },
];

const LIMITE_DIAS_PARADO = 30;

// ── Helpers ───────────────────────────────────────────────────────────────────
function toStr(d: Date) { return d.toISOString().split("T")[0]; }

function inicioSemana(d: Date) {
  const dow = d.getDay();
  const seg = new Date(d);
  seg.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return seg;
}

function calcAtalho(id: AtalhoId): { inicio: string; fim: string } {
  const d = new Date();
  if (id === "hoje")   return { inicio: toStr(d), fim: toStr(d) };
  if (id === "semana") return { inicio: toStr(inicioSemana(d)), fim: toStr(d) };
  if (id === "mes")    return { inicio: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, fim: toStr(d) };
  if (id === "ano")    return { inicio: `${d.getFullYear()}-01-01`, fim: toStr(d) };
  return { inicio: "", fim: "" };
}

/** Produção de um SDR = soma das contribuições de cada material */
function calcProducao(r: Reaprov): number | null {
  if (r.materiais && r.materiais.length > 0) {
    const total = r.materiais.reduce((sum, m) => {
      const qtd = m.quantidade_utilizada ?? m.quantidade_material;
      if (!m.percentual_reaproveitado || m.percentual_reaproveitado <= 0 || !qtd || qtd <= 0) return sum;
      return sum + (qtd / (m.percentual_reaproveitado / 100));
    }, 0);
    return total > 0 ? total : null;
  }
  // Fallback para SDRs antigos sem materiais cadastrados
  const qtd = r.quantidade_utilizada ?? r.quantidade_material;
  const pct = r.percentual_reaproveitado;
  if (!pct || pct <= 0 || !qtd || qtd <= 0) return null;
  return qtd / (pct / 100);
}

/** Kg total de material de um SDR (soma dos materiais) */
function totalKgSDR(r: Reaprov): number {
  if (r.materiais && r.materiais.length > 0) {
    return r.materiais.reduce((s, m) => s + m.quantidade_material, 0);
  }
  return r.quantidade_material;
}

/** Origens de um SDR como texto (para exibição) */
function origensLabel(r: Reaprov): string {
  if (r.materiais && r.materiais.length > 0) {
    return r.materiais.map((m) => m.produto_origem).join(", ");
  }
  return r.produto_origem ?? "Origem não informada";
}

function diasPassados(isoDate: string): number {
  const diff = Date.now() - new Date(isoDate.includes("T") ? isoDate : isoDate + "T00:00:00Z").getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.split("T")[0].split("-").reverse().join("/");
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
      {icon}
      <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: D.text }}>{title}</h2>
    </div>
  );
}

function Vazio({ mensagem = "Nenhum dado no período" }: { mensagem?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 120, color: D.muted, fontSize: "0.875rem" }}>
      {mensagem}
    </div>
  );
}

function SummaryCard({
  label, value, sub, color,
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={cardStyle}>
      <p style={{ fontSize: 11, fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
        {label}
      </p>
      <p style={{ fontSize: 22, fontWeight: 700, color: color ?? D.text, margin: "0.25rem 0 0" }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 11, color: D.muted, margin: "0.15rem 0 0" }}>{sub}</p>}
    </div>
  );
}

function TooltipKg({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={tooltipStyle}>
      <p style={{ fontWeight: 700, margin: 0 }}>{d.label ?? d.nome ?? "—"}</p>
      <p style={{ margin: "4px 0 0", color: D.emerald }}>{formatKg(payload[0].value)}</p>
      {d.qtd !== undefined && (
        <p style={{ margin: "2px 0 0", color: D.muted }}>{d.qtd} SDR{d.qtd !== 1 ? "s" : ""}</p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PainelAnaliseReaproveitamento() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  D = buildPalette(dark);
  cardStyle = makeCardStyle(D);
  tooltipStyle = makeTooltipStyle(D);

  const [lista, setLista] = useState<Reaprov[]>([]);
  const [loading, setLoading] = useState(true);

  const mesAtual = useMemo(() => calcAtalho("mes"), []);
  const [dataInicio, setDataInicio] = useState(mesAtual.inicio);
  const [dataFim, setDataFim]       = useState(mesAtual.fim);
  const [atalhoAtivo, setAtalhoAtivo] = useState<AtalhoId>("mes");

  const [filtroTipo, setFiltroTipo] = useState<TipoErro | "todos">("todos");

  // Modal: histórico de SDRs de uma origem
  const [modalOrigem, setModalOrigem] = useState<string | null>(null);

  const fetchLista = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("reaproveitamentos")
      .select("id, codigo, produto_destino, produto_origem, quantidade_material, quantidade_utilizada, percentual_reaproveitado, status, tipo_erro, criado_em, reaproveitamentos_materiais(*)")
      .order("criado_em", { ascending: false })
      .limit(5000);
    if (!error) {
      setLista((data ?? []).map((r: any) => ({
        ...r,
        materiais: r.reaproveitamentos_materiais ?? [],
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLista();
    const channel = (supabase as any)
      .channel("analise-reaprov-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "reaproveitamentos" }, fetchLista)
      .on("postgres_changes", { event: "*", schema: "public", table: "reaproveitamentos_materiais" }, fetchLista)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchLista]);

  function aplicarAtalho(id: Exclude<AtalhoId, null>) {
    const { inicio, fim } = calcAtalho(id);
    setDataInicio(inicio);
    setDataFim(fim);
    setAtalhoAtivo(id);
  }

  // SDRs filtrados por período e tipo de erro
  const periodo = useMemo(() => {
    return lista.filter((r) => {
      const dia = r.criado_em.split("T")[0];
      if (dataInicio && dia < dataInicio) return false;
      if (dataFim && dia > dataFim) return false;
      if (filtroTipo === null && r.tipo_erro !== null) return false;
      if (filtroTipo !== "todos" && filtroTipo !== null && r.tipo_erro !== filtroTipo) return false;
      return true;
    });
  }, [lista, dataInicio, dataFim, filtroTipo]);

  // ── Cards de resumo ────────────────────────────────────────────────────────
  const cards = useMemo(() => {
    const totalSDRs = periodo.length;
    const totalKgMaterial = periodo.reduce((s, r) => s + totalKgSDR(r), 0);
    const totalProducao = periodo.reduce((s, r) => s + (calcProducao(r) ?? 0), 0);
    const utilizados = periodo.filter((r) => r.status === "utilizado").length;
    const taxaUtil = totalSDRs > 0 ? Math.round((utilizados / totalSDRs) * 100) : 0;
    const pendentes = lista.filter((r) => r.status === "pendente");
    const kgPendentes = pendentes.reduce((s, r) => s + totalKgSDR(r), 0);
    return { totalSDRs, totalKgMaterial, totalProducao, taxaUtil, qtdPendentes: pendentes.length, kgPendentes };
  }, [periodo, lista]);

  // ── Seção 1: Ranking por origem ───────────────────────────────────────────
  // Itera pelos materiais de cada SDR — um SDR pode contribuir para múltiplas origens
  const rankingOrigem = useMemo(() => {
    const map = new Map<string, { qtd: number; kgMaterial: number; sdrIds: Set<string> }>();

    periodo.forEach((r) => {
      if (r.materiais && r.materiais.length > 0) {
        r.materiais.forEach((m) => {
          const key = m.produto_origem?.trim() || "Origem não informada";
          if (!map.has(key)) map.set(key, { qtd: 0, kgMaterial: 0, sdrIds: new Set() });
          const e = map.get(key)!;
          if (!e.sdrIds.has(r.id)) { e.qtd++; e.sdrIds.add(r.id); }
          e.kgMaterial += m.quantidade_material;
        });
      } else {
        // Fallback para SDRs sem materiais cadastrados
        const key = r.produto_origem?.trim() || "Origem não informada";
        if (!map.has(key)) map.set(key, { qtd: 0, kgMaterial: 0, sdrIds: new Set() });
        const e = map.get(key)!;
        if (!e.sdrIds.has(r.id)) { e.qtd++; e.sdrIds.add(r.id); }
        e.kgMaterial += r.quantidade_material;
      }
    });

    return Array.from(map.entries())
      .map(([nome, { qtd, kgMaterial }]) => ({ nome, qtd, kgMaterial, label: nome }))
      .sort((a, b) => b.kgMaterial - a.kgMaterial);
  }, [periodo]);

  // SDRs de uma origem específica (para o modal)
  const sdrsModal = useMemo(() => {
    if (!modalOrigem) return [];
    const chave = modalOrigem === "Origem não informada" ? null : modalOrigem;
    return lista.filter((r) => {
      if (r.materiais && r.materiais.length > 0) {
        if (chave === null) {
          return r.materiais.length === 0;
        }
        return r.materiais.some((m) => m.produto_origem?.trim() === chave);
      }
      // Fallback
      if (chave === null) return !r.produto_origem?.trim();
      return r.produto_origem?.trim() === chave;
    });
  }, [lista, modalOrigem]);

  // ── Seção 2: Volume por mês ────────────────────────────────────────────────
  const volumeMensal = useMemo(() => {
    const map = new Map<string, { kgMaterial: number; qtd: number }>();
    periodo.forEach((r) => {
      const key = r.criado_em.substring(0, 7);
      if (!map.has(key)) map.set(key, { kgMaterial: 0, qtd: 0 });
      const e = map.get(key)!;
      e.kgMaterial += totalKgSDR(r);
      e.qtd++;
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, { kgMaterial, qtd }]) => ({
        label: format(new Date(key + "-02"), "MMM/yy", { locale: ptBR }),
        kgMaterial,
        qtd,
      }));
  }, [periodo]);

  // ── Seção 3: Material parado ───────────────────────────────────────────────
  const materialParado = useMemo(() => {
    return lista
      .filter((r) => r.status === "pendente")
      .map((r) => ({
        ...r,
        dias: diasPassados(r.criado_em),
        totalKg: totalKgSDR(r),
        origens: origensLabel(r),
      }))
      .sort((a, b) => b.dias - a.dias);
  }, [lista]);

  // ── Divisão por tipo de erro ──────────────────────────────────────────────
  const divisaoTipo = useMemo(() => {
    const producao  = periodo.filter((r) => r.tipo_erro === "producao");
    const comercial = periodo.filter((r) => r.tipo_erro === "comercial");
    const semTipo   = periodo.filter((r) => !r.tipo_erro);
    return {
      producao:  { qtd: producao.length,  kg: producao.reduce((s, r) => s + totalKgSDR(r), 0) },
      comercial: { qtd: comercial.length, kg: comercial.reduce((s, r) => s + totalKgSDR(r), 0) },
      semTipo:   { qtd: semTipo.length,   kg: semTipo.reduce((s, r) => s + totalKgSDR(r), 0) },
    };
  }, [periodo]);

  // ── Seção 4: Ranking por produto_destino ──────────────────────────────────
  const rankingDestino = useMemo(() => {
    const map = new Map<string, { qtd: number; kgProducao: number }>();
    periodo.forEach((r) => {
      const key = r.produto_destino.trim() || "Destino não informado";
      if (!map.has(key)) map.set(key, { qtd: 0, kgProducao: 0 });
      const e = map.get(key)!;
      e.qtd++;
      e.kgProducao += calcProducao(r) ?? 0;
    });
    return Array.from(map.entries())
      .map(([nome, { qtd, kgProducao }]) => ({ nome, qtd, kgProducao }))
      .sort((a, b) => b.kgProducao - a.kgProducao);
  }, [periodo]);

  // ── CSV exports ───────────────────────────────────────────────────────────
  function exportarOrigemCSV() {
    const header = "Produto origem;Nº SDRs;Material total (kg)";
    const rows = rankingOrigem.map((r) =>
      [
        `"${r.nome.replace(/"/g, '""')}"`,
        r.qtd,
        r.kgMaterial.toFixed(3).replace(".", ","),
      ].join(";")
    );
    downloadCsv([header, ...rows].join("\n"), "ranking_origem_reaproveitamento.csv");
  }

  function exportarParadoCSV() {
    const header = "Código;Origens;Produto destino;Material (kg);Criado em;Dias parado";
    const rows = materialParado.map((r) =>
      [
        r.codigo,
        `"${r.origens.replace(/"/g, '""')}"`,
        `"${r.produto_destino.replace(/"/g, '""')}"`,
        r.totalKg.toFixed(3).replace(".", ","),
        fmtDate(r.criado_em),
        r.dias,
      ].join(";")
    );
    downloadCsv([header, ...rows].join("\n"), "material_parado_reaproveitamento.csv");
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 256, background: D.page, color: D.text }}>
        <Loader2 style={{ width: 32, height: 32, color: D.cyan }} className="animate-spin" />
      </div>
    );
  }

  const rankingTop10 = rankingOrigem.slice(0, 10);

  return (
    <div style={{ background: D.page, minHeight: "100vh", padding: "1.5rem", color: D.text }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
          <Recycle style={{ width: 24, height: 24, color: D.cyan }} />
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>Análise de Reaproveitamento</h1>
        </div>
        <p style={{ margin: 0, color: D.muted, fontSize: "0.875rem" }}>
          {periodo.length} SDR{periodo.length !== 1 ? "s" : ""} no período
        </p>
      </div>

      {/* ── Filtro de período e tipo ── */}
      <div style={{ ...cardStyle, marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap" }}>
          <CalendarRange style={{ width: 15, height: 15, color: D.muted, flexShrink: 0 }} />

          {ATALHOS.map((a) => (
            <button
              key={a.id}
              onClick={() => aplicarAtalho(a.id)}
              style={{
                padding: "0.25rem 0.625rem",
                borderRadius: "0.375rem",
                border: `1px solid ${atalhoAtivo === a.id ? D.cyan : D.border}`,
                background: atalhoAtivo === a.id ? `${D.cyan}22` : "transparent",
                color: atalhoAtivo === a.id ? D.cyan : D.muted,
                fontSize: "0.75rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {a.label}
            </button>
          ))}
          <button
            onClick={() => setAtalhoAtivo(null)}
            style={{
              padding: "0.25rem 0.625rem",
              borderRadius: "0.375rem",
              border: `1px solid ${atalhoAtivo === null ? D.cyan : D.border}`,
              background: atalhoAtivo === null ? `${D.cyan}22` : "transparent",
              color: atalhoAtivo === null ? D.cyan : D.muted,
              fontSize: "0.75rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Personalizado
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "auto", flexWrap: "wrap" }}>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => { setDataInicio(e.target.value); setAtalhoAtivo(null); }}
              style={{ background: D.cardAlt, border: `1px solid ${D.border}`, borderRadius: "0.375rem", color: D.text, fontSize: "0.75rem", padding: "0.25rem 0.5rem", outline: "none", colorScheme: dark ? "dark" : "light" }}
            />
            <span style={{ color: D.muted, fontSize: "0.75rem" }}>até</span>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => { setDataFim(e.target.value); setAtalhoAtivo(null); }}
              style={{ background: D.cardAlt, border: `1px solid ${D.border}`, borderRadius: "0.375rem", color: D.text, fontSize: "0.75rem", padding: "0.25rem 0.5rem", outline: "none", colorScheme: dark ? "dark" : "light" }}
            />
          </div>
        </div>

        {/* Filtro por tipo de erro */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.625rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.72rem", color: D.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Tipo de erro:</span>
          {([
            { v: "todos",    label: "Todos" },
            { v: "producao", label: "Produção",       cor: "#0891b2" },
            { v: "comercial",label: "Comercial",      cor: "#7c3aed" },
            { v: null,       label: "Não classificado", cor: D.muted },
          ] as const).map((f) => {
            const sel = filtroTipo === f.v;
            const cor = "cor" in f ? f.cor : D.muted;
            return (
              <button
                key={String(f.v)}
                onClick={() => setFiltroTipo(f.v)}
                style={{
                  padding: "0.2rem 0.625rem", borderRadius: "9999px", fontSize: "0.72rem", fontWeight: 600,
                  border: `1px solid ${sel ? cor : D.border}`,
                  background: sel ? `${cor}22` : "transparent",
                  color: sel ? cor : D.muted,
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Cards de resumo ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem", marginBottom: "1.75rem" }}>
        <SummaryCard
          label="Total de SDRs"
          value={String(cards.totalSDRs)}
          sub="no período"
          color={D.cyan}
        />
        <SummaryCard
          label="Material reaproveitado"
          value={formatKg(cards.totalKgMaterial)}
          sub="soma de todos os materiais"
        />
        <SummaryCard
          label="Produção gerada"
          value={cards.totalProducao > 0 ? formatKg(cards.totalProducao) : "—"}
          sub="soma das contribuições"
        />
        <SummaryCard
          label="Pendentes (estoque atual)"
          value={`${cards.qtdPendentes} SDR${cards.qtdPendentes !== 1 ? "s" : ""}`}
          sub={`${formatKg(cards.kgPendentes)} aguardando uso`}
          color={cards.qtdPendentes > 0 ? D.amber : D.emerald}
        />
        <SummaryCard
          label="Taxa de utilização"
          value={`${cards.taxaUtil}%`}
          sub="utilizados / total no período"
          color={cards.taxaUtil >= 70 ? D.emerald : cards.taxaUtil >= 40 ? D.amber : D.red}
        />
      </div>

      {/* ── Card: Divisão por tipo de erro ── */}
      <div style={{ ...cardStyle, marginBottom: "1.75rem" }}>
        <p style={{ margin: "0 0 0.875rem", fontSize: "0.8rem", fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Divisão por tipo de erro — no período
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
          {/* Produção */}
          <div style={{ padding: "0.875rem 1rem", borderRadius: "0.5rem", border: "2px solid #0891b2", background: "#0891b218" }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#0891b2", textTransform: "uppercase", letterSpacing: "0.05em" }}>Erro de produção</p>
            <p style={{ margin: "0.35rem 0 0", fontSize: 22, fontWeight: 700, color: "#0891b2", lineHeight: 1 }}>
              {divisaoTipo.producao.qtd} <span style={{ fontSize: 13, fontWeight: 500 }}>SDR{divisaoTipo.producao.qtd !== 1 ? "s" : ""}</span>
            </p>
            <p style={{ margin: "0.25rem 0 0", fontSize: 13, fontWeight: 600, color: D.text }}>
              {formatKg(divisaoTipo.producao.kg)}
            </p>
            {cards.totalSDRs > 0 && (
              <div style={{ marginTop: "0.625rem", height: 6, borderRadius: 999, background: D.border, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 999, background: "#0891b2", width: `${Math.round((divisaoTipo.producao.qtd / cards.totalSDRs) * 100)}%`, transition: "width 0.4s" }} />
              </div>
            )}
            <p style={{ margin: "0.25rem 0 0", fontSize: 11, color: D.muted }}>
              {cards.totalSDRs > 0 ? `${Math.round((divisaoTipo.producao.qtd / cards.totalSDRs) * 100)}% dos SDRs` : "—"}
            </p>
          </div>

          {/* Comercial */}
          <div style={{ padding: "0.875rem 1rem", borderRadius: "0.5rem", border: "2px solid #7c3aed", background: "#7c3aed18" }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.05em" }}>Erro comercial</p>
            <p style={{ margin: "0.35rem 0 0", fontSize: 22, fontWeight: 700, color: "#7c3aed", lineHeight: 1 }}>
              {divisaoTipo.comercial.qtd} <span style={{ fontSize: 13, fontWeight: 500 }}>SDR{divisaoTipo.comercial.qtd !== 1 ? "s" : ""}</span>
            </p>
            <p style={{ margin: "0.25rem 0 0", fontSize: 13, fontWeight: 600, color: D.text }}>
              {formatKg(divisaoTipo.comercial.kg)}
            </p>
            {cards.totalSDRs > 0 && (
              <div style={{ marginTop: "0.625rem", height: 6, borderRadius: 999, background: D.border, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 999, background: "#7c3aed", width: `${Math.round((divisaoTipo.comercial.qtd / cards.totalSDRs) * 100)}%`, transition: "width 0.4s" }} />
              </div>
            )}
            <p style={{ margin: "0.25rem 0 0", fontSize: 11, color: D.muted }}>
              {cards.totalSDRs > 0 ? `${Math.round((divisaoTipo.comercial.qtd / cards.totalSDRs) * 100)}% dos SDRs` : "—"}
            </p>
          </div>

          {/* Não classificado */}
          {divisaoTipo.semTipo.qtd > 0 && (
            <div style={{ padding: "0.875rem 1rem", borderRadius: "0.5rem", border: `1px solid ${D.border}`, background: D.cardAlt }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Não classificado</p>
              <p style={{ margin: "0.35rem 0 0", fontSize: 22, fontWeight: 700, color: D.muted, lineHeight: 1 }}>
                {divisaoTipo.semTipo.qtd} <span style={{ fontSize: 13, fontWeight: 500 }}>SDR{divisaoTipo.semTipo.qtd !== 1 ? "s" : ""}</span>
              </p>
              <p style={{ margin: "0.25rem 0 0", fontSize: 13, fontWeight: 600, color: D.text }}>
                {formatKg(divisaoTipo.semTipo.kg)}
              </p>
              <p style={{ margin: "0.5rem 0 0", fontSize: 11, color: D.amber, fontStyle: "italic" }}>
                Registros antigos — classifique editando cada SDR
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Seção 1: Origem do retrabalho ── */}
      <div style={{ marginBottom: "1.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <SectionTitle
            icon={<BarChart2 style={{ width: 15, height: 15, color: D.cyan }} />}
            title="Origem do retrabalho"
          />
          {rankingOrigem.length > 0 && (
            <button
              onClick={exportarOrigemCSV}
              style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.25rem 0.625rem", background: D.cardAlt, border: `1px solid ${D.border}`, borderRadius: "0.375rem", color: D.muted, fontSize: "0.72rem", fontWeight: 500, cursor: "pointer" }}
            >
              <Download style={{ width: 12, height: 12 }} /> CSV
            </button>
          )}
        </div>

        {rankingOrigem.length === 0 ? (
          <div style={cardStyle}><Vazio /></div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "1rem" }}>
            {/* Gráfico de barras horizontal */}
            <div style={cardStyle}>
              <p style={{ margin: "0 0 0.875rem", fontSize: "0.8rem", fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Top 10 por kg de material
              </p>
              <ResponsiveContainer width="100%" height={Math.min(400, Math.max(200, rankingTop10.length * 44))}>
                <BarChart
                  data={rankingTop10}
                  layout="vertical"
                  margin={{ top: 0, right: 60, left: 0, bottom: 0 }}
                >
                  <CartesianGrid horizontal={false} stroke={D.grid} />
                  <XAxis
                    type="number"
                    tick={{ fill: D.muted, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}t`}
                  />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    tick={{ fill: D.text, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={160}
                    tickFormatter={(v: string) => v.length > 22 ? v.substring(0, 22) + "…" : v}
                  />
                  <Tooltip content={<TooltipKg />} cursor={{ fill: D.grid }} />
                  <Bar dataKey="kgMaterial" radius={[0, 4, 4, 0]}>
                    {rankingTop10.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? D.red : i === 1 ? D.amber : D.cyan} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.68rem", color: D.muted }}>
                Vermelho = maior gerador de retrabalho
              </p>
            </div>

            {/* Tabela ranking completo */}
            <div style={cardStyle}>
              <p style={{ margin: "0 0 0.875rem", fontSize: "0.8rem", fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Ranking completo — clique para ver histórico
              </p>
              <div style={{ borderRadius: "0.5rem", border: `1px solid ${D.border}`, overflow: "hidden" }}>
                <div style={{ overflowY: "auto", maxHeight: 420 }}>
                  <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${D.border}`, background: D.cardAlt, position: "sticky", top: 0, zIndex: 10 }}>
                        <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, color: D.muted, fontSize: 11, width: 32 }}>#</th>
                        <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, color: D.muted, fontSize: 11 }}>Produto de origem</th>
                        <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600, color: D.muted, fontSize: 11 }}>SDRs</th>
                        <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600, color: D.muted, fontSize: 11 }}>Material (kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingOrigem.map(({ nome, qtd, kgMaterial }, i) => (
                        <tr
                          key={nome}
                          style={{ borderBottom: `1px solid ${D.border}`, cursor: "pointer" }}
                          onClick={() => setModalOrigem(nome)}
                          onMouseEnter={(e) => (e.currentTarget.style.background = D.cardAlt)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <td style={{ padding: "0.5rem 0.75rem", color: D.muted, fontFamily: "monospace", fontSize: 11 }}>
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}º`}
                          </td>
                          <td style={{ padding: "0.5rem 0.75rem", color: i === 0 ? D.red : D.text, fontWeight: i < 3 ? 600 : 400, fontSize: 12 }}>
                            {nome}
                          </td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: D.muted, fontSize: 12 }}>{qtd}</td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600, color: D.cyan, fontFamily: "monospace", fontSize: 12 }}>
                            {formatKg(kgMaterial)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Seção 2: Volume ao longo do tempo ── */}
      <div style={{ marginBottom: "1.75rem" }}>
        <SectionTitle
          icon={<TrendingDown style={{ width: 15, height: 15, color: D.cyan }} />}
          title="Volume ao longo do tempo"
        />
        <div style={cardStyle}>
          <p style={{ margin: "0 0 0.875rem", fontSize: "0.8rem", fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            kg de material reaproveitado por mês
          </p>
          {volumeMensal.length === 0 ? <Vazio /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={volumeMensal} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={D.grid} />
                <XAxis dataKey="label" tick={{ fill: D.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: D.muted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}t`} />
                <Tooltip content={<TooltipKg />} cursor={{ fill: D.grid }} />
                <Bar dataKey="kgMaterial" fill={D.cyan} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Seção 3: Material parado ── */}
      <div style={{ marginBottom: "1.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <SectionTitle
            icon={<AlertTriangle style={{ width: 15, height: 15, color: D.amber }} />}
            title="Material parado (estoque atual)"
          />
          {materialParado.length > 0 && (
            <button
              onClick={exportarParadoCSV}
              style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.25rem 0.625rem", background: D.cardAlt, border: `1px solid ${D.border}`, borderRadius: "0.375rem", color: D.muted, fontSize: "0.72rem", fontWeight: 500, cursor: "pointer" }}
            >
              <Download style={{ width: 12, height: 12 }} /> CSV
            </button>
          )}
        </div>

        {materialParado.length === 0 ? (
          <div style={cardStyle}><Vazio mensagem="Nenhum SDR pendente — sem material parado" /></div>
        ) : (
          <>
            <div style={{ ...cardStyle, display: "inline-flex", alignItems: "center", gap: "1.5rem", marginBottom: "0.75rem", padding: "0.875rem 1.5rem" }}>
              <div>
                <p style={{ margin: 0, fontSize: "0.7rem", color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>SDRs pendentes</p>
                <p style={{ margin: "0.125rem 0 0", fontSize: "1.75rem", fontWeight: 700, color: D.amber, lineHeight: 1 }}>
                  {materialParado.length}
                </p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: "0.7rem", color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>kg parados</p>
                <p style={{ margin: "0.125rem 0 0", fontSize: "1.75rem", fontWeight: 700, color: D.amber, lineHeight: 1 }}>
                  {formatKg(materialParado.reduce((s, r) => s + r.totalKg, 0))}
                </p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: "0.7rem", color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Críticos ({`>`}{LIMITE_DIAS_PARADO}d)</p>
                <p style={{ margin: "0.125rem 0 0", fontSize: "1.75rem", fontWeight: 700, color: D.red, lineHeight: 1 }}>
                  {materialParado.filter((r) => r.dias > LIMITE_DIAS_PARADO).length}
                </p>
              </div>
            </div>

            <div style={{ borderRadius: "0.75rem", border: `1px solid ${D.border}`, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: D.cardAlt, borderBottom: `1px solid ${D.border}` }}>
                      <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, color: D.muted, fontSize: 11 }}>Código</th>
                      <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, color: D.muted, fontSize: 11 }}>Origens (materiais)</th>
                      <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, color: D.muted, fontSize: 11 }}>Produto destino</th>
                      <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600, color: D.muted, fontSize: 11 }}>Material (kg)</th>
                      <th style={{ padding: "0.5rem 0.75rem", textAlign: "center", fontWeight: 600, color: D.muted, fontSize: 11 }}>Criado em</th>
                      <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600, color: D.muted, fontSize: 11 }}>Dias parado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materialParado.map((r, i) => {
                      const critico = r.dias > LIMITE_DIAS_PARADO;
                      return (
                        <tr key={r.id} style={{ borderBottom: `1px solid ${D.border}`, background: i % 2 === 0 ? "transparent" : D.cardAlt }}>
                          <td style={{ padding: "0.5rem 0.75rem", color: D.cyan, fontWeight: 700, fontFamily: "monospace" }}>{r.codigo}</td>
                          <td style={{ padding: "0.5rem 0.75rem", color: D.muted, fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.origens || <span style={{ fontStyle: "italic" }}>—</span>}
                          </td>
                          <td style={{ padding: "0.5rem 0.75rem", color: D.text, fontWeight: 500, fontSize: 12 }}>{r.produto_destino}</td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>
                            {formatKg(r.totalKg)}
                          </td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "center", color: D.muted }}>{fmtDate(r.criado_em)}</td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>
                            <span style={{
                              display: "inline-block",
                              padding: "0.15rem 0.5rem",
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 700,
                              background: critico ? `${D.red}22` : `${D.amber}22`,
                              color: critico ? D.red : D.amber,
                              border: `1px solid ${critico ? D.red : D.amber}`,
                            }}>
                              {r.dias}d {critico ? "⚠" : ""}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.68rem", color: D.muted }}>
              Ordenado pelo mais antigo (maior risco de perda). Crítico: mais de {LIMITE_DIAS_PARADO} dias parado.
            </p>
          </>
        )}
      </div>

      {/* ── Seção 4: Destino mais comum ── */}
      <div style={{ marginBottom: "1.75rem" }}>
        <SectionTitle
          icon={<ArrowDownToLine style={{ width: 15, height: 15, color: D.cyan }} />}
          title="Destino mais comum"
        />
        {rankingDestino.length === 0 ? (
          <div style={cardStyle}><Vazio /></div>
        ) : (
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: D.cardAlt, borderBottom: `1px solid ${D.border}` }}>
                  <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, color: D.muted, fontSize: 11, width: 32 }}>#</th>
                  <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, color: D.muted, fontSize: 11 }}>Produto de destino</th>
                  <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600, color: D.muted, fontSize: 11 }}>SDRs</th>
                  <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600, color: D.muted, fontSize: 11 }}>Produção gerada (kg)</th>
                </tr>
              </thead>
              <tbody>
                {rankingDestino.map(({ nome, qtd, kgProducao }, i) => (
                  <tr key={nome} style={{ borderBottom: `1px solid ${D.border}`, background: i % 2 === 0 ? "transparent" : D.cardAlt }}>
                    <td style={{ padding: "0.5rem 0.75rem", color: D.muted, fontFamily: "monospace", fontSize: 11 }}>{i + 1}º</td>
                    <td style={{ padding: "0.5rem 0.75rem", color: D.text, fontWeight: 500, fontSize: 12 }}>{nome}</td>
                    <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: D.muted, fontSize: 12 }}>{qtd}</td>
                    <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600, color: D.emerald, fontFamily: "monospace", fontSize: 12 }}>
                      {kgProducao > 0 ? formatKg(kgProducao) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal: histórico de SDRs de uma origem ── */}
      <Dialog open={!!modalOrigem} onOpenChange={(o) => { if (!o) setModalOrigem(null); }}>
        <DialogContent
          className="max-w-2xl max-h-[80vh] overflow-y-auto"
          style={{ background: D.card, border: `1px solid ${D.border}`, color: D.text }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: D.text }}>
              SDRs — {modalOrigem}
            </DialogTitle>
          </DialogHeader>
          <div style={{ marginTop: "0.25rem" }}>
            {sdrsModal.length === 0 ? (
              <p style={{ color: D.muted, textAlign: "center", padding: "2rem 0" }}>Nenhum SDR encontrado.</p>
            ) : (
              <>
                <p style={{ margin: "0 0 0.75rem", fontSize: "0.75rem", color: D.muted }}>
                  {sdrsModal.length} SDR{sdrsModal.length !== 1 ? "s" : ""} no total
                </p>
                <div style={{ borderRadius: "0.5rem", border: `1px solid ${D.border}`, overflow: "hidden" }}>
                  <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: D.cardAlt, borderBottom: `1px solid ${D.border}` }}>
                        <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, color: D.muted, fontSize: 11 }}>Código</th>
                        <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, color: D.muted, fontSize: 11 }}>Destino</th>
                        <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600, color: D.muted, fontSize: 11 }}>Material (kg)</th>
                        <th style={{ padding: "0.5rem 0.75rem", textAlign: "center", fontWeight: 600, color: D.muted, fontSize: 11 }}>Data</th>
                        <th style={{ padding: "0.5rem 0.75rem", textAlign: "center", fontWeight: 600, color: D.muted, fontSize: 11 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sdrsModal.map((r, i) => (
                        <tr key={r.id} style={{ borderBottom: `1px solid ${D.border}`, background: i % 2 === 0 ? "transparent" : D.cardAlt }}>
                          <td style={{ padding: "0.5rem 0.75rem", color: D.cyan, fontWeight: 700, fontFamily: "monospace" }}>{r.codigo}</td>
                          <td style={{ padding: "0.5rem 0.75rem", color: D.text, fontSize: 12 }}>{r.produto_destino}</td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{formatKg(totalKgSDR(r))}</td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "center", color: D.muted }}>{fmtDate(r.criado_em)}</td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>
                            <span style={{
                              display: "inline-block",
                              padding: "0.1rem 0.5rem",
                              borderRadius: 999,
                              fontSize: 10,
                              fontWeight: 700,
                              background: r.status === "utilizado" ? `${D.emerald}22` : `${D.amber}22`,
                              color: r.status === "utilizado" ? D.emerald : D.amber,
                              textTransform: "uppercase",
                            }}>
                              {r.status === "utilizado" ? "Utilizado" : "Pendente"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
