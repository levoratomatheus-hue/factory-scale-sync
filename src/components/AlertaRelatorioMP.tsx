import { ClipboardList, X, Clock } from 'lucide-react';
import { useAlertaRelatorioMP } from '@/hooks/useAlertaRelatorioMP';
import { Button } from '@/components/ui/button';

interface Props {
  isGestor: boolean;
  userId: string | null;
  onIrParaRelatorio: () => void;
}

export function AlertaRelatorioMP({ isGestor, userId, onIrParaRelatorio }: Props) {
  const { visivel, carregando, confirmarFeito, deixarParaDepois } = useAlertaRelatorioMP(
    isGestor,
    userId
  );

  if (!visivel) return null;

  return (
    <div className="w-full bg-amber-50 border-b-2 border-amber-400 px-4 py-2.5 flex items-center gap-3 shrink-0 z-20">
      <ClipboardList className="h-5 w-5 text-amber-600 shrink-0" />

      <p className="flex-1 text-sm font-medium text-amber-900 leading-snug">
        📋 Lembrete: fazer o relatório de matérias-primas desta semana
      </p>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-amber-400 text-amber-800 hover:bg-amber-100"
          onClick={onIrParaRelatorio}
        >
          Ver relatório
        </Button>

        <Button
          size="sm"
          className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white border-0"
          disabled={carregando}
          onClick={confirmarFeito}
        >
          {carregando ? 'Salvando…' : 'OK, feito'}
        </Button>

        <button
          aria-label="Deixar para depois"
          title="Deixar para depois"
          className="ml-1 text-amber-600 hover:text-amber-900 transition-colors"
          onClick={deixarParaDepois}
        >
          <Clock className="h-4 w-4" />
        </button>

        <button
          aria-label="Fechar"
          title="Deixar para depois"
          className="text-amber-500 hover:text-amber-900 transition-colors"
          onClick={deixarParaDepois}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
