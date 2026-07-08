import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Wrench, BarChart2, CalendarRange, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ── Theme palette (light/dark) ────────────────────────────────────────────────
function buildPalette(dark: boolean) {
  return {
    page:    dark ? "#111827" : "#f8fafc",
    card:    dark ? "#1f2937" : "#ffffff",
    cardAlt: dark ? "#374151" : "#f1f5f9",
    border:  dark ? "#374151" : "#e2e8f0",
    text:    dark ? "#f1f5f9" : "#0f172a",
    muted:   dark ? "#94a3b8" : "#64748b",
    cyan:    "#0891b2",
    emerald: "#059669",
    amber:   "#d97706",
    red:     "#dc2626",
    violet:  "#7c3aed",
    grid:    dark ? "#374151" : "#e2e8f0",
  };
}

// Placeholder — replaced by reactive value inside component
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

// Legacy aliases — overwritten in component render scope via closure
let cardStyle = makeCardStyle(D);
let tooltipStyle = makeTooltipStyle(D);

// ── Types ─────────────────────────────────────────────────────────────────────
interface OS {
  id: string;
  descricao_problema: string;
  prioridade: string;
  tipo: string;
  status: string;
  aberta_por: string | null;
  tecnico_nome: string | null;
  solucao_aplicada: string | null;
  aberta_em: string | null;
  iniciado_em: string | null;
  concluido_em: string | null;
  equipamentos?: { id: string; nome: string; tag: string | null; linha: number | null } | null;
}

type AtalhoId = "hoje" | "semana" | "mes" | "ano" | null;

const ATALHOS: { id: Exclude<AtalhoId, null>; label: string }[] = [
  { id: "hoje",   label: "Hoje" },
  { id: "semana", label: "Esta semana" },
  { id: "mes",    label: "Este mês" },
  { id: "ano",    label: "Este ano" },
];

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

function diffHours(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (diff <= 0) return null;
  return diff / (1000 * 60 * 60);
}

function fmtHoras(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}min`;
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm > 0 ? `${hh}h ${mm}min` : `${hh}h`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
}

function getPrioridadeConfig(d: ReturnType<typeof buildPalette>): Record<string, { label: string; color: string }> {
  return {
    baixa:   { label: "Baixa",   color: d.muted },
    media:   { label: "Média",   color: d.cyan },
    alta:    { label: "Alta",    color: d.amber },
    critica: { label: "Crítica", color: d.red },
  };
}

function getStatusConfig(d: ReturnType<typeof buildPalette>): Record<string, { label: string; color: string }> {
  return {
    aberta:               { label: "Aberta",           color: d.muted },
    em_andamento:         { label: "Em Andamento",      color: d.cyan },
    aguardando_aprovacao: { label: "Aguard. Aprovação", color: d.amber },
    concluida:            { label: "Concluída",         color: d.emerald },
  };
}

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// ── Tooltip components ────────────────────────────────────────────────────────
function TooltipContagem({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={tooltipStyle}>
      <p style={{ fontWeight: 700, margin: 0 }}>{d.label ?? d.nome ?? "—"}</p>
      <p style={{ margin: "4px 0 0", color: D.cyan }}>{payload[0].value} OS</p>
    </div>
  );
}

function TooltipTempo({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={tooltipStyle}>
      <p style={{ fontWeight: 700, margin: 0 }}>{d.label ?? d.nome ?? "—"}</p>
      <p style={{ margin: "4px 0 0", color: D.emerald }}>{fmtHoras(payload[0].value)}</p>
      <p style={{ margin: "2px 0 0", color: D.muted }}>
        {d.qtdConcluidas} OS concluída{d.qtdConcluidas !== 1 ? "s" : ""}
      </p>
    </div>
  );
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

// ── Main component ────────────────────────────────────────────────────────────
export default function PainelAnaliseManutencao() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  D = buildPalette(dark);
  cardStyle = makeCardStyle(D);
  tooltipStyle = makeTooltipStyle(D);

  const PRIORIDADE_CONFIG = getPrioridadeConfig(D);
  const STATUS_CONFIG = getStatusConfig(D);

  const [oss, setOss] = useState<OS[]>([]);
  const [loading, setLoading] = useState(true);

  const mesAtual = useMemo(() => calcAtalho("mes"), []);
  const [dataInicio, setDataInicio] = useState(mesAtual.inicio);
  const [dataFim, setDataFim]       = useState(mesAtual.fim);
  const [atalhoAtivo, setAtalhoAtivo] = useState<AtalhoId>("mes");
  const [equipFiltro, setEquipFiltro] = useState("");

  const [modalEquip, setModalEquip] = useState<{ id: string; nome: string } | null>(null);

  const fetchOss = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("ordens_servico")
      .select("*, equipamentos(id, nome, tag, linha)")
      .order("aberta_em", { ascending: false });
    if (!error) setOss(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOss();
    const channel = supabase
      .channel("analise-manutencao-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ordens_servico" }, fetchOss)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchOss]);

  function aplicarAtalho(id: Exclude<AtalhoId, null>) {
    const { inicio, fim } = calcAtalho(id);
    setDataInicio(inicio);
    setDataFim(fim);
    setAtalhoAtivo(id);
  }

  // Lista de equipamentos para o dropdown
  const equipamentosUnicos = useMemo(() => {
    const map = new Map<string, string>();
    oss.forEach((o) => {
      if (o.equipamentos?.id) map.set(o.equipamentos.id, o.equipamentos.nome);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [oss]);

  // OS filtradas por período (baseado em aberta_em)
  const ossPeriodo = useMemo(() => {
    return oss.filter((o) => {
      if (!o.aberta_em) return false;
      const dia = o.aberta_em.split("T")[0];
      if (dataInicio && dia < dataInicio) return false;
      if (dataFim && dia > dataFim) return false;
      return true;
    });
  }, [oss, dataInicio, dataFim]);

  // OS filtradas por período + equipamento
  const ossFiltered = useMemo(() => {
    if (!equipFiltro) return ossPeriodo;
    return ossPeriodo.filter((o) => o.equipamentos?.id === equipFiltro);
  }, [ossPeriodo, equipFiltro]);

  // ── Seção 1: Por Equipamento (usa ossPeriodo para sempre mostrar ranking completo) ──
  const rankingEquipamentos = useMemo(() => {
    const source = equipFiltro ? ossFiltered : ossPeriodo;
    const map = new Map<string, { nome: string; count: number; tempos: number[] }>();
    source.forEach((o) => {
      const id   = o.equipamentos?.id   ?? "__unknown";
      const nome = o.equipamentos?.nome ?? "Equipamento removido";
      if (!map.has(id)) map.set(id, { nome, count: 0, tempos: [] });
      const entry = map.get(id)!;
      entry.count++;
      const h = diffHours(o.aberta_em, o.concluido_em);
      if (h !== null && o.status === "concluida") entry.tempos.push(h);
    });
    return Array.from(map.entries())
      .map(([id, { nome, count, tempos }]) => ({
        id,
        nome,
        count,
        mediaReparo: tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null,
        qtdConcluidas: tempos.length,
      }))
      .sort((a, b) => b.count - a.count);
  }, [ossPeriodo, ossFiltered, equipFiltro]);

  // OS do modal (histórico completo do equipamento, sem filtro de período)
  const ossModal = useMemo(() => {
    if (!modalEquip) return [];
    return oss.filter((o) => o.equipamentos?.id === modalEquip.id);
  }, [oss, modalEquip]);

  // ── Seção 2: Por Tempo ────────────────────────────────────────────────────
  const osPorMes = useMemo(() => {
    const map = new Map<string, number>();
    ossFiltered.forEach((o) => {
      if (!o.aberta_em) return;
      const key = o.aberta_em.substring(0, 7);
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, count]) => ({
        label: format(new Date(key + "-02"), "MMM/yy", { locale: ptBR }),
        count,
      }));
  }, [ossFiltered]);

  const mediaGeralReparo = useMemo(() => {
    const tempos = ossFiltered
      .filter((o) => o.status === "concluida")
      .map((o) => diffHours(o.aberta_em, o.concluido_em))
      .filter((h): h is number => h !== null);
    if (!tempos.length) return null;
    return tempos.reduce((a, b) => a + b, 0) / tempos.length;
  }, [ossFiltered]);

  const tipoProporção = useMemo(() => {
    const total = ossFiltered.length;
    const preventiva = ossFiltered.filter((o) => (o.tipo ?? "corretiva") === "preventiva").length;
    const corretiva = total - preventiva;
    const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;
    return { total, preventiva, corretiva, pctPreventiva: pct(preventiva), pctCorretiva: pct(corretiva) };
  }, [ossFiltered]);

  const osPorDiaSemana = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    ossFiltered.forEach((o) => {
      if (!o.aberta_em) return;
      counts[new Date(o.aberta_em).getDay()]++;
    });
    const max = Math.max(...counts);
    return DIAS_SEMANA.map((label, i) => ({ label, count: counts[i], isMax: counts[i] === max && max > 0 }));
  }, [ossFiltered]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 256, background: D.page, color: D.text }}>
        <Loader2 style={{ width: 32, height: 32, color: D.cyan }} className="animate-spin" />
      </div>
    );
  }

  const rankingTop10 = rankingEquipamentos.slice(0, 10);
  const rankingComReparo = rankingEquipamentos.filter((e) => e.mediaReparo !== null).slice(0, 10);
  const qtdConcluidas = ossFiltered.filter((o) => o.status === "concluida").length;

  return (
    <div style={{ background: D.page, minHeight: "100vh", padding: "1.5rem", color: D.text }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
          <BarChart2 style={{ width: 24, height: 24, color: D.cyan }} />
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>Análise de Manutenção</h1>
        </div>
        <p style={{ margin: 0, color: D.muted, fontSize: "0.875rem" }}>
          {ossFiltered.length} OS no período · {qtdConcluidas} concluída{qtdConcluidas !== 1 ? "s" : ""}
        </p>
      </div>

      {/* ── Filtros ── */}
      <div style={{ ...cardStyle, marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap" }}>
          <CalendarRange style={{ width: 15, height: 15, color: D.muted, flexShrink: 0 }} />

          {/* Atalhos */}
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

          {/* Datas + equipamento */}
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
            <select
              value={equipFiltro}
              onChange={(e) => setEquipFiltro(e.target.value)}
              style={{
                background: D.cardAlt,
                border: `1px solid ${D.border}`,
                borderRadius: "0.375rem",
                color: equipFiltro ? D.text : D.muted,
                fontSize: "0.75rem",
                padding: "0.25rem 0.5rem",
                outline: "none",
                minWidth: 170,
              }}
            >
              <option value="">Todos os equipamentos</option>
              {equipamentosUnicos.map(([id, nome]) => (
                <option key={id} value={id}>{nome}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Proporção Preventiva × Corretiva ── */}
      {tipoProporção.total > 0 && (
        <div style={{ ...cardStyle, marginBottom: "1.75rem" }}>
          <p style={{ margin: "0 0 0.875rem", fontSize: "0.8rem", fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Proporção Preventiva × Corretiva
          </p>
          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginBottom: "0.875rem" }}>
            {/* Corretiva */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: D.red, flexShrink: 0 }} />
              <div>
                <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, color: D.red, lineHeight: 1 }}>
                  {tipoProporção.corretiva}
                  <span style={{ fontSize: "0.85rem", fontWeight: 500, color: D.muted, marginLeft: "0.25rem" }}>
                    ({tipoProporção.pctCorretiva}%)
                  </span>
                </p>
                <p style={{ margin: "0.125rem 0 0", fontSize: "0.72rem", color: D.muted }}>Corretiva</p>
              </div>
            </div>
            {/* Preventiva */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: D.emerald, flexShrink: 0 }} />
              <div>
                <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, color: D.emerald, lineHeight: 1 }}>
                  {tipoProporção.preventiva}
                  <span style={{ fontSize: "0.85rem", fontWeight: 500, color: D.muted, marginLeft: "0.25rem" }}>
                    ({tipoProporção.pctPreventiva}%)
                  </span>
                </p>
                <p style={{ margin: "0.125rem 0 0", fontSize: "0.72rem", color: D.muted }}>Preventiva</p>
              </div>
            </div>
          </div>
          {/* Barra de proporção */}
          <div style={{ height: 10, borderRadius: 999, overflow: "hidden", background: D.border, display: "flex" }}>
            {tipoProporção.pctCorretiva > 0 && (
              <div style={{ width: `${tipoProporção.pctCorretiva}%`, background: D.red, transition: "width 0.4s" }} />
            )}
            {tipoProporção.pctPreventiva > 0 && (
              <div style={{ width: `${tipoProporção.pctPreventiva}%`, background: D.emerald, transition: "width 0.4s" }} />
            )}
          </div>
        </div>
      )}

      {/* ── Seção 1: Por Equipamento ── */}
      <SectionTitle icon={<Wrench style={{ width: 15, height: 15, color: D.cyan }} />} title="Por Equipamento" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "1rem", marginBottom: "1.75rem" }}>

        {/* Ranking: quantidade de OS */}
        <div style={cardStyle}>
          <p style={{ margin: "0 0 0.875rem", fontSize: "0.8rem", fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Ranking por nº de OS
          </p>
          {rankingTop10.length === 0 ? <Vazio /> : (
            <>
              <ResponsiveContainer width="100%" height={Math.min(400, Math.max(180, rankingTop10.length * 42))}>
                <BarChart
                  data={rankingTop10}
                  layout="vertical"
                  margin={{ top: 0, right: 28, left: 0, bottom: 0 }}
                >
                  <CartesianGrid horizontal={false} stroke={D.grid} />
                  <XAxis type="number" tick={{ fill: D.muted, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    tick={{ fill: D.text, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={130}
                  />
                  <Tooltip content={<TooltipContagem />} cursor={{ fill: D.grid }} />
                  <Bar
                    dataKey="count"
                    radius={[0, 4, 4, 0]}
                    onClick={(d) => setModalEquip({ id: d.id, nome: d.nome })}
                    style={{ cursor: "pointer" }}
                  >
                    {rankingTop10.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? D.cyan : `${D.cyan}99`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.68rem", color: D.muted }}>
                Clique em um equipamento para ver o histórico completo
              </p>
            </>
          )}
        </div>

        {/* Tempo médio de reparo por equipamento */}
        <div style={cardStyle}>
          <p style={{ margin: "0 0 0.875rem", fontSize: "0.8rem", fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Tempo médio de reparo
          </p>
          {rankingComReparo.length === 0
            ? <Vazio mensagem="Nenhuma OS concluída no período" />
            : (
              <ResponsiveContainer width="100%" height={Math.min(400, Math.max(180, rankingComReparo.length * 42))}>
                <BarChart
                  data={rankingComReparo.map((e) => ({
                    ...e,
                    mediaReparo: parseFloat(e.mediaReparo!.toFixed(2)),
                  }))}
                  layout="vertical"
                  margin={{ top: 0, right: 28, left: 0, bottom: 0 }}
                >
                  <CartesianGrid horizontal={false} stroke={D.grid} />
                  <XAxis
                    type="number"
                    tick={{ fill: D.muted, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}h`}
                  />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    tick={{ fill: D.text, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={130}
                  />
                  <Tooltip content={<TooltipTempo />} cursor={{ fill: D.grid }} />
                  <Bar dataKey="mediaReparo" radius={[0, 4, 4, 0]}>
                    {rankingComReparo.map((_, i) => (
                      <Cell key={i} fill={D.emerald} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          }
        </div>
      </div>

      {/* ── Seção 2: Por Tempo ── */}
      <SectionTitle icon={<Clock style={{ width: 15, height: 15, color: D.cyan }} />} title="Por Tempo" />

      {/* Card: tempo médio geral */}
      <div style={{ marginBottom: "1rem" }}>
        <div style={{
          ...cardStyle,
          display: "inline-flex",
          alignItems: "center",
          gap: "1rem",
          padding: "0.875rem 1.5rem",
        }}>
          <Clock style={{ width: 22, height: 22, color: D.emerald, flexShrink: 0 }} />
          <div>
            <p style={{ margin: 0, fontSize: "0.7rem", color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Tempo médio geral de reparo
            </p>
            <p style={{ margin: "0.125rem 0 0", fontSize: "1.75rem", fontWeight: 700, color: D.emerald, lineHeight: 1 }}>
              {mediaGeralReparo !== null ? fmtHoras(mediaGeralReparo) : "—"}
            </p>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.7rem", color: D.muted }}>
              baseado em {qtdConcluidas} OS concluída{qtdConcluidas !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>

        {/* OS abertas por mês */}
        <div style={cardStyle}>
          <p style={{ margin: "0 0 0.875rem", fontSize: "0.8rem", fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            OS abertas por mês
          </p>
          {osPorMes.length === 0 ? <Vazio /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={osPorMes} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={D.grid} />
                <XAxis dataKey="label" tick={{ fill: D.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: D.muted, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<TooltipContagem />} cursor={{ fill: D.grid }} />
                <Bar dataKey="count" fill={D.cyan} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* OS por dia da semana */}
        <div style={cardStyle}>
          <p style={{ margin: "0 0 0.875rem", fontSize: "0.8rem", fontWeight: 600, color: D.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            OS por dia da semana
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={osPorDiaSemana} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={D.grid} />
              <XAxis dataKey="label" tick={{ fill: D.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: D.muted, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<TooltipContagem />} cursor={{ fill: D.grid }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {osPorDiaSemana.map((d, i) => (
                  <Cell key={i} fill={d.isMax ? D.amber : D.violet} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.68rem", color: D.muted }}>
            Dia com mais OS destacado em amarelo
          </p>
        </div>
      </div>

      {/* ── Modal: Histórico completo do equipamento ── */}
      <Dialog open={!!modalEquip} onOpenChange={(o) => { if (!o) setModalEquip(null); }}>
        <DialogContent
          className="max-w-2xl max-h-[80vh] overflow-y-auto"
          style={{ background: D.card, border: `1px solid ${D.border}`, color: D.text }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: D.text }}>
              Histórico completo — {modalEquip?.nome}
            </DialogTitle>
          </DialogHeader>
          <div style={{ marginTop: "0.25rem" }}>
            {ossModal.length === 0 ? (
              <p style={{ color: D.muted, textAlign: "center", padding: "2rem 0" }}>Nenhuma OS encontrada.</p>
            ) : (
              <>
                <p style={{ margin: "0 0 0.75rem", fontSize: "0.75rem", color: D.muted }}>
                  {ossModal.length} OS no total para este equipamento
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                  {ossModal.map((o) => {
                    const prio = PRIORIDADE_CONFIG[o.prioridade] ?? { label: o.prioridade, color: D.muted };
                    const st   = STATUS_CONFIG[o.status]       ?? { label: o.status,      color: D.muted };
                    const h    = diffHours(o.aberta_em, o.concluido_em);
                    return (
                      <div
                        key={o.id}
                        style={{
                          background: D.cardAlt,
                          border: `1px solid ${D.border}`,
                          borderRadius: "0.5rem",
                          padding: "0.875rem",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                          <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 500, flex: 1, minWidth: 0 }}>
                            {o.descricao_problema}
                          </p>
                          <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", flexShrink: 0 }}>
                            <span style={{ padding: "0.125rem 0.5rem", borderRadius: 999, fontSize: "0.7rem", fontWeight: 600, background: `${prio.color}22`, color: prio.color }}>{prio.label}</span>
                            <span style={{ padding: "0.125rem 0.5rem", borderRadius: 999, fontSize: "0.7rem", fontWeight: 600, background: `${st.color}22`, color: st.color }}>{st.label}</span>
                          </div>
                        </div>
                        {o.solucao_aplicada && (
                          <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: D.muted }}>
                            <span style={{ color: D.emerald, fontWeight: 600 }}>Solução: </span>
                            {o.solucao_aplicada}
                          </p>
                        )}
                        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.5rem", fontSize: "0.7rem", color: D.muted }}>
                          <span>Aberta: {fmtDate(o.aberta_em)}</span>
                          {o.aberta_por && <span>Por: {o.aberta_por}</span>}
                          {o.tecnico_nome && <span>Técnico: {o.tecnico_nome}</span>}
                          {o.concluido_em && <span>Concluída: {fmtDate(o.concluido_em)}</span>}
                          {h !== null && (
                            <span style={{ color: D.emerald, fontWeight: 600 }}>
                              Reparo: {fmtHoras(h)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
