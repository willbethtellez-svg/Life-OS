import { useState, useEffect, useCallback } from 'react';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { api } from '@/lib/firefly-api';
import { formatCurrency, formatMonth } from '@/lib/utils';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [txHistory, setTxHistory] = useState<any[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().split('T')[0]);
  const [budgets, setBudgets] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, budRes] = await Promise.all([
        api.categories.list(),
        api.budgets.list(),
      ]);
      setCategories(Array.isArray(catRes) ? catRes : catRes.data || []);
      setBudgets(Array.isArray(budRes) ? budRes : budRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function loadCategoryTransactions(cat: any) {
    setSelected(cat);
    setTxHistory([]);
    try {
      const start = startOfMonth(parseISO(currentMonth)).toISOString().split('T')[0];
      const end = endOfMonth(parseISO(currentMonth)).toISOString().split('T')[0];
      const res = await api.categories.transactions(cat.id, { start, end });
      setTxHistory(Array.isArray(res) ? res : res.data || []);
    } catch (err) {
      console.error(err);
    }
  }

  if (selected) {
    return (
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <button
          onClick={() => setSelected(null)}
          className="text-text-muted hover:text-text flex items-center gap-1 text-sm"
        >
          ← Volver a categorías
        </button>

        <div className="bg-surface rounded-xl p-4">
          <h2 className="text-lg font-bold">{selected.attributes?.name || selected.name}</h2>
          <p className="text-sm text-text-muted mt-1">{formatMonth(currentMonth)}</p>
        </div>

        <div className="bg-surface rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
            Transacciones
          </h3>
          <div className="space-y-2">
            {txHistory.length === 0 && (
              <p className="text-text-muted text-sm text-center py-4">
                Sin movimientos este mes
              </p>
            )}
            {txHistory.map((tx: any) => {
              const t = tx.attributes || tx;
              const amount = parseFloat(t.amount || '0');
              const isNegative = t.type === 'withdrawal' || amount < 0;
              const currency = t.currency_code || t.currency || 'USD';
              return (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b border-surface-light last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.description || 'Sin descripción'}</p>
                    <p className="text-xs text-text-muted">{format(parseISO(t.date || t.createdAt), 'dd/MM/yy')}</p>
                  </div>
                  <span className={`text-sm font-semibold ml-3 ${isNegative ? 'text-danger' : 'text-secondary'}`}>
                    {isNegative ? '-' : '+'}{formatCurrency(Math.abs(amount), currency)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <h1 className="text-xl font-bold">Categorías</h1>

      <div className="bg-surface rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">
            Presupuestos activos
          </h2>
        </div>
        {budgets.length === 0 ? (
          <p className="text-text-muted text-sm text-center py-2">Sin presupuestos configurados</p>
        ) : (
          <div className="space-y-2">
            {budgets.map((bud: any) => {
              const attrs = bud.attributes || bud;
              const budgeted = parseFloat(attrs.budget_limit || attrs.budgeted || '0');
              const spent = parseFloat(attrs.spent || '0');
              const currency = attrs.currency_code || 'USD';
              const progress = budgeted > 0 ? Math.min(100, (spent / budgeted) * 100) : 0;
              return (
                <div key={bud.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{attrs.name}</span>
                    <span className={progress > 100 ? 'text-danger' : 'text-text-muted'}>
                      {formatCurrency(spent, currency)} / {formatCurrency(budgeted, currency)}
                    </span>
                  </div>
                  <div className="w-full bg-surface-light rounded-full h-2">
                    <div
                      className={`rounded-full h-2 transition-all ${progress > 100 ? 'bg-danger' : 'bg-primary'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          categories.map((cat: any) => (
            <button
              key={cat.id}
              onClick={() => loadCategoryTransactions(cat)}
              className="w-full bg-surface rounded-xl p-4 text-left hover:bg-surface-light transition-colors"
            >
              <p className="font-medium">{cat.attributes?.name || cat.name}</p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
