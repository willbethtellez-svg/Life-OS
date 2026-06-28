import { useState, useEffect, useCallback } from 'react';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { db } from '@/lib/db';
import { formatCurrency, formatMonth } from '@/lib/utils';
import type { CurrencyCode } from '@/types';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [txHistory, setTxHistory] = useState<any[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().split('T')[0]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [showCatForm, setShowCatForm] = useState(false);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [catName, setCatName] = useState('');
  const [budgetForm, setBudgetForm] = useState({ name: '', limit: '', currency: 'USD' as CurrencyCode });
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [catList, budList] = await Promise.all([
        db.categories.list(),
        db.budgets.list(),
      ]);
      setCategories(catList);
      setBudgets(budList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!catName.trim()) { setError('Nombre requerido'); return; }
    try {
      await db.categories.create(catName.trim());
      setCatName('');
      setShowCatForm(false);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Error al crear categoría');
    }
  }

  async function handleCreateBudget(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!budgetForm.name.trim()) { setError('Nombre requerido'); return; }
    try {
      await db.budgets.create({
        name: budgetForm.name.trim(),
        budget_limit: parseFloat(budgetForm.limit) || 0,
        currency: budgetForm.currency,
        active: true,
      });
      setBudgetForm({ name: '', limit: '', currency: 'USD' });
      setShowBudgetForm(false);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Error al crear presupuesto');
    }
  }

  async function handleDeleteCategory(id: string) {
    if (!confirm('¿Eliminar esta categoría?')) return;
    try {
      await db.categories.delete(id);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  }

  async function loadCategoryTransactions(cat: any) {
    setSelected(cat);
    setTxHistory([]);
    try {
      const start = startOfMonth(parseISO(currentMonth)).toISOString().split('T')[0];
      const end = endOfMonth(parseISO(currentMonth)).toISOString().split('T')[0];
      const allTxs = await db.transactions.list({ start, end, limit: 500 });
      setTxHistory(allTxs.filter((tx: any) => tx.category_id === cat.id));
    } catch (err) {
      console.error(err);
    }
  }

  if (selected) {
    return (
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <button onClick={() => setSelected(null)} className="text-text-muted hover:text-text flex items-center gap-1 text-sm">← Volver a categorías</button>
        <div className="bg-surface rounded-xl p-4">
          <h2 className="text-lg font-bold">{selected.name}</h2>
          <p className="text-sm text-text-muted mt-1">{formatMonth(currentMonth)}</p>
        </div>
        <div className="bg-surface rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">Transacciones</h3>
          <div className="space-y-2">
            {txHistory.length === 0 && <p className="text-text-muted text-sm text-center py-4">Sin movimientos este mes</p>}
            {txHistory.map((tx: any) => {
              const amount = parseFloat(tx.amount || '0');
              const isNegative = tx.type === 'withdrawal' || amount < 0;
              return (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b border-surface-light last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tx.description || 'Sin descripción'}</p>
                    <p className="text-xs text-text-muted">{format(parseISO(tx.date), 'dd/MM/yy')}</p>
                  </div>
                  <span className={`text-sm font-semibold ml-3 ${isNegative ? 'text-danger' : 'text-secondary'}`}>
                    {isNegative ? '-' : '+'}{formatCurrency(Math.abs(amount), tx.currency || 'USD')}
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

      {error && <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">{error}</div>}

      {/* Presupuestos */}
      <div className="bg-surface rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">Presupuestos</h2>
          <button onClick={() => setShowBudgetForm(!showBudgetForm)} className="text-xs text-primary hover:underline">
            {showBudgetForm ? 'Cancelar' : '+ Nuevo'}
          </button>
        </div>
        {showBudgetForm && (
          <form onSubmit={handleCreateBudget} className="bg-background rounded-lg p-3 space-y-2 mb-3">
            <input type="text" value={budgetForm.name} onChange={e => setBudgetForm(f => ({ ...f, name: e.target.value }))}
              className="w-full bg-surface border border-surface-light rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Nombre del presupuesto" required />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" step="0.01" value={budgetForm.limit} onChange={e => setBudgetForm(f => ({ ...f, limit: e.target.value }))}
                className="w-full bg-surface border border-surface-light rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Límite" />
              <select value={budgetForm.currency} onChange={e => setBudgetForm(f => ({ ...f, currency: e.target.value as CurrencyCode }))}
                className="w-full bg-surface border border-surface-light rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="USD">USD</option><option value="VES">VES</option><option value="EUR">EUR</option>
              </select>
            </div>
            <button type="submit" className="w-full bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg py-2 transition-colors">Crear presupuesto</button>
          </form>
        )}
        {budgets.length === 0 ? (
          <p className="text-text-muted text-sm text-center py-2">Sin presupuestos</p>
        ) : (
          <div className="space-y-2">
            {budgets.map((bud: any) => {
              const budgeted = parseFloat(bud.budget_limit || '0');
              const spent = parseFloat(bud.spent || '0');
              const currency = bud.currency || 'USD';
              const progress = budgeted > 0 ? Math.min(100, (spent / budgeted) * 100) : 0;
              return (
                <div key={bud.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{bud.name}</span>
                    <span className={progress > 100 ? 'text-danger' : 'text-text-muted'}>
                      {formatCurrency(spent, currency)} / {formatCurrency(budgeted, currency)}
                    </span>
                  </div>
                  <div className="w-full bg-surface-light rounded-full h-2">
                    <div className={`rounded-full h-2 transition-all ${progress > 100 ? 'bg-danger' : 'bg-primary'}`} style={{ width: `${progress}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Categorías */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">Categorías</h2>
        <button onClick={() => setShowCatForm(!showCatForm)} className="bg-primary hover:bg-primary-dark text-white rounded-full w-8 h-8 flex items-center justify-center text-lg font-bold transition-colors">
          {showCatForm ? '×' : '+'}
        </button>
      </div>

      {showCatForm && (
        <form onSubmit={handleCreateCategory} className="bg-surface rounded-xl p-4 flex gap-2">
          <input type="text" value={catName} onChange={e => setCatName(e.target.value)}
            className="flex-1 bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Nombre de la categoría" required autoFocus />
          <button type="submit" className="bg-primary hover:bg-primary-dark text-white font-medium rounded-lg px-4 py-2.5 transition-colors">Crear</button>
        </form>
      )}

      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" /></div>
        ) : categories.length === 0 ? (
          <div className="text-center py-8 text-text-muted">
            <p className="text-lg mb-1">⊞</p>
            <p className="text-sm">No hay categorías</p>
            <p className="text-xs mt-1">Toca + para crear una</p>
          </div>
        ) : (
          categories.map((cat: any) => (
            <div key={cat.id} className="bg-surface rounded-xl p-4 flex items-center justify-between">
              <button onClick={() => loadCategoryTransactions(cat)} className="flex-1 text-left hover:bg-surface-light rounded-lg px-2 py-1 transition-colors">
                <p className="font-medium">{cat.name}</p>
              </button>
              <button onClick={() => handleDeleteCategory(cat.id)} className="text-text-muted hover:text-danger text-sm ml-2 px-2">×</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
