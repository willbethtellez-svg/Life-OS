import { cn } from '@/lib/utils';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  fullPage?: boolean;
}

const sizes = { sm: 'h-4 w-4 border-2', md: 'h-6 w-6 border-2', lg: 'h-8 w-8 border-2' };

export function Spinner({ size = 'md', className, fullPage }: SpinnerProps) {
  const spinner = (
    <div className={cn('rounded-full border-primary border-t-transparent animate-spin', sizes[size], className)} />
  );

  if (fullPage) {
    return (
      <div className="flex items-center justify-center min-h-64">
        {spinner}
      </div>
    );
  }

  return spinner;
}
