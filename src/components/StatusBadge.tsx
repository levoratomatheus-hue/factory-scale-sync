import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pendente:            { label: 'Pendente',         className: 'bg-status-open-bg text-status-open' },
  em_pesagem:          { label: 'Em Pesagem',        className: 'bg-status-weighing-bg text-status-weighing' },
  aguardando_mistura:  { label: 'Aguard. Mistura',   className: 'bg-status-mixing-bg text-status-mixing' },
  em_mistura:          { label: 'Em Mistura',         className: 'bg-status-mixing-bg text-status-mixing font-bold' },
  aguardando_linha:    { label: 'Aguard. Linha',      className: 'bg-status-line-bg text-status-line' },
  em_linha:              { label: 'Em Linha',            className: 'bg-status-line-bg text-status-line font-bold' },
  aguardando_liberacao:  { label: 'Aguard. Liberação',   className: 'bg-orange-100 text-orange-700' },
  concluido:             { label: 'Concluído',           className: 'bg-status-done-bg text-status-done' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold',
        config ? config.className : 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {config ? config.label : status}
    </span>
  );
}
