import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/firefly-api';
import { formatCurrency } from '@/lib/utils';

export default function LoansPage() {
  const [liabilities, setLiabilities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.liabilities.list();
      setLiabilities(Array.isArray(res) ? res : res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalDebt = liabilities.reduce((sum: number, l: any) => {
    const attrs = l.attributes || l;
    return sum + parseFloat(attrs.current_balance || attrs.amount || '0');
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
            <p className="text-xs mt-1">Créalos desde Firefly III (Liabilities)</p>
          </div>
        ) : (
          liabilities.map((liab: any) => {
            const attrs = liab.attributes || liab;
            const balance = parseFloat(attrs.current_balance || attrs.amount || '0');
            const currency = attrs.currency_code || 'USD';
            return (
              <div
                key={liab.id}
                className="bg-surface rounded-xl p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{attrs.name}</p>
                    <p className="text-xs text-text-muted mt-0.5">{attrs.type} · {currency}</p>
                  </div>
                  <p className={`font-bold text-lg ${balance >= 0 ? 'text-secondary' : 'text-danger'}`}>
                    {formatCurrency(balance, currency)}
                  </p>
                </div>
                {attrs.interest && parseFloat(attrs.interest) > 0 && (
                  <p className="text-xs text-text-muted mt-2">
                    Interés: {attrs.interest}% · Vence: {attrs.due_date || 'Sin fecha'}
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
