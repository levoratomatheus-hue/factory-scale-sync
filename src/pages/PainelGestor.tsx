import { useState } from 'react';
import { useOrdens } from '@/hooks/useOrdens';
import { MetricCard } from '@/components/MetricCard';
import { StatusBadge } from '@/components/StatusBadge';
import { ClipboardList, CheckCircle2, Loader2, Clock, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function PainelGestor() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const { ordens, loading } = useOrdens(dateStr);

  const total = ordens.length;
  const concluidas = ordens.filter(o => o.status === 'Concluído').length;
  const emPesagem = ordens.filter(o => o.status === 'Em Pesagem').length;
  const emAberto = ordens.filter(o => o.status === 'Em Aberto').length;

  const ordensPorLinha = (linha: number) => ordens.filter(o => o.linha === linha);
  const ordensPorBalanca = (balanca: number) => ordens.filter(o => o.balanca === balanca);

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
        <h1 className="text-2xl font-bold">Painel do Gestor</h1>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn('justify-start text-left font-normal gap-2')}>
              <CalendarIcon className="h-4 w-4" />
              {format(selectedDate, 'dd/MM/yyyy')}
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

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard title="Total do dia" value={total} variant="default" icon={<ClipboardList className="h-4 w-4" />} />
        <MetricCard title="Concluídas" value={concluidas} variant="done" icon={<CheckCircle2 className="h-4 w-4" />} />
        <MetricCard title="Em Pesagem" value={emPesagem} variant="weighing" icon={<Loader2 className="h-4 w-4" />} />
        <MetricCard title="Em Aberto" value={emAberto} variant="open" icon={<Clock className="h-4 w-4" />} />
      </div>

      {/* Programação por Linha */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Programação por Linha</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(linha => (
            <div key={linha} className="bg-card rounded-lg border p-4">
              <h3 className="font-semibold text-sm text-muted-foreground mb-3">Linha {linha}</h3>
              <div className="space-y-2">
                {ordensPorLinha(linha).length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhuma ordem</p>
                )}
                {ordensPorLinha(linha).map(ordem => (
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

      {/* Status por Balança */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Status por Balança</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(balanca => {
            const balancaOrdens = ordensPorBalanca(balanca);
            const atual = balancaOrdens.find(o => o.status === 'Em Pesagem');
            return (
              <div key={balanca} className="bg-card rounded-lg border overflow-hidden">
                <div className="px-4 pt-4 pb-2">
                  <h3 className="font-semibold text-sm text-muted-foreground">Balança {balanca}</h3>
                </div>

                {/* Ordem atual em destaque */}
                {atual ? (
                  <div className="mx-4 mb-4 rounded-lg border-2 border-status-weighing/40 bg-status-weighing-bg p-4 space-y-1">
                    <StatusBadge status="Em Pesagem" />
                    <div className="text-lg font-bold leading-tight mt-2">{atual.produto}</div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-extrabold text-primary">{atual.quantidade} kg</span>
                      <span className="text-sm text-muted-foreground">· Lote {atual.lote}</span>
                    </div>
                  </div>
                ) : (
                  <div className="mx-4 mb-4 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    Nenhuma ordem em pesagem
                  </div>
                )}

                {/* Lista completa */}
                <div className="px-4 pb-4 space-y-3">
                  {balancaOrdens.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhuma ordem</p>
                  )}
                  {balancaOrdens.map(ordem => (
                    <div key={ordem.id} className="flex items-center justify-between py-3 px-3 rounded-md bg-muted/50 border">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{ordem.produto}</div>
                        <div className="text-sm text-muted-foreground mt-0.5">
                          Lote {ordem.lote} · {ordem.quantidade} kg
                        </div>
                      </div>
                      <StatusBadge status={ordem.status} className="ml-3 shrink-0" />
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
