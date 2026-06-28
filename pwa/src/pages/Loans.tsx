import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';
import type { CurrencyCode } from '@/types';

export default function LoansPage() {
  const [liabilities, setLiabilities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    type: 'loan' as 'loan' | 'debt' | 'credit',
    amount: '',
    interestRate: '',
    currency: 'USD' as CurrencyCode,
    startDate: new Date().toISOString().split('T')[0],
    dueDate: '',
  });

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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Nombre requerido'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { setError('Monto requerido'); return; }
    try {
      await db.liabilities.create({
        name: form.name.trim(),
        type: form.type,
        amount: parseFloat(form.amount),
        current_balance: parseFloat(form.amount),
        interest_rate: parseFloat(form.interestRate) || 0,
        currency: form.currency,
        start_date: form.startDate || null,
        due_date: form.dueDate || null,
      });
      setForm({ name: '', type: 'loan', amount: '', interestRate: '', currency: 'USD', startDate: new Date().toISOString().split('T')[0], dueDate: '' });
      setShowForm(false);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Error al crear préstamo');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este préstamo?')) return;
    try {
      await db.liabilities.delete(id);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  }

  const totalDebt = liabilities.reduce((sum: number, l: any) => sum + parseFloat(l.current_balance || l.amount || '0'), 0);

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Préstamos / Deudas</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-primary hover:bg-primary-dark text-white rounded-full w-10 h-10 flex items-center justify-center text-xl font-bold transition-colors">
          {showForm ? '×' : '+'}
        </button>
      </div>

      {error && <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-surface rounded-xl p-4 space-y-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">Nombre</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Ej. Préstamo Juan" required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-text-muted mb-1">Tipo</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="loan">Préstamo</option>
                <option value="debt">Deuda</option>
                <option value="credit">Crédito</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Moneda</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value as CurrencyCode }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="USD">USD</option><option value="VES">VES</option><option value="EUR">EUR</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-text-muted mb-1">Monto total</label>
              <input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="0.00" required />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Tasa de interés %</label>
              <input type="number" step="0.01" value={form.interestRate} onChange={e => setForm(f => ({ ...f, interestRate: e.target.value }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-text-muted mb-1">Fecha inicio</label>
              <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Fecha vencimiento</label>
              <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg py-2.5 transition-colors">Crear préstamo</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 text-text-muted hover:text-text">Cancelar</button>
          </div>
        </form>
      )}

      <div className="bg-surface rounded-xl p-4">
        <p className="text-text-muted text-xs uppercase tracking-wide">Deuda total</p>
        <p className="text-2xl font-bold text-danger mt-1">{formatCurrency(Math.abs(totalDebt))}</p>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" /></div>
        ) : liabilities.length === 0 ? (
          <div className="text-center py-8 text-text-muted">
            <p className="text-lg mb-1">⊡</p>
            <p className="text-sm">No hay préstamos o deudas</p>
            <p className="text-xs mt-1">Toca + para crear uno</p>
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
                  <div className="flex items-center gap-2">
                    <p className={`font-bold text-lg ${balance >= 0 ? 'text-secondary' : 'text-danger'}`}>
                      {formatCurrency(balance, currency)}
                    </p>
                    <button onClick={() => handleDelete(liab.id)} className="text-text-muted hover:text-danger text-sm">×</button>
                  </div>
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
