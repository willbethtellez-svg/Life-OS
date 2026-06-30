import { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select } from '@/components/ui/Input';
import type { BabyRecord, CurrencyCode } from '@/types';

const typeLabels: Record<string, string> = {
  expense: 'Gasto', purchase: 'Compra', appointment: 'Cita', milestone: 'Hito', other: 'Otro',
};

const typeColors: Record<string, string> = {
  expense: 'text-danger bg-danger/10 border-danger/20',
  purchase: 'text-warning bg-warning/10 border-warning/20',
  appointment: 'text-transfer bg-transfer/10 border-transfer/20',
  milestone: 'text-primary bg-primary/10 border-primary/20',
  other: 'text-text-muted bg-surface-elevated border-surface-light',
};

export default function BabyPage() {
  const [records, setRecords] = useState<BabyRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<'all' | 'upcoming'>('upcoming');
  const [form, setForm] = useState({
    type: 'expense' as BabyRecord['type'], description: '', cost: '',
    estimatedCost: '', date: new Date().toISOString().split('T')[0], notes: '',
  });

  useEffect(() => { db.babyRecords.getAll().then(setRecords); }, []);

  async function addRecord(e: React.FormEvent) {
    e.preventDefault();
    const record = await db.babyRecords.set({
      date: form.date, type: form.type, description: form.description,
      cost: parseFloat(form.cost) || 0, currency: 'VES' as CurrencyCode,
      estimated_cost: parseFloat(form.estimatedCost) || 0, notes: form.notes,
      completed: form.type === 'expense',
    });
    setRecords(prev => [record, ...prev]);
    setShowForm(false);
    setForm({ type: 'expense', description: '', cost: '', estimatedCost: '', date: new Date().toISOString().split('T')[0], notes: '' });
  }

  const totalSpent = records.filter(r => r.type === 'expense' || r.type === 'purchase').reduce((s, r) => s + r.cost, 0);
  const upcoming = records.filter(r => !r.completed && r.type !== 'expense');
  const totalEstimated = upcoming.reduce((s, r) => s + r.estimated_cost, 0);
  const totalExpected = records.filter(r => r.estimated_cost > 0).reduce((s, r) => s + r.estimated_cost, 0);
  const displayList = tab === 'upcoming' ? upcoming : records;

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Bebé</h1>
        <Button size="icon" onClick={() => setShowForm(!showForm)} className="rounded-full w-10 h-10">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            {showForm ? <path d="M6 18L18 6M6 6l12 12" /> : <path d="M12 5v14M5 12h14" />}
          </svg>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card padding="sm">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1">Total gastado</p>
          <p className="text-2xl font-bold text-danger">{formatCurrency(totalSpent)}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1">Presupuesto estimado</p>
          <p className="text-2xl font-bold text-warning">{formatCurrency(totalExpected)}</p>
        </Card>
      </div>

      {upcoming.length > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
          <p className="text-sm font-medium text-warning">Próximos gastos</p>
          <p className="text-xs text-text-muted mt-1">
            {upcoming.length} pendiente(s) · Total estimado: {formatCurrency(totalEstimated)}
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface border border-surface-light rounded-xl p-1">
        {(['upcoming', 'all'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-primary text-white' : 'text-text-muted hover:text-text'}`}>
            {t === 'upcoming' ? 'Pendientes' : 'Historial'}
          </button>
        ))}
      </div>

      {showForm && (
        <Card>
          <form onSubmit={addRecord} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tipo">
                <Select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as BabyRecord['type'] }))}>
                  <option value="expense">Gasto</option>
                  <option value="purchase">Compra planeada</option>
                  <option value="appointment">Cita médica</option>
                  <option value="milestone">Hito/Logro</option>
                  <option value="other">Otro</option>
                </Select>
              </Field>
              <Field label="Fecha">
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </Field>
            </div>
            <Field label="Descripción">
              <Input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción" required />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Costo real">
                <Input type="number" step="0.01" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} placeholder="0.00" />
              </Field>
              <Field label="Costo estimado">
                <Input type="number" step="0.01" value={form.estimatedCost} onChange={e => setForm(f => ({ ...f, estimatedCost: e.target.value }))} placeholder="0.00" />
              </Field>
            </div>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full bg-background border border-surface-light rounded-xl px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              placeholder="Notas" rows={2} />
            <Button type="submit" className="w-full">Agregar</Button>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {displayList.length === 0 && (
          <div className="text-center py-10 text-text-muted">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-3 opacity-40"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
            <p className="text-sm">{tab === 'upcoming' ? 'Sin pendientes' : 'Sin registros'}</p>
          </div>
        )}
        {displayList.map((r) => (
          <Card key={r.id} padding="sm" className="border-l-4 border-primary/60">
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${typeColors[r.type] || typeColors.other}`}>
                {typeLabels[r.type] || r.type}
              </span>
              <span className="text-xs text-text-muted">{format(new Date(r.date), 'dd/MM/yy')}</span>
            </div>
            <p className="font-medium">{r.description}</p>
            <div className="flex items-center gap-4 mt-1.5 text-sm">
              {r.cost > 0 && <span className="text-danger">{formatCurrency(r.cost)}</span>}
              {r.estimated_cost > 0 && r.cost === 0 && <span className="text-warning">Est. {formatCurrency(r.estimated_cost)}</span>}
            </div>
            {r.notes && <p className="text-xs text-text-muted mt-1.5">{r.notes}</p>}
          </Card>
        ))}
      </div>
    </div>
  );
}
