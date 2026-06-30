import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { db } from '@/lib/db';
import { formatCurrency, formatDate, generateId } from '@/lib/utils';
import { Card, CardHeader, CardTitle, Button, Input, Select, Field } from '@/components/ui';
import type { PiggyBank, CurrencyCode, Transaction, ExchangeRate } from '@/types';

const CURRENCIES: CurrencyCode[] = ['USD', 'VES', 'EUR', 'BTC', 'USDT'];

// Convierte un monto a USD usando la tasa más cercana a la fecha dada (o la más reciente disponible)
function toUSDClient(amount: number, currency: string, rates: ExchangeRate[], date?: string | null): number {
  if (currency === 'USD' || currency === 'USDT') return amount;
  let rate = date ? rates.find(r => r.date === date && r.to_currency === currency)?.rate : undefined;
  if (!rate) {
    rate = [...rates].filter(r => r.to_currency === currency).sort((a, b) => b.date.localeCompare(a.date))[0]?.rate;
  }
  if (!rate) return amount;
  return amount / rate;
}

interface JarForm {
  name: string;
  currency: CurrencyCode;
  initial_amount: string;
  target_amount: string;
  start_date: string;
  target_date: string;
  notes: string;
}

const emptyForm = (): JarForm => ({
  name: '', currency: 'USD', initial_amount: '0', target_amount: '', start_date: '', target_date: '', notes: '',
});

export default function Jars() {
  const { jars, addJar, updateJar, exchangeRates } = useAppStore();
  const [form, setForm] = useState<JarForm>(emptyForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Ledger state
  const [ledger, setLedger] = useState<PiggyBank | null>(null);
  const [txHistory, setTxHistory] = useState<Transaction[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');

  function openForm(jar?: PiggyBank) {
    if (jar) {
      setEditId(jar.id);
      setForm({
        name: jar.name,
        currency: jar.currency,
        initial_amount: String(jar.initial_amount ?? 0),
        target_amount: String(jar.target_amount),
        start_date: jar.start_date || '',
        target_date: jar.target_date || '',
        notes: jar.notes || '',
      });
    } else {
      setEditId(null);
      setForm(emptyForm());
    }
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditId(null);
    setForm(emptyForm());
    setError('');
  }

  const f = (k: keyof JarForm, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const initial = parseFloat(form.initial_amount) || 0;
    const target = parseFloat(form.target_amount) || 0;
    const payload = {
      name: form.name,
      currency: form.currency as CurrencyCode,
      initial_amount: initial,
      target_amount: target,
      start_date: form.start_date || null,
      target_date: form.target_date || null,
      notes: form.notes,
    };
    try {
      if (editId) {
        const prev = jars.find(j => j.id === editId)!;
        updateJar(editId, { ...prev, ...payload });
        closeForm();
        const real = await db.piggyBanks.update(editId, payload);
        updateJar(editId, real);
      } else {
        const tempId = generateId();
        const optimistic: PiggyBank = {
          id: tempId, user_id: '', current_amount: initial, created_at: new Date().toISOString(), ...payload,
        };
        addJar(optimistic);
        closeForm();
        // Set current_amount = initial_amount when creating
        const real = await db.piggyBanks.create({ ...payload, current_amount: initial });
        updateJar(tempId, real);
      }
    } catch {
      setError('Error al guardar la jarra');
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  async function openLedger(jar: PiggyBank) {
    setLedger(jar);
    setLedgerLoading(true);
    setFilterStart('');
    setFilterEnd('');
    setSortOrder('asc');
    const txs = await db.piggyBanks.transactions(jar.id);
    setTxHistory(txs);
    setLedgerLoading(false);
  }

  async function applyFilter() {
    if (!ledger) return;
    setLedgerLoading(true);
    const txs = await db.piggyBanks.transactions(ledger.id, {
      start: filterStart || undefined,
      end: filterEnd || undefined,
    });
    setTxHistory(txs);
    setLedgerLoading(false);
  }

  // El monto USD de cada movimiento viene directo de tx.amount_usd (ya calculado y
  // persistido server-side con la tasa del día), así que es siempre el valor real
  // del movimiento sin importar en qué moneda se registró la transacción. El monto
  // nativo se muestra solo como referencia pequeña.
  function getTxAmount(tx: Transaction, jarId: string): { amountUsd: number; isIn: boolean; nativeAmount: number; nativeCurrency: string } {
    const isDestJar = tx.destination_piggy_bank_id === jarId;
    const isSrcJar = tx.piggy_bank_id === jarId;
    const amountUsd = parseFloat(String(tx.amount_usd ?? 0));
    if (tx.type === 'deposit' && isSrcJar) return { amountUsd, isIn: true, nativeAmount: parseFloat(String(tx.amount)), nativeCurrency: tx.currency };
    if (tx.type === 'withdrawal' && isSrcJar) return { amountUsd, isIn: false, nativeAmount: parseFloat(String(tx.amount)), nativeCurrency: tx.currency };
    if (tx.type === 'transfer' && isSrcJar) return { amountUsd, isIn: false, nativeAmount: parseFloat(String(tx.amount)), nativeCurrency: tx.currency };
    if (tx.type === 'transfer' && isDestJar) {
      const nativeAmount = tx.foreign_amount != null ? parseFloat(String(tx.foreign_amount)) : parseFloat(String(tx.amount));
      const nativeCurrency = tx.foreign_currency || tx.currency;
      return { amountUsd, isIn: true, nativeAmount, nativeCurrency };
    }
    return { amountUsd: 0, isIn: true, nativeAmount: 0, nativeCurrency: 'USD' };
  }

  function computeRunningBalanceUSD(index: number, txList: Transaction[]): number {
    if (!ledger) return 0;
    const initialDate = ledger.start_date || ledger.created_at?.split('T')[0] || null;
    const initial = toUSDClient(parseFloat(String(ledger.initial_amount ?? 0)), ledger.currency, exchangeRates, initialDate);
    let bal = initial;
    for (let i = 0; i <= index; i++) {
      const { amountUsd, isIn } = getTxAmount(txList[i], ledger.id);
      bal += isIn ? amountUsd : -amountUsd;
    }
    return bal;
  }

  const displayTxs = [...txHistory].sort((a, b) =>
    sortOrder === 'asc' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)
  );

  // ── Ledger view ──────────────────────────────────────────────
  if (ledger) {
    const current = parseFloat(String(ledger.current_amount));
    const target = parseFloat(String(ledger.target_amount));
    const initial = parseFloat(String(ledger.initial_amount ?? 0));
    const initialDate = ledger.start_date || ledger.created_at?.split('T')[0] || null;
    const initialUsd = toUSDClient(initial, ledger.currency, exchangeRates, initialDate);
    const currentUsd = toUSDClient(current, ledger.currency, exchangeRates, null);
    const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;

    return (
      <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setLedger(null)} className="text-text-muted hover:text-text p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-text">{ledger.name}</h1>
            <p className="text-xs text-text-muted">{ledger.currency} · {Math.round(pct)}% alcanzado</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => openForm(ledger)}>Editar</Button>
        </div>

        {/* Progress */}
        <Card padding="sm">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-text-muted">Ahorrado</span>
            <span className="font-semibold text-text">{formatCurrency(current, ledger.currency)} / {formatCurrency(target, ledger.currency)}</span>
          </div>
          {ledger.currency !== 'USD' && (
            <p className="text-xs text-text-muted text-right mb-2">≈ {formatCurrency(currentUsd, 'USD')}</p>
          )}
          <div className="w-full h-2 bg-surface-light rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </Card>

        {/* Filters */}
        <Card padding="sm">
          <div className="flex flex-wrap gap-3 items-end">
            <Field label="Desde" className="flex-1 min-w-[120px]">
              <Input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} />
            </Field>
            <Field label="Hasta" className="flex-1 min-w-[120px]">
              <Input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} />
            </Field>
            <Button variant="outline" size="sm" onClick={applyFilter}>Filtrar</Button>
            <Button variant="ghost" size="sm" onClick={() => setSortOrder(s => s === 'asc' ? 'desc' : 'asc')}>
              {sortOrder === 'asc' ? '↑ Antiguo' : '↓ Nuevo'}
            </Button>
          </div>
        </Card>

        {/* Desktop table */}
        <Card padding="none" className="hidden sm:block">
          {ledgerLoading ? (
            <div className="flex justify-center py-10"><span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-light/40 text-xs text-text-muted">
                  <th className="px-5 py-3 text-left">Fecha</th>
                  <th className="px-5 py-3 text-left">Descripción</th>
                  <th className="px-5 py-3 text-right">Entrada</th>
                  <th className="px-5 py-3 text-right">Salida</th>
                  <th className="px-5 py-3 text-right">Saldo (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-light/40">
                {/* Opening balance row */}
                <tr className="bg-surface-elevated/40">
                  <td className="px-5 py-2 text-xs text-text-muted">{ledger.created_at.split('T')[0]}</td>
                  <td className="px-5 py-2 text-xs text-text-muted italic">Saldo inicial</td>
                  <td className="px-5 py-2" />
                  <td className="px-5 py-2" />
                  <td className="px-5 py-2 text-right">
                    <p className="text-xs font-mono text-text-muted">{formatCurrency(initialUsd, 'USD')}</p>
                    {ledger.currency !== 'USD' && (
                      <p className="text-[10px] text-text-muted/70 font-mono">{formatCurrency(initial, ledger.currency)}</p>
                    )}
                  </td>
                </tr>
                {displayTxs.map((tx, i) => {
                  const { amountUsd, isIn, nativeAmount, nativeCurrency } = getTxAmount(tx, ledger.id);
                  const runBal = computeRunningBalanceUSD(i, displayTxs);
                  const showRef = nativeCurrency !== 'USD';
                  return (
                    <tr key={tx.id} className="hover:bg-surface-elevated/50">
                      <td className="px-5 py-3 text-text-muted">{formatDate(tx.date)}</td>
                      <td className="px-5 py-3 text-text">{tx.description || '—'}</td>
                      <td className="px-5 py-3 text-right font-mono text-secondary">
                        {isIn && (
                          <>
                            <p>{formatCurrency(amountUsd, 'USD')}</p>
                            {showRef && <p className="text-[10px] text-secondary/70">{formatCurrency(nativeAmount, nativeCurrency)}</p>}
                          </>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-danger">
                        {!isIn && (
                          <>
                            <p>{formatCurrency(amountUsd, 'USD')}</p>
                            {showRef && <p className="text-[10px] text-danger/70">{formatCurrency(nativeAmount, nativeCurrency)}</p>}
                          </>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-text">
                        {formatCurrency(runBal, 'USD')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        {/* Mobile list */}
        <div className="sm:hidden space-y-2">
          {/* Opening balance card */}
          <Card padding="sm" className="bg-surface-elevated/40">
            <div className="flex items-center justify-between">
              <p className="text-xs text-text-muted italic">Saldo inicial</p>
              <div className="text-right">
                <p className="text-xs font-mono text-text-muted">{formatCurrency(initialUsd, 'USD')}</p>
                {ledger.currency !== 'USD' && (
                  <p className="text-[10px] text-text-muted/70 font-mono">{formatCurrency(initial, ledger.currency)}</p>
                )}
              </div>
            </div>
          </Card>
          {ledgerLoading ? (
            <div className="flex justify-center py-10"><span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : displayTxs.map((tx, i) => {
            const { amountUsd, isIn, nativeAmount, nativeCurrency } = getTxAmount(tx, ledger.id);
            const runBal = computeRunningBalanceUSD(i, displayTxs);
            const showRef = nativeCurrency !== 'USD';
            return (
              <Card key={tx.id} padding="sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text">{tx.description || '—'}</p>
                    <p className="text-xs text-text-muted">{formatDate(tx.date)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${isIn ? 'text-secondary' : 'text-danger'}`}>
                      {isIn ? '+' : '−'}{formatCurrency(amountUsd, 'USD')}
                    </p>
                    {showRef && (
                      <p className={`text-[10px] ${isIn ? 'text-secondary/70' : 'text-danger/70'}`}>
                        {formatCurrency(nativeAmount, nativeCurrency)}
                      </p>
                    )}
                    <p className="text-xs text-text-muted font-mono">{formatCurrency(runBal, 'USD')}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text">Jarras</h1>
        <Button onClick={() => openForm()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
          Nueva
        </Button>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-sm text-danger">{error}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {jars.map(jar => {
          const current = parseFloat(String(jar.current_amount));
          const target = parseFloat(String(jar.target_amount));
          const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
          return (
            <Card key={jar.id} padding="sm" className="cursor-pointer hover:border-surface-light transition-colors" onClick={() => openLedger(jar)}>
              <div className="flex items-start justify-between mb-3">
                <p className="font-semibold text-text truncate flex-1 mr-2">{jar.name}</p>
                <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  <Button size="icon" variant="ghost" onClick={() => openForm(jar)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </Button>
                </div>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-text-muted">{Math.round(pct)}%</span>
                <span className="text-text-muted">{jar.currency}</span>
              </div>
              <div className="w-full h-1.5 bg-surface-light rounded-full overflow-hidden mb-2">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between text-xs text-text-muted">
                <span>{formatCurrency(current, jar.currency)}</span>
                <span>Meta: {formatCurrency(target, jar.currency)}</span>
              </div>
            </Card>
          );
        })}
      </div>

      {jars.length === 0 && (
        <Card className="text-center py-12">
          <p className="text-text-muted mb-3">Sin jarras aún</p>
          <Button onClick={() => openForm()}>Crear primera jarra</Button>
        </Card>
      )}

      {/* Form — bottom sheet on mobile */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative w-full lg:max-w-md bg-surface rounded-t-2xl lg:rounded-2xl border border-surface-light/60 p-5 z-10">
            <div className="w-10 h-1 bg-surface-light rounded-full mx-auto mb-5 lg:hidden" />
            <h2 className="text-base font-semibold text-text mb-4">
              {editId ? 'Editar jarra' : 'Nueva jarra'}
            </h2>
            {error && <div className="bg-danger/10 border border-danger/30 rounded-xl px-3 py-2 text-sm text-danger mb-3">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-3">
              <Field label="Nombre">
                <Input value={form.name} onChange={e => f('name', e.target.value)} placeholder="Ej: Viaje, Emergencias..." required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Moneda">
                  <Select value={form.currency} onChange={e => f('currency', e.target.value)}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Field>
                <Field label="Saldo inicial">
                  <Input type="number" step="any" min="0" value={form.initial_amount} onChange={e => f('initial_amount', e.target.value)} placeholder="0.00" />
                </Field>
              </div>
              <Field label="Meta">
                <Input type="number" step="any" min="0" value={form.target_amount} onChange={e => f('target_amount', e.target.value)} placeholder="0.00" required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Fecha inicio">
                  <Input type="date" value={form.start_date} onChange={e => f('start_date', e.target.value)} />
                </Field>
                <Field label="Fecha meta">
                  <Input type="date" value={form.target_date} onChange={e => f('target_date', e.target.value)} />
                </Field>
              </div>
              <Field label="Notas">
                <Input value={form.notes} onChange={e => f('notes', e.target.value)} placeholder="Opcional..." />
              </Field>
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
