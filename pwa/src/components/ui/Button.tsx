import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'danger' | 'ghost' | 'outline' | 'warning';
type Size = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'bg-primary hover:bg-primary-dark text-white font-semibold',
  danger: 'bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30',
  ghost: 'hover:bg-surface-elevated text-text-muted hover:text-text',
  outline: 'border border-surface-light hover:border-text-muted text-text-muted hover:text-text',
  warning: 'bg-warning/10 hover:bg-warning/20 text-warning border border-warning/30',
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-xl',
  lg: 'px-5 py-3 text-sm rounded-xl',
  icon: 'w-9 h-9 rounded-xl flex items-center justify-center',
};

export function Button({ variant = 'primary', size = 'md', loading, children, className, disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : children}
    </button>
  );
}
