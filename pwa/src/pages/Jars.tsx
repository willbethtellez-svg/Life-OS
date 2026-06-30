import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import type { CurrencyCode } from '@/types';

type SortOrder = 'asc' | 'desc';

export default function JarsPage() {
  const [jars, setJars] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [txHistory, setTxHistory] = useState<any[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Ledger filters
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');

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
        const updated = await db.piggyBanks.update(editingId, {
          name: form.name.trim(), target_amount: parseFloat(form.targetAmount) || 0,
          current_amount: parseFloat(form.currentAmount) || 0, currency: form.currency, notes: form.notes,
        });
        setJars(prev => prev.map(j => j.id === editingId ? updated : j));
        // If we're editing the selected jar, update it
        if (selected?.id === editingId) setSelected(updated);
      } else {
        const created = await db.piggyBanks.create({
          name: form.name.trim(), target_amount: parseFloat(form.targetAmount) || 0,
          current_amount: parseFloat(form.currentAmount) || 0, currency: form.currency,
          start_date: new Date().toISOString().split('T')[0], notes: form.notes,
        });
        setJars(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      }
      resetForm();
    } catch (err: any) { setError(err.message || 'Error'); }
  }

  function startEdit(jar: any) {
    setForm({ name: jar.name, targetAmount: jar.target_amount?.toString() || '', currentAmount: jar.current_amount?.toString() || '', currency: jar.currency || 'USD', notes: jar.notes || '' });
    setEditingId(jar.id); setShowForm(true);
  }

  async function openLedger(jar: any) {
    setSelected(jar);
    setTxHistory([]);
    setTxLoading(true);
    try {
      const txs = await db.piggyBanks.transactions(jar.id, {
        start: filterStart || undefined,
        end: filterEnd || undefined,
      });
      setTxHistory(txs);
    } catch (err) { console.error(err); }
    finally { setTxLoading(false); }
  }

  async function applyFilter() {
    if (!selected) return;
    setTxLoading(true);
    try {
      const txs = await db.piggyBanks.transactions(selected.id, {
        start: filterStart || undefined,
        end: filterEnd || undefined,
      });
      setTxHistory(txs);
    } catch (err) { console.error(err); }
    finally { setTxLoading(false); }
  }

  function getSortedTxs() {
    const sorted = [...txHistory].sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }

  function getJarAmount(tx: any, jarId: string): { amount: number; isDebit: boolean } {
    const amt = parseFloat(tx.amount || '0');
    // deposit with piggy_bank_id = money goes TO jar
    if (tx.type === 'deposit' && tx.piggy_bank_id === jarId) return { amount: amt, isDebit: true };
    // destination_piggy_bank_id on transfer = money arrives TO jar
    if (tx.destination_piggy_bank_id === jarId) return { amount: parseFloat(tx.foreign_amount || tx.amount || '0'), isDebit: true };
    // piggy_bank_id on withdrawal/transfer = money leaves FROM jar
    return { amount: amt, isDebit: false };
  }

  function computeRunningBalance(sortedTxs: any[], index: number, jarId: string, initialAmount: number): number {
    let balance = initialAmount;
    for (let i = 0; i <= index; i++) {
      const t = sortedTxs[i];
      if (!t) continue;
      const { amount, isDebit } = getJarAmount(t, jarId);
      if (isDebit) balance += amount;
      else balance -= amount;
    }
    return balance;
  }

  const totalInJars = jars.reduce((s, j) => {
    const cur = j.currency || 'USD';
    if (cur === 'USD' || cur === 'USDT') return s + parseFloat(j.current_amount || '0');
    return s;
  }, 0);

  // ─── Ledger view ──────────────────────────────────────────
  if (selected) {
    const current = parseFloat(selected.current_amount || '0');
    const target = parseFloat(selected.target_amount || '0');
    const currency = selected.currency || 'USD';
    const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
    const sortedTxs = getSortedTxs();

    // Compute initial balance by reversing all transactions from current
    // We show initial_amount from the creation + any manual adjustment
    const initialAmount = parseFloat(selected.initial_balance || '0');

    return (
      <div className="p-4 lg:p-6 space-y-4 max-w-4xl">
        <div className="flex items-center gap-3">
          <button onClick={() => { setSelected(null); setTxHistory([]); setFilterStart(''); setFilterEnd(''); }}
            className="text-text-muted hover:text-text p-2 rounded-xl hover:bg-surface-elevated transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">{selected.name}</h1>
            <p className="text-xs text-text-muted">{currency} · Jarra de ahorro</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-primary">{formatCurrency(current, currency)}</p>
            {target > 0 && <p className="text-xs text-text-muted">{pct.toFixed(1)}% de meta</p>}
          </div>
        </div>

        {target > 0 && (
          <div className="w-full bg-surface-light rounded-full h-2">
            <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { startEdit(selected); setSelected(null); }}>
            Editar jarra
          </Button>
        </div>

        {/* Date filter + sort controls */}
        <Card padding="sm">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Desde">
              <Input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="py-1.5 text-sm" />
            </Field>
            <Field label="Hasta">
              <Input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="py-1.5 text-sm" />
            </Field>
            <Button size="sm" variant="outline" onClick={applyFilter}>Filtrar</Button>
            <Button size="sm" variant="ghost" onClick={() => { setFilterStart(''); setFilterEnd(''); applyFilter(); }}>Limpiar</Button>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-text-muted">Orden:</span>
              <button onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
                className="flex items-center gap-1 text-xs text-primary hover:underline">
                {sortOrder === 'asc' ? 'Más antiguo primero' : 'Más reciente primero'}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {sortOrder === 'asc' ? <path d="M12 5v14M5 12l7-7 7 7" /> : <path d="M12 19V5M5 12l7 7 7-7" />}
                </svg>
              </button>
            </div>
          </div>
        </Card>

        {/* Ledger table */}
        <Card padding="none">
          <div className="px-5 py-4 border-b border-surface-light/60">
            <CardTitle>Libro contable — {selected.name}</CardTitle>
          </div>

          {txLoading ? (
            <div className="py-10 flex justify-center"><Spinner /></div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-surface-light/40 bg-surface-elevated/30">
                      <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Fecha</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Descripción</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Tipo</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Entrada</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Salida</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-light/30">
                    {/* Opening balance row */}
                    <tr className="bg-surface-elevated/20">
                      <td className="px-5 py-3 text-sm text-text-muted">{selected.start_date || '—'}</td>
                      <td className="px-5 py-3 text-sm font-medium text-text-muted italic">Saldo inicial</td>
                      <td className="px-5 py-3"></td>
                      <td className="px-5 py-3 text-right text-sm font-medium text-primary">{formatCurrency(initialAmount, currency)}</td>
                      <td className="px-5 py-3"></td>
                      <td className="px-5 py-3 text-right text-sm font-semibold">{formatCurrency(initialAmount, currency)}</td>
                    </tr>
                    {sortedTxs.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-8 text-text-muted text-sm">Sin movimientos</td></tr>
                    ) : (
                      sortedTxs.map((tx: any, i: number) => {
                        const { amount, isDebit } = getJarAmount(tx, selected.id);
                        const running = computeRunningBalance(sortedTxs, i, selected.id, initialAmount);
                        const typeLabel = tx.type === 'deposit' ? 'Ingreso' : tx.type === 'withdrawal' ? 'Gasto' : 'Transferencia';
                        return (
                          <tr key={tx.id} className="hover:bg-surface-elevated/40 transition-colors">
                            <td className="px-5 py-3 text-sm text-text-muted whitespace-nowrap">{tx.date}</td>
                            <td className="px-5 py-3">
                              <p className="text-sm font-medium truncate max-w-xs">{tx.description || 'Sin descripción'}</p>
                              {tx.category_name && <p className="text-[11px] text-text-muted">{tx.category_name}</p>}
                            </td>
                            <td className="px-5 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${
                                tx.type === 'deposit' ? 'text-primary bg-primary/10 border-primary/20' :
                                tx.type === 'withdrawal' ? 'text-danger bg-danger/10 border-danger/20' :
                                'text-transfer bg-transfer/10 border-transfer/20'
                              }`}>{typeLabel}</span>
                            </td>
                            <td className="px-5 py-3 text-right text-sm font-medium text-primary">
                              {isDebit ? formatCurrency(amount, currency) : ''}
                            </td>
                            <td className="px-5 py-3 text-right text-sm font-medium text-danger">
                              {!isDebit ? formatCurrency(amount, currency) : ''}
                            </td>
                            <td className="px-5 py-3 text-right text-sm font-semibold text-text">{formatCurrency(running, currency)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="lg:hidden divide-y divide-surface-light/30">
                <div className="flex items-center justify-between px-5 py-3.5 bg-surface-elevated/20">
                  <div>
                    <p className="text-sm font-medium text-text-muted italic">Saldo inicial</p>
                    <p className="text-xs text-text-muted">{selected.start_date || '—'}</p>
                  </div>
                  <span className="text-sm font-semibold text-primary">{formatCurrency(initialAmount, currency)}</span>
                </div>
                {sortedTxs.length === 0 ? (
                  <div className="py-8 text-center text-text-muted text-sm">Sin movimientos</div>
                ) : (
                  sortedTxs.map((tx: any, i: number) => {
                    const { amount, isDebit } = getJarAmount(tx, selected.id);
                    const running = computeRunningBalance(sortedTxs, i, selected.id, initialAmount);
                    return (
                      <div key={tx.id} className="flex items-center justify-between px-5 py-3.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{tx.description || 'Sin descripción'}</p>
                          <p className="text-xs text-text-muted">{tx.date}{tx.category_name ? ` · ${tx.category_name}` : ''}</p>
                        </div>
                        <div className="text-right ml-3">
                          <span className={`text-sm font-semibold ${isDebit ? 'text-primary' : 'text-danger'}`}>
                            {isDebit ? '+' : '−'}{formatCurrency(amount, currency)}
                          </span>
                          <p className="text-[11px] text-text-muted">{formatCurrency(running, currency)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    );
  }

  // ─── Jar list ─────────────────────────────────────────────
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
              <div className="flex items-center justify-between cursor-pointer" onClick={() => openLedger(jar)}>
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
