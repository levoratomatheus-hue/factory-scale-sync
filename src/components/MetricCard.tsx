import { memo } from 'react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: number | string;
  variant: 'default' | 'open' | 'weighing' | 'done';
  icon: React.ReactNode;
}

const variantStyles = {
  default: 'border-border',
  open: 'border-status-open/30 bg-status-open-bg',
  weighing: 'border-status-weighing/30 bg-status-weighing-bg',
  done: 'border-status-done/30 bg-status-done-bg',
};

const valueStyles = {
  default: 'text-foreground',
  open: 'text-status-open',
  weighing: 'text-status-weighing',
  done: 'text-status-done',
};

export const MetricCard = memo(function MetricCard({ title, value, variant, icon }: MetricCardProps) {
  return (
    <div className={cn('rounded-lg border p-4 bg-card', variantStyles[variant])}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
        {icon}
        {title}
      </div>
      <div className={cn('text-3xl font-bold', valueStyles[variant])}>
        {value}
      </div>
    </div>
  );
});
