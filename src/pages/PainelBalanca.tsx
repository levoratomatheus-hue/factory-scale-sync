import { useEffect } from 'react';
import { useOrdens } from '@/hooks/useOrdens';
import { StatusBadge } from '@/components/StatusBadge';
import { CheckCircle2, Loader2, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface PainelBalancaProps {
  balanca: number;
}

export default function PainelBalanca({ balanca }: PainelBalancaProps) {
  const { ordens, loading, concluirOrdem, initBalanca } = useOrdens();

  const balancaOrdens = ordens.filter(o => o.balanca === balanca);
  const concluidas = balancaOrdens.filter(o => o.status === 'Concluído');
  const emPesagem = balancaOrdens.find(o => o.status === 'Em Pesagem');
  const emAberto = balancaOrdens.filter(o => o.status === 'Em Aberto');
  const total = balancaOrdens.length;
  const concluidasCount = concluidas.length;
  const progress = total > 0 ? (concluidasCount / total) * 100 : 0;

  useEffect(() => {
    if (!loading && balancaOrdens.length > 0) {
      initBalanca(balanca);
    }
  }, [loading, balancaOrdens.length, balanca, initBalanca]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Scale className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Balança {balanca}</h1>
      </div>

      {/* Progress bar */}
      <div className="bg-card rounded-lg border p-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-muted-foreground">Progresso</span>
          <span className="font-semibold">{concluidasCount}/{total} concluídas</span>
        </div>
        <Progress value={progress} className="h-3" />
      </div>

      {/* Current order */}
      {emPesagem ? (
        <div className="bg-card rounded-xl border-2 border-status-weighing/40 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <StatusBadge status="Em Pesagem" />
            <span className="text-sm text-muted-foreground">Lote {emPesagem.lote}</span>
          </div>
          <div className="text-xl font-bold leading-tight">{emPesagem.produto}</div>
          <div className="text-4xl font-extrabold text-primary">
            {emPesagem.quantidade} <span className="text-lg font-semibold text-muted-foreground">kg</span>
          </div>
          <Button
            size="lg"
            className="w-full h-14 text-lg font-bold bg-status-done hover:bg-status-done/90 text-primary-foreground"
            onClick={() => concluirOrdem(emPesagem.id)}
          >
            <CheckCircle2 className="mr-2 h-6 w-6" />
            OK — Pesagem concluída
          </Button>
        </div>
      ) : (
        <div className="bg-card rounded-xl border p-6 text-center text-muted-foreground">
          {total === concluidasCount && total > 0
            ? '🎉 Todas as ordens foram concluídas!'
            : 'Nenhuma ordem em pesagem'}
        </div>
      )}

      {/* Próximas ordens */}
      {emAberto.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">Próximas ordens</h2>
          <div className="space-y-2">
            {emAberto.map((ordem, i) => (
              <div key={ordem.id} className="bg-card rounded-lg border p-3 flex items-center gap-3">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-status-open-bg text-status-open font-bold text-sm shrink-0">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{ordem.produto}</div>
                  <div className="text-xs text-muted-foreground">
                    Lote {ordem.lote} · {ordem.quantidade} kg
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Concluídas */}
      {concluidas.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">Concluídas</h2>
          <div className="space-y-2">
            {concluidas.map(ordem => (
              <div key={ordem.id} className={cn('bg-card rounded-lg border p-3 flex items-center gap-3 opacity-50')}>
                <CheckCircle2 className="h-5 w-5 text-status-done shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate line-through">{ordem.produto}</div>
                  <div className="text-xs text-muted-foreground">
                    Lote {ordem.lote} · {ordem.quantidade} kg
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
