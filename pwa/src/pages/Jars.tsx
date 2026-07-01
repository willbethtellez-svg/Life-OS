import { useEffect, useState } from 'react';
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

// Convierte un monto en USD a otra moneda usando la tasa más cercana a la fecha dada
function usdToCurrencyClient(amountUsd: number, currency: string, rates: ExchangeRate[], date?: string | null): number {
  if (currency === 'USD' || currency === 'USDT') return amountUsd;
  let rate = date ? rates.find(r => r.date === date && r.to_currency === currency)?.rate : undefined;
  if (!rate) {
    rate = [...rates].filter(r => r.to_currency === currency).sort((a, b) => b.date.localeCompare(a.date))[0]?.rate;
  }
  if (!rate) return amountUsd;
  return amountUsd * rate;
}

const jarTypeLabelEs: Record<string, string> = { withdrawal: 'gasto', deposit: 'ingreso', transfer: 'transferencia' };

interface JarLedgerEntry {
  key: string;
  date: string;
  description: string;
  amountUsd: number;
  nativeAmount: number;
  nativeCurrency: string;
  isIn: boolean;
  isFee: boolean;
}

// Genera todas las entradas de una transacción para una jarra dada. Una
// transferencia cuya jarra de origen y destino son la MISMA jarra (uso común:
// "mover" dinero entre cuentas dejando constancia solo de la comisión) debe
// producir DOS entradas — la salida y la vuelta a entrar — no solo una; antes
// se usaba un if/return secuencial que devolvía la primera rama que aplicara,
// por lo que la entrada nunca se veía en ese caso. El monto USD de cada
// movimiento viene directo de tx.amount_usd (ya calculado y persistido
// server-side con la tasa del día); el monto nativo se muestra solo como
// referencia pequeña en el libro contable.
function buildJarEntries(jarId: string, txs: Transaction[]): JarLedgerEntry[] {
  const entries: JarLedgerEntry[] = [];
  for (const tx of txs) {
    const isSrcJar = tx.piggy_bank_id === jarId;
    const isDestJar = tx.destination_piggy_bank_id === jarId;
    const amountUsd = parseFloat(String(tx.amount_usd ?? 0));
    const nativeAmount = parseFloat(String(tx.amount));
    const nativeCurrency = tx.currency;

    if (tx.type === 'deposit' && isSrcJar) {
      entries.push({ key: tx.id, date: tx.date, description: tx.description, amountUsd, nativeAmount, nativeCurrency, isIn: true, isFee: false });
    }
    if (tx.type === 'withdrawal' && isSrcJar) {
      entries.push({ key: tx.id, date: tx.date, description: tx.description, amountUsd, nativeAmount, nativeCurrency, isIn: false, isFee: false });
    }
    if (tx.type === 'transfer') {
      if (isSrcJar) {
        entries.push({ key: `${tx.id}-out`, date: tx.date, description: tx.description, amountUsd, nativeAmount, nativeCurrency, isIn: false, isFee: false });
      }
      if (isDestJar) {
        const destNativeAmount = tx.foreign_amount != null ? parseFloat(String(tx.foreign_amount)) : nativeAmount;
        const destNativeCurrency = tx.foreign_currency || tx.currency;
        entries.push({ key: `${tx.id}-in`, date: tx.date, description: tx.description, amountUsd, nativeAmount: destNativeAmount, nativeCurrency: destNativeCurrency, isIn: true, isFee: false });
      }
    }

    // La comisión sale de la jarra referenciada como origen (piggy_bank_id),
    // igual que en el libro contable de cuentas — nunca de la jarra destino.
    const fee = parseFloat(String(tx.fee || 0));
    if (fee > 0 && isSrcJar) {
      const unitUsdRate = nativeAmount > 0 ? amountUsd / nativeAmount : 0;
      entries.push({
        key: `${tx.id}-fee`,
        date: tx.date,
        description: `Comisión de "${tx.description || jarTypeLabelEs[tx.type] || tx.type}"`,
        amountUsd: fee * unitUsdRate,
        nativeAmount: fee,
        nativeCurrency,
        isIn: false,
        isFee: true,
      });
    }
  }
  return entries;
}

// Saldo en la moneda propia de la jarra: arranca en initial_amount (ya está en
// la moneda de la jarra) y convierte cada movimiento (vía su amount_usd, el
// valor ya calculado server-side) a esa misma moneda — la misma fuente que
// alimenta el libro contable, para que nunca haya dos cifras distintas.
function computeJarFinalBalance(jar: PiggyBank, txs: Transaction[], rates: ExchangeRate[]): number {
  let bal = parseFloat(String(jar.initial_amount ?? 0));
  for (const e of buildJarEntries(jar.id, txs)) {
    const native = usdToCurrencyClient(e.amountUsd, jar.currency, rates, e.date);
    bal += e.isIn ? native : -native;
  }
  return bal;
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

  // Saldos (en moneda propia de cada jarra) calculados en vivo desde los
  // movimientos reales — la misma función que alimenta el libro contable.
  const [balances, setBalances] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(jars.map(async (jar) => {
        const txs = await db.piggyBanks.transactions(jar.id);
        return [jar.id, computeJarFinalBalance(jar, txs, exchangeRates)] as const;
      }));
      if (!cancelled) setBalances(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [jars, exchangeRates]);

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

  const displayEntries = ledger ? (() => {
    const sorted = [...txHistory].sort((a, b) =>
      sortOrder === 'asc' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)
    );
    const initialDate = ledger.start_date || ledger.created_at?.split('T')[0] || null;
    let bal = toUSDClient(parseFloat(String(ledger.initial_amount ?? 0)), ledger.currency, exchangeRates, initialDate);
    return buildJarEntries(ledger.id, sorted).map(e => {
      bal += e.isIn ? e.amountUsd : -e.amountUsd;
      return { ...e, runningBalanceUsd: bal };
    });
  })() : [];

  // ── Ledger view ──────────────────────────────────────────────
  if (ledger) {
    const current = balances[ledger.id] ?? parseFloat(String(ledger.current_amount));
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
                {displayEntries.map(e => {
                  const showRef = e.nativeCurrency !== 'USD';
                  return (
                    <tr key={e.key} className={`hover:bg-surface-elevated/50 ${e.isFee ? 'opacity-70' : ''}`}>
                      <td className="px-5 py-3 text-text-muted">{formatDate(e.date)}</td>
                      <td className="px-5 py-3 text-text">{e.description || '—'}</td>
                      <td className="px-5 py-3 text-right font-mono text-secondary">
                        {e.isIn && (
                          <>
                            <p>{formatCurrency(e.amountUsd, 'USD')}</p>
                            {showRef && <p className="text-[10px] text-secondary/70">{formatCurrency(e.nativeAmount, e.nativeCurrency)}</p>}
                          </>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-danger">
                        {!e.isIn && (
                          <>
                            <p>{formatCurrency(e.amountUsd, 'USD')}</p>
                            {showRef && <p className="text-[10px] text-danger/70">{formatCurrency(e.nativeAmount, e.nativeCurrency)}</p>}
                          </>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-text">
                        {formatCurrency(e.runningBalanceUsd, 'USD')}
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
          ) : displayEntries.map(e => {
            const showRef = e.nativeCurrency !== 'USD';
            return (
              <Card key={e.key} padding="sm" className={e.isFee ? 'opacity-70' : ''}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text">{e.description || '—'}</p>
                    <p className="text-xs text-text-muted">{formatDate(e.date)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${e.isIn ? 'text-secondary' : 'text-danger'}`}>
                      {e.isIn ? '+' : '−'}{formatCurrency(e.amountUsd, 'USD')}
                    </p>
                    {showRef && (
                      <p className={`text-[10px] ${e.isIn ? 'text-secondary/70' : 'text-danger/70'}`}>
                        {formatCurrency(e.nativeAmount, e.nativeCurrency)}
                      </p>
                    )}
                    <p className="text-xs text-text-muted font-mono">{formatCurrency(e.runningBalanceUsd, 'USD')}</p>
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
          const current = balances[jar.id] ?? parseFloat(String(jar.current_amount));
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
