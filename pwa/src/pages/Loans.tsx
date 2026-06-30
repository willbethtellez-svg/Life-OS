import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import type { CurrencyCode } from '@/types';

const typeLabels: Record<string, string> = { loan: 'Préstamo', debt: 'Deuda', credit: 'Crédito' };
const movTypeLabels: Record<string, string> = {
  initial: 'Monto inicial', payment: 'Pago / Abono', increase: 'Incremento de deuda', interest: 'Interés',
};
const movTypeColors: Record<string, string> = {
  initial: 'text-text-muted bg-surface-elevated border-surface-light',
  payment: 'text-primary bg-primary/10 border-primary/20',
  increase: 'text-danger bg-danger/10 border-danger/20',
  interest: 'text-warning bg-warning/10 border-warning/20',
};

export default function LoansPage() {
  const [liabilities, setLiabilities] = useState<any[]>([]);
  const [archivedList, setArchivedList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [movLoading, setMovLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Movement form
  const [showMovForm, setShowMovForm] = useState(false);
  const [movForm, setMovForm] = useState({
    type: 'payment' as 'payment' | 'increase' | 'interest',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [form, setForm] = useState({
    name: '', type: 'loan' as 'loan' | 'debt' | 'credit', amount: '', interestRate: '',
    currency: 'USD' as CurrencyCode, startDate: new Date().toISOString().split('T')[0], dueDate: '',
    createInitialMovement: false,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [active, archived] = await Promise.all([
        db.liabilities.list(false),
        db.liabilities.list(true).then(all => all.filter(l => l.archived)),
      ]);
      setLiabilities(active);
      setArchivedList(archived);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function openDetail(liab: any) {
    setSelected(liab);
    setMovLoading(true);
    try {
      const movs = await db.liabilities.movements(liab.id);
      setMovements(movs);
    } catch (err) { console.error(err); }
    finally { setMovLoading(false); }
  }

  function resetForm() {
    setForm({ name: '', type: 'loan', amount: '', interestRate: '', currency: 'USD', startDate: new Date().toISOString().split('T')[0], dueDate: '', createInitialMovement: false });
    setEditingId(null); setShowForm(false);
  }

  function resetMovForm() {
    setMovForm({ type: 'payment', amount: '', date: new Date().toISOString().split('T')[0], notes: '' });
    setShowMovForm(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (!form.name.trim()) { setError('Nombre requerido'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { setError('Monto requerido'); return; }
    try {
      if (editingId) {
        const updated = await db.liabilities.update(editingId, {
          name: form.name.trim(), type: form.type, amount: parseFloat(form.amount),
          interest_rate: parseFloat(form.interestRate) || 0, currency: form.currency,
          start_date: form.startDate || null, due_date: form.dueDate || null,
        });
        setLiabilities(prev => prev.map(l => l.id === editingId ? updated : l));
        if (selected?.id === editingId) setSelected(updated);
      } else {
        const created = await db.liabilities.create({
          name: form.name.trim(), type: form.type, amount: parseFloat(form.amount),
          current_balance: parseFloat(form.amount), interest_rate: parseFloat(form.interestRate) || 0,
          currency: form.currency, start_date: form.startDate || null, due_date: form.dueDate || null,
          archived: false,
        });
        setLiabilities(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));

        // Optionally create initial movement
        if (form.createInitialMovement) {
          await db.liabilities.addMovement({
            liability_id: created.id,
            date: form.startDate || new Date().toISOString().split('T')[0],
            type: 'initial',
            amount: parseFloat(form.amount),
            currency: form.currency,
            notes: 'Monto inicial del préstamo',
            transaction_id: null,
          });
        }
      }
      resetForm();
    } catch (err: any) { setError(err.message || 'Error'); }
  }

  function startEdit(liab: any) {
    setForm({
      name: liab.name, type: liab.type, amount: liab.amount?.toString() || '',
      interestRate: liab.interest_rate?.toString() || '', currency: liab.currency || 'USD',
      startDate: liab.start_date || '', dueDate: liab.due_date || '', createInitialMovement: false,
    });
    setEditingId(liab.id); setShowForm(true);
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este préstamo y todos sus movimientos?')) return;
    try {
      await db.liabilities.delete(id);
      setLiabilities(prev => prev.filter(l => l.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (err) { console.error(err); }
  }

  async function handleArchive(id: string) {
    if (!confirm('¿Marcar como pagado y archivar este préstamo?')) return;
    try {
      await db.liabilities.archive(id);
      const liab = liabilities.find(l => l.id === id);
      setLiabilities(prev => prev.filter(l => l.id !== id));
      if (liab) setArchivedList(prev => [{ ...liab, archived: true, current_balance: 0 }, ...prev]);
      if (selected?.id === id) setSelected(null);
    } catch (err) { console.error(err); }
  }

  async function handleAddMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !movForm.amount || parseFloat(movForm.amount) <= 0) return;
    try {
      const mov = await db.liabilities.addMovement({
        liability_id: selected.id,
        date: movForm.date,
        type: movForm.type,
        amount: parseFloat(movForm.amount),
        currency: selected.currency,
        notes: movForm.notes,
        transaction_id: null,
      });
      setMovements(prev => [...prev, mov].sort((a, b) => a.date.localeCompare(b.date)));

      // Update the selected liability's balance
      const currentBalance = parseFloat(selected.current_balance || '0');
      const newBalance = movForm.type === 'payment'
        ? Math.max(0, currentBalance - parseFloat(movForm.amount))
        : currentBalance + parseFloat(movForm.amount);
      const updatedLiab = { ...selected, current_balance: newBalance };
      setSelected(updatedLiab);
      setLiabilities(prev => prev.map(l => l.id === selected.id ? updatedLiab : l));

      resetMovForm();
    } catch (err) { console.error(err); }
  }

  async function handleDeleteMovement(mov: any) {
    if (!confirm('¿Eliminar este movimiento?')) return;
    try {
      await db.liabilities.deleteMovement(mov.id, selected.id, mov.amount, mov.type);
      setMovements(prev => prev.filter(m => m.id !== mov.id));

      // Update balance
      const currentBalance = parseFloat(selected.current_balance || '0');
      const newBalance = mov.type === 'payment'
        ? currentBalance + mov.amount
        : Math.max(0, currentBalance - mov.amount);
      const updatedLiab = { ...selected, current_balance: newBalance };
      setSelected(updatedLiab);
      setLiabilities(prev => prev.map(l => l.id === selected.id ? updatedLiab : l));
    } catch (err) { console.error(err); }
  }

  const totalDebt = liabilities.reduce((sum: number, l: any) => sum + parseFloat(l.current_balance || l.amount || '0'), 0);

  // ─── Detail / history view ────────────────────────────────
  if (selected) {
    const balance = parseFloat(selected.current_balance || '0');
    const originalAmount = parseFloat(selected.amount || '0');
    const paid = originalAmount > 0 ? Math.min(100, ((originalAmount - balance) / originalAmount) * 100) : 0;
    const currency = selected.currency || 'USD';

    return (
      <div className="p-4 lg:p-6 space-y-4 max-w-2xl">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="text-text-muted hover:text-text p-2 rounded-xl hover:bg-surface-elevated transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">{selected.name}</h1>
            <p className="text-xs text-text-muted">{typeLabels[selected.type] || selected.type} · {currency}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-danger">{formatCurrency(balance, currency)}</p>
            <p className="text-xs text-text-muted">pendiente</p>
          </div>
        </div>

        {/* Progress */}
        {originalAmount > 0 && (
          <Card>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-text-muted">Progreso de pago</span>
              <span className="font-medium text-primary">{paid.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-surface-light rounded-full h-2 mb-2">
              <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${paid}%` }} />
            </div>
            <div className="flex justify-between text-xs text-text-muted">
              <span>Pagado: {formatCurrency(originalAmount - balance, currency)}</span>
              <span>Total: {formatCurrency(originalAmount, currency)}</span>
            </div>
            {selected.interest_rate > 0 && (
              <p className="text-xs text-text-muted mt-1">{selected.interest_rate}% interés</p>
            )}
            {selected.due_date && (
              <p className="text-xs text-text-muted mt-0.5">Vencimiento: {selected.due_date}</p>
            )}
          </Card>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setShowMovForm(!showMovForm)}>
            {showMovForm ? 'Cancelar' : '+ Registrar movimiento'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => { startEdit(selected); setSelected(null); }}>
            Editar
          </Button>
          <Button size="sm" variant="warning" onClick={() => handleArchive(selected.id)}>
            Marcar como pagado
          </Button>
          <Button size="sm" variant="danger" onClick={() => handleDelete(selected.id)}>
            Eliminar
          </Button>
        </div>

        {/* Movement form */}
        {showMovForm && (
          <Card>
            <form onSubmit={handleAddMovement} className="space-y-3">
              <p className="text-sm font-semibold">Nuevo movimiento</p>
              <div className="grid grid-cols-3 gap-1">
                {(['payment', 'increase', 'interest'] as const).map(t => (
                  <button key={t} type="button"
                    onClick={() => setMovForm(f => ({ ...f, type: t }))}
                    className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                      movForm.type === t
                        ? t === 'payment' ? 'bg-primary text-white' : t === 'increase' ? 'bg-danger text-white' : 'bg-warning text-black'
                        : 'bg-surface-light text-text-muted'
                    }`}>
                    {movTypeLabels[t]}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Monto">
                  <Input type="number" step="0.01" value={movForm.amount} onChange={e => setMovForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" required autoFocus />
                </Field>
                <Field label="Fecha">
                  <Input type="date" value={movForm.date} onChange={e => setMovForm(f => ({ ...f, date: e.target.value }))} />
                </Field>
              </div>
              <Field label="Notas (opcional)">
                <Input type="text" value={movForm.notes} onChange={e => setMovForm(f => ({ ...f, notes: e.target.value }))} placeholder="Referencia, banco, etc." />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1">Guardar</Button>
                <Button type="button" variant="ghost" onClick={resetMovForm}>Cancelar</Button>
              </div>
            </form>
          </Card>
        )}

        {/* Movements history */}
        <Card padding="none">
          <div className="px-5 py-4 border-b border-surface-light/60">
            <CardTitle>Historial de movimientos</CardTitle>
          </div>
          {movLoading ? (
            <div className="py-8 flex justify-center"><Spinner /></div>
          ) : movements.length === 0 ? (
            <div className="py-8 text-center text-text-muted text-sm">
              Sin movimientos registrados. Usa el botón de arriba para agregar.
            </div>
          ) : (
            <div className="divide-y divide-surface-light/30">
              {[...movements].sort((a, b) => b.date.localeCompare(a.date)).map(mov => (
                <div key={mov.id} className="flex items-start justify-between px-5 py-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${movTypeColors[mov.type]}`}>
                        {movTypeLabels[mov.type]}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted">{mov.date}{mov.notes ? ` · ${mov.notes}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-3 ml-3">
                    <span className={`font-semibold ${mov.type === 'payment' ? 'text-primary' : 'text-danger'}`}>
                      {mov.type === 'payment' ? '−' : '+'}{formatCurrency(mov.amount, mov.currency)}
                    </span>
                    <button onClick={() => handleDeleteMovement(mov)} className="text-text-muted hover:text-danger transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    );
  }

  // ─── Loan list ────────────────────────────────────────────
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
            {!editingId && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.createInitialMovement}
                  onChange={e => setForm(f => ({ ...f, createInitialMovement: e.target.checked }))}
                  className="w-4 h-4 rounded accent-primary"
                />
                <span className="text-sm text-text-muted">Registrar monto inicial en el historial</span>
              </label>
            )}
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">{editingId ? 'Guardar' : 'Crear'}</Button>
              <Button type="button" variant="ghost" onClick={resetForm}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Total */}
      <Card>
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1">Deuda total activa</p>
        <p className="text-3xl font-bold text-danger">{formatCurrency(Math.abs(totalDebt))}</p>
      </Card>

      {/* Active loans */}
      <div className="space-y-2">
        {loading ? <Spinner fullPage /> : liabilities.length === 0 ? (
          <div className="text-center py-10 text-text-muted"><p className="text-sm">No hay préstamos registrados</p></div>
        ) : liabilities.map((liab: any) => {
          const balance = parseFloat(liab.current_balance || liab.amount || '0');
          const original = parseFloat(liab.amount || '0');
          const paid = original > 0 ? Math.min(100, ((original - balance) / original) * 100) : 0;
          const currency = liab.currency || 'USD';
          return (
            <Card key={liab.id} padding="sm" className="cursor-pointer hover:border-surface-elevated transition-colors" >
              <div className="flex items-start justify-between" onClick={() => openDetail(liab)}>
                <div className="flex-1">
                  <p className="font-medium">{liab.name}</p>
                  <p className="text-xs text-text-muted mt-0.5">{typeLabels[liab.type] || liab.type} · {currency}</p>
                  {liab.interest_rate > 0 && (
                    <p className="text-xs text-text-muted mt-1">{liab.interest_rate}% · Vence: {liab.due_date || 'Sin fecha'}</p>
                  )}
                </div>
                <div className="ml-3 text-right">
                  <p className="font-bold text-lg text-danger">{formatCurrency(balance, currency)}</p>
                  <p className="text-xs text-text-muted">{paid.toFixed(0)}% pagado</p>
                </div>
              </div>
              {original > 0 && (
                <div className="mt-3">
                  <div className="w-full bg-surface-light rounded-full h-1.5">
                    <div className="bg-primary rounded-full h-1.5 transition-all" style={{ width: `${paid}%` }} />
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Archived loans */}
      {archivedList.length > 0 && (
        <div>
          <button onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-2 text-sm text-text-muted hover:text-text transition-colors mb-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`transition-transform ${showArchived ? 'rotate-90' : ''}`}>
              <path d="M9 18l6-6-6-6" />
            </svg>
            {showArchived ? 'Ocultar' : 'Ver'} archivados ({archivedList.length})
          </button>
          {showArchived && (
            <div className="space-y-2">
              {archivedList.map((liab: any) => (
                <Card key={liab.id} padding="sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-text-muted line-through">{liab.name}</p>
                      <p className="text-xs text-text-muted">{typeLabels[liab.type]} · Pagado {liab.paid_date || ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">Pagado</span>
                      <span className="text-sm font-medium text-text-muted">{formatCurrency(parseFloat(liab.amount || '0'), liab.currency)}</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
