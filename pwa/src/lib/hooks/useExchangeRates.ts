import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db';
import type { ExchangeRate } from '@/types';

export function useExchangeRates() {
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await db.exchangeRates.getAll();
      setRates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar tasas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const latestVES = rates.find(
    r => (r.from_currency === 'USDT' || r.from_currency === 'USD') && r.to_currency === 'VES'
  );

  return { rates, loading, error, refresh, latestVES };
}
