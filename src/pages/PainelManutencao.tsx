import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Loader2, Wrench, Play, CheckCircle2, Clock, RefreshCw, CalendarRange, Package, PackageCheck, Pencil, Trash2 } from "lucide-react";

function toStr(d: Date) { return d.toISOString().split("T")[0]; }
function inicioSemana(d: Date) {
  const dow = d.getDay();
  const seg = new Date(d);
  seg.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return seg;
}

type AtalhoData = "hoje" | "semana" | "mes" | "mes_passado" | null;
const ATALHOS: { id: AtalhoData; label: string }[] = [
  { id: "hoje",        label: "Hoje" },
  { id: "semana",      label: "Esta semana" },
  { id: "mes",         label: "Este mês" },
  { id: "mes_passado", label: "Mês passado" },
];
function calcAtalho(id: AtalhoData): { inicio: string; fim: string } {
  const d = new Date();
  if (id === "hoje")   return { inicio: toStr(d), fim: toStr(d) };
  if (id === "semana") return { inicio: toStr(inicioSemana(d)), fim: toStr(d) };
  if (id === "mes")    return { inicio: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, fim: toStr(d) };
  if (id === "mes_passado") {
    const ultimoDia = new Date(d.getFullYear(), d.getMonth(), 0);
    const primeiroDia = new Date(ultimoDia.getFullYear(), ultimoDia.getMonth(), 1);
    return { inicio: toStr(primeiroDia), fim: toStr(ultimoDia) };
  }
  return { inicio: "", fim: "" };
}

interface OS {
  id: string;
  equipamento_id: string | null;
  descricao_problema: string;
  prioridade: string;
  status: string;
  aberta_por: string | null;
  tecnico_id: string | null;
  tecnico_nome: string | null;
  solucao_aplicada: string | null;
  peca_aguardada: string | null;
  previsao_peca: string | null;
  aberta_em: string | null;
  iniciado_em: string | null;
  concluido_em: string | null;
  equipamentos?: { nome: string; tag: string | null; linha: number | null } | null;
}

interface PainelManutencaoProps {
  papel: string;
  perfilId: string;
  perfilNome: string;
}

const PRIORIDADE_CONFIG: Record<string, { label: string; class: string }> = {
  baixa:   { label: "Baixa",   class: "bg-slate-100 text-slate-600" },
  media:   { label: "Média",   class: "bg-blue-100 text-blue-700" },
  alta:    { label: "Alta",    class: "bg-amber-100 text-amber-700" },
  critica: { label: "Crítica", class: "bg-red-100 text-red-700 font-bold" },
};

const STATUS_TABS = [
  { value: "aberta",                label: "Aberta" },
  { value: "em_andamento",          label: "Em Andamento" },
  { value: "aguardando_peca",       label: "Aguard. Peça" },
  { value: "aguardando_aprovacao",  label: "Aguard. Aprovação" },
  { value: "concluida",             label: "Concluída" },
] as const;

const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  aberta:               { label: "Aberta",             class: "bg-slate-100 text-slate-700" },
  em_andamento:         { label: "Em Andamento",        class: "bg-blue-100 text-blue-700" },
  aguardando_peca:      { label: "Aguard. Peça",        class: "bg-yellow-100 text-yellow-700" },
  aguardando_aprovacao: { label: "Aguard. Aprovação",   class: "bg-amber-100 text-amber-700" },
  concluida:            { label: "Concluída",           class: "bg-green-100 text-green-700" },
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
}

export default function PainelManutencao({ papel, perfilId, perfilNome }: PainelManutencaoProps) {
  const [oss, setOss] = useState<OS[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabAtiva, setTabAtiva] = useState<string>("aberta");

  const [solucao_aplicadaDialogOS, setSolucaoDialogOS] = useState<OS | null>(null);
  const [solucao_aplicadaText, setSolucaoText] = useState("");
  const [savingSolucao, setSavingSolucao] = useState(false);
  const [estoqueItems, setEstoqueItems] = useState<{ id: string; nome: string; unidade: string; quantidade: number }[]>([]);
  const [pecasUtilizadas, setPecasUtilizadas] = useState<{ item_id: string; nome: string; unidade: string; quantidade: string }[]>([]);

  const [confirmarConclusaoOS, setConfirmarConclusaoOS] = useState<OS | null>(null);
  const [savingConclusao, setSavingConclusao] = useState(false);

  const [iniciarConfirmOS, setIniciarConfirmOS] = useState<OS | null>(null);

  const [aguardarPecaOS, setAguardarPecaOS] = useState<OS | null>(null);
  const [pecaText, setPecaText] = useState("");
  const [previsaoText, setPrevisaoText] = useState("");
  const [savingPeca, setSavingPeca] = useState(false);

  const [editOS, setEditOS] = useState<OS | null>(null);
  const [editForm, setEditForm] = useState({ equipamento_id: "", descricao_problema: "", prioridade: "media", tecnico_nome: "" });
  const [editEquipamentos, setEditEquipamentos] = useState<{ id: string; nome: string; tag: string | null; linha: number | null }[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const [movsPorOS, setMovsPorOS] = useState<Record<string, { id: string; item_id: string; quantidade: number; nome: string; unidade: string }[]>>({});
  const [qtdEditadas, setQtdEditadas] = useState<Record<string, string>>({});
  const [savingMovIds, setSavingMovIds] = useState<Record<string, boolean>>({});

  const mesAtual = useMemo(() => calcAtalho("mes"), []);
  const [dataInicio, setDataInicio] = useState(mesAtual.inicio);
  const [dataFim, setDataFim] = useState(mesAtual.fim);
  const [atalhoAtivo, setAtalhoAtivo] = useState<AtalhoData>("mes");

  function aplicarAtalho(id: AtalhoData) {
    const { inicio, fim } = calcAtalho(id);
    setDataInicio(inicio);
    setDataFim(fim);
    setAtalhoAtivo(id);
  }

  const fetchOss = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("ordens_servico")
      .select("*, equipamentos(nome, tag, linha)")
      .order("aberta_em", { ascending: false });
    if (error) {
      console.error("[PainelManutencao] fetchOss error:", error);
      toast({ title: "Erro ao carregar OS", description: error.message, variant: "destructive" });
    } else {
      setOss(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOss();
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("ordens-servico-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ordens_servico" }, () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => fetchOss(), 1500);
      })
      .subscribe();
    return () => {
      if (debounce) clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
  }, [fetchOss]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    oss.forEach((o) => { c[o.status] = (c[o.status] ?? 0) + 1; });
    return c;
  }, [oss]);

  const ossFiltradas = useMemo(() => {
    const porStatus = oss.filter((o) => o.status === tabAtiva);
    if (tabAtiva !== "concluida") return porStatus;
    return porStatus.filter((o) => {
      if (!o.concluido_em) return false;
      const dia = o.concluido_em.split("T")[0];
      if (dataInicio && dia < dataInicio) return false;
      if (dataFim && dia > dataFim) return false;
      return true;
    });
  }, [oss, tabAtiva, dataInicio, dataFim]);

  useEffect(() => {
    if (tabAtiva !== "aguardando_aprovacao" && tabAtiva !== "concluida") return;
    ossFiltradas.forEach(os => recarregarMovsOS(os.id));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabAtiva, ossFiltradas]);

  async function salvarAguardarPeca() {
    if (!aguardarPecaOS) return;
    if (!pecaText.trim()) {
      toast({ title: "Informe qual peça está sendo aguardada", variant: "destructive" });
      return;
    }
    setSavingPeca(true);
    const { error } = await (supabase as any).from("ordens_servico").update({
      status: "aguardando_peca",
      peca_aguardada: pecaText.trim(),
      previsao_peca: previsaoText || null,
    }).eq("id", aguardarPecaOS.id);
    setSavingPeca(false);
    if (error) toast({ title: "Erro ao registrar peça", description: error.message, variant: "destructive" });
    else {
      toast({ title: "OS aguardando peça" });
      setAguardarPecaOS(null);
      setPecaText("");
      setPrevisaoText("");
    }
  }

  async function pecaChegou(os: OS) {
    const { error } = await (supabase as any).from("ordens_servico").update({
      status: "em_andamento",
      peca_aguardada: null,
      previsao_peca: null,
    }).eq("id", os.id);
    if (error) toast({ title: "Erro ao registrar chegada da peça", description: error.message, variant: "destructive" });
    else toast({ title: "Peça registrada — OS voltou para Em Andamento" });
  }

  async function iniciarOS(os: OS) {
    const { error } = await (supabase as any).from("ordens_servico").update({
      status: "em_andamento",
      tecnico_id: perfilId,
      tecnico_nome: perfilNome,
      iniciado_em: new Date().toISOString(),
    }).eq("id", os.id);
    if (error) toast({ title: "Erro ao iniciar OS", description: error.message, variant: "destructive" });
    else { toast({ title: "OS iniciada!" }); setIniciarConfirmOS(null); }
  }

  async function abrirDialogSolucao(os: OS) {
    setSolucaoDialogOS(os);
    setSolucaoText("");
    setPecasUtilizadas([]);
    const { data } = await (supabase as any)
      .from("estoque_manutencao")
      .select("id, nome, unidade, quantidade")
      .order("nome", { ascending: true });
    setEstoqueItems(data ?? []);
  }

  function adicionarPeca() {
    setPecasUtilizadas(prev => [...prev, { item_id: "", nome: "", unidade: "", quantidade: "1" }]);
  }

  function removerPeca(idx: number) {
    setPecasUtilizadas(prev => prev.filter((_, i) => i !== idx));
  }

  function updatePeca(idx: number, item_id: string) {
    const item = estoqueItems.find(i => i.id === item_id);
    if (!item) return;
    setPecasUtilizadas(prev => prev.map((p, i) =>
      i === idx ? { ...p, item_id, nome: item.nome, unidade: item.unidade } : p
    ));
  }

  async function registrarSolucao() {
    if (!solucao_aplicadaDialogOS) return;
    if (!solucao_aplicadaText.trim()) {
      toast({ title: "Descreva a solução aplicada", variant: "destructive" });
      return;
    }
    setSavingSolucao(true);

    const { error } = await (supabase as any).from("ordens_servico").update({
      status: "aguardando_aprovacao",
      solucao_aplicada: solucao_aplicadaText.trim(),
    }).eq("id", solucao_aplicadaDialogOS.id);

    if (error) {
      setSavingSolucao(false);
      toast({ title: "Erro ao registrar solução", description: error.message, variant: "destructive" });
      return;
    }

    // Baixa automática de peças utilizadas
    const pecasValidas = pecasUtilizadas.filter(p => p.item_id && parseFloat(p.quantidade) > 0);
    for (const peca of pecasValidas) {
      const qtd = parseFloat(peca.quantidade);
      const item = estoqueItems.find(i => i.id === peca.item_id);
      if (!item) continue;
      await Promise.all([
        (supabase as any).from("movimentacoes_estoque").insert({
          item_id: peca.item_id,
          tipo: "saida",
          quantidade: qtd,
          motivo: `OS: ${solucao_aplicadaDialogOS.descricao_problema}`,
          ordem_servico_id: solucao_aplicadaDialogOS.id,
          criado_por: perfilNome,
        }),
        (supabase as any).from("estoque_manutencao")
          .update({ quantidade: Math.max(0, item.quantidade - qtd) })
          .eq("id", peca.item_id),
      ]);
    }

    setSavingSolucao(false);
    toast({ title: "Solução registrada — aguardando aprovação do gestor" });
    setSolucaoDialogOS(null);
    setSolucaoText("");
    setPecasUtilizadas([]);
  }

  async function abrirEdicao(os: OS) {
    setEditForm({
      equipamento_id: os.equipamento_id ?? "",
      descricao_problema: os.descricao_problema,
      prioridade: os.prioridade,
      tecnico_nome: os.tecnico_nome ?? "",
    });
    const { data } = await (supabase as any)
      .from("equipamentos")
      .select("id, nome, tag, linha")
      .eq("status", "ativo")
      .order("nome", { ascending: true });
    setEditEquipamentos(data ?? []);
    setEditOS(os);
  }

  async function salvarEdicao() {
    if (!editOS) return;
    if (!editForm.descricao_problema.trim()) {
      toast({ title: "Descrição é obrigatória", variant: "destructive" }); return;
    }
    setSavingEdit(true);
    const { error } = await (supabase as any).from("ordens_servico").update({
      equipamento_id: editForm.equipamento_id || null,
      descricao_problema: editForm.descricao_problema.trim(),
      prioridade: editForm.prioridade,
      tecnico_nome: editForm.tecnico_nome.trim() || null,
    }).eq("id", editOS.id);
    setSavingEdit(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "OS atualizada!" });
    setEditOS(null);
  }

  async function deletarOS(os: OS) {
    if (!window.confirm(`Excluir a OS "${os.descricao_problema}"? Esta ação não pode ser desfeita.`)) return;
    const { error } = await (supabase as any).from("ordens_servico").delete().eq("id", os.id);
    if (error) toast({ title: "Erro ao excluir OS", description: error.message, variant: "destructive" });
    else { toast({ title: "OS excluída" }); fetchOss(); }
  }

  async function recarregarMovsOS(osId: string) {
    const { data: movData, error } = await (supabase as any)
      .from("movimentacoes_estoque")
      .select("id, item_id, quantidade")
      .eq("ordem_servico_id", osId)
      .eq("tipo", "saida");

    if (error) {
      console.error("[recarregarMovsOS] erro:", error.message);
      setMovsPorOS(prev => ({ ...prev, [osId]: [] }));
      return;
    }

    if (!movData || movData.length === 0) {
      setMovsPorOS(prev => ({ ...prev, [osId]: [] }));
      return;
    }

    const itemIds = [...new Set(movData.map((m: any) => m.item_id))];
    const { data: estoqueData } = await (supabase as any)
      .from("estoque_manutencao")
      .select("id, nome, unidade")
      .in("id", itemIds);

    const itemMap: Record<string, { nome: string; unidade: string }> = {};
    (estoqueData ?? []).forEach((i: any) => { itemMap[i.id] = { nome: i.nome, unidade: i.unidade }; });

    const movs = movData.map((m: any) => ({
      id: m.id,
      item_id: m.item_id,
      quantidade: m.quantidade,
      nome: itemMap[m.item_id]?.nome ?? "—",
      unidade: itemMap[m.item_id]?.unidade ?? "",
    }));

    setMovsPorOS(prev => ({ ...prev, [osId]: movs }));
  }

  async function salvarQtdMov(mov: { id: string; item_id: string; quantidade: number }, osId: string) {
    const novaQtd = parseFloat(qtdEditadas[mov.id] ?? String(mov.quantidade));
    if (!novaQtd || novaQtd <= 0) {
      toast({ title: "Quantidade inválida", variant: "destructive" }); return;
    }
    setSavingMovIds(prev => ({ ...prev, [mov.id]: true }));

    const { data: estoqueData } = await (supabase as any)
      .from("estoque_manutencao").select("quantidade").eq("id", mov.item_id).single();

    if (!estoqueData) {
      setSavingMovIds(prev => ({ ...prev, [mov.id]: false }));
      toast({ title: "Item não encontrado no estoque", variant: "destructive" }); return;
    }

    const novaQtdEstoque = Math.max(0, estoqueData.quantidade + mov.quantidade - novaQtd);

    const [movErr, estoqueErr] = await Promise.all([
      (supabase as any).from("movimentacoes_estoque").update({ quantidade: novaQtd }).eq("id", mov.id).then((r: any) => r.error),
      (supabase as any).from("estoque_manutencao").update({ quantidade: novaQtdEstoque }).eq("id", mov.item_id).then((r: any) => r.error),
    ]);

    setSavingMovIds(prev => ({ ...prev, [mov.id]: false }));
    if (movErr || estoqueErr) { toast({ title: "Erro ao salvar", variant: "destructive" }); return; }

    toast({ title: "Quantidade atualizada!" });
    setQtdEditadas(prev => { const n = { ...prev }; delete n[mov.id]; return n; });
    await recarregarMovsOS(osId);
  }

  async function removerMovimentacao(mov: { id: string; item_id: string; quantidade: number }, osId: string) {
    if (!window.confirm("Remover esta peça da OS?")) return;
    setSavingMovIds(prev => ({ ...prev, [mov.id]: true }));

    const { data: estoqueData } = await (supabase as any)
      .from("estoque_manutencao").select("quantidade").eq("id", mov.item_id).single();

    const qtdRestaurada = estoqueData ? estoqueData.quantidade + mov.quantidade : null;

    const ops: Promise<any>[] = [
      (supabase as any).from("movimentacoes_estoque").delete().eq("id", mov.id),
    ];
    if (qtdRestaurada !== null) {
      ops.push((supabase as any).from("estoque_manutencao").update({ quantidade: qtdRestaurada }).eq("id", mov.item_id));
    }
    await Promise.all(ops);

    setSavingMovIds(prev => ({ ...prev, [mov.id]: false }));
    toast({ title: "Peça removida" });
    await recarregarMovsOS(osId);
  }

  async function concluirOS(os: OS) {
    setSavingConclusao(true);
    const { error } = await (supabase as any).from("ordens_servico").update({
      status: "concluida",
      concluido_em: new Date().toISOString(),
    }).eq("id", os.id);
    setSavingConclusao(false);
    if (error) toast({ title: "Erro ao concluir OS", description: error.message, variant: "destructive" });
    else { toast({ title: "OS concluída!" }); setConfirmarConclusaoOS(null); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wrench className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-bold">Painel de Manutenção</h2>
            <p className="text-sm text-muted-foreground">{oss.length} OS{oss.length !== 1 ? "s" : ""} no total</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchOss} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {STATUS_TABS.map(({ value, label }) => {
          const count = counts[value] ?? 0;
          return (
            <button
              key={value}
              onClick={() => setTabAtiva(value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tabAtiva === value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                  tabAtiva === value ? "bg-white/20" : "bg-background"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filtro de período — apenas na aba Concluída */}
      {tabAtiva === "concluida" && (
        <div className="flex items-center gap-3 flex-wrap rounded-lg border bg-card px-4 py-3">
          <CalendarRange className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex gap-1 flex-wrap">
            {ATALHOS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => aplicarAtalho(a.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                  atalhoAtivo === a.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-input bg-background text-muted-foreground hover:border-foreground/30"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => { setDataInicio(e.target.value); setAtalhoAtivo(null); }}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-xs text-muted-foreground">até</span>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => { setDataFim(e.target.value); setAtalhoAtivo(null); }}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      )}

      {/* Lista de OS */}
      {ossFiltradas.length === 0 ? (
        <div className="rounded-lg border bg-card py-12 text-center text-muted-foreground">
          Nenhuma OS com status "{STATUS_TABS.find(t => t.value === tabAtiva)?.label}".
        </div>
      ) : (
        <div className="space-y-3">
          {ossFiltradas.map((os) => {
            const prio = PRIORIDADE_CONFIG[os.prioridade] ?? { label: os.prioridade, class: "bg-muted text-muted-foreground" };
            const st = STATUS_CONFIG[os.status] ?? { label: os.status, class: "bg-muted text-muted-foreground" };
            const equip = os.equipamentos;

            return (
              <div key={os.id} className="bg-card rounded-lg border p-4 space-y-3">
                {/* Topo */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-base">
                        {equip?.nome ?? "Equipamento removido"}
                      </span>
                      {equip?.tag && (
                        <span className="font-mono text-xs text-muted-foreground border rounded px-1.5 py-0.5">
                          {equip.tag}
                        </span>
                      )}
                      {equip?.linha != null && (
                        <span className="text-xs text-muted-foreground">L{equip.linha}</span>
                      )}
                    </div>
                    <p className="text-sm text-foreground/80 line-clamp-2">{os.descricao_problema}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${prio.class}`}>
                      {prio.label}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${st.class}`}>
                      {st.label}
                    </span>
                  </div>
                </div>

                {/* Peça aguardada (destaque âmbar) */}
                {os.peca_aguardada && (
                  <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm flex items-start gap-2">
                    <Package className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-yellow-700">Aguardando peça: </span>
                      <span className="text-yellow-800">{os.peca_aguardada}</span>
                      {os.previsao_peca && (
                        <span className="ml-2 text-yellow-600 text-xs">
                          · Previsão: {format(new Date(os.previsao_peca + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Solução (se houver) */}
                {os.solucao_aplicada && (
                  <div className="rounded-md bg-muted/50 border px-3 py-2 text-sm">
                    <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Solução: </span>
                    {os.solucao_aplicada}
                  </div>
                )}

                {/* Peças utilizadas — aguardando_aprovacao e concluida */}
                {(os.status === "aguardando_aprovacao" || os.status === "concluida") && (
                  <div className="rounded-md bg-muted/30 border px-3 py-2 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <Package className="h-3 w-3" /> Peças utilizadas
                    </p>
                    {(movsPorOS[os.id] === undefined) ? (
                      <p className="text-xs text-muted-foreground">Carregando...</p>
                    ) : (movsPorOS[os.id].length === 0) ? (
                      <p className="text-xs text-muted-foreground">Nenhuma peça registrada</p>
                    ) : (
                      movsPorOS[os.id].map(mov => {
                        const qtdAtual = qtdEditadas[mov.id] ?? String(mov.quantidade);
                        const alterada = qtdAtual !== String(mov.quantidade);
                        const salvando = savingMovIds[mov.id] ?? false;
                        return (
                          <div key={mov.id} className="flex items-center gap-2 text-sm">
                            <span className="flex-1 text-foreground/80 min-w-0 truncate">{mov.nome}</span>
                            <input
                              type="number" min="0.01" step="0.01"
                              value={qtdAtual}
                              onChange={(e) => setQtdEditadas(prev => ({ ...prev, [mov.id]: e.target.value }))}
                              className="w-20 rounded border border-input bg-background px-2 py-0.5 text-xs text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                            <span className="text-xs text-muted-foreground w-6 shrink-0">{mov.unidade}</span>
                            {alterada && (
                              <button
                                onClick={() => salvarQtdMov(mov, os.id)}
                                disabled={salvando}
                                title="Salvar"
                                className="p-1 rounded text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
                              >
                                {salvando ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                              </button>
                            )}
                            <button
                              onClick={() => removerMovimentacao(mov, os.id)}
                              disabled={salvando}
                              title="Remover peça"
                              className="p-1 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Metadados */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Aberta {fmtDate(os.aberta_em)} por {os.aberta_por ?? "—"}
                  </span>
                  {os.tecnico_nome && (
                    <span>· Técnico: <span className="font-medium text-foreground">{os.tecnico_nome}</span></span>
                  )}
                  {os.concluido_em && (
                    <span>· Concluída {fmtDate(os.concluido_em)}</span>
                  )}
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {/* Técnico: iniciar OS aberta */}
                  {(papel === "tecnico" || papel === "gestor") && os.status === "aberta" && (
                    <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => setIniciarConfirmOS(os)}>
                      <Play className="h-3 w-3" />
                      Iniciar
                    </Button>
                  )}

                  {/* Técnico: aguardar peça */}
                  {(papel === "tecnico" || papel === "gestor") && os.status === "em_andamento" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-7 text-xs text-yellow-700 border-yellow-300 hover:bg-yellow-50"
                      onClick={() => { setAguardarPecaOS(os); setPecaText(os.peca_aguardada ?? ""); setPrevisaoText(os.previsao_peca ?? ""); }}
                    >
                      <Package className="h-3 w-3" />
                      Aguardar Peça
                    </Button>
                  )}

                  {/* Técnico: registrar solução */}
                  {(papel === "tecnico" || papel === "gestor") && os.status === "em_andamento" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-7 text-xs"
                      onClick={() => { abrirDialogSolucao(os); setSolucaoText(os.solucao_aplicada ?? ""); }}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Registrar Solução
                    </Button>
                  )}

                  {/* Técnico: peça chegou */}
                  {(papel === "tecnico" || papel === "gestor") && os.status === "aguardando_peca" && (
                    <Button
                      size="sm"
                      className="gap-1.5 h-7 text-xs bg-yellow-500 hover:bg-yellow-600 text-white"
                      onClick={() => pecaChegou(os)}
                    >
                      <PackageCheck className="h-3 w-3" />
                      Peça Chegou
                    </Button>
                  )}

                  {/* Gestor: aprovar/concluir */}
                  {papel === "gestor" && os.status === "aguardando_aprovacao" && (
                    <Button
                      size="sm"
                      className="gap-1.5 h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => setConfirmarConclusaoOS(os)}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Aprovar e Concluir
                    </Button>
                  )}

                  {/* Gestor: editar e excluir */}
                  {papel === "gestor" && (
                    <div className="flex items-center gap-1 ml-auto">
                      <button
                        onClick={() => abrirEdicao(os)}
                        title="Editar"
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deletarOS(os)}
                        title="Excluir"
                        className="p-1.5 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog: Aguardar Peça */}
      <Dialog open={!!aguardarPecaOS} onOpenChange={(o) => { if (!o) setAguardarPecaOS(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aguardar Peça</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {aguardarPecaOS && (
              <p className="text-sm text-muted-foreground">
                {aguardarPecaOS.equipamentos?.nome} — {aguardarPecaOS.descricao_problema}
              </p>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Qual peça está sendo aguardada? *</label>
              <Input
                value={pecaText}
                onChange={(e) => setPecaText(e.target.value)}
                placeholder="Ex: Rolamento 6205, Correia B-78..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Previsão de chegada</label>
              <Input
                type="date"
                value={previsaoText}
                onChange={(e) => setPrevisaoText(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAguardarPecaOS(null)}>Cancelar</Button>
            <Button
              onClick={salvarAguardarPeca}
              disabled={savingPeca}
              className="bg-yellow-500 hover:bg-yellow-600 text-white"
            >
              {savingPeca && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Registrar Solução */}
      <Dialog open={!!solucao_aplicadaDialogOS} onOpenChange={(o) => { if (!o) { setSolucaoDialogOS(null); setPecasUtilizadas([]); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Solução</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {solucao_aplicadaDialogOS && (
              <p className="text-sm text-muted-foreground">
                {solucao_aplicadaDialogOS.equipamentos?.nome} — {solucao_aplicadaDialogOS.descricao_problema}
              </p>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Solução aplicada *</label>
              <textarea
                value={solucao_aplicadaText}
                onChange={(e) => setSolucaoText(e.target.value)}
                rows={3}
                placeholder="Descreva o que foi feito para resolver o problema..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            {/* Peças utilizadas */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  Peças / Materiais utilizados
                </label>
                <button
                  type="button"
                  onClick={adicionarPeca}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  + Adicionar
                </button>
              </div>
              {estoqueItems.length === 0 && pecasUtilizadas.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum item cadastrado no estoque de manutenção</p>
              )}
              {pecasUtilizadas.map((peca, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={peca.item_id}
                    onChange={(e) => updatePeca(idx, e.target.value)}
                    className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Selecione...</option>
                    {estoqueItems.map(i => (
                      <option key={i.id} value={i.id}>{i.nome} ({i.quantidade} {i.unidade})</option>
                    ))}
                  </select>
                  <Input
                    type="number" min="0.01" step="0.01"
                    value={peca.quantidade}
                    onChange={(e) => setPecasUtilizadas(prev => prev.map((p, i) => i === idx ? { ...p, quantidade: e.target.value } : p))}
                    className="w-20"
                    placeholder="Qtd"
                  />
                  {peca.unidade && <span className="text-xs text-muted-foreground shrink-0 w-6">{peca.unidade}</span>}
                  <button type="button" onClick={() => removerPeca(idx)} className="text-muted-foreground hover:text-destructive text-lg leading-none">×</button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSolucaoDialogOS(null); setPecasUtilizadas([]); }}>Cancelar</Button>
            <Button onClick={registrarSolucao} disabled={savingSolucao}>
              {savingSolucao && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar para Aprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Iniciar OS */}
      <AlertDialog open={!!iniciarConfirmOS} onOpenChange={(o) => { if (!o) setIniciarConfirmOS(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Iniciar atendimento</AlertDialogTitle>
            <AlertDialogDescription>
              Confirma que você vai iniciar o atendimento desta OS?
              Seu nome ficará registrado como técnico responsável.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => iniciarConfirmOS && iniciarOS(iniciarConfirmOS)}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: Editar OS */}
      <Dialog open={!!editOS} onOpenChange={(o) => { if (!o) setEditOS(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar OS</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Equipamento</label>
              <select
                value={editForm.equipamento_id}
                onChange={(e) => setEditForm(f => ({ ...f, equipamento_id: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Selecione...</option>
                {editEquipamentos.map(eq => (
                  <option key={eq.id} value={eq.id}>
                    {eq.nome}{eq.tag ? ` — ${eq.tag}` : ""}{eq.linha != null ? ` (L${eq.linha})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Descrição do problema *</label>
              <textarea
                value={editForm.descricao_problema}
                onChange={(e) => setEditForm(f => ({ ...f, descricao_problema: e.target.value }))}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Prioridade</label>
              <select
                value={editForm.prioridade}
                onChange={(e) => setEditForm(f => ({ ...f, prioridade: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="critica">Crítica</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Técnico responsável</label>
              <Input
                value={editForm.tecnico_nome}
                onChange={(e) => setEditForm(f => ({ ...f, tecnico_nome: e.target.value }))}
                placeholder="Nome do técnico"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOS(null)}>Cancelar</Button>
            <Button onClick={salvarEdicao} disabled={savingEdit}>
              {savingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Concluir OS */}
      <AlertDialog open={!!confirmarConclusaoOS} onOpenChange={(o) => { if (!o) setConfirmarConclusaoOS(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar e concluir OS</AlertDialogTitle>
            <AlertDialogDescription>
              Confirma que a solução foi verificada e a OS pode ser marcada como concluída?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingConclusao}
              onClick={() => confirmarConclusaoOS && concluirOS(confirmarConclusaoOS)}
            >
              {savingConclusao && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar Conclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
