import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: 'sm' | 'md' | 'lg' | 'none';
}

const paddings = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-6' };

export function Card({ children, padding = 'md', className, ...props }: CardProps) {
  return (
    <div
      {...props}
      className={cn('bg-surface border border-surface-light/60 rounded-2xl', paddings[padding], className)}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cn('flex items-center justify-between mb-4', className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 {...props} className={cn('text-sm font-semibold text-text-muted uppercase tracking-wider', className)}>
      {children}
    </h3>
  );
}
