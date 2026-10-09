import { useState, useEffect, useCallback, useMemo } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Loader2,
  PlusCircle,
  PackageSearch,
  AlertTriangle,
  CalendarPlus,
  CalendarClock,
  ListOrdered,
  RotateCcw,
  Search,
  X,
  FlaskConical,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { diasUteis } from "@/lib/diasUteis";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { isLoteBloqueado } from "@/lib/lotesBloqueados";

interface LoteSemOP {
  lote: number;
  produto: string;
  quantidade: number;
  classe: string;
  formula_id: string | null;
}

interface IngredienteMP {
  sequencia: number;
  materia_prima: string;
  percentual: number;
  quantidade_kg: number;
}

interface OrdemProgramada {
  id: string;
  lote: string;
  produto: string;
  quantidade: number;
  status: string;
  data_programacao: string | null;
  data_emissao: string | null;
  linha: number | null;
  balanca: number | null;
  posicao: number | null;
  marca: string | null;
}

interface PainelGestorProps {
  onCriarOP?: (lote: number) => void;
}


export default function PainelGestor({ onCriarOP }: PainelGestorProps = {}) {
  const todayStr = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  const [lotesSemOP, setLotesSemOP] = useState<LoteSemOP[]>([]);
  const [ordens, setOrdens] = useState<OrdemProgramada[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    // Step 1: busca lotes Em Aberto (mesma query do CriarOrdem)
    const { data: cadastro } = await (supabase as any)
      .from("cadastro_lotes")
      .select("lote, produto, quantidade, classe, formula_id")
      .eq("status", "Em Aberto")
      .order("lote", { ascending: true });

    // Step 2: busca ordens ativas para a seção "Lotes Programados"
    const { data: ordensData } = await supabase
      .from("ordens")
      .select("id, lote, produto, quantidade, status, data_programacao, data_emissao, linha, balanca, posicao, marca")
      .neq("status", "concluido")
      .order("data_programacao", { ascending: true })
      .order("posicao", { ascending: true, nullsFirst: false });

    // Step 3: filtra lotes sem OP — mesma lógica do CriarOrdem (String(bigint) dos dois lados)
    if (cadastro?.length) {
      const loteStrs = (cadastro as any[]).map((l) => String(l.lote));
      const { data: ordensDosCadastros } = await (supabase as any)
        .from("ordens")
        .select("lote")
        .in("lote", loteStrs);

      const lotesComOP = new Set((ordensDosCadastros ?? []).map((o: any) => String(o.lote)));
      setLotesSemOP((cadastro as any[]).filter((l) => !lotesComOP.has(String(l.lote)) && !isLoteBloqueado(Number(l.lote))));
    } else {
      setLotesSemOP([]);
    }

    setOrdens(ordensData ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("painel-gestor-v2")
      .on("postgres_changes", { event: "*", schema: "public", table: "ordens" }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(fetchAll, 800);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  // OPs de dias anteriores ainda pendentes
  const pendentesAnteriores = useMemo(
    () =>
      ordens.filter(
        (o) =>
          o.data_programacao &&
          o.data_programacao < todayStr &&
          ["pendente", "aguardando_linha"].includes(o.status)
      ),
    [ordens, todayStr]
  );

  // OPs com mais de 7 dias úteis em aberto
  const opsAtrasadas = useMemo(
    () =>
      ordens.filter(
        (o) =>
          o.data_emissao &&
          o.status !== "aguardando_liberacao" &&
          diasUteis(o.data_emissao, o.data_programacao ?? todayStr) > 7
      ),
    [ordens, todayStr]
  );

  const [pendentesOpen, setPendentesOpen] = useState(false);
  const [novaData, setNovaData] = useState<Record<string, string>>({});
  const [reprogramando, setReprogramando] = useState<Record<string, boolean>>({});
  const [ordemParaVoltarPesagem, setOrdemParaVoltarPesagem] = useState<OrdemProgramada | null>(null);
  const [voltandoPesagem, setVoltandoPesagem] = useState(false);
  const [filterMaterial, setFilterMaterial] = useState("");

  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set());

  const toggleStatus = (s: string) =>
    setFilterStatuses((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  const [prospecaoLote, setProspecaoLote] = useState<LoteSemOP | null>(null);
  const [prospecaoIngredientes, setProspecaoIngredientes] = useState<IngredienteMP[]>([]);
  const [loadingProspecao, setLoadingProspecao] = useState(false);
  const [prospecaoSemFormula, setProspecaoSemFormula] = useState<LoteSemOP[]>([]);

  const abrirProspecaoGeral = async () => {
    setProspecaoLote({ lote: 0, produto: "", quantidade: 0, classe: "", formula_id: null }); // abre o modal
    setProspecaoIngredientes([]);
    setLoadingProspecao(true);
    setProspecaoSemFormula([]);

    const formulaIds = [...new Set(lotesSemOP.map((l) => l.formula_id).filter(Boolean))] as string[];
    if (formulaIds.length === 0) { setLoadingProspecao(false); return; }

    const { data } = await (supabase as any)
      .from("formulas")
      .select("formula_id, cod_mp, materia_prima, percentual")
      .in("formula_id", formulaIds)
      .eq("ativo", true);

    setLoadingProspecao(false);
    if (!data) return;

    const formulaIdsNoBanco = new Set((data as any[]).map((r: any) => r.formula_id));
    setProspecaoSemFormula(lotesSemOP.filter((l) => l.formula_id && !formulaIdsNoBanco.has(l.formula_id)));

    // Agrupa por cod_mp (código TID) — evita duplicatas por variação de nome
    const totaisQty = new Map<string, number>();   // cod_mp → total kg
    const totaisNome = new Map<string, string>();  // cod_mp → nome para exibição

    for (const lote of lotesSemOP) {
      if (!lote.formula_id) continue;
      const itens = (data as any[]).filter((r) => r.formula_id === lote.formula_id);
      for (const item of itens) {
        if (!item.cod_mp) continue;
        const qty = (item.percentual / 100) * lote.quantidade;
        totaisQty.set(item.cod_mp, (totaisQty.get(item.cod_mp) ?? 0) + qty);
        if (!totaisNome.has(item.cod_mp)) totaisNome.set(item.cod_mp, item.materia_prima);
      }
    }

    setProspecaoIngredientes(
      Array.from(totaisQty.entries())
        .map(([cod_mp, quantidade_kg], i) => ({
          sequencia: i + 1,
          materia_prima: `${cod_mp} — ${totaisNome.get(cod_mp) ?? ""}`,
          percentual: 0,
          quantidade_kg,
        }))
        .sort((a, b) => a.materia_prima.localeCompare(b.materia_prima))
    );
  };

  const ordensFiltradas = useMemo(() => {
    let result = ordens;
    if (filterStatuses.size > 0) result = result.filter((o) => filterStatuses.has(o.status));
    if (filterMaterial.trim()) {
      const q = filterMaterial.trim().toLowerCase();
      result = result.filter((o) => o.produto?.toLowerCase().includes(q));
    }
    return result;
  }, [ordens, filterMaterial, filterStatuses]);

  const reprogramarOrdem = async (ordemId: string, paraHoje: boolean) => {
    const data = paraHoje ? todayStr : (novaData[ordemId] ?? "");
    if (!data) { toast({ title: "Selecione uma data", variant: "destructive" }); return; }
    setReprogramando((prev) => ({ ...prev, [ordemId]: true }));
    const { error } = await supabase
      .from("ordens")
      .update({ data_programacao: data, status: "aguardando_linha" } as any)
      .eq("id", ordemId);
    setReprogramando((prev) => ({ ...prev, [ordemId]: false }));
    if (error) { toast({ title: "Erro ao reprogramar", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Ordem reprogramada para ${paraHoje ? "hoje" : format(new Date(data + "T12:00:00"), "dd/MM/yyyy")}` });
  };

  const handleVoltarParaPesagem = async () => {
    if (!ordemParaVoltarPesagem) return;
    setVoltandoPesagem(true);
    const { error } = await supabase
      .from("ordens")
      .update({ status: "pendente", bateladas_feitas: 0, obs_pausa: null } as any)
      .eq("id", ordemParaVoltarPesagem.id);
    if (!error) {
      supabase.from("historico").insert({
        ordem_id: ordemParaVoltarPesagem.id,
        status_anterior: ordemParaVoltarPesagem.status,
        status_novo: "pendente",
        obs: "Retorno para pesagem solicitado pelo gestor — pesagem anterior cancelada",
      } as any);
      toast({ title: "OP voltou para a pesagem" });
      fetchAll();
    } else {
      toast({ title: "Erro ao voltar para pesagem", description: error.message, variant: "destructive" });
    }
    setVoltandoPesagem(false);
    setOrdemParaVoltarPesagem(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold dark:text-white">Painel do Gestor</h1>

      {/* Alerta: OPs de dias anteriores */}
      {pendentesAnteriores.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
              <span className="font-bold">{pendentesAnteriores.length}</span>{" "}
              OP{pendentesAnteriores.length !== 1 ? "s" : ""} de dias anteriores precisam ser reprogramadas
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-amber-400 text-amber-700 hover:bg-amber-100"
            onClick={() => setPendentesOpen(true)}
          >
            Ver e reprogramar
          </Button>
        </div>
      )}

      {/* Alerta: OPs atrasadas */}
      {opsAtrasadas.length > 0 && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 space-y-2">
          <h3 className="text-sm font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {opsAtrasadas.length} OP{opsAtrasadas.length > 1 ? "s" : ""} em atraso
          </h3>
          {opsAtrasadas.map((op) => (
            <div key={op.id} className="text-xs text-red-800 dark:text-red-300 flex items-center justify-between">
              <span>{op.produto} — Lote {op.lote}</span>
              <span className="font-semibold">
                {diasUteis(op.data_emissao!, op.data_programacao ?? todayStr) - 7} dias em atraso
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Lotes Pendentes de Programação */}
      {lotesSemOP.length > 0 && (
        <div className="bg-card dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b dark:border-gray-700 bg-muted/40 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <PackageSearch className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm dark:text-white">Lotes Pendentes de Programação</h3>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1 h-7 text-xs text-violet-600 border-violet-300 hover:bg-violet-50 dark:text-violet-400 dark:border-violet-700 dark:hover:bg-violet-900/20"
                onClick={abrirProspecaoGeral}
              >
                <FlaskConical className="h-3.5 w-3.5" />
                Prospecção de MP
              </Button>
              <span className="text-xs font-bold bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                {lotesSemOP.length} lote{lotesSemOP.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b dark:border-gray-700">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Lote</th>
                  <th className="text-left px-4 py-2 font-medium">Produto</th>
                  <th className="text-right px-4 py-2 font-medium">Qtd (kg)</th>
                  <th className="text-left px-4 py-2 font-medium">Classe</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {lotesSemOP.map((l) => (
                  <tr key={l.lote} className="border-b dark:border-gray-700 last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2 font-mono font-medium dark:text-gray-300">{l.lote}</td>
                    <td className="px-4 py-2 max-w-xs truncate dark:text-gray-300">{l.produto}</td>
                    <td className="px-4 py-2 text-right dark:text-gray-300">{l.quantidade.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2 text-muted-foreground">{l.classe || "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 h-7 text-xs"
                        onClick={() => onCriarOP?.(l.lote)}
                      >
                        <PlusCircle className="h-3.5 w-3.5" />
                        Criar OP
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {lotesSemOP.length === 0 && (
        <div className="rounded-lg border dark:border-gray-700 bg-muted/20 px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
          <PackageSearch className="h-4 w-4 shrink-0" />
          Nenhum lote pendente de programação.
        </div>
      )}

      {/* Lotes Programados */}
      <div className="bg-card dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b dark:border-gray-700 bg-muted/40 gap-3 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            <ListOrdered className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm dark:text-white">Lotes Programados</h3>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {[
              { value: "pendente",             label: "Pendente" },
              { value: "em_pesagem",           label: "Em Pesagem" },
              { value: "aguardando_mistura",   label: "Ag. Mistura" },
              { value: "em_mistura",           label: "Em Mistura" },
              { value: "aguardando_linha",     label: "Ag. Linha" },
              { value: "aguardando_liberacao", label: "Ag. Liberação" },
              { value: "pre_programacao",      label: "Pré-prog." },
            ].map(({ value, label }) => {
              const active = filterStatuses.has(value);
              return (
                <button
                  key={value}
                  onClick={() => toggleStatus(value)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background dark:bg-gray-800 text-muted-foreground border-input dark:border-gray-600 hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              );
            })}
            {filterStatuses.size > 0 && (
              <button
                onClick={() => setFilterStatuses(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 ml-0.5"
              >
                <X className="h-3 w-3" /> limpar
              </button>
            )}
          </div>
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Filtrar por material..."
              value={filterMaterial}
              onChange={(e) => setFilterMaterial(e.target.value)}
              className="w-full rounded-md border border-input dark:border-gray-600 bg-background dark:bg-gray-800 dark:text-white pl-8 pr-7 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {filterMaterial && (
              <button
                onClick={() => setFilterMaterial("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <span className="text-xs font-bold bg-primary text-primary-foreground rounded-full px-2 py-0.5 shrink-0">
            {ordensFiltradas.length}{(filterMaterial || filterStatuses.size > 0) ? `/${ordens.length}` : ""} OP{ordens.length !== 1 ? "s" : ""}
          </span>
        </div>

        {ordensFiltradas.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {filterMaterial || filterStatuses.size > 0 ? "Nenhuma ordem encontrada para este filtro." : "Nenhuma ordem programada."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b dark:border-gray-700">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Produto</th>
                  <th className="text-left px-4 py-2 font-medium">Lote</th>
                  <th className="text-right px-4 py-2 font-medium">Qtd (kg)</th>
                  <th className="text-left px-4 py-2 font-medium">Data Prog.</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {ordensFiltradas.map((op) => (
                  <tr key={op.id} className="border-b dark:border-gray-700 last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2 max-w-xs truncate dark:text-gray-300">{op.produto}</td>
                    <td className="px-4 py-2 font-mono dark:text-gray-300">{op.lote}</td>
                    <td className="px-4 py-2 text-right dark:text-gray-300">{op.quantidade?.toLocaleString("pt-BR") ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-muted-foreground">
                      {op.data_programacao
                        ? format(new Date(op.data_programacao + "T12:00:00"), "dd/MM/yyyy")
                        : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={op.status} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      {["aguardando_mistura", "em_mistura", "aguardando_linha"].includes(op.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 h-7 text-xs text-orange-600 border-orange-300 hover:bg-orange-50"
                          onClick={() => setOrdemParaVoltarPesagem(op)}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Voltar para pesagem
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialog: reprogramar OPs atrasadas */}
      <Dialog open={pendentesOpen} onOpenChange={setPendentesOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-amber-600" />
              OPs de dias anteriores pendentes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {pendentesAnteriores.map((op) => (
              <div key={op.id} className="rounded-lg border dark:border-gray-700 bg-muted/30 dark:bg-gray-700/30 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-sm font-semibold leading-tight">{op.produto}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span>Lote {op.lote}</span>
                      <span>·</span>
                      <span>{op.quantidade} kg</span>
                      <span>·</span>
                      <StatusBadge status={op.status} />
                    </div>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground shrink-0 bg-background border rounded px-2 py-0.5">
                    {format(new Date(op.data_programacao! + "T12:00:00"), "dd/MM/yyyy")}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={reprogramando[op.id]}
                    onClick={() => reprogramarOrdem(op.id, true)}
                  >
                    {reprogramando[op.id]
                      ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      : <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />}
                    Reprogramar para hoje
                  </Button>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={novaData[op.id] ?? ""}
                      min={todayStr}
                      onChange={(e) => setNovaData((prev) => ({ ...prev, [op.id]: e.target.value }))}
                      className="rounded-md border border-input dark:border-gray-600 bg-background dark:bg-gray-800 dark:text-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!novaData[op.id] || reprogramando[op.id]}
                      onClick={() => reprogramarOrdem(op.id, false)}
                    >
                      {reprogramando[op.id]
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : "Reprogramar"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendentesOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: prospecção de matéria-prima */}
      <Dialog open={!!prospecaoLote} onOpenChange={(open) => !open && setProspecaoLote(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-violet-600" />
              Prospecção de Matéria-Prima
            </DialogTitle>
            <DialogDescription>
              Total consolidado de todos os <span className="font-semibold">{lotesSemOP.length} lote{lotesSemOP.length !== 1 ? "s" : ""}</span> pendentes de programação.
            </DialogDescription>
          </DialogHeader>

          {loadingProspecao ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : prospecaoIngredientes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum ingrediente encontrado. Verifique se os lotes possuem fórmula cadastrada.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b dark:border-gray-700">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Matéria-Prima</th>
                    <th className="text-right px-3 py-2 font-medium">Total (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {prospecaoIngredientes.map((mp) => (
                    <tr key={mp.materia_prima} className="border-b dark:border-gray-700 last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 dark:text-gray-300">{mp.materia_prima}</td>
                      <td className="px-3 py-2 text-right font-semibold dark:text-gray-200">
                        {mp.quantidade_kg.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {prospecaoIngredientes.length > 0 && (
            <div className="rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700 px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-violet-700 dark:text-violet-300">Total geral de MP</span>
              <span className="text-lg font-bold text-violet-800 dark:text-violet-200">
                {prospecaoIngredientes.reduce((s, mp) => s + mp.quantidade_kg, 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
              </span>
            </div>
          )}

          {prospecaoSemFormula.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-4 py-3 space-y-1">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {prospecaoSemFormula.length} lote{prospecaoSemFormula.length !== 1 ? "s" : ""} sem fórmula importada — não entram na soma
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {prospecaoSemFormula.map((l) => (
                  <span key={l.lote} className="text-xs font-mono bg-amber-100 dark:bg-amber-800/40 text-amber-800 dark:text-amber-300 rounded px-2 py-0.5">
                    {l.lote} · {l.quantidade.toLocaleString("pt-BR")} kg
                  </span>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setProspecaoLote(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: voltar para pesagem */}
      <Dialog open={!!ordemParaVoltarPesagem} onOpenChange={(open) => !open && setOrdemParaVoltarPesagem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Voltar para pesagem?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{ordemParaVoltarPesagem?.produto}</span>
              <br />
              A pesagem anterior será desfeita. O operador terá que pesar a OP inteira novamente. O estoque não será alterado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOrdemParaVoltarPesagem(null)} disabled={voltandoPesagem}>
              Cancelar
            </Button>
            <Button onClick={handleVoltarParaPesagem} disabled={voltandoPesagem}>
              {voltandoPesagem && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
