import { useState, useEffect } from "react";
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
  Trash2,
  ChevronUp,
  ChevronDown,
  PlusCircle,
  PackageSearch,
  AlertTriangle,
  CalendarPlus,
  CalendarClock,
  Pencil,
  Undo2,
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn, sortOrdens } from "@/lib/utils";
import { MarcaBadge } from "@/components/MarcaBadge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { EditarOrdemDialog, type OrdemEditavel } from "@/components/EditarOrdemDialog";

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
  const { ordens: todasPendentes } = useOrdens();
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const pendentesAnteriores = todasPendentes.filter(
    (o) =>
      o.data_programacao < todayStr &&
      ["pendente", "aguardando_linha"].includes(o.status)
  );

  const [pendentesOpen, setPendentesOpen] = useState(false);
  const [ordemParaExcluir, setOrdemParaExcluir] = useState<{ id: string; produto: string } | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [ordemEditando, setOrdemEditando] = useState<OrdemEditavel | null>(null);
  const [ordemParaVoltar, setOrdemParaVoltar] = useState<{ id: string; produto: string } | null>(null);
  const [voltando, setVoltando] = useState(false);
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

  const ordensPorLinha = (linha: number) => sortOrdens(ordens.filter((o) => o.linha === linha));
  const ordensPorBalanca = (balanca: number) =>
    sortOrdens(todasPendentes.filter((o) => o.balanca === balanca && o.status !== "concluido"));

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

  const excluirOrdem = async () => {
    if (!ordemParaExcluir) return;
    setExcluindo(true);
    const { error } = await supabase.from("ordens").delete().eq("id", ordemParaExcluir.id);
    setExcluindo(false);
    setOrdemParaExcluir(null);
    if (error) {
      toast({ title: "Erro ao excluir ordem", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Ordem excluída com sucesso!" });
    }
  };

  const handleVoltarFila = async () => {
    if (!ordemParaVoltar) return;
    setVoltando(true);
    const { error } = await supabase
      .from("ordens")
      .update({ status: "aguardando_linha" } as any)
      .eq("id", ordemParaVoltar.id);
    if (!error) {
      await supabase.from("historico").insert({
        ordem_id: ordemParaVoltar.id,
        status_anterior: "em_linha",
        status_novo: "aguardando_linha",
      });
      toast({ title: "Ordem voltou para a fila" });
    } else {
      toast({ title: "Erro ao voltar para fila", description: error.message, variant: "destructive" });
    }
    setVoltando(false);
    setOrdemParaVoltar(null);
  };

  const handleEditar = async (id: string, payload: Record<string, unknown>) => {
    const { error } = await supabase.from("ordens").update(payload as any).eq("id", id);
    if (error) {
      toast({ title: "Erro ao editar ordem", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Ordem atualizada com sucesso" });
    }
  };

  const moverOrdem = async (ordemId: string, direcao: "up" | "down", balanca: number) => {
    const fila = ordensPorBalanca(balanca);
    const idx = fila.findIndex((o) => o.id === ordemId);
    if (idx === -1) return;
    if (direcao === "up" && idx === 0) return;
    if (direcao === "down" && idx === fila.length - 1) return;

    const outro = direcao === "up" ? fila[idx - 1] : fila[idx + 1];
    const atual = fila[idx];

    const posAtual = atual.posicao ?? idx + 1;
    const posOutro = outro.posicao ?? (direcao === "up" ? idx : idx + 2);

    await supabase.from("ordens").update({ posicao: posOutro }).eq("id", atual.id);
    await supabase.from("ordens").update({ posicao: posAtual }).eq("id", outro.id);
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

      {/* Aviso pendências */}
      {isPassado && emAberto > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3 text-sm text-destructive font-medium">
          ⚠️ {emAberto} ordem{emAberto > 1 ? "s" : ""} não {emAberto > 1 ? "foram concluídas" : "foi concluída"} neste
          dia e ainda pode estar na fila das balanças.
        </div>
      )}

      {/* Programação por Linha */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Programação por Linha</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((linha) => (
            <div key={linha} className="bg-card rounded-lg border p-4">
              <h3 className="font-semibold text-sm text-muted-foreground mb-3">Linha {linha}</h3>
              <div className="space-y-2">
                {ordensPorLinha(linha).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma ordem</p>}
                {ordensPorLinha(linha).map((ordem) => (
                  <div key={ordem.id} className="bg-card border rounded-lg p-2.5 flex items-start gap-1.5">
                    <div className="flex-1 space-y-1 overflow-hidden">
                      <p className="text-xs font-semibold leading-tight break-words">{ordem.produto}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                        Lote {ordem.lote} · {ordem.quantidade} kg
                        <MarcaBadge marca={ordem.marca} size="sm" />
                      </p>
                      <StatusBadge status={ordem.status} className="text-[10px] px-1.5 py-0" />
                    </div>
                    <button
                      onClick={() => setOrdemEditando(ordem as OrdemEditavel)}
                      className="mt-0.5 text-muted-foreground/50 hover:text-primary shrink-0"
                      title="Editar OP"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {ordem.status === "em_linha" && (
                      <button
                        onClick={() => setOrdemParaVoltar({ id: ordem.id, produto: ordem.produto })}
                        className="mt-0.5 text-muted-foreground/50 hover:text-amber-600 shrink-0"
                        title="Voltar para Fila"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setOrdemParaExcluir({ id: ordem.id, produto: ordem.produto })}
                      className="mt-0.5 text-muted-foreground/50 hover:text-destructive shrink-0"
                      title="Excluir OP"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fila por Balança */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Fila por Balança</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((balanca) => {
            const fila = ordensPorBalanca(balanca);
            const atual = fila.find((o) => o.status === "em_pesagem");
            return (
              <div key={balanca} className="bg-card rounded-lg border overflow-hidden">
                <div className="px-4 pt-4 pb-2">
                  <h3 className="font-semibold text-sm text-muted-foreground">Balança {balanca}</h3>
                </div>
                {atual ? (
                  <div className="mx-4 mb-3 rounded-lg border-2 border-status-weighing/40 bg-status-weighing-bg p-3 space-y-1">
                    <StatusBadge status="em_pesagem" />
                    <div className="flex items-baseline gap-2 flex-wrap mt-1">
                      <div className="text-base font-bold leading-tight">{atual.produto}</div>
                      <MarcaBadge marca={atual.marca} size="sm" />
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xl font-extrabold text-primary">{atual.quantidade} kg</span>
                      <div className="text-sm text-muted-foreground">
                        Lote {atual.lote} · {format(new Date(atual.data_programacao), 'dd/MM/yyyy')}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <button onClick={() => setOrdemEditando(atual as OrdemEditavel)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline">
                        <Pencil className="h-3 w-3" /> Editar
                      </button>
                      <button onClick={() => setOrdemParaExcluir({ id: atual.id, produto: atual.produto })} className="flex items-center gap-1 text-xs text-destructive hover:underline">
                        <Trash2 className="h-3 w-3" /> Excluir
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mx-4 mb-3 rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
                    Nenhuma ordem em pesagem
                  </div>
                )}
                <div className="px-4 pb-4 space-y-2">
                  {fila.filter((o) => o.status === "pendente").length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhuma ordem na fila</p>
                  )}
                  {fila.filter((o) => o.status === "pendente").map((ordem, idx, arr) => (
                    <div key={ordem.id} className="flex items-center gap-2 py-2 px-3 rounded-md bg-muted/50 border">
                      <div className="flex items-center justify-center h-7 w-7 rounded-full bg-status-open-bg text-status-open font-bold text-xs shrink-0">
                        {idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <div className="text-sm font-semibold truncate">{ordem.produto}</div>
                          <MarcaBadge marca={ordem.marca} size="sm" />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Lote {ordem.lote} · {ordem.quantidade} kg · {format(new Date(ordem.data_programacao), 'dd/MM/yyyy')}
                        </div>
                      </div>
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button onClick={() => moverOrdem(ordem.id, "up", balanca)} disabled={idx === 0} className="p-0.5 rounded hover:bg-muted disabled:opacity-30">
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button onClick={() => moverOrdem(ordem.id, "down", balanca)} disabled={idx === arr.length - 1} className="p-0.5 rounded hover:bg-muted disabled:opacity-30">
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>
                      <button onClick={() => setOrdemEditando(ordem as OrdemEditavel)} className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary shrink-0" title="Editar">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => setOrdemParaExcluir({ id: ordem.id, produto: ordem.produto })} className="p-1 rounded hover:bg-destructive/10 text-destructive shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <EditarOrdemDialog
        ordem={ordemEditando}
        onClose={() => setOrdemEditando(null)}
        onSalvar={handleEditar}
      />

      <Dialog open={!!ordemParaVoltar} onOpenChange={(open) => !open && setOrdemParaVoltar(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Voltar para a fila?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{ordemParaVoltar?.produto}</span>
              <br />
              O status voltará de <strong>Em Linha</strong> para <strong>Aguardando Linha</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOrdemParaVoltar(null)} disabled={voltando}>
              Cancelar
            </Button>
            <Button onClick={handleVoltarFila} disabled={voltando}>
              {voltando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!ordemParaExcluir} onOpenChange={(open) => !open && setOrdemParaExcluir(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir ordem de produção?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{ordemParaExcluir?.produto}</span>
              <br />
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOrdemParaExcluir(null)} disabled={excluindo}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={excluirOrdem} disabled={excluindo}>
              {excluindo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
