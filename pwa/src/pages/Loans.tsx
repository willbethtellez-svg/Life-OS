import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import type { CurrencyCode } from '@/types';

const typeLabels: Record<string, string> = { loan: 'Préstamo', debt: 'Deuda', credit: 'Crédito' };

export default function LoansPage() {
  const [liabilities, setLiabilities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', type: 'loan' as 'loan' | 'debt' | 'credit', amount: '', interestRate: '',
    currency: 'USD' as CurrencyCode, startDate: new Date().toISOString().split('T')[0], dueDate: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try { setLiabilities(await db.liabilities.list()); } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function resetForm() {
    setForm({ name: '', type: 'loan', amount: '', interestRate: '', currency: 'USD', startDate: new Date().toISOString().split('T')[0], dueDate: '' });
    setEditingId(null); setShowForm(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (!form.name.trim()) { setError('Nombre requerido'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { setError('Monto requerido'); return; }
    try {
      if (editingId) {
        await db.liabilities.update(editingId, { name: form.name.trim(), type: form.type, amount: parseFloat(form.amount), interest_rate: parseFloat(form.interestRate) || 0, currency: form.currency, start_date: form.startDate || null, due_date: form.dueDate || null });
      } else {
        await db.liabilities.create({ name: form.name.trim(), type: form.type, amount: parseFloat(form.amount), current_balance: parseFloat(form.amount), interest_rate: parseFloat(form.interestRate) || 0, currency: form.currency, start_date: form.startDate || null, due_date: form.dueDate || null });
      }
      resetForm(); fetchData();
    } catch (err: any) { setError(err.message || 'Error'); }
  }

  function startEdit(liab: any) {
    setForm({ name: liab.name, type: liab.type, amount: liab.amount?.toString() || '', interestRate: liab.interest_rate?.toString() || '', currency: liab.currency || 'USD', startDate: liab.start_date || '', dueDate: liab.due_date || '' });
    setEditingId(liab.id); setShowForm(true);
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar?')) return;
    try { await db.liabilities.delete(id); fetchData(); } catch (err) { console.error(err); }
  }

  const totalDebt = liabilities.reduce((sum: number, l: any) => sum + parseFloat(l.current_balance || l.amount || '0'), 0);

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Préstamos / Deudas</h1>
          <p className="text-sm text-text-muted">Gestiona tus pasivos</p>
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
              <Input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej. Préstamo Juan" required />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tipo">
                <Select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}>
                  <option value="loan">Préstamo</option><option value="debt">Deuda</option><option value="credit">Crédito</option>
                </Select>
              </Field>
              <Field label="Moneda">
                <Select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value as CurrencyCode }))}>
                  <option value="USD">USD</option><option value="VES">VES</option><option value="EUR">EUR</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Monto total">
                <Input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" required />
              </Field>
              <Field label="Interés %">
                <Input type="number" step="0.01" value={form.interestRate} onChange={e => setForm(f => ({ ...f, interestRate: e.target.value }))} placeholder="0" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Fecha inicio">
                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </Field>
              <Field label="Vencimiento">
                <Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">{editingId ? 'Guardar' : 'Crear'}</Button>
              <Button type="button" variant="ghost" onClick={resetForm}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Total */}
      <Card>
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1">Deuda total</p>
        <p className="text-3xl font-bold text-danger">{formatCurrency(Math.abs(totalDebt))}</p>
      </Card>

      <div className="space-y-2">
        {loading ? <Spinner fullPage /> : liabilities.length === 0 ? (
          <div className="text-center py-10 text-text-muted"><p className="text-sm">No hay préstamos registrados</p></div>
        ) : liabilities.map((liab: any) => {
          const balance = parseFloat(liab.current_balance || liab.amount || '0');
          const currency = liab.currency || 'USD';
          return (
            <Card key={liab.id} padding="sm">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium">{liab.name}</p>
                  <p className="text-xs text-text-muted mt-0.5">{typeLabels[liab.type] || liab.type} · {currency}</p>
                  {liab.interest_rate > 0 && (
                    <p className="text-xs text-text-muted mt-1">{liab.interest_rate}% interés · Vence: {liab.due_date || 'Sin fecha'}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 ml-3">
                  <p className="font-bold text-lg text-danger">{formatCurrency(balance, currency)}</p>
                  <div className="flex flex-col gap-1">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(liab)}>Editar</Button>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(liab.id)}>Eliminar</Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
