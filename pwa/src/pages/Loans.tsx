import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';

export default function LoansPage() {
  const [liabilities, setLiabilities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await db.liabilities.list();
      setLiabilities(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalDebt = liabilities.reduce((sum: number, l: any) => {
    return sum + parseFloat(l.current_balance || l.amount || '0');
  }, 0);

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <h1 className="text-xl font-bold">Préstamos / Deudas</h1>

      <div className="bg-surface rounded-xl p-4">
        <p className="text-text-muted text-xs uppercase tracking-wide">Deuda total</p>
        <p className="text-2xl font-bold text-danger mt-1">
          {formatCurrency(Math.abs(totalDebt))}
        </p>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : liabilities.length === 0 ? (
          <div className="text-center py-8 text-text-muted">
            <p className="text-lg mb-1">⊡</p>
            <p className="text-sm">No hay préstamos o deudas registradas</p>
          </div>
        ) : (
          liabilities.map((liab: any) => {
            const balance = parseFloat(liab.current_balance || liab.amount || '0');
            const currency = liab.currency || 'USD';
            return (
              <div key={liab.id} className="bg-surface rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{liab.name}</p>
                    <p className="text-xs text-text-muted mt-0.5">{liab.type} · {currency}</p>
                  </div>
                  <p className={`font-bold text-lg ${balance >= 0 ? 'text-secondary' : 'text-danger'}`}>
                    {formatCurrency(balance, currency)}
                  </p>
                </div>
                {liab.interest_rate > 0 && (
                  <p className="text-xs text-text-muted mt-2">
                    Interés: {liab.interest_rate}% · Vence: {liab.due_date || 'Sin fecha'}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
