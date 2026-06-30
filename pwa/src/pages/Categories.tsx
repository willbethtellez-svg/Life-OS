import { useState, useEffect, useCallback } from 'react';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { db } from '@/lib/db';
import { formatCurrency, formatMonth } from '@/lib/utils';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import type { CurrencyCode } from '@/types';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [txHistory, setTxHistory] = useState<any[]>([]);
  const [currentMonth] = useState(new Date().toISOString().split('T')[0]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [showCatForm, setShowCatForm] = useState(false);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [catName, setCatName] = useState('');
  const [budgetForm, setBudgetForm] = useState({ name: '', limit: '', currency: 'USD' as CurrencyCode });
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [catList, budList] = await Promise.all([db.categories.list(), db.budgets.list()]);
      setCategories(catList); setBudgets(budList);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (!catName.trim()) { setError('Nombre requerido'); return; }
    try {
      if (editingCatId) { await db.categories.update(editingCatId, catName.trim()); }
      else { await db.categories.create(catName.trim()); }
      setCatName(''); setShowCatForm(false); setEditingCatId(null); fetchData();
    } catch (err: any) { setError(err.message); }
  }

  async function handleCreateBudget(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (!budgetForm.name.trim()) { setError('Nombre requerido'); return; }
    try {
      if (editingBudgetId) {
        await db.budgets.update(editingBudgetId, { name: budgetForm.name.trim(), budget_limit: parseFloat(budgetForm.limit) || 0, currency: budgetForm.currency });
      } else {
        await db.budgets.create({ name: budgetForm.name.trim(), budget_limit: parseFloat(budgetForm.limit) || 0, currency: budgetForm.currency, active: true });
      }
      setBudgetForm({ name: '', limit: '', currency: 'USD' }); setShowBudgetForm(false); setEditingBudgetId(null); fetchData();
    } catch (err: any) { setError(err.message); }
  }

  function startEditCat(cat: any) { setCatName(cat.name); setEditingCatId(cat.id); setShowCatForm(true); }
  function startEditBudget(bud: any) {
    setBudgetForm({ name: bud.name, limit: bud.budget_limit?.toString() || '', currency: bud.currency || 'USD' });
    setEditingBudgetId(bud.id); setShowBudgetForm(true);
  }

  async function handleDeleteCategory(id: string) {
    if (!confirm('¿Eliminar?')) return;
    try { await db.categories.delete(id); fetchData(); } catch (err) { console.error(err); }
  }

  async function loadCategoryTransactions(cat: any) {
    setSelected(cat); setTxHistory([]);
    try {
      const start = startOfMonth(parseISO(currentMonth)).toISOString().split('T')[0];
      const end = endOfMonth(parseISO(currentMonth)).toISOString().split('T')[0];
      const allTxs = await db.transactions.list({ start, end, limit: 500 });
      setTxHistory(allTxs.filter((tx: any) => tx.category_id === cat.id));
    } catch (err) { console.error(err); }
  }

  if (selected) {
    return (
      <div className="p-4 lg:p-6 space-y-4 max-w-2xl">
        <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-text-muted hover:text-text transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Volver
        </button>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">{selected.name}</h2>
              <p className="text-sm text-text-muted mt-0.5">{formatMonth(currentMonth)}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => { startEditCat(selected); setSelected(null); }}>Editar</Button>
          </div>
        </Card>
        <Card padding="none">
          <div className="divide-y divide-surface-light/40">
            {txHistory.length === 0 ? (
              <p className="text-text-muted text-sm text-center py-8">Sin movimientos este mes</p>
            ) : txHistory.map((tx: any) => {
              const amount = parseFloat(tx.amount || '0');
              const isNeg = tx.type === 'withdrawal' || amount < 0;
              return (
                <div key={tx.id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tx.description}</p>
                    <p className="text-xs text-text-muted">{format(parseISO(tx.date), 'dd/MM/yy')}</p>
                  </div>
                  <span className={`text-sm font-semibold ml-3 ${isNeg ? 'text-danger' : 'text-secondary'}`}>
                    {isNeg ? '-' : '+'}{formatCurrency(Math.abs(amount), tx.currency || 'USD')}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-2xl">
      <h1 className="text-xl font-bold">Categorías</h1>

      {error && <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-sm text-danger">{error}</div>}

      {/* Presupuestos */}
      <Card>
        <CardHeader>
          <CardTitle>Presupuestos</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setBudgetForm({ name: '', limit: '', currency: 'USD' }); setEditingBudgetId(null); setShowBudgetForm(!showBudgetForm); }}
          >
            {showBudgetForm ? 'Cancelar' : '+ Nuevo'}
          </Button>
        </CardHeader>
        {showBudgetForm && (
          <form onSubmit={handleCreateBudget} className="space-y-3 mb-4 p-3 bg-background rounded-xl border border-surface-light/40">
            <Field label="Nombre">
              <Input type="text" value={budgetForm.name} onChange={e => setBudgetForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre del presupuesto" required />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Límite">
                <Input type="number" step="0.01" value={budgetForm.limit} onChange={e => setBudgetForm(f => ({ ...f, limit: e.target.value }))} placeholder="0.00" />
              </Field>
              <Field label="Moneda">
                <Select value={budgetForm.currency} onChange={e => setBudgetForm(f => ({ ...f, currency: e.target.value as CurrencyCode }))}>
                  <option value="USD">USD</option><option value="VES">VES</option>
                </Select>
              </Field>
            </div>
            <Button type="submit" className="w-full">{editingBudgetId ? 'Guardar' : 'Crear presupuesto'}</Button>
          </form>
        )}
        <div className="space-y-3">
          {budgets.map((bud: any) => {
            const budgeted = parseFloat(bud.budget_limit || '0');
            const spent = parseFloat(bud.spent || '0');
            const currency = bud.currency || 'USD';
            const progress = budgeted > 0 ? Math.min(100, (spent / budgeted) * 100) : 0;
            return (
              <div key={bud.id} className="cursor-pointer" onClick={() => startEditBudget(bud)}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium">{bud.name}</span>
                  <span className={progress > 100 ? 'text-danger font-medium' : 'text-text-muted'}>
                    {formatCurrency(spent, currency)} / {formatCurrency(budgeted, currency)}
                  </span>
                </div>
                <div className="w-full bg-surface-light rounded-full h-1.5">
                  <div className={`rounded-full h-1.5 transition-all ${progress > 100 ? 'bg-danger' : 'bg-primary'}`} style={{ width: `${progress}%` }} />
                </div>
              </div>
            );
          })}
          {budgets.length === 0 && <p className="text-text-muted text-sm text-center py-3">Sin presupuestos configurados</p>}
        </div>
      </Card>

      {/* Categorías */}
      <div className="flex items-center justify-between">
        <CardTitle>Categorías</CardTitle>
        <Button
          size="icon"
          onClick={() => { setCatName(''); setEditingCatId(null); setShowCatForm(!showCatForm); }}
          className="rounded-full w-8 h-8"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            {showCatForm ? <path d="M6 18L18 6M6 6l12 12" /> : <path d="M12 5v14M5 12h14" />}
          </svg>
        </Button>
      </div>

      {showCatForm && (
        <Card>
          <form onSubmit={handleCreateCategory} className="flex gap-2">
            <Input type="text" value={catName} onChange={e => setCatName(e.target.value)} placeholder="Nombre de categoría" required autoFocus />
            <Button type="submit" size="md">{editingCatId ? 'Guardar' : 'Crear'}</Button>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {loading ? <Spinner fullPage /> : categories.length === 0 ? (
          <div className="text-center py-10 text-text-muted"><p className="text-sm">No hay categorías creadas</p></div>
        ) : categories.map((cat: any) => (
          <Card key={cat.id} className="flex items-center justify-between" padding="sm">
            <button onClick={() => loadCategoryTransactions(cat)} className="flex-1 text-left px-1 py-1 text-sm font-medium hover:text-primary transition-colors">
              {cat.name}
            </button>
            <div className="flex gap-2 items-center">
              <Button variant="ghost" size="sm" onClick={() => startEditCat(cat)}>Editar</Button>
              <button onClick={() => handleDeleteCategory(cat.id)} className="text-text-muted hover:text-danger text-lg leading-none transition-colors">×</button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
