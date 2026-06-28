import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  const locales: Record<string, string> = {
    USD: 'en-US',
    VES: 'es-VE',
    EUR: 'es-ES',
    BTC: 'en-US',
    USDT: 'en-US',
  };

  const options: Intl.NumberFormatOptions = {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'BTC' ? 8 : 2,
    maximumFractionDigits: currency === 'BTC' ? 8 : 2,
  };

  return new Intl.NumberFormat(locales[currency] || 'en-US', options).format(amount);
}

export function formatDate(date: string, fmt: string = 'dd/MM/yyyy'): string {
  return format(parseISO(date), fmt, { locale: es });
}

export function formatRelative(date: string): string {
  return formatDistanceToNow(parseISO(date), { addSuffix: true, locale: es });
}

export function formatMonth(date: string): string {
  return format(parseISO(date), 'MMMM yyyy', { locale: es });
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export function currencySymbol(code: string): string {
  const symbols: Record<string, string> = {
    USD: '$',
    VES: 'Bs.',
    EUR: '€',
    BTC: '₿',
    USDT: '₮',
  };
  return symbols[code] || code;
}
