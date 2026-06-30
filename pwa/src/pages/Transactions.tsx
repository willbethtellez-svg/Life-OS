import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { db } from '@/lib/db';
import { formatCurrency, formatDate, generateId } from '@/lib/utils';
import { Card, CardHeader, CardTitle, Button, Input, Select, Field, Badge } from '@/components/ui';
import type { Transaction, CurrencyCode, TransactionType } from '@/types';

const CURRENCIES: CurrencyCode[] = ['USD', 'VES', 'EUR', 'BTC', 'USDT'];

interface TxForm {
  date: string;
  description: string;
  type: TransactionType;
  amount: string;
  currency: CurrencyCode;
  sourceAccountId: string;
  destAccountId: string;
  categoryId: string;
  piggyBankId: string;
  destPiggyBankId: string;
  foreignAmount: string;
  foreignCurrency: CurrencyCode;
  fee: string;
  notes: string;
  loanId: string;
}

const emptyForm = (): TxForm => ({
  date: new Date().toISOString().split('T')[0],
  description: '', type: 'withdrawal', amount: '', currency: 'USD',
  sourceAccountId: '', destAccountId: '', categoryId: '',
  piggyBankId: '', destPiggyBankId: '',
  foreignAmount: '', foreignCurrency: 'USD',
  fee: '', notes: '', loanId: '',
});

const typeLabel: Record<TransactionType, string> = {
  withdrawal: 'Gasto', deposit: 'Ingreso', transfer: 'Transferencia',
};
const typeColor: Record<TransactionType, string> = {
  withdrawal: 'text-danger', deposit: 'text-secondary', transfer: 'text-transfer',
};
const typeBg: Record<TransactionType, string> = {
  withdrawal: 'bg-danger/10 text-danger', deposit: 'bg-secondary/10 text-secondary', transfer: 'bg-transfer/10 text-transfer',
};

export default function Transactions() {
  const { accounts, categories, jars, liabilities } = useAppStore();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<TxForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');

  async function loadTxs(params?: { type?: string; start?: string; end?: string }) {
    setLoading(true);
    const data = await db.transactions.list({
      limit: 100,
      type: params?.type || undefined,
      start: params?.start || undefined,
      end: params?.end || undefined,
    });
    setTxs(data);
    setLoading(false);
  }

  useEffect(() => { loadTxs(); }, []);

  function openForm() {
    setForm(emptyForm());
    setError('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setForm(emptyForm());
    setError('');
  }

  const f = (k: keyof TxForm, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const amt = parseFloat(form.amount) || 0;
    const payload: Partial<Transaction> = {
      date: form.date,
      description: form.description,
      type: form.type,
      amount: amt,
      currency: form.currency,
      source_account_id: (form.type === 'withdrawal' || form.type === 'transfer') ? (form.sourceAccountId || null) : null,
      destination_account_id: (form.type === 'deposit' || form.type === 'transfer') ? (form.destAccountId || null) : null,
      category_id: form.categoryId || null,
      piggy_bank_id: form.piggyBankId || null,
      destination_piggy_bank_id: form.type === 'transfer' ? (form.destPiggyBankId || null) : null,
      foreign_amount: form.foreignAmount ? parseFloat(form.foreignAmount) : null,
      foreign_currency: form.foreignAmount ? form.foreignCurrency : null,
      fee: parseFloat(form.fee) || 0,
      notes: form.notes,
      confirmed: true,
      reconciled: false,
    };

    // Optimistic: build a fake enriched tx
    const getAccName = (id: string) => accounts.find(a => a.id === id)?.name ?? null;
    const getCatName = (id: string) => categories.find(c => c.id === id)?.name ?? null;
    const getJarName = (id: string) => jars.find(j => j.id === id)?.name ?? null;

    const tempId = generateId();
    const optimistic: Transaction = {
      ...payload as Transaction,
      id: tempId, user_id: '', amount_usd: amt, created_at: new Date().toISOString(),
      fee_currency: null,
      source_name: payload.source_account_id ? getAccName(payload.source_account_id) : null,
      destination_name: payload.destination_account_id ? getAccName(payload.destination_account_id) : null,
      category_name: payload.category_id ? getCatName(payload.category_id) : null,
      piggy_bank_name: payload.piggy_bank_id ? getJarName(payload.piggy_bank_id) : null,
      destination_piggy_bank_name: payload.destination_piggy_bank_id ? getJarName(payload.destination_piggy_bank_id) : null,
    };

    setTxs(prev => [optimistic, ...prev]);
    closeForm();

    try {
      const real = await db.transactions.create(payload);
      setTxs(prev => prev.map(t => t.id === tempId ? { ...real,
        source_name: getAccName(real.source_account_id ?? ''),
        destination_name: getAccName(real.destination_account_id ?? ''),
        category_name: getCatName(real.category_id ?? ''),
        piggy_bank_name: getJarName(real.piggy_bank_id ?? ''),
        destination_piggy_bank_name: getJarName(real.destination_piggy_bank_id ?? ''),
      } : t));

      // Link to loan if selected
      if (form.loanId && (form.type === 'withdrawal' || form.type === 'deposit')) {
        const movType = form.type === 'withdrawal' ? 'payment' : 'increase';
        await db.liabilities.addMovement({
          liability_id: form.loanId,
          date: form.date,
          type: movType,
          amount: amt,
          currency: form.currency,
          notes: form.description || '',
          transaction_id: real.id,
        });
      }
    } catch {
      setTxs(prev => prev.filter(t => t.id !== tempId));
      setError('Error al crear la transacción');
      setShowForm(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(tx: Transaction) {
    setTxs(prev => prev.filter(t => t.id !== tx.id));
    try {
      await db.transactions.delete(tx.id);
    } catch {
      setTxs(prev => [tx, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      setError('Error al eliminar');
    }
  }

  function applyFilter() {
    loadTxs({ type: filterType || undefined, start: filterStart || undefined, end: filterEnd || undefined });
  }

  const assetAccounts = accounts.filter(a => a.type === 'asset');
  const showSource = form.type === 'withdrawal' || form.type === 'transfer';
  const showDest = form.type === 'deposit' || form.type === 'transfer';
  const jarLabel = form.type === 'deposit' ? 'Jarra (destino)' : form.type === 'withdrawal' ? 'Jarra (origen)' : 'Jarra origen';
  const activeLoans = liabilities.filter(l => !l.archived);

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text">Transacciones</h1>
        <Button onClick={openForm}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
          Nueva
        </Button>
      </div>

      {error && <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-sm text-danger">{error}</div>}

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-wrap gap-3 items-end">
          <Field label="Tipo" className="w-36">
            <Select value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">Todos</option>
              <option value="withdrawal">Gastos</option>
              <option value="deposit">Ingresos</option>
              <option value="transfer">Transferencias</option>
            </Select>
          </Field>
          <Field label="Desde" className="flex-1 min-w-[120px]">
            <Input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} />
          </Field>
          <Field label="Hasta" className="flex-1 min-w-[120px]">
            <Input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} />
          </Field>
          <Button variant="outline" size="sm" onClick={applyFilter}>Filtrar</Button>
          {(filterType || filterStart || filterEnd) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterType(''); setFilterStart(''); setFilterEnd(''); loadTxs(); }}>
              Limpiar
            </Button>
          )}
        </div>
      </Card>

      {/* Desktop table */}
      <Card padding="none" className="hidden sm:block">
        {loading ? (
          <div className="flex justify-center py-12"><span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-light/40 text-xs text-text-muted">
                <th className="px-5 py-3 text-left">Fecha</th>
                <th className="px-5 py-3 text-left">Descripción</th>
                <th className="px-5 py-3 text-left">Tipo</th>
                <th className="px-5 py-3 text-left">Cuenta</th>
                <th className="px-5 py-3 text-left">Categoría</th>
                <th className="px-5 py-3 text-right">Monto</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-light/40">
              {txs.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-text-muted">Sin transacciones</td></tr>
              ) : txs.map(tx => (
                <tr key={tx.id} className="hover:bg-surface-elevated/50 group">
                  <td className="px-5 py-3 text-text-muted whitespace-nowrap">{formatDate(tx.date)}</td>
                  <td className="px-5 py-3 text-text max-w-[200px] truncate">{tx.description || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeBg[tx.type]}`}>
                      {typeLabel[tx.type]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-text-muted max-w-[150px] truncate">
                    {tx.source_name || tx.destination_name || '—'}
                  </td>
                  <td className="px-5 py-3 text-text-muted">{tx.category_name || '—'}</td>
                  <td className={`px-5 py-3 text-right font-semibold font-mono ${typeColor[tx.type]}`}>
                    {tx.type === 'withdrawal' ? '−' : tx.type === 'deposit' ? '+' : ''}
                    {formatCurrency(parseFloat(String(tx.amount)), tx.currency)}
                  </td>
                  <td className="px-3 py-3">
                    <Button size="icon" variant="danger" className="opacity-0 group-hover:opacity-100" onClick={() => handleDelete(tx)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></svg>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-2">
        {loading ? (
          <div className="flex justify-center py-10"><span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : txs.length === 0 ? (
          <Card className="text-center py-10">
            <p className="text-text-muted">Sin transacciones</p>
          </Card>
        ) : txs.map(tx => (
          <Card key={tx.id} padding="sm">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-medium text-text truncate">{tx.description || '—'}</p>
                </div>
                <p className="text-xs text-text-muted">
                  {formatDate(tx.date)} · {typeLabel[tx.type]}
                  {tx.source_name && ` · ${tx.source_name}`}
                  {tx.category_name && ` · ${tx.category_name}`}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-semibold ${typeColor[tx.type]}`}>
                  {tx.type === 'withdrawal' ? '−' : tx.type === 'deposit' ? '+' : ''}
                  {formatCurrency(parseFloat(String(tx.amount)), tx.currency)}
                </p>
                <button onClick={() => handleDelete(tx)} className="text-danger/60 hover:text-danger text-xs mt-0.5">Eliminar</button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* FAB for mobile */}
      <button
        onClick={openForm}
        className="sm:hidden fixed bottom-20 right-4 w-14 h-14 bg-primary rounded-full shadow-lg flex items-center justify-center text-white z-20"
        style={{ boxShadow: '0 4px 20px rgba(22,163,74,0.4)' }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
      </button>

      {/* Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative w-full sm:max-w-lg bg-surface rounded-t-2xl sm:rounded-2xl border border-surface-light/60 z-10 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-surface border-b border-surface-light/40 px-5 py-4">
              <div className="w-10 h-1 bg-surface-light rounded-full mx-auto mb-3 sm:hidden" />
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-text">Nueva transacción</h2>
                <button onClick={closeForm} className="text-text-muted hover:text-text">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && <div className="bg-danger/10 border border-danger/30 rounded-xl px-3 py-2 text-sm text-danger">{error}</div>}

              {/* Type selector */}
              <div className="grid grid-cols-3 gap-2">
                {(['withdrawal', 'deposit', 'transfer'] as TransactionType[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => f('type', t)}
                    className={`py-2.5 rounded-xl text-sm font-medium transition-colors border ${
                      form.type === t
                        ? t === 'withdrawal' ? 'border-danger bg-danger/10 text-danger'
                          : t === 'deposit' ? 'border-secondary bg-secondary/10 text-secondary'
                          : 'border-transfer bg-transfer/10 text-transfer'
                        : 'border-surface-light text-text-muted hover:border-text-muted'
                    }`}
                  >{typeLabel[t]}</button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Fecha">
                  <Input type="date" value={form.date} onChange={e => f('date', e.target.value)} required />
                </Field>
                <Field label="Moneda">
                  <Select value={form.currency} onChange={e => f('currency', e.target.value)}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Field>
              </div>

              <Field label="Descripción">
                <Input value={form.description} onChange={e => f('description', e.target.value)} placeholder="Ej: Supermercado" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Monto">
                  <Input type="number" step="any" min="0" value={form.amount} onChange={e => f('amount', e.target.value)} placeholder="0.00" required />
                </Field>
                <Field label="Comisión">
                  <Input type="number" step="any" min="0" value={form.fee} onChange={e => f('fee', e.target.value)} placeholder="0.00" />
                </Field>
              </div>

              {showSource && (
                <Field label="Cuenta origen">
                  <Select value={form.sourceAccountId} onChange={e => f('sourceAccountId', e.target.value)}>
                    <option value="">— Sin cuenta —</option>
                    {assetAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                  </Select>
                </Field>
              )}

              {showDest && (
                <Field label="Cuenta destino">
                  <Select value={form.destAccountId} onChange={e => f('destAccountId', e.target.value)}>
                    <option value="">— Sin cuenta —</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                  </Select>
                </Field>
              )}

              {form.type === 'transfer' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Monto destino (si diferente)">
                    <Input type="number" step="any" min="0" value={form.foreignAmount} onChange={e => f('foreignAmount', e.target.value)} placeholder="0.00" />
                  </Field>
                  <Field label="Moneda destino">
                    <Select value={form.foreignCurrency} onChange={e => f('foreignCurrency', e.target.value)}>
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </Select>
                  </Field>
                </div>
              )}

              <Field label="Categoría">
                <Select value={form.categoryId} onChange={e => f('categoryId', e.target.value)}>
                  <option value="">— Sin categoría —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>

              <Field label={jarLabel}>
                <Select value={form.piggyBankId} onChange={e => f('piggyBankId', e.target.value)}>
                  <option value="">— Sin jarra —</option>
                  {jars.map(j => <option key={j.id} value={j.id}>{j.name} ({j.currency})</option>)}
                </Select>
              </Field>

              {form.type === 'transfer' && (
                <Field label="Jarra destino">
                  <Select value={form.destPiggyBankId} onChange={e => f('destPiggyBankId', e.target.value)}>
                    <option value="">— Sin jarra —</option>
                    {jars.map(j => <option key={j.id} value={j.id}>{j.name} ({j.currency})</option>)}
                  </Select>
                </Field>
              )}

              {form.type !== 'transfer' && activeLoans.length > 0 && (
                <Field label="Vincular a préstamo">
                  <Select value={form.loanId} onChange={e => f('loanId', e.target.value)}>
                    <option value="">— No vincular —</option>
                    {activeLoans.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </Select>
                </Field>
              )}

              <Field label="Notas">
                <Input value={form.notes} onChange={e => f('notes', e.target.value)} placeholder="Opcional..." />
              </Field>

              <div className="flex gap-3 pt-1">
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
