import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db';
import type { Account } from '@/types';

export function useAccounts(params?: { type?: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await db.accounts.list(params);
      setAccounts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar cuentas');
    } finally {
      setLoading(false);
    }
  }, [params?.type]);

  useEffect(() => { refresh(); }, [refresh]);

  return { accounts, loading, error, refresh };
}
