import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'income' | 'expense' | 'transfer' | 'default' | 'warning' | 'primary';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  income: 'bg-secondary/10 text-secondary border border-secondary/20',
  expense: 'bg-danger/10 text-danger border border-danger/20',
  transfer: 'bg-transfer/10 text-transfer border border-transfer/20',
  warning: 'bg-warning/10 text-warning border border-warning/20',
  primary: 'bg-secondary/10 text-secondary border border-secondary/20',
  default: 'bg-surface-light text-text-muted border border-surface-light',
};

export function Badge({ variant = 'default', children, className, ...props }: BadgeProps) {
  return (
    <span
      {...props}
      className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', variants[variant], className)}
    >
      {children}
    </span>
  );
}
