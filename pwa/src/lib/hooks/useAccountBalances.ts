import { useEffect, useState } from 'react';
import { db } from '@/lib/db';
import { computeAccountFinalBalance } from '@/lib/ledger';
import type { Account } from '@/types';

// Saldos calculados en vivo desde los movimientos reales — la misma función
// que alimenta el libro contable, para que nunca haya dos cifras distintas
// entre páginas que muestran saldos de cuentas.
export function useAccountBalances(accounts: Account[]): Record<string, number> {
  const [balances, setBalances] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(accounts.map(async (acc) => {
        const txs = await db.accounts.transactions(acc.id);
        return [acc.id, computeAccountFinalBalance(acc, txs)] as const;
      }));
      if (!cancelled) setBalances(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [accounts]);

  return balances;
}
