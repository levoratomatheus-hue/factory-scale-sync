import { useState, useEffect, useCallback } from "react";
import { useOrdens } from "@/hooks/useOrdens";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import {
  ClipboardList,
  CheckCircle2,
  Loader2,
  Clock,
  CalendarIcon,
  TrendingUp,
  PlusCircle,
  PackageSearch,
  AlertTriangle,
  CalendarPlus,
  CalendarClock,
} from "lucide-react";
import { format, isToday, isPast, isFuture } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { diasUteis } from "@/lib/diasUteis";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface LoteSemOP {
  lote: number;
  produto: string;
  quantidade: number;
  classe: string;
}

interface PainelGestorProps {
  onCriarOP?: (lote: number) => void;
}

export default function PainelGestor({ onCriarOP }: PainelGestorProps = {}) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const { ordens, loading } = useOrdens(dateStr);
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [todasPendentes, setTodasPendentes] = useState<any[]>([]);

  const fetchTodasPendentes = useCallback(async () => {
    const { data } = await supabase
      .from("ordens")
      .select("id, produto, lote, quantidade, status, posicao, linha, balanca, marca, data_programacao, data_emissao")
      .neq("status", "concluido")
      .limit(500)
      .order("posicao", { ascending: true, nullsFirst: false });
    setTodasPendentes(data ?? []);
  }, []);

  useEffect(() => {
    fetchTodasPendentes();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("gestor-pendentes-global")
      .on("postgres_changes", { event: "*", schema: "public", table: "ordens" }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fetchTodasPendentes(), 300);
      })
      .subscribe();
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchTodasPendentes]);

  const pendentesAnteriores = todasPendentes.filter(
    (o) =>
      o.data_programacao < todayStr &&
      ["pendente", "aguardando_linha"].includes(o.status)
  );

  const [pendentesOpen, setPendentesOpen] = useState(false);
  const [novaData, setNovaData] = useState<Record<string, string>>({});
  const [reprogramando, setReprogramando] = useState<Record<string, boolean>>({});

  const isHoje = isToday(selectedDate);
  const isPassado = isPast(selectedDate) && !isHoje;
  const isFuturo = isFuture(selectedDate);

  const total = ordens.length;
  const concluidas = ordens.filter((o) => o.status === "concluido").length;
  const emPesagem = ordens.filter((o) => o.status === "em_pesagem").length;
  const emAberto = ordens.filter((o) => o.status === "pendente").length;
  const taxaConclusao = total > 0 ? Math.round((concluidas / total) * 100) : 0;

  const [opsComEmissao, setOpsComEmissao] = useState<any[]>([]);

  useEffect(() => {
    const fetchOpsComEmissao = async () => {
      const { data } = await supabase
        .from('ordens')
        .select('id, produto, lote, data_emissao, data_programacao, linha, status')
        .not('data_emissao', 'is', null)
        .not('status', 'in', '("concluido","aguardando_liberacao")')
        .limit(500);
      setOpsComEmissao(data ?? []);
    };
    fetchOpsComEmissao();
  }, []);

  const opsAtrasadas = opsComEmissao.filter(op =>
    diasUteis(op.data_emissao, op.data_programacao) > 7
  );

  const [lotesSeOP, setLotesSeOP] = useState<LoteSemOP[]>([]);
  const [loadingLotesSemOP, setLoadingLotesSemOP] = useState(false);

  useEffect(() => {
    const fetchLotesSemOP = async () => {
      setLoadingLotesSemOP(true);
      const { data: lotes } = await (supabase as any)
        .from('cadastro_lotes')
        .select('lote, produto, quantidade, classe')
        .eq('status', 'Em Aberto')
        .order('lote', { ascending: true });

      if (!lotes?.length) { setLoadingLotesSemOP(false); return; }

      const { data: ordensExistentes } = await supabase
        .from('ordens')
        .select('lote');

      const lotesComOP = new Set((ordensExistentes ?? []).map((o: any) => String(o.lote)));
      setLotesSeOP(lotes.filter((l: any) => !lotesComOP.has(String(l.lote))));
      setLoadingLotesSemOP(false);
    };
    fetchLotesSemOP();
  }, []);

  const reprogramarOrdem = async (ordemId: string, paraHoje: boolean) => {
    const data = paraHoje ? todayStr : (novaData[ordemId] ?? todayStr);
    if (!data) { toast({ title: "Selecione uma data", variant: "destructive" }); return; }
    setReprogramando((prev) => ({ ...prev, [ordemId]: true }));
    const { error } = await supabase
      .from("ordens")
      .update({ data_programacao: data, status: "aguardando_linha" } as any)
      .eq("id", ordemId);
    setReprogramando((prev) => ({ ...prev, [ordemId]: false }));
    if (error) { toast({ title: "Erro ao reprogramar", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Ordem reprogramada para ${paraHoje ? "hoje" : data}` });
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Painel do Gestor</h1>
          {isPassado && <p className="text-sm text-muted-foreground mt-0.5">Visualizando dia passado</p>}
          {isFuturo && <p className="text-sm text-muted-foreground mt-0.5">Visualizando programação futura</p>}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("justify-start text-left font-normal gap-2")}>
              <CalendarIcon className="h-4 w-4" />
              {isHoje ? "Hoje" : format(selectedDate, "dd/MM/yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => d && setSelectedDate(d)}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total programado"
          value={total}
          variant="default"
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <MetricCard title="Concluídas" value={concluidas} variant="done" icon={<CheckCircle2 className="h-4 w-4" />} />
        {isHoje && (
          <MetricCard title="Em Pesagem" value={emPesagem} variant="weighing" icon={<Loader2 className="h-4 w-4" />} />
        )}
        {isPassado && (
          <MetricCard
            title="Taxa de conclusão"
            value={`${taxaConclusao}%`}
            variant="weighing"
            icon={<TrendingUp className="h-4 w-4" />}
          />
        )}
        {isFuturo && (
          <MetricCard title="Previstas" value={total} variant="weighing" icon={<TrendingUp className="h-4 w-4" />} />
        )}
        <MetricCard
          title={isPassado ? "Não concluídas" : "Pendentes"}
          value={emAberto}
          variant="open"
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {/* Lotes sem OP */}
      {(loadingLotesSemOP || lotesSeOP.length > 0) && (
        <div className="bg-card rounded-lg border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
            <div className="flex items-center gap-2">
              <PackageSearch className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Lotes Pendentes de Programação</h3>
            </div>
            {!loadingLotesSemOP && (
              <span className="text-xs font-bold bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                {lotesSeOP.length} lote{lotesSeOP.length !== 1 ? 's' : ''} sem OP
              </span>
            )}
          </div>

          {loadingLotesSemOP ? (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Lote</th>
                    <th className="text-left px-4 py-2 font-medium">Produto</th>
                    <th className="text-right px-4 py-2 font-medium">Qtd (kg)</th>
                    <th className="text-left px-4 py-2 font-medium">Classe</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lotesSeOP.map((l) => (
                    <tr key={l.lote} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2 font-mono font-medium">{l.lote}</td>
                      <td className="px-4 py-2 max-w-xs truncate">{l.produto}</td>
                      <td className="px-4 py-2 text-right">{l.quantidade.toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-2 text-muted-foreground">{l.classe || '—'}</td>
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
          )}
        </div>
      )}

      {/* Pendentes de dias anteriores */}
      {pendentesAnteriores.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-sm font-medium text-amber-800">
              <span className="font-bold">{pendentesAnteriores.length}</span> OP{pendentesAnteriores.length !== 1 ? "s" : ""} de dias anteriores precisam ser reprogramadas
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
              <div key={op.id} className="rounded-lg border bg-muted/30 p-4 space-y-3">
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
                    {format(new Date(op.data_programacao + "T12:00:00"), "dd/MM/yyyy")}
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
                      className="rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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

      {/* OPs atrasadas */}
      {opsAtrasadas.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
          <h3 className="text-sm font-bold text-red-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {opsAtrasadas.length} OP{opsAtrasadas.length > 1 ? 's' : ''} em atraso
          </h3>
          {opsAtrasadas.map(op => (
            <div key={op.id} className="text-xs text-red-800 flex items-center justify-between">
              <span>{op.produto} — Lote {op.lote}</span>
              <span className="font-semibold">
                {diasUteis(op.data_emissao, op.data_programacao) - 7} dias em atraso
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Aviso pendências */}
      {isPassado && emAberto > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3 text-sm text-destructive font-medium">
          ⚠️ {emAberto} ordem{emAberto > 1 ? "s" : ""} não {emAberto > 1 ? "foram concluídas" : "foi concluída"} neste
          dia e ainda pode estar na fila das balanças.
        </div>
      )}

    </div>
  );
}
