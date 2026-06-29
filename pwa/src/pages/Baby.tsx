import { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';
import type { BabyRecord, CurrencyCode } from '@/types';

export default function BabyPage() {
  const [records, setRecords] = useState<BabyRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<'all' | 'upcoming'>('upcoming');

  const [form, setForm] = useState({
    type: 'expense' as BabyRecord['type'],
    description: '',
    cost: '',
    estimatedCost: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  useEffect(() => {
    db.babyRecords.getAll().then(setRecords);
  }, []);

  async function addRecord(e: React.FormEvent) {
    e.preventDefault();
    const record = await db.babyRecords.set({
      date: form.date,
      type: form.type,
      description: form.description,
      cost: parseFloat(form.cost) || 0,
      currency: 'VES' as CurrencyCode,
      estimated_cost: parseFloat(form.estimatedCost) || 0,
      notes: form.notes,
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

  return (
    <div className="p-4 space-y-4 max-w-lg lg:max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Bebé</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-primary hover:bg-primary-dark text-white rounded-full w-10 h-10 flex items-center justify-center text-xl font-bold transition-colors"
        >
          {showForm ? '×' : '+'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface rounded-xl p-4">
          <p className="text-text-muted text-xs uppercase tracking-wide">Total gastado</p>
          <p className="text-2xl font-bold text-danger mt-1">{formatCurrency(totalSpent)}</p>
        </div>
        <div className="bg-surface rounded-xl p-4">
          <p className="text-text-muted text-xs uppercase tracking-wide">Presupuesto estimado</p>
          <p className="text-2xl font-bold text-warning mt-1">{formatCurrency(totalExpected)}</p>
        </div>
      </div>

      {upcoming.length > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
          <p className="text-sm font-medium text-warning">Próximos gastos</p>
          <p className="text-xs text-text-muted mt-1">
            {upcoming.length} pendiente(s) · Total estimado: {formatCurrency(totalEstimated)}
          </p>
        </div>
      )}

      <div className="flex gap-1 bg-surface rounded-lg p-1">
        <button
          onClick={() => setTab('upcoming')}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'upcoming' ? 'bg-primary text-white' : 'text-text-muted'}`}
        >
          Pendientes
        </button>
        <button
          onClick={() => setTab('all')}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'all' ? 'bg-primary text-white' : 'text-text-muted'}`}
        >
          Historial
        </button>
      </div>

      {showForm && (
        <form onSubmit={addRecord} className="bg-surface rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-text-muted mb-1">Tipo</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as BabyRecord['type'] }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="expense">Gasto</option>
                <option value="purchase">Compra planeada</option>
                <option value="appointment">Cita médica</option>
                <option value="milestone">Hito/Logro</option>
                <option value="other">Otro</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Fecha</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <input
            type="text"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Descripción"
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-text-muted mb-1">Costo real</label>
              <input
                type="number"
                step="0.01"
                value={form.cost}
                onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Costo estimado</label>
              <input
                type="number"
                step="0.01"
                value={form.estimatedCost}
                onChange={e => setForm(f => ({ ...f, estimatedCost: e.target.value }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="0.00"
              />
            </div>
          </div>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Notas"
            rows={2}
          />
          <button
            type="submit"
            className="w-full bg-primary hover:bg-primary-dark text-white font-medium rounded-lg py-2.5 transition-colors"
          >
            Agregar
          </button>
        </form>
      )}

      <div className="space-y-2">
        {(tab === 'upcoming' ? upcoming : records).length === 0 && (
          <div className="text-center py-8 text-text-muted">
            <p className="text-lg mb-1">✦</p>
            <p className="text-sm">
              {tab === 'upcoming' ? 'Sin pendientes' : 'Sin registros'}
            </p>
          </div>
        )}
        {(tab === 'upcoming' ? upcoming : records).map((r) => (
          <div key={r.id} className="bg-surface rounded-xl p-4 border-l-4 border-primary">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs bg-surface-light px-2 py-0.5 rounded-full text-text-muted uppercase">{r.type}</span>
              <span className="text-xs text-text-muted">{format(new Date(r.date), 'dd/MM/yy')}</span>
            </div>
            <p className="font-medium mt-1">{r.description}</p>
            <div className="flex items-center gap-3 mt-1.5 text-sm text-text-muted">
              {r.cost > 0 && <span>💵 {formatCurrency(r.cost)}</span>}
              {r.estimated_cost > 0 && r.cost === 0 && <span>💰 Est. {formatCurrency(r.estimated_cost)}</span>}
            </div>
            {r.notes && <p className="text-xs text-text-muted mt-1">{r.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
