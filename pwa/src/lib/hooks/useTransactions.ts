import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db';
import type { Transaction } from '@/types';

interface UseTransactionsParams {
  limit?: number;
  start?: string;
  end?: string;
  type?: string;
}

export function useTransactions(params?: UseTransactionsParams) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await db.transactions.list(params);
      setTransactions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar transacciones');
    } finally {
      setLoading(false);
    }
  }, [params?.limit, params?.start, params?.end, params?.type]);

  useEffect(() => { refresh(); }, [refresh]);

  return { transactions, loading, error, refresh };
}
