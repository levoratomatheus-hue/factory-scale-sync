import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const styles = {
    'Em Aberto': 'bg-status-open-bg text-status-open',
    'Em Pesagem': 'bg-status-weighing-bg text-status-weighing',
    'Concluído': 'bg-status-done-bg text-status-done',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold',
        styles[status as keyof typeof styles] || 'bg-muted text-muted-foreground',
        className
      )}
    >
      {status}
    </span>
  );
}
