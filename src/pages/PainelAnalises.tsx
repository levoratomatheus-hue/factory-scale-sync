import { useState, useMemo, useEffect } from "react";
import { useAnalises, useParadasAnalises, useRegistrosDiariosAnalises } from "@/hooks/useOrdens";
import { parseHoras } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, TrendingUp, Gauge, Factory, BarChart2, CalendarRange, Clock, Search, X } from "lucide-react";
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
  AreaChart,
  Area,
  ReferenceLine,
} from "recharts";

// ── Dark theme palette ────────────────────────────────────────────────────────
const D = {
  page:    "#0a0a0a",
  card:    "#1a1a2e",
  cardAlt: "#1e1e1e",
  border:  "#2d2d2d",
  text:    "#ffffff",
  muted:   "#94a3b8",
  cyan:    "#06B6D4",
  grid:    "#1e293b",
  emerald: "#10b981",
  amber:   "#f59e0b",
  red:     "#ef4444",
} as const;

const cardStyle = {
  background: D.card,
  border: `1px solid ${D.border}`,
  borderRadius: "0.75rem",
  padding: "1rem",
};

const tooltipStyle = {
  borderRadius: "0.5rem",
  border: `1px solid ${D.border}`,
  background: D.cardAlt,
  color: D.text,
  fontSize: 12,
  padding: "8px 12px",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const CORES_LINHA = [
  "from-violet-500 to-violet-700",
  "from-sky-500 to-sky-700",
  "from-amber-500 to-amber-600",
  "from-rose-500 to-rose-700",
  "from-teal-500 to-teal-700",
];

type Atalho = "hoje" | "semana" | "mes" | "mes_anterior" | "ano" | null;

function toStr(d: Date) {
  return d.toISOString().split("T")[0];
}

function inicioSemana(d: Date) {
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const seg = new Date(d);
  seg.setDate(d.getDate() + diff);
  return seg;
}

function fmt(n: number, decimais = 1) {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: decimais });
}

function fmtHHMM(horas: number): string {
  const h = Math.floor(horas);
  const m = Math.round((horas - h) * 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

const FAIXAS = [
  { label: "0 – 36 kg",    min: 0,   max: 36  },
  { label: "36 – 70 kg",   min: 36,  max: 70  },
  { label: "70 – 200 kg",  min: 70,  max: 200 },
  { label: "> 200 kg",     min: 200, max: Infinity },
];

// ── Tooltips ──────────────────────────────────────────────────────────────────

function TooltipFaixa({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { faixa, media, ops } = payload[0].payload;
  return (
    <div style={tooltipStyle}>
      <p style={{ fontWeight: 700, margin: 0 }}>{faixa}</p>
      <p style={{ margin: "4px 0 0", color: D.cyan }}>
        {media > 0 ? media.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—"} kg/h
      </p>
      <p style={{ margin: "2px 0 0", color: D.muted }}>{ops} OP{ops !== 1 ? "s" : ""}</p>
    </div>
  );
}

function TooltipMensal({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={tooltipStyle}>
      <p style={{ fontWeight: 700, margin: 0 }}>{label}</p>
      <p style={{ margin: "4px 0 0", color: D.cyan }}>
        {(payload[0].value as number).toLocaleString("pt-BR")} kg
      </p>
    </div>
  );
}

function TooltipProdutividade({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div style={tooltipStyle}>
      <p style={{ fontWeight: 700, margin: 0 }}>{label}</p>
      <p style={{ margin: "4px 0 0", color: D.cyan }}>
        {val != null ? `${(val as number).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg/h` : "Sem dados"}
      </p>
    </div>
  );
}

// ── CardHorasLinha ────────────────────────────────────────────────────────────

type HorasLinha = {
  linha: number; diasComOP: number; capacidade: number; horasTrabalhadas: number;
  manutencao: number; sem_material: number; problema_processo: number; falta_energia: number;
  horasLimpeza: number; eficiencia: number;
};

const BREAKDOWN_DEFS = [
  { key: "horasTrabalhadas", emoji: "✅", label: "Trabalhadas",    color: "#10b981" },
  { key: "manutencao",       emoji: "🔧", label: "Manutenção",     color: "#f97316" },
  { key: "sem_material",     emoji: "📦", label: "Sem Material",   color: "#eab308" },
  { key: "problema_processo",emoji: "⚙️", label: "Prob. Processo", color: "#ef4444" },
  { key: "falta_energia",    emoji: "⚡", label: "Falta Energia",  color: "#b91c1c" },
  { key: "horasLimpeza",     emoji: "🧹", label: "Limpeza",        color: "#3b82f6" },
] as const;

function CardHorasLinha(h: HorasLinha) {
  const efCor = h.eficiencia >= 80 ? "#10b981" : h.eficiencia >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className={`inline-flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br ${CORES_LINHA[h.linha - 1]} text-white`}>
          <span className="text-xs font-bold">{h.linha}</span>
        </div>
        <span style={{ fontSize: 11, color: D.muted }}>{h.diasComOP}d</span>
      </div>
      <p style={{ fontSize: 11, color: D.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
        Linha {h.linha}
      </p>
      <div style={{ background: "#0f172a", borderRadius: "0.5rem", padding: "0.5rem 0.75rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: D.muted, fontWeight: 600 }}>🕐 Disponíveis</span>
        <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: D.text }}>{fmtHHMM(h.capacidade)}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
        {BREAKDOWN_DEFS.map(({ key, emoji, label, color }) => {
          const val = h[key as keyof HorasLinha] as number;
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: D.muted }}>{emoji} {label}</span>
              <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "monospace", color: val === 0 ? "#334155" : color }}>
                {fmtHHMM(val)}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ borderTop: `1px solid ${D.border}`, paddingTop: "0.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: D.muted }}>Eficiência</span>
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "monospace", color: efCor }}>{h.eficiencia.toFixed(1)}%</span>
      </div>
      <div style={{ height: 6, width: "100%", borderRadius: 9999, background: "#1e293b", overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 9999, background: efCor, width: `${Math.min(100, h.eficiencia)}%` }} />
      </div>
    </div>
  );
}

// ── Atalhos ───────────────────────────────────────────────────────────────────

const atalhos: { id: Atalho; label: string }[] = [
  { id: "hoje",          label: "Hoje" },
  { id: "semana",        label: "Esta semana" },
  { id: "mes",           label: "Este mês" },
  { id: "mes_anterior",  label: "Mês anterior" },
  { id: "ano",           label: "Este ano" },
];

function calcAtalho(id: Atalho): { inicio: string; fim: string } {
  const hoje = new Date();
  switch (id) {
    case "hoje":
      return { inicio: toStr(hoje), fim: toStr(hoje) };
    case "semana":
      return { inicio: toStr(inicioSemana(hoje)), fim: toStr(hoje) };
    case "mes":
      return { inicio: `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`, fim: toStr(hoje) };
    case "mes_anterior": {
      const primeiro = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      const ultimo = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      return { inicio: toStr(primeiro), fim: toStr(ultimo) };
    }
    case "ano":
      return { inicio: `${hoje.getFullYear()}-01-01`, fim: toStr(hoje) };
    default:
      return { inicio: toStr(hoje), fim: toStr(hoje) };
  }
}

// ── Section title helper ──────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <h3 style={{ marginBottom: "1rem", fontSize: "0.9375rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem", color: D.text }}>
      <Icon size={16} style={{ color: D.muted }} />
      {children}
    </h3>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PainelAnalises() {
  const hoje = new Date();
  const primeiroDiaMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;

  const [dataInicio, setDataInicio] = useState(primeiroDiaMes);
  const [dataFim, setDataFim] = useState(toStr(hoje));
  const [atalhoAtivo, setAtalhoAtivo] = useState<Atalho>("mes");
  const [linhaFiltro, setLinhaFiltro] = useState<number>(0);
  const [materialFiltro, setMaterialFiltro] = useState("");
  const [materialLabel, setMaterialLabel] = useState("");

  useEffect(() => {
    if (!materialFiltro) { setMaterialLabel(""); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("ordens")
        .select("produto")
        .ilike("produto", `%${materialFiltro}%`)
        .eq("status", "concluido")
        .limit(1)
        .single();
      if (data?.produto) setMaterialLabel(data.produto);
      else setMaterialLabel(materialFiltro);
    }, 300);
    return () => clearTimeout(timer);
  }, [materialFiltro]);

  const { ordens: ordensRaw, loading } = useAnalises(dataInicio, dataFim);
  const { paradas: paradasRaw } = useParadasAnalises(dataInicio, dataFim);
  const { registros: registrosDiariosRaw } = useRegistrosDiariosAnalises(dataInicio, dataFim);

  const inicioAnual = toStr(new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1));
  const { ordens: ordensAnuaisRaw } = useAnalises(inicioAnual, toStr(hoje));
  const { registros: registrosDiariosAnuaisRaw } = useRegistrosDiariosAnalises(inicioAnual, toStr(hoje));
  const { paradas: paradasAnuaisRaw } = useParadasAnalises(inicioAnual, toStr(hoje));

  const matchesMaterial = (o: any) => {
    if (!materialFiltro) return true;
    const q = materialFiltro.toLowerCase();
    return (
      (o.produto ?? "").toLowerCase().includes(q) ||
      String(o.formula_id ?? "").toLowerCase().includes(q)
    );
  };

  const ordens = useMemo(
    () => ordensRaw.filter((o) => (linhaFiltro === 0 || Number(o.linha) === linhaFiltro) && matchesMaterial(o)),
    [ordensRaw, linhaFiltro, materialFiltro],
  );
  const ordensAnuais = useMemo(
    () => ordensAnuaisRaw.filter((o) => (linhaFiltro === 0 || Number(o.linha) === linhaFiltro) && matchesMaterial(o)),
    [ordensAnuaisRaw, linhaFiltro, materialFiltro],
  );

  const ordensAnuaisIds = useMemo(() => new Set(ordensAnuais.map((o) => o.id)), [ordensAnuais]);

  const paradasIdx = useMemo(() => {
    const idx = new Map<string, any[]>();
    paradasRaw.forEach((p: any) => {
      const key = `${p.linha}-${p.data}`;
      if (!idx.has(key)) idx.set(key, []);
      idx.get(key)!.push(p);
    });
    return idx;
  }, [paradasRaw]);

  const { horasMap, diasLinhaMap } = useMemo(() => {
    const hMap: Record<string, number> = {};
    const dMap: Record<number, Set<string>> = {};
    const toH = (s: string | null) => { if (!s) return 0; const [h, m] = s.split(":").map(Number); return (h || 0) + (m || 0) / 60; };
    registrosDiariosRaw.forEach((r: any) => {
      const h = parseHoras(r.hora_inicio, r.hora_fim);
      if (h !== null) {
        const linhaNum = Number(r.ordens?.linha);
        const horasParadas = (paradasIdx.get(`${linhaNum}-${r.data}`) ?? [])
          .filter((p: any) => toH(p.hora_inicio) < toH(r.hora_fim) && toH(p.hora_fim) > toH(r.hora_inicio))
          .reduce((acc: number, p: any) => acc + Math.min(toH(p.hora_fim), toH(r.hora_fim)) - Math.max(toH(p.hora_inicio), toH(r.hora_inicio)), 0);
        hMap[r.ordem_id] = (hMap[r.ordem_id] || 0) + Math.max(0, h - horasParadas);
      }
      const linhaNum = Number(r.ordens?.linha);
      if (linhaNum) {
        if (!dMap[linhaNum]) dMap[linhaNum] = new Set();
        dMap[linhaNum].add(r.data);
      }
    });
    return { horasMap: hMap, diasLinhaMap: dMap };
  }, [registrosDiariosRaw, paradasIdx]);

  const paradas = useMemo(
    () => linhaFiltro === 0 ? paradasRaw : paradasRaw.filter((p) => Number(p.linha) === linhaFiltro),
    [paradasRaw, linhaFiltro],
  );

  function aplicarAtalho(id: Atalho) {
    const { inicio, fim } = calcAtalho(id);
    setDataInicio(inicio);
    setDataFim(fim);
    setAtalhoAtivo(id);
  }

  function handleManualInicio(v: string) { setDataInicio(v); setAtalhoAtivo(null); }
  function handleManualFim(v: string)    { setDataFim(v);    setAtalhoAtivo(null); }

  const descPeriodo = useMemo(() => {
    if (dataInicio === dataFim)
      return format(new Date(dataInicio + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR });
    return `${format(new Date(dataInicio + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })} – ${format(new Date(dataFim + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}`;
  }, [dataInicio, dataFim]);

  const paradasAnuaisIdx = useMemo(() => {
    const idx = new Map<string, any[]>();
    paradasAnuaisRaw.forEach((p: any) => {
      const key = `${p.linha}-${p.data}`;
      if (!idx.has(key)) idx.set(key, []);
      idx.get(key)!.push(p);
    });
    return idx;
  }, [paradasAnuaisRaw]);

  const horasMapAnual = useMemo(() => {
    const hMap: Record<string, number> = {};
    const toH = (s: string | null) => { if (!s) return 0; const [h, m] = s.split(":").map(Number); return (h || 0) + (m || 0) / 60; };
    registrosDiariosAnuaisRaw.forEach((r: any) => {
      const h = parseHoras(r.hora_inicio, r.hora_fim);
      if (h !== null) {
        const linhaNum = Number(r.ordens?.linha);
        const horasParadas = (paradasAnuaisIdx.get(`${linhaNum}-${r.data}`) ?? [])
          .filter((p: any) => toH(p.hora_inicio) < toH(r.hora_fim) && toH(p.hora_fim) > toH(r.hora_inicio))
          .reduce((acc: number, p: any) => acc + Math.min(toH(p.hora_fim), toH(r.hora_fim)) - Math.max(toH(p.hora_inicio), toH(r.hora_inicio)), 0);
        hMap[r.ordem_id] = (hMap[r.ordem_id] || 0) + Math.max(0, h - horasParadas);
      }
    });
    return hMap;
  }, [registrosDiariosAnuaisRaw, paradasAnuaisIdx]);

  const { dadosMensais, dadosProdutividadeMensal } = useMemo(() => {
    const meses = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - 11 + i, 1);
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: format(d, "MMM/yy", { locale: ptBR }),
      };
    });
    const regsAnuaisFiltrados = registrosDiariosAnuaisRaw.filter((r: any) => {
      if (linhaFiltro !== 0 && Number(r.ordens?.linha) !== linhaFiltro) return false;
      if (materialFiltro && !ordensAnuaisIds.has(r.ordem_id)) return false;
      return true;
    });
    // Iteração única sobre registros anuais
    const mapaKg: Record<string, number> = {};
    const mapaProd: Record<string, { kg: number; h: number }> = {};
    regsAnuaisFiltrados.forEach((r: any) => {
      const chave = String(r.data).slice(0, 7);
      const items: any[] = Array.isArray(r.registro_producao) ? r.registro_producao : [];
      const kgDia = items.reduce((s: number, it: any) => s + (it.qty || 0) * (it.peso || 0), 0);
      mapaKg[chave] = (mapaKg[chave] || 0) + kgDia;
      const h = parseHoras(r.hora_inicio, r.hora_fim);
      if (h !== null) {
        if (!mapaProd[chave]) mapaProd[chave] = { kg: 0, h: 0 };
        mapaProd[chave].kg += kgDia;
        mapaProd[chave].h += h;
      }
    });
    const dadosMensais = meses.map(({ key, label }) => ({ mes: label, kg: Math.round(mapaKg[key] || 0) }));
    const dadosProdutividadeMensal = meses.map(({ key, label }) => {
      const m = mapaProd[key];
      const kgH = m && m.h > 0 ? parseFloat((m.kg / m.h).toFixed(1)) : null;
      return { mes: label, kgH };
    });
    return { dadosMensais, dadosProdutividadeMensal };
  }, [registrosDiariosAnuaisRaw, linhaFiltro, materialFiltro, ordensAnuaisIds]);

  const { producaoTotal, mediaKgHora, porLinha, dadosFaixas, topProdutos, topRepetidas, horasPorLinha } = useMemo(() => {
    // kg por registro diário — mesmo filtro do gráfico
    const kgPorOrdem: Record<string, number> = {};
    registrosDiariosRaw.forEach((r: any) => {
      if (linhaFiltro !== 0 && Number(r.ordens?.linha) !== linhaFiltro) return;
      if (materialFiltro && !ordensAnuaisIds.has(r.ordem_id)) return;
      const items: any[] = Array.isArray(r.registro_producao) ? r.registro_producao : [];
      const kg = items.reduce((s: number, it: any) => s + (it.qty || 0) * (it.peso || 0), 0);
      kgPorOrdem[r.ordem_id] = (kgPorOrdem[r.ordem_id] || 0) + kg;
    });

    const producaoTotal = Object.values(kgPorOrdem).reduce((s, v) => s + v, 0);

    // kg/hora e contagem de OPs baseados nos registros diários (inclui OPs em aberto)
    const uniqueIdsGeral = new Set<string>(Object.keys(kgPorOrdem));
    let totalKgComHora = 0, totalHoras = 0;
    uniqueIdsGeral.forEach((id) => {
      const h = horasMap[id] ?? null;
      if (h !== null) { totalKgComHora += kgPorOrdem[id] || 0; totalHoras += h; }
    });
    const mediaKgHora = totalHoras > 0 ? totalKgComHora / totalHoras : 0;

    const porLinha = [1, 2, 3, 4, 5].map((linha) => {
      const regsLinha = registrosDiariosRaw.filter((r: any) =>
        Number(r.ordens?.linha) === linha &&
        (!materialFiltro || ordensAnuaisIds.has(r.ordem_id))
      );
      const totalKg = regsLinha.reduce((s: number, r: any) => {
        const items: any[] = Array.isArray(r.registro_producao) ? r.registro_producao : [];
        return s + items.reduce((ss: number, it: any) => ss + (it.qty || 0) * (it.peso || 0), 0);
      }, 0);
      const uniqueIds = new Set<string>(regsLinha.map((r: any) => r.ordem_id));
      let kgH = 0, hH = 0;
      uniqueIds.forEach((id) => {
        const h = horasMap[id] ?? null;
        if (h !== null) { kgH += kgPorOrdem[id] || 0; hH += h; }
      });
      return { linha, totalKg, media: hH > 0 ? kgH / hH : 0, ops: uniqueIds.size };
    });

    const dadosFaixas = FAIXAS.map(({ label, min, max }) => {
      const ol = ordens.filter((o) => {
        const q = o.quantidade_real || 0;
        return q >= min && (max === Infinity ? true : q < max);
      });
      let kgH = 0, hH = 0;
      ol.forEach((o) => {
        const h = horasMap[o.id] ?? null;
        if (h !== null) { kgH += o.quantidade_real || 0; hH += h; }
      });
      return { faixa: label, media: hH > 0 ? kgH / hH : 0, ops: ol.length };
    });

    const mapaP: Record<string, { produto: string; ops: number; kg: number }> = {};
    ordens.forEach((o) => {
      const chave = o.formula_id ? String(o.formula_id) : `sem_formula_${o.produto || "?"}`;
      if (!mapaP[chave]) mapaP[chave] = { produto: o.produto || "Desconhecido", ops: 0, kg: 0 };
      mapaP[chave].ops += 1;
      mapaP[chave].kg += o.quantidade_real || 0;
    });
    const linhasAgrupadas = Object.entries(mapaP).map(([formulaId, v]) => ({
      formulaId, produto: v.produto, ops: v.ops, kg: v.kg,
    }));
    const topProdutos  = [...linhasAgrupadas].sort((a, b) => b.kg  - a.kg ).slice(0, 25);
    const topRepetidas = [...linhasAgrupadas].sort((a, b) => b.ops - a.ops).slice(0, 20);

    const TURNO_H = 9;
    const MOTIVOS_PARADA = ["manutencao", "sem_material", "problema_processo", "falta_energia"] as const;
    const horasPorLinha = [1, 2, 3, 4, 5].map((linha) => {
      const diasComOP = diasLinhaMap[linha]?.size ?? 0;
      const toH = (t: string | null) => { if (!t) return 0; const [h, m] = t.split(":").map(Number); return (h || 0) + (m || 0) / 60; };
      const horasTrabalhadas = registrosDiariosRaw
        .filter((r: any) => Number(r.ordens?.linha) === linha &&
          (!materialFiltro || ordensAnuaisIds.has(r.ordem_id)))
        .reduce((s: number, r: any) => {
          const h = parseHoras(r.hora_inicio, r.hora_fim);
          if (h === null) return s;
          const hp = (paradasIdx.get(`${linha}-${r.data}`) ?? [])
            .filter((p: any) => toH(p.hora_inicio) < toH(r.hora_fim) && toH(p.hora_fim) > toH(r.hora_inicio))
            .reduce((acc: number, p: any) => acc + Math.min(toH(p.hora_fim), toH(r.hora_fim)) - Math.max(toH(p.hora_inicio), toH(r.hora_inicio)), 0);
          return s + Math.max(0, h - hp);
        }, 0);
      const paradasLinha = paradas.filter((p) => Number(p.linha) === linha);
      const porMotivo = Object.fromEntries(
        MOTIVOS_PARADA.map((m) => [
          m,
          paradasLinha.filter((p) => p.motivo === m).reduce((s, p) => s + (parseHoras(p.hora_inicio, p.hora_fim) ?? 0), 0),
        ])
      ) as Record<typeof MOTIVOS_PARADA[number], number>;
      const totalParadasRegistradas = MOTIVOS_PARADA.reduce((s, m) => s + porMotivo[m], 0);
      const capacidade = diasComOP * TURNO_H;
      const horasLimpeza = Math.max(0, capacidade - horasTrabalhadas - totalParadasRegistradas);
      const eficiencia = capacidade > 0 ? (horasTrabalhadas / capacidade) * 100 : 0;
      return { linha, diasComOP, capacidade, horasTrabalhadas, ...porMotivo, horasLimpeza, eficiencia };
    });

    return { producaoTotal, mediaKgHora, porLinha, dadosFaixas, topProdutos, topRepetidas, horasPorLinha };
  }, [ordens, paradas, horasMap, diasLinhaMap, registrosDiariosRaw, linhaFiltro, materialFiltro, ordensAnuaisIds]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: D.page, minHeight: "calc(100vh - 3rem)", padding: "1.5rem", margin: "-1.5rem", width: "calc(100% + 3rem)", display: "flex", flexDirection: "column", gap: "2rem" }}>

      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 40, width: 40, borderRadius: "0.75rem", background: "#06B6D41a", flexShrink: 0 }}>
          <BarChart2 size={20} style={{ color: D.cyan }} />
        </div>
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: D.text, margin: 0 }}>Análises da Produção</h2>
          <p style={{ fontSize: "0.875rem", color: D.muted, margin: "0.25rem 0 0" }}>
            {ordens.length} OPs concluídas · {descPeriodo}
            {linhaFiltro !== 0 && <span style={{ marginLeft: "0.25rem", fontWeight: 600, color: D.cyan }}> · Linha {linhaFiltro}</span>}
            {materialFiltro && <span style={{ marginLeft: "0.25rem", fontWeight: 600, color: D.amber }}> · {materialFiltro}</span>}
          </p>
        </div>
      </div>

      {/* Filtro de período */}
      <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", fontWeight: 500, color: D.muted }}>
          <CalendarRange size={16} />
          Período
        </div>

        {/* Atalhos */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {atalhos.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => aplicarAtalho(id)}
              style={{
                borderRadius: 9999,
                padding: "0.25rem 0.75rem",
                fontSize: 12,
                fontWeight: 500,
                border: `1px solid ${atalhoAtivo === id ? D.cyan : D.border}`,
                background: atalhoAtivo === id ? D.cyan : "transparent",
                color: atalhoAtivo === id ? "#000" : D.muted,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Inputs de data + filtro de linha */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1rem" }}>
          {[{ lbl: "De", val: dataInicio, max: dataFim, min: undefined, fn: handleManualInicio },
            { lbl: "Até", val: dataFim, max: undefined, min: dataInicio, fn: handleManualFim }].map(({ lbl, val, max, min, fn }) => (
            <div key={lbl} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label style={{ fontSize: "0.875rem", color: D.muted, fontWeight: 500, width: 24 }}>{lbl}</label>
              <input
                type="date"
                value={val}
                max={max}
                min={min}
                onChange={(e) => fn(e.target.value)}
                style={{
                  borderRadius: "0.375rem",
                  border: `1px solid ${D.border}`,
                  background: D.cardAlt,
                  color: D.text,
                  padding: "0.375rem 0.75rem",
                  fontSize: "0.875rem",
                  outline: "none",
                  colorScheme: "dark",
                }}
              />
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "auto" }}>
            <Factory size={16} style={{ color: D.muted }} />
            <div style={{ display: "flex", border: `1px solid ${D.border}`, borderRadius: "0.375rem", overflow: "hidden", fontSize: 12 }}>
              {[{ v: 0, label: "Todas" }, ...[1,2,3,4,5].map((n) => ({ v: n, label: `L${n}` }))].map(({ v, label }) => (
                <button
                  key={v}
                  onClick={() => setLinhaFiltro(v)}
                  style={{
                    padding: "0.375rem 0.75rem",
                    fontWeight: 500,
                    borderLeft: v === 0 ? "none" : `1px solid ${D.border}`,
                    background: linhaFiltro === v ? D.cyan : "transparent",
                    color: linhaFiltro === v ? "#000" : D.muted,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filtro de material */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Search size={16} style={{ color: D.muted, flexShrink: 0 }} />
          <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
            <input
              type="text"
              placeholder="Filtrar por produto ou fórmula..."
              value={materialFiltro}
              onChange={(e) => setMaterialFiltro(e.target.value)}
              style={{
                width: "100%",
                borderRadius: "0.375rem",
                border: `1px solid ${materialFiltro ? D.amber : D.border}`,
                background: D.cardAlt,
                color: D.text,
                padding: "0.375rem 2rem 0.375rem 0.75rem",
                fontSize: "0.875rem",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {materialFiltro && (
              <button
                onClick={() => setMaterialFiltro("")}
                style={{
                  position: "absolute",
                  right: "0.5rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: D.muted,
                  display: "flex",
                  alignItems: "center",
                  padding: 0,
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {materialFiltro && materialLabel && (
        <div style={{ paddingInline: "1.5rem", paddingBottom: "0.5rem" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              background: `${D.amber}18`,
              color: D.amber,
              border: `1px solid ${D.amber}44`,
              borderRadius: "9999px",
              padding: "0.25rem 0.75rem",
              fontSize: "0.8125rem",
              fontWeight: 500,
            }}
          >
            {materialLabel}
            <button
              onClick={() => setMaterialFiltro("")}
              style={{ background: "none", border: "none", cursor: "pointer", color: D.amber, display: "flex", alignItems: "center", padding: 0 }}
            >
              <X size={12} />
            </button>
          </span>
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "5rem 0" }}>
          <Loader2 size={32} style={{ color: D.cyan, animation: "spin 1s linear infinite" }} className="animate-spin" />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.25rem" }}>
            {/* Produção Total */}
            <div style={{ position: "relative", overflow: "hidden", borderRadius: "1rem", background: "#0e1a2e", border: `1px solid #1d3557`, padding: "1.5rem" }}>
              <div style={{ position: "absolute", right: -16, top: -16, height: 96, width: 96, borderRadius: 9999, background: `${D.cyan}15` }} />
              <div style={{ position: "absolute", right: -8, bottom: 8, height: 64, width: 64, borderRadius: 9999, background: `${D.cyan}10` }} />
              <div style={{ position: "relative" }}>
                <div style={{ marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem", color: D.muted }}>
                  <TrendingUp size={16} />
                  <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Produção Total do Período</span>
                </div>
                <div style={{ fontSize: "2.5rem", fontWeight: 800, letterSpacing: "-0.02em", color: D.text }}>
                  {fmt(producaoTotal, 0)}
                  <span style={{ marginLeft: "0.5rem", fontSize: "1.25rem", fontWeight: 600, color: D.cyan }}>kg</span>
                </div>
                <p style={{ marginTop: "0.25rem", fontSize: "0.875rem", color: D.muted }}>{descPeriodo}</p>
              </div>
            </div>

            {/* Média kg/h */}
            <div style={{ position: "relative", overflow: "hidden", borderRadius: "1rem", background: "#0e1a2e", border: `1px solid #1d3557`, padding: "1.5rem" }}>
              <div style={{ position: "absolute", right: -16, top: -16, height: 96, width: 96, borderRadius: 9999, background: `${D.cyan}15` }} />
              <div style={{ position: "absolute", right: -8, bottom: 8, height: 64, width: 64, borderRadius: 9999, background: `${D.cyan}10` }} />
              <div style={{ position: "relative" }}>
                <div style={{ marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem", color: D.muted }}>
                  <Gauge size={16} />
                  <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Média kg/hora Geral</span>
                </div>
                <div style={{ fontSize: "2.5rem", fontWeight: 800, letterSpacing: "-0.02em", color: D.cyan }}>
                  {fmt(mediaKgHora)}
                  <span style={{ marginLeft: "0.5rem", fontSize: "1.25rem", fontWeight: 600, color: D.muted }}>kg/h</span>
                </div>
                <p style={{ marginTop: "0.25rem", fontSize: "0.875rem", color: D.muted }}>Média de todas as linhas</p>
              </div>
            </div>
          </div>

          {/* Por Linha */}
          <div>
            <SectionTitle icon={Factory}>Por Linha de Produção</SectionTitle>
            {linhaFiltro === 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "1rem" }}>
                {porLinha.map(({ linha, totalKg, media, ops }) => (
                  <div key={linha} style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <div className={`inline-flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br ${CORES_LINHA[linha - 1]} text-white`}>
                      <span className="text-sm font-bold">{linha}</span>
                    </div>
                    <p style={{ fontSize: 11, color: D.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>Linha {linha}</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                      <div>
                        <p style={{ fontSize: "1.5rem", fontWeight: 700, color: D.text, lineHeight: 1.2, margin: 0 }}>{fmt(totalKg, 0)}</p>
                        <p style={{ fontSize: 11, color: D.muted, margin: 0 }}>kg produzidos</p>
                      </div>
                      <div style={{ borderTop: `1px solid ${D.border}`, paddingTop: "0.375rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: 11 }}>
                        <div>
                          <p style={{ fontWeight: 600, color: D.text, margin: 0 }}>{fmt(media)} <span style={{ color: D.muted, fontWeight: 400 }}>kg/h</span></p>
                          <p style={{ color: D.muted, margin: 0 }}>média/hora</p>
                        </div>
                        <div>
                          <p style={{ fontWeight: 600, color: D.text, margin: 0 }}>{ops}</p>
                          <p style={{ color: D.muted, margin: 0 }}>OPs</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              (() => {
                const l = porLinha.find((p) => p.linha === linhaFiltro)!;
                return (
                  <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${CORES_LINHA[linhaFiltro - 1]} p-8 text-white shadow-lg max-w-sm`}>
                    <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/10" />
                    <div className="absolute -right-3 bottom-3 h-20 w-20 rounded-full bg-white/10" />
                    <div className="relative space-y-4">
                      <div>
                        <p className="text-sm font-medium opacity-80 uppercase tracking-wide">Linha {linhaFiltro}</p>
                        <p className="text-5xl font-extrabold tracking-tight mt-1">
                          {fmt(l.totalKg, 0)}
                          <span className="ml-2 text-2xl font-semibold opacity-70">kg</span>
                        </p>
                      </div>
                      <div className="border-t border-white/20 pt-4 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-2xl font-bold">{fmt(l.media)}</p>
                          <p className="text-sm opacity-70">kg/hora</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{l.ops}</p>
                          <p className="text-sm opacity-70">OPs</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()
            )}
          </div>

          {/* Horas por Linha */}
          <div>
            <SectionTitle icon={Clock}>Horas por Linha de Produção</SectionTitle>
            {linhaFiltro === 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem" }}>
                {horasPorLinha.map((h) => <CardHorasLinha key={h.linha} {...h} />)}
              </div>
            ) : (
              (() => {
                const h = horasPorLinha.find((p) => p.linha === linhaFiltro)!;
                const efCor = h.eficiencia >= 80 ? "#10b981" : h.eficiencia >= 60 ? "#f59e0b" : "#ef4444";
                return (
                  <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${CORES_LINHA[linhaFiltro - 1]} p-8 text-white shadow-lg max-w-md`}>
                    <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/10" />
                    <div className="absolute -right-3 bottom-3 h-20 w-20 rounded-full bg-white/10" />
                    <div className="relative space-y-5">
                      <p className="text-sm font-medium opacity-80 uppercase tracking-wide">Linha {linhaFiltro} · {h.diasComOP} dia{h.diasComOP !== 1 ? "s" : ""}</p>
                      <div className="rounded-lg bg-white/10 px-4 py-2.5 flex items-center justify-between">
                        <span className="text-sm opacity-80">🕐 Horas Disponíveis</span>
                        <span className="text-2xl font-extrabold font-mono">{fmtHHMM(h.capacidade)}</span>
                      </div>
                      <div className="space-y-2">
                        {BREAKDOWN_DEFS.map(({ key, emoji, label }) => {
                          const val = h[key as keyof HorasLinha] as number;
                          return (
                            <div key={key} className="flex items-center justify-between">
                              <span className="text-sm opacity-80">{emoji} {label}</span>
                              <span className={`text-base font-bold font-mono ${val === 0 ? "opacity-30" : "opacity-100"}`}>{fmtHHMM(val)}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="space-y-2 border-t border-white/20 pt-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm opacity-70">Eficiência</span>
                          <span style={{ fontSize: "1.5rem", fontWeight: 700, fontFamily: "monospace", color: efCor }}>{h.eficiencia.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-white/20 overflow-hidden">
                          <div style={{ height: "100%", borderRadius: 9999, background: efCor, width: `${Math.min(100, h.eficiencia)}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()
            )}
          </div>

          {/* Gráficos + Tabelas */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "1.25rem", alignItems: "start" }}>

            {/* Coluna esquerda: gráficos */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

              {/* Faixa de OP */}
              <div>
                <SectionTitle icon={BarChart2}>Média por Faixa de OP</SectionTitle>
                <div style={{ ...cardStyle }}>
                  <p style={{ fontSize: 11, color: D.muted, marginBottom: "0.75rem" }}>Média kg/hora · período selecionado</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={dadosFaixas} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={D.grid} />
                      <XAxis dataKey="faixa" tick={{ fontSize: 10, fill: D.muted }} tickLine={false} axisLine={false} />
                      <YAxis
                        tick={{ fontSize: 10, fill: D.muted }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${v}`}
                        label={{ value: "kg/h", angle: -90, position: "insideLeft", fontSize: 10, fill: D.muted, dy: 20 }}
                      />
                      <Tooltip content={<TooltipFaixa />} cursor={{ fill: "#ffffff08" }} />
                      <Bar dataKey="media" fill={D.cyan} radius={[4, 4, 0, 0]} maxBarSize={60} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Produção Mensal */}
              <div>
                <SectionTitle icon={BarChart2}>Produção Mensal (kg)</SectionTitle>
                <div style={{ ...cardStyle }}>
                  <p style={{ fontSize: 11, color: D.muted, marginBottom: "0.75rem" }}>Últimos 12 meses</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={dadosMensais} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={D.grid} />
                      <XAxis dataKey="mes" tick={{ fontSize: 10, fill: D.muted }} tickLine={false} axisLine={false} />
                      <YAxis
                        tick={{ fontSize: 10, fill: D.muted }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                      />
                      <Tooltip content={<TooltipMensal />} cursor={{ fill: "#ffffff08" }} />
                      <Bar dataKey="kg" fill={D.cyan} radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Produtividade kg/h por Mês */}
              <div>
                <SectionTitle icon={TrendingUp}>Produtividade kg/h por Mês</SectionTitle>
                <div style={{ ...cardStyle, background: "#0f172a" }}>
                  <p style={{ fontSize: 11, color: D.muted, marginBottom: "0.75rem" }}>
                    Últimos 12 meses · média kg/h das OPs concluídas
                    {linhaFiltro !== 0 && <span style={{ color: D.cyan }}> · Linha {linhaFiltro}</span>}
                  </p>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={dadosProdutividadeMensal} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
                      <defs>
                        <linearGradient id="gradCiano" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={D.cyan} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={D.cyan} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={D.grid} />
                      <XAxis dataKey="mes" tick={{ fontSize: 10, fill: D.muted }} tickLine={false} axisLine={false} />
                      <YAxis
                        tick={{ fontSize: 10, fill: D.muted }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${v}`}
                        label={{ value: "kg/h", angle: -90, position: "insideLeft", fontSize: 10, fill: D.muted, dy: 20 }}
                      />
                      <Tooltip content={<TooltipProdutividade />} cursor={{ stroke: D.border, strokeWidth: 1 }} />
                      <ReferenceLine
                        y={115}
                        stroke="#FACC15"
                        strokeDasharray="5 4"
                        strokeWidth={1.5}
                        label={{ value: "Meta 115", position: "right", fontSize: 10, fill: "#FACC15" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="kgH"
                        stroke={D.cyan}
                        strokeWidth={2}
                        fill="url(#gradCiano)"
                        dot={{ r: 4, fill: D.cyan, strokeWidth: 0 }}
                        activeDot={{ r: 6, fill: D.cyan, stroke: "#0f172a", strokeWidth: 2 }}
                        connectNulls={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Coluna direita: tabelas */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>

              {/* Top 25 por kg */}
              <div>
                <SectionTitle icon={TrendingUp}>Top 25 por kg</SectionTitle>
                <div style={{ borderRadius: "0.5rem", border: `1px solid ${D.border}`, overflow: "hidden" }}>
                  <div style={{ overflowY: "auto", maxHeight: 420 }}>
                    <table style={{ width: "100%", fontSize: "0.875rem", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${D.border}`, background: D.cardAlt, position: "sticky", top: 0, zIndex: 10 }}>
                          <th style={{ padding: "0.625rem 0.75rem", textAlign: "left", fontWeight: 600, color: D.muted, fontSize: 11, width: 32 }}>#</th>
                          <th style={{ padding: "0.625rem 0.75rem", textAlign: "left", fontWeight: 600, color: D.muted, fontSize: 11 }}>Produto</th>
                          <th style={{ padding: "0.625rem 0.75rem", textAlign: "right", fontWeight: 600, color: D.muted, fontSize: 11 }}>kg</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topProdutos.length === 0 ? (
                          <tr>
                            <td colSpan={3} style={{ padding: "2rem", textAlign: "center", color: D.muted, fontSize: 11 }}>Sem dados</td>
                          </tr>
                        ) : topProdutos.map(({ formulaId, produto, kg }, i) => (
                          <tr key={formulaId} style={{ borderBottom: `1px solid ${D.border}` }}>
                            <td style={{ padding: "0.5rem 0.75rem", color: D.muted, fontFamily: "monospace", fontSize: 11 }}>
                              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}º`}
                            </td>
                            <td style={{ padding: "0.5rem 0.75rem" }}>
                              <p style={{ fontWeight: 500, fontSize: 11, color: D.text, margin: 0 }}>{produto}</p>
                              <p style={{ fontSize: 11, color: D.muted, fontFamily: "monospace", margin: 0 }}>ID {formulaId}</p>
                            </td>
                            <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600, fontSize: 11, color: D.cyan }}>{fmt(kg, 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Top 20 OPs Repetidas */}
              <div>
                <SectionTitle icon={TrendingUp}>Top 20 OPs Repetidas</SectionTitle>
                <div style={{ borderRadius: "0.5rem", border: `1px solid ${D.border}`, overflow: "hidden" }}>
                  <div style={{ overflowY: "auto", maxHeight: 420 }}>
                    <table style={{ width: "100%", fontSize: "0.875rem", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${D.border}`, background: D.cardAlt, position: "sticky", top: 0, zIndex: 10 }}>
                          <th style={{ padding: "0.625rem 0.75rem", textAlign: "left", fontWeight: 600, color: D.muted, fontSize: 11, width: 32 }}>#</th>
                          <th style={{ padding: "0.625rem 0.75rem", textAlign: "left", fontWeight: 600, color: D.muted, fontSize: 11 }}>Produto</th>
                          <th style={{ padding: "0.625rem 0.75rem", textAlign: "right", fontWeight: 600, color: D.muted, fontSize: 11 }}>OPs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topRepetidas.length === 0 ? (
                          <tr>
                            <td colSpan={3} style={{ padding: "2rem", textAlign: "center", color: D.muted, fontSize: 11 }}>Sem dados</td>
                          </tr>
                        ) : topRepetidas.map(({ formulaId, produto, ops }, i) => (
                          <tr key={formulaId} style={{ borderBottom: `1px solid ${D.border}` }}>
                            <td style={{ padding: "0.5rem 0.75rem", color: D.muted, fontFamily: "monospace", fontSize: 11 }}>
                              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}º`}
                            </td>
                            <td style={{ padding: "0.5rem 0.75rem" }}>
                              <p style={{ fontWeight: 500, fontSize: 11, color: D.text, margin: 0 }}>{produto}</p>
                              <p style={{ fontSize: 11, color: D.muted, fontFamily: "monospace", margin: 0 }}>ID {formulaId}</p>
                            </td>
                            <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600, fontSize: 11, color: D.cyan }}>{ops}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </>
      )}
    </div>
  );
}
