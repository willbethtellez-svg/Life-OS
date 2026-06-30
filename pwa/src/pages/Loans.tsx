import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { db } from '@/lib/db';
import { formatCurrency, formatDate, generateId } from '@/lib/utils';
import { Card, CardHeader, CardTitle, Button, Input, Select, Field, Badge } from '@/components/ui';
import type { Liability, LiabilityMovement, CurrencyCode } from '@/types';

const CURRENCIES: CurrencyCode[] = ['USD', 'VES', 'EUR', 'BTC', 'USDT'];
const LIAB_TYPES = [
  { value: 'loan', label: 'Préstamo' },
  { value: 'debt', label: 'Deuda' },
  { value: 'credit', label: 'Crédito' },
];

interface LiabForm {
  name: string;
  type: 'loan' | 'debt' | 'credit';
  amount: string;
  currency: CurrencyCode;
  interest_rate: string;
  start_date: string;
  due_date: string;
  registerInitial: boolean;
}

const emptyLiabForm = (): LiabForm => ({
  name: '', type: 'loan', amount: '', currency: 'USD',
  interest_rate: '0', start_date: '', due_date: '', registerInitial: true,
});

interface MovForm {
  date: string;
  type: 'payment' | 'increase' | 'interest';
  amount: string;
  currency: CurrencyCode;
  notes: string;
}

const emptyMovForm = (currency: CurrencyCode = 'USD'): MovForm => ({
  date: new Date().toISOString().split('T')[0],
  type: 'payment', amount: '', currency, notes: '',
});

const movTypeLabel: Record<string, string> = { payment: 'Pago', increase: 'Aumento', interest: 'Interés', initial: 'Inicial' };
const movTypeColor: Record<string, string> = { payment: 'text-secondary', increase: 'text-danger', interest: 'text-warning', initial: 'text-transfer' };

export default function Loans() {
  const { liabilities, addLiability, updateLiability, removeLiability, archiveLiabilityInStore } = useAppStore();
  const [form, setForm] = useState<LiabForm>(emptyLiabForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Detail view
  const [selected, setSelected] = useState<Liability | null>(null);
  const [movements, setMovements] = useState<LiabilityMovement[]>([]);
  const [movLoading, setMovLoading] = useState(false);
  const [movForm, setMovForm] = useState<MovForm>(emptyMovForm());
  const [addingMov, setAddingMov] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState<Liability[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);

  const active = liabilities.filter(l => !l.archived);

  function openForm(l?: Liability) {
    if (l) {
      setEditId(l.id);
      setForm({
        name: l.name, type: l.type, amount: String(l.amount), currency: l.currency,
        interest_rate: String(l.interest_rate), start_date: l.start_date || '', due_date: l.due_date || '', registerInitial: false,
      });
    } else {
      setEditId(null);
      setForm(emptyLiabForm());
    }
    setShowForm(true);
  }

  function closeForm() { setShowForm(false); setEditId(null); setForm(emptyLiabForm()); setError(''); }

  const f = (k: keyof LiabForm, v: string | boolean) => setForm(prev => ({ ...prev, [k]: v }));
  const mf = (k: keyof MovForm, v: string) => setMovForm(prev => ({ ...prev, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const amt = parseFloat(form.amount) || 0;
    const payload = {
      name: form.name, type: form.type, amount: amt, current_balance: amt,
      currency: form.currency as CurrencyCode, interest_rate: parseFloat(form.interest_rate) || 0,
      start_date: form.start_date || null, due_date: form.due_date || null, archived: false, paid_date: null,
    };
    try {
      if (editId) {
        const prev = liabilities.find(l => l.id === editId)!;
        updateLiability(editId, { ...prev, ...payload, current_balance: prev.current_balance });
        closeForm();
        const real = await db.liabilities.update(editId, payload);
        updateLiability(editId, real);
      } else {
        const tempId = generateId();
        const optimistic: Liability = { id: tempId, user_id: '', created_at: new Date().toISOString(), ...payload };
        addLiability(optimistic);
        closeForm();
        const real = await db.liabilities.create(payload);
        updateLiability(tempId, real);
        if (form.registerInitial && amt > 0) {
          await db.liabilities.addMovement({
            liability_id: real.id, date: form.start_date || new Date().toISOString().split('T')[0],
            type: 'initial', amount: amt, currency: form.currency, notes: 'Monto inicial', transaction_id: null,
          });
        }
      }
    } catch {
      setError('Error al guardar');
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  async function openDetail(l: Liability) {
    setSelected(l);
    setMovForm(emptyMovForm(l.currency));
    setMovLoading(true);
    const movs = await db.liabilities.movements(l.id);
    setMovements(movs);
    setMovLoading(false);
  }

  async function handleAddMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setAddingMov(true);
    const amt = parseFloat(movForm.amount);
    const movement = {
      liability_id: selected.id, date: movForm.date, type: movForm.type,
      amount: amt, currency: movForm.currency, notes: movForm.notes, transaction_id: null,
    };
    const newBalance = movForm.type === 'payment'
      ? Math.max(0, parseFloat(String(selected.current_balance)) - amt)
      : parseFloat(String(selected.current_balance)) + amt;
    const updatedLiab = { ...selected, current_balance: newBalance };
    setSelected(updatedLiab);
    updateLiability(selected.id, updatedLiab);
    setMovForm(emptyMovForm(selected.currency));
    try {
      const real = await db.liabilities.addMovement(movement);
      setMovements(prev => [...prev, real].sort((a, b) => a.date.localeCompare(b.date)));
    } catch {
      setSelected(selected);
      updateLiability(selected.id, selected);
      setError('Error al agregar movimiento');
    } finally {
      setAddingMov(false);
    }
  }

  async function handleDeleteMovement(mov: LiabilityMovement) {
    if (!selected) return;
    const newBalance = mov.type === 'payment'
      ? parseFloat(String(selected.current_balance)) + mov.amount
      : Math.max(0, parseFloat(String(selected.current_balance)) - mov.amount);
    const updatedLiab = { ...selected, current_balance: newBalance };
    setSelected(updatedLiab);
    updateLiability(selected.id, updatedLiab);
    setMovements(prev => prev.filter(m => m.id !== mov.id));
    try {
      await db.liabilities.deleteMovement(mov.id, selected.id, mov.amount, mov.type);
    } catch {
      setSelected(selected);
      updateLiability(selected.id, selected);
      setMovements(prev => [...prev, mov].sort((a, b) => a.date.localeCompare(b.date)));
      setError('Error al eliminar movimiento');
    }
  }

  async function handleArchive(l: Liability) {
    archiveLiabilityInStore(l.id);
    if (selected?.id === l.id) setSelected(null);
    try {
      await db.liabilities.archive(l.id);
    } catch {
      addLiability(l);
      setError('Error al archivar');
    }
  }

  async function loadArchived() {
    setArchivedLoading(true);
    const data = await db.liabilities.list(true);
    setArchived(data.filter(l => l.archived));
    setArchivedLoading(false);
    setShowArchived(true);
  }

  // Detail view
  if (selected) {
    const current = parseFloat(String(selected.current_balance));
    const original = parseFloat(String(selected.amount));
    const paid = original - current;
    const pct = original > 0 ? Math.min(100, (paid / original) * 100) : 0;

    return (
      <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="text-text-muted hover:text-text p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-text">{selected.name}</h1>
            <p className="text-xs text-text-muted capitalize">{movTypeLabel[selected.type] ?? selected.type} · {selected.currency}</p>
          </div>
          <Button size="sm" variant="warning" onClick={() => handleArchive(selected)}>Marcar pagado</Button>
        </div>

        {error && <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-sm text-danger">{error}</div>}

        {/* Progress */}
        <Card padding="sm">
          <div className="flex justify-between text-sm mb-2">
            <div>
              <p className="text-text-muted text-xs">Pagado</p>
              <p className="font-semibold text-secondary">{formatCurrency(paid, selected.currency)}</p>
            </div>
            <div className="text-right">
              <p className="text-text-muted text-xs">Restante</p>
              <p className="font-semibold text-danger">{formatCurrency(current, selected.currency)}</p>
            </div>
          </div>
          <div className="w-full h-2 bg-surface-light rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-text-muted mt-1.5 text-center">{Math.round(pct)}% pagado · Original: {formatCurrency(original, selected.currency)}</p>
        </Card>

        {/* Add movement form */}
        <Card>
          <CardHeader><CardTitle>Agregar movimiento</CardTitle></CardHeader>
          <form onSubmit={handleAddMovement} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="Fecha">
              <Input type="date" value={movForm.date} onChange={e => mf('date', e.target.value)} required />
            </Field>
            <Field label="Tipo">
              <Select value={movForm.type} onChange={e => mf('type', e.target.value)}>
                <option value="payment">Pago</option>
                <option value="increase">Aumento</option>
                <option value="interest">Interés</option>
              </Select>
            </Field>
            <Field label="Moneda">
              <Select value={movForm.currency} onChange={e => mf('currency', e.target.value)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Monto">
              <Input type="number" step="any" min="0" value={movForm.amount} onChange={e => mf('amount', e.target.value)} placeholder="0.00" required />
            </Field>
            <Field label="Notas" className="col-span-2 sm:col-span-1">
              <Input value={movForm.notes} onChange={e => mf('notes', e.target.value)} placeholder="Opcional" />
            </Field>
            <div className="col-span-2 sm:col-span-3 flex justify-end">
              <Button type="submit" loading={addingMov}>Registrar</Button>
            </div>
          </form>
        </Card>

        {/* Movement history */}
        <Card padding="none">
          <CardHeader className="px-5 pt-5"><CardTitle>Historial</CardTitle></CardHeader>
          {movLoading ? (
            <div className="flex justify-center py-6"><span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : movements.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-6">Sin movimientos aún</p>
          ) : (
            <ul className="divide-y divide-surface-light/40">
              {movements.map(mov => (
                <li key={mov.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${movTypeColor[mov.type]}`}>{movTypeLabel[mov.type]}</span>
                      {mov.notes && <span className="text-xs text-text-muted">— {mov.notes}</span>}
                    </div>
                    <p className="text-xs text-text-muted">{formatDate(mov.date)}</p>
                  </div>
                  <span className={`text-sm font-semibold ${movTypeColor[mov.type]}`}>
                    {mov.type === 'payment' ? '−' : '+'}{formatCurrency(mov.amount, mov.currency)}
                  </span>
                  {mov.type !== 'initial' && (
                    <Button size="icon" variant="danger" onClick={() => handleDeleteMovement(mov)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></svg>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text">Préstamos</h1>
        <Button onClick={() => openForm()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
          Nuevo
        </Button>
      </div>

      {error && <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-sm text-danger">{error}</div>}

      {/* Active loans */}
      <div className="space-y-3">
        {active.length === 0 && (
          <Card className="text-center py-12">
            <p className="text-text-muted mb-3">Sin préstamos activos</p>
            <Button onClick={() => openForm()}>Agregar préstamo</Button>
          </Card>
        )}
        {active.map(l => {
          const current = parseFloat(String(l.current_balance));
          const original = parseFloat(String(l.amount));
          const paid = original - current;
          const pct = original > 0 ? Math.min(100, (paid / original) * 100) : 0;
          return (
            <Card key={l.id} padding="sm" className="cursor-pointer hover:border-surface-light transition-colors" onClick={() => openDetail(l)}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0 mr-2">
                  <p className="font-semibold text-text truncate">{l.name}</p>
                  <p className="text-xs text-text-muted capitalize">{LIAB_TYPES.find(t => t.value === l.type)?.label} · {l.currency}</p>
                </div>
                <div className="text-right shrink-0" onClick={e => e.stopPropagation()}>
                  <p className="font-bold text-danger">{formatCurrency(current, l.currency)}</p>
                  <div className="flex gap-1 justify-end mt-1">
                    <Button size="sm" variant="ghost" onClick={() => openForm(l)}>Editar</Button>
                    <Button size="sm" variant="danger" onClick={async () => {
                      removeLiability(l.id);
                      try { await db.liabilities.delete(l.id); } catch { addLiability(l); }
                    }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></svg>
                    </Button>
                  </div>
                </div>
              </div>
              <div className="w-full h-1.5 bg-surface-light rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-text-muted mt-1">{Math.round(pct)}% pagado · {formatCurrency(paid, l.currency)} de {formatCurrency(original, l.currency)}</p>
            </Card>
          );
        })}
      </div>

      {/* Archived section */}
      <div>
        <button onClick={showArchived ? () => setShowArchived(false) : loadArchived}
          className="flex items-center gap-2 text-sm text-text-muted hover:text-text transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d={showArchived ? 'M19 9l-7 7-7-7' : 'M9 18l6-6-6-6'} />
          </svg>
          {showArchived ? 'Ocultar' : 'Ver'} préstamos pagados {archived.length > 0 ? `(${archived.length})` : ''}
        </button>
        {showArchived && (
          <div className="mt-3 space-y-2">
            {archivedLoading ? (
              <div className="flex justify-center py-4"><span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
            ) : archived.map(l => (
              <Card key={l.id} padding="sm" className="opacity-70">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-text">{l.name}</p>
                    <p className="text-xs text-text-muted">{l.paid_date ? `Pagado ${formatDate(l.paid_date)}` : 'Archivado'}</p>
                  </div>
                  <Badge variant="primary">Pagado</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative w-full lg:max-w-md bg-surface rounded-t-2xl lg:rounded-2xl border border-surface-light/60 p-5 z-10">
            <div className="w-10 h-1 bg-surface-light rounded-full mx-auto mb-5 lg:hidden" />
            <h2 className="text-base font-semibold text-text mb-4">{editId ? 'Editar' : 'Nuevo préstamo'}</h2>
            {error && <div className="bg-danger/10 border border-danger/30 rounded-xl px-3 py-2 text-sm text-danger mb-3">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-3">
              <Field label="Nombre">
                <Input value={form.name} onChange={e => f('name', e.target.value)} placeholder="Ej: Banco Nacional" required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tipo">
                  <Select value={form.type} onChange={e => f('type', e.target.value)}>
                    {LIAB_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </Select>
                </Field>
                <Field label="Moneda">
                  <Select value={form.currency} onChange={e => f('currency', e.target.value)}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Monto original">
                  <Input type="number" step="any" min="0" value={form.amount} onChange={e => f('amount', e.target.value)} placeholder="0.00" required />
                </Field>
                <Field label="Tasa de interés %">
                  <Input type="number" step="any" min="0" value={form.interest_rate} onChange={e => f('interest_rate', e.target.value)} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Fecha inicio">
                  <Input type="date" value={form.start_date} onChange={e => f('start_date', e.target.value)} />
                </Field>
                <Field label="Fecha vence">
                  <Input type="date" value={form.due_date} onChange={e => f('due_date', e.target.value)} />
                </Field>
              </div>
              {!editId && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.registerInitial} onChange={e => f('registerInitial', e.target.checked)} className="w-4 h-4 accent-primary" />
                  <span className="text-sm text-text">Registrar monto inicial en historial</span>
                </label>
              )}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={closeForm} type="button">Cancelar</Button>
                <Button type="submit" loading={saving} className="flex-1">Guardar</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
