import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import type { CurrencyCode } from '@/types';

export default function JarsPage() {
  const [jars, setJars] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', targetAmount: '', currentAmount: '', currency: 'USD' as CurrencyCode, notes: '' });

  const fetchJars = useCallback(async () => {
    setLoading(true);
    try { setJars(await db.piggyBanks.list()); } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchJars(); }, [fetchJars]);

  function resetForm() { setForm({ name: '', targetAmount: '', currentAmount: '', currency: 'USD', notes: '' }); setEditingId(null); setShowForm(false); }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Nombre requerido'); return; }
    try {
      if (editingId) {
        await db.piggyBanks.update(editingId, {
          name: form.name.trim(), target_amount: parseFloat(form.targetAmount) || 0,
          current_amount: parseFloat(form.currentAmount) || 0, currency: form.currency, notes: form.notes,
        });
      } else {
        await db.piggyBanks.create({
          name: form.name.trim(), target_amount: parseFloat(form.targetAmount) || 0,
          current_amount: parseFloat(form.currentAmount) || 0, currency: form.currency,
          start_date: new Date().toISOString().split('T')[0], notes: form.notes,
        });
      }
      resetForm(); fetchJars();
    } catch (err: any) { setError(err.message || 'Error'); }
  }

  function startEdit(jar: any) {
    setForm({ name: jar.name, targetAmount: jar.target_amount?.toString() || '', currentAmount: jar.current_amount?.toString() || '', currency: jar.currency || 'USD', notes: jar.notes || '' });
    setEditingId(jar.id); setShowForm(true);
  }

  const totalInJars = jars.reduce((s, j) => {
    const cur = j.currency || 'USD';
    if (cur === 'USD' || cur === 'USDT') return s + parseFloat(j.current_amount || '0');
    return s;
  }, 0);

  if (selected) {
    const current = parseFloat(selected.current_amount || '0');
    const target = parseFloat(selected.target_amount || '0');
    const currency = selected.currency || 'USD';
    const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
    return (
      <div className="p-4 lg:p-6 space-y-4 max-w-lg">
        <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-text-muted hover:text-text transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Volver
        </button>
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">{selected.name}</h2>
            <Button variant="outline" size="sm" onClick={() => { startEdit(selected); setSelected(null); }}>Editar</Button>
          </div>
          <div className="text-3xl font-bold text-primary mb-1">{formatCurrency(current, currency)}</div>
          {target > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-text-muted">Progreso hacia meta</span>
                <span className="font-medium text-text">{pct.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-surface-light rounded-full h-2">
                <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-text-muted mt-1.5">Meta: {formatCurrency(target, currency)}</p>
            </div>
          )}
          {selected.notes && <p className="text-xs text-text-muted mt-3 pt-3 border-t border-surface-light/40">{selected.notes}</p>}
          {selected.start_date && <p className="text-xs text-text-muted mt-1">Creada: {selected.start_date}</p>}
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Jarras / Fondos</h1>
          <p className="text-sm text-text-muted">Fondos de ahorro por objetivo</p>
        </div>
        <Button size="icon" onClick={() => { resetForm(); setShowForm(!showForm); }} className="rounded-full w-10 h-10">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            {showForm ? <path d="M6 18L18 6M6 6l12 12" /> : <path d="M12 5v14M5 12h14" />}
          </svg>
        </Button>
      </div>

      {error && <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-sm text-danger">{error}</div>}

      {showForm && (
        <Card>
          <form onSubmit={handleCreate} className="space-y-3">
            <Field label="Nombre">
              <Input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej. Fondo Bebé" required autoFocus />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Saldo actual">
                <Input type="number" step="0.01" value={form.currentAmount} onChange={e => setForm(f => ({ ...f, currentAmount: e.target.value }))} placeholder="0.00" />
              </Field>
              <Field label="Meta">
                <Input type="number" step="0.01" value={form.targetAmount} onChange={e => setForm(f => ({ ...f, targetAmount: e.target.value }))} placeholder="0.00" />
              </Field>
              <Field label="Moneda">
                <Select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value as CurrencyCode }))}>
                  <option value="USD">USD</option><option value="VES">VES</option><option value="EUR">EUR</option><option value="USDT">USDT</option>
                </Select>
              </Field>
            </div>
            <Field label="Notas (opcional)">
              <Input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Para qué es este fondo..." />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">{editingId ? 'Guardar' : 'Crear jarra'}</Button>
              <Button type="button" variant="ghost" onClick={resetForm}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Total */}
      <Card>
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1">Total en jarras (USD/USDT)</p>
        <p className="text-3xl font-bold text-primary">{formatCurrency(totalInJars)}</p>
      </Card>

      <div className="space-y-2">
        {loading ? <Spinner fullPage /> : jars.length === 0 ? (
          <div className="text-center py-10 text-text-muted">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-3 opacity-40"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            <p className="text-sm">No hay jarras creadas</p>
          </div>
        ) : jars.map((jar: any) => {
          const current = parseFloat(jar.current_amount || '0');
          const target = parseFloat(jar.target_amount || '0');
          const currency = jar.currency || 'USD';
          const progress = target > 0 ? Math.min(100, (current / target) * 100) : 0;
          return (
            <Card key={jar.id} padding="sm">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setSelected(jar)}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-surface-elevated flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-text-muted">{jar.currency}</span>
                  </div>
                  <p className="font-medium text-sm">{jar.name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-primary">{formatCurrency(current, currency)}</span>
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); startEdit(jar); }}>Editar</Button>
                </div>
              </div>
              {target > 0 && (
                <div className="mt-3">
                  <div className="w-full bg-surface-light rounded-full h-1.5">
                    <div className="bg-warning rounded-full h-1.5 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-xs text-text-muted mt-1">Meta: {formatCurrency(target, currency)} · {progress.toFixed(1)}%</p>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
