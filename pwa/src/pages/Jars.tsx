import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';
import type { CurrencyCode } from '@/types';

export default function JarsPage() {
  const [jars, setJars] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    targetAmount: '',
    currency: 'USD' as CurrencyCode,
    notes: '',
  });

  const fetchJars = useCallback(async () => {
    setLoading(true);
    try {
      const list = await db.piggyBanks.list();
      setJars(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchJars(); }, [fetchJars]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Nombre requerido'); return; }
    try {
      await db.piggyBanks.create({
        name: form.name.trim(),
        target_amount: parseFloat(form.targetAmount) || 0,
        current_amount: 0,
        currency: form.currency,
        start_date: new Date().toISOString().split('T')[0],
        notes: form.notes,
      });
      setForm({ name: '', targetAmount: '', currency: 'USD', notes: '' });
      setShowForm(false);
      fetchJars();
    } catch (err: any) {
      setError(err.message || 'Error al crear jarra');
    }
  }

  if (selected) {
    return (
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <button onClick={() => setSelected(null)} className="text-text-muted hover:text-text flex items-center gap-1 text-sm">← Volver a jarras</button>
        <div className="bg-surface rounded-xl p-4">
          <h2 className="text-lg font-bold">{selected.name}</h2>
          {selected.target_amount > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-text-muted">Progreso</span>
                <span className="font-medium">
                  {formatCurrency(selected.current_amount || 0, selected.currency)} / {formatCurrency(selected.target_amount, selected.currency)}
                </span>
              </div>
              <div className="w-full bg-surface-light rounded-full h-2.5">
                <div className="bg-primary rounded-full h-2.5 transition-all" style={{ width: `${Math.min(100, (selected.current_amount / selected.target_amount) * 100)}%` }} />
              </div>
            </div>
          )}
          {selected.start_date && <p className="text-xs text-text-muted mt-2">Creada: {selected.start_date}</p>}
          {selected.target_date && <p className="text-xs text-text-muted">Meta: {selected.target_date}</p>}
          {selected.notes && <p className="text-xs text-text-muted mt-1">{selected.notes}</p>}
        </div>
      </div>
    );
  }

  const totalJars = jars.reduce((sum: number, j: any) => sum + parseFloat(j.current_amount || '0'), 0);

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Jarras / Fondos</h1>
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
              placeholder="Ej. Fondo de emergencia" required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-text-muted mb-1">Meta</label>
              <input type="number" step="0.01" value={form.targetAmount} onChange={e => setForm(f => ({ ...f, targetAmount: e.target.value }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Moneda</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value as CurrencyCode }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="USD">USD</option>
                <option value="VES">VES</option>
                <option value="EUR">EUR</option>
                <option value="USDT">USDT</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Notas (opcional)</label>
            <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Descripción de la jarra" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg py-2.5 transition-colors">Crear jarra</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 text-text-muted hover:text-text">Cancelar</button>
          </div>
        </form>
      )}

      <div className="bg-surface rounded-xl p-4">
        <p className="text-text-muted text-xs uppercase tracking-wide">Total en jarras</p>
        <p className="text-2xl font-bold text-primary mt-1">{formatCurrency(totalJars)}</p>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" /></div>
        ) : jars.length === 0 ? (
          <div className="text-center py-8 text-text-muted">
            <p className="text-lg mb-1">⚱</p>
            <p className="text-sm">No hay jarras creadas</p>
            <p className="text-xs mt-1">Toca + para crear una</p>
          </div>
        ) : (
          jars.map((jar: any) => {
            const current = parseFloat(jar.current_amount || '0');
            const target = parseFloat(jar.target_amount || '0');
            const currency = jar.currency || 'USD';
            const progress = target > 0 ? Math.min(100, (current / target) * 100) : 0;
            return (
              <button key={jar.id} onClick={() => setSelected(jar)} className="w-full bg-surface rounded-xl p-4 text-left hover:bg-surface-light transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium">{jar.name}</p>
                  <span className="font-bold">{formatCurrency(current, currency)}</span>
                </div>
                {target > 0 && (
                  <>
                    <div className="w-full bg-surface-light rounded-full h-2">
                      <div className="bg-warning rounded-full h-2 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-xs text-text-muted mt-1">Meta: {formatCurrency(target, currency)}</p>
                  </>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
