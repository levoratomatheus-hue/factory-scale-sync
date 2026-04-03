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
  Trash2,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { format, isToday, isPast, isFuture } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export default function PainelGestor() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const { ordens, loading } = useOrdens(dateStr);
  const { ordens: todasPendentes } = useOrdens();

  const pendentesAnteriores = todasPendentes.filter(
    (o) => o.data_programacao < dateStr && (o.status === "Em Aberto" || o.status === "Em Pesagem")
  );

  const isHoje = isToday(selectedDate);
  const isPassado = isPast(selectedDate) && !isHoje;
  const isFuturo = isFuture(selectedDate);

  const total = ordens.length;
  const concluidas = ordens.filter((o) => o.status === "Concluído").length;
  const emPesagem = ordens.filter((o) => o.status === "Em Pesagem").length;
  const emAberto = ordens.filter((o) => o.status === "Em Aberto").length;
  const taxaConclusao = total > 0 ? Math.round((concluidas / total) * 100) : 0;

  const ordensPorLinha = (linha: number) => ordens.filter((o) => o.linha === linha);
  const ordensPorBalanca = (balanca: number) =>
    todasPendentes
      .filter((o) => o.balanca === balanca && o.status !== "Concluído")
      .sort((a, b) => (a.posicao ?? 999) - (b.posicao ?? 999));

  const removerOrdem = async (ordemId: string) => {
    if (!confirm("Tem certeza que deseja remover esta ordem?")) return;
    const { error } = await supabase.from("ordens").delete().eq("id", ordemId);
    if (error) {
      toast({ title: "Erro ao remover ordem", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Ordem removida com sucesso!" });
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
          title={isPassado ? "Não concluídas" : "Em Aberto"}
          value={emAberto}
          variant="open"
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {/* Pendentes de dias anteriores */}
      {pendentesAnteriores.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
          <h3 className="font-semibold text-sm text-destructive mb-2">⚠️ Pendentes de dias anteriores</h3>
          <div className="space-y-2">
            {pendentesAnteriores.map((ordem) => (
              <div key={ordem.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-background border">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{ordem.produto}</div>
                  <div className="text-xs text-muted-foreground">
                    Lote {ordem.lote} · {ordem.quantidade} kg · {format(new Date(ordem.data_programacao), "dd/MM/yyyy")}
                  </div>
                </div>
                <StatusBadge status={ordem.status} className="ml-2 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}

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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((linha) => (
            <div key={linha} className="bg-card rounded-lg border p-4">
              <h3 className="font-semibold text-sm text-muted-foreground mb-3">Linha {linha}</h3>
              <div className="space-y-2">
                {ordensPorLinha(linha).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma ordem</p>}
                {ordensPorLinha(linha).map((ordem) => (
                  <div key={ordem.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{ordem.produto}</div>
                      <div className="text-xs text-muted-foreground">
                        Lote {ordem.lote} · {ordem.quantidade} kg
                      </div>
                    </div>
                    <StatusBadge status={ordem.status} className="ml-2 shrink-0" />
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
            const atual = fila.find((o) => o.status === "Em Pesagem");
            return (
              <div key={balanca} className="bg-card rounded-lg border overflow-hidden">
                <div className="px-4 pt-4 pb-2">
                  <h3 className="font-semibold text-sm text-muted-foreground">Balança {balanca}</h3>
                </div>
                {atual ? (
                  <div className="mx-4 mb-3 rounded-lg border-2 border-status-weighing/40 bg-status-weighing-bg p-3 space-y-1">
                    <StatusBadge status="Em Pesagem" />
                    <div className="text-base font-bold leading-tight mt-1">{atual.produto}</div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xl font-extrabold text-primary">{atual.quantidade} kg</span>
                      <div className="text-sm text-muted-foreground">
                        Lote {atual.lote} · {format(new Date(atual.data_programacao), 'dd/MM/yyyy')}
                      </div>
                    </div>
                    <button onClick={() => removerOrdem(atual.id)} className="flex items-center gap-1 text-xs text-destructive hover:underline mt-1">
                      <Trash2 className="h-3 w-3" /> Remover
                    </button>
                  </div>
                ) : (
                  <div className="mx-4 mb-3 rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
                    Nenhuma ordem em pesagem
                  </div>
                )}
                <div className="px-4 pb-4 space-y-2">
                  {fila.filter((o) => o.status === "Em Aberto").length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhuma ordem na fila</p>
                  )}
                  {fila.filter((o) => o.status === "Em Aberto").map((ordem, idx, arr) => (
                    <div key={ordem.id} className="flex items-center gap-2 py-2 px-3 rounded-md bg-muted/50 border">
                      <div className="flex items-center justify-center h-7 w-7 rounded-full bg-status-open-bg text-status-open font-bold text-xs shrink-0">
                        {idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{ordem.produto}</div>
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
                      <button onClick={() => removerOrdem(ordem.id)} className="p-1 rounded hover:bg-destructive/10 text-destructive shrink-0">
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
    </div>
  );
}
