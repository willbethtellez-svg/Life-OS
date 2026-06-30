import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { db } from '@/lib/db';
import { formatCurrency, formatDate, generateId } from '@/lib/utils';
import { Card, CardHeader, CardTitle, Button, Input, Select, Field, Badge } from '@/components/ui';
import type { Account, CurrencyCode, Transaction } from '@/types';

const CURRENCIES: CurrencyCode[] = ['USD', 'VES', 'EUR', 'BTC', 'USDT'];
const ACC_TYPES = [{ value: 'asset', label: 'Activo' }, { value: 'liability', label: 'Pasivo' }];

const typeLabelEs: Record<string, string> = { withdrawal: 'gasto', deposit: 'ingreso', transfer: 'transferencia' };

// Una sola fuente de verdad para el saldo: arranca en initial_balance y
// recorre los movimientos reales. La comisión de cada transacción se modela
// como un renglón aparte ("Comisión de ...") que sale de la cuenta que
// originó el movimiento, en vez de mezclarse silenciosamente en el monto.
interface LedgerEntry {
  key: string;
  date: string;
  description: string;
  amount: number;
  isDebit: boolean;
  isFee: boolean;
}

function buildAccountEntries(accountId: string, txs: Transaction[]): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  for (const tx of txs) {
    const isSource = tx.source_account_id === accountId;
    const isDest = tx.destination_account_id === accountId;
    if (isSource) {
      entries.push({ key: tx.id, date: tx.date, description: tx.description, amount: parseFloat(String(tx.amount)), isDebit: true, isFee: false });
    } else if (isDest) {
      const amt = parseFloat(String(tx.foreign_amount ?? tx.amount));
      entries.push({ key: tx.id, date: tx.date, description: tx.description, amount: amt, isDebit: false, isFee: false });
    }
    const fee = parseFloat(String(tx.fee || 0));
    if (fee > 0) {
      const feeAccountId = tx.source_account_id || tx.destination_account_id;
      if (feeAccountId === accountId) {
        entries.push({
          key: `${tx.id}-fee`,
          date: tx.date,
          description: `Comisión de "${tx.description || typeLabelEs[tx.type] || tx.type}"`,
          amount: fee,
          isDebit: true,
          isFee: true,
        });
      }
    }
  }
  return entries;
}

function computeFinalBalance(account: Account, txs: Transaction[]): number {
  const entries = buildAccountEntries(account.id, txs);
  let bal = parseFloat(String(account.initial_balance));
  for (const e of entries) bal += e.isDebit ? -e.amount : e.amount;
  return bal;
}

interface AccForm {
  name: string;
  type: 'asset' | 'liability';
  currency: CurrencyCode;
  initial_balance: string;
  include_in_net_worth: boolean;
}

const emptyForm = (): AccForm => ({
  name: '', type: 'asset', currency: 'USD', initial_balance: '0', include_in_net_worth: true,
});

export default function Accounts() {
  const { accounts, addAccount, updateAccount, removeAccount } = useAppStore();
  const [form, setForm] = useState<AccForm>(emptyForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Saldos calculados en vivo desde los movimientos reales — la misma función
  // que alimenta el libro contable, para que nunca haya dos cifras distintas.
  const [balances, setBalances] = useState<Record<string, number>>({});

  // Ledger state
  const [ledger, setLedger] = useState<Account | null>(null);
  const [txHistory, setTxHistory] = useState<Transaction[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');

  // Se recalcula cada vez que `accounts` cambia de referencia — lo cual ya
  // ocurre tras cada mutación y tras cada refresh automático del store
  // (navegación, regreso de background), así que los saldos quedan al día
  // sin lógica adicional de invalidación.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(accounts.map(async (acc) => {
        const txs = await db.accounts.transactions(acc.id);
        return [acc.id, computeFinalBalance(acc, txs)] as const;
      }));
      if (!cancelled) setBalances(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [accounts]);

  function openForm(acc?: Account) {
    if (acc) {
      setEditId(acc.id);
      setForm({
        name: acc.name, type: acc.type, currency: acc.currency,
        initial_balance: String(acc.initial_balance),
        include_in_net_worth: acc.include_in_net_worth,
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

  const f = (k: keyof AccForm, v: string | boolean) => setForm(prev => ({ ...prev, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const bal = parseFloat(form.initial_balance) || 0;
    try {
      if (editId) {
        const prev = accounts.find(a => a.id === editId)!;
        const optimistic: Account = { ...prev, name: form.name, type: form.type, currency: form.currency as CurrencyCode, initial_balance: bal, include_in_net_worth: form.include_in_net_worth };
        updateAccount(editId, optimistic);
        closeForm();
        const real = await db.accounts.update(editId, { name: form.name, type: form.type, currency: form.currency as CurrencyCode, initial_balance: bal, include_in_net_worth: form.include_in_net_worth });
        updateAccount(editId, real);
      } else {
        const tempId = generateId();
        const optimistic: Account = {
          id: tempId, user_id: '', name: form.name, type: form.type,
          currency: form.currency as CurrencyCode, initial_balance: bal, current_balance: bal,
          include_in_net_worth: form.include_in_net_worth, active: true,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        };
        addAccount(optimistic);
        closeForm();
        const real = await db.accounts.create({ name: form.name, type: form.type, currency: form.currency as CurrencyCode, initial_balance: bal, current_balance: bal, include_in_net_worth: form.include_in_net_worth });
        updateAccount(tempId, real);
      }
    } catch {
      setError('Error al guardar la cuenta');
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const prev = accounts.find(a => a.id === id)!;
    removeAccount(id);
    try {
      await db.accounts.delete(id);
    } catch {
      addAccount(prev);
      setError('Error al eliminar');
    }
  }

  async function openLedger(acc: Account) {
    setLedger(acc);
    setLedgerLoading(true);
    setFilterStart('');
    setFilterEnd('');
    setSortOrder('asc');
    const txs = await db.accounts.transactions(acc.id);
    setTxHistory(txs);
    setLedgerLoading(false);
  }

  async function applyFilter() {
    if (!ledger) return;
    setLedgerLoading(true);
    const txs = await db.accounts.transactions(ledger.id, {
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
    const entries = buildAccountEntries(ledger.id, sorted);
    let bal = parseFloat(String(ledger.initial_balance));
    return entries.map(e => {
      bal += e.isDebit ? -e.amount : e.amount;
      return { ...e, runningBalance: bal };
    });
  })() : [];

  // Ledger view
  if (ledger) {
    const headerBalance = balances[ledger.id] ?? parseFloat(String(ledger.current_balance));
    return (
      <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setLedger(null)} className="text-text-muted hover:text-text p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-text">{ledger.name}</h1>
            <p className="text-xs text-text-muted">{ledger.currency} · Libro contable</p>
          </div>
          <span className="text-lg font-bold text-text">
            {formatCurrency(headerBalance, ledger.currency)}
          </span>
        </div>

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
                  <th className="px-5 py-3 text-right">Debe</th>
                  <th className="px-5 py-3 text-right">Haber</th>
                  <th className="px-5 py-3 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-light/40">
                <tr className="bg-surface-elevated/40">
                  <td className="px-5 py-2 text-xs text-text-muted">{ledger.created_at.split('T')[0]}</td>
                  <td className="px-5 py-2 text-xs text-text-muted italic">Saldo inicial</td>
                  <td className="px-5 py-2" />
                  <td className="px-5 py-2" />
                  <td className="px-5 py-2 text-right text-xs font-mono text-text-muted">
                    {formatCurrency(parseFloat(String(ledger.initial_balance)), ledger.currency)}
                  </td>
                </tr>
                {displayEntries.map(e => (
                  <tr key={e.key} className={`hover:bg-surface-elevated/50 ${e.isFee ? 'opacity-70' : ''}`}>
                    <td className="px-5 py-3 text-text-muted">{formatDate(e.date)}</td>
                    <td className="px-5 py-3 text-text">{e.description || '—'}</td>
                    <td className="px-5 py-3 text-right font-mono text-danger">
                      {e.isDebit ? formatCurrency(e.amount, ledger.currency) : ''}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-secondary">
                      {!e.isDebit ? formatCurrency(e.amount, ledger.currency) : ''}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-text">
                      {formatCurrency(e.runningBalance, ledger.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Mobile list */}
        <div className="sm:hidden space-y-2">
          {ledgerLoading ? (
            <div className="flex justify-center py-10"><span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : displayEntries.map(e => (
            <Card key={e.key} padding="sm" className={e.isFee ? 'opacity-70' : ''}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text">{e.description || '—'}</p>
                  <p className="text-xs text-text-muted">{formatDate(e.date)}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${e.isDebit ? 'text-danger' : 'text-secondary'}`}>
                    {e.isDebit ? '−' : '+'}{formatCurrency(e.amount, ledger.currency)}
                  </p>
                  <p className="text-xs text-text-muted font-mono">{formatCurrency(e.runningBalance, ledger.currency)}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text">Cuentas</h1>
        <Button onClick={() => openForm()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
          Nueva
        </Button>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {/* List */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map(acc => (
          <Card key={acc.id} padding="sm" className="cursor-pointer hover:border-surface-light transition-colors" onClick={() => openLedger(acc)}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0 mr-2">
                <p className="font-semibold text-text truncate">{acc.name}</p>
                <p className="text-xs text-text-muted mt-0.5">{acc.currency} · {acc.type === 'asset' ? 'Activo' : 'Pasivo'}</p>
              </div>
              <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                <Button size="icon" variant="ghost" onClick={() => openForm(acc)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                </Button>
                <Button size="icon" variant="danger" onClick={() => handleDelete(acc.id)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></svg>
                </Button>
              </div>
            </div>
            <p className={`text-xl font-bold ${acc.type === 'liability' ? 'text-danger' : 'text-text'}`}>
              {formatCurrency(balances[acc.id] ?? parseFloat(String(acc.current_balance)), acc.currency)}
            </p>
            {!acc.include_in_net_worth && (
              <Badge variant="warning" className="mt-2 text-xs">Excluida del patrimonio</Badge>
            )}
          </Card>
        ))}
      </div>

      {accounts.length === 0 && (
        <Card className="text-center py-12">
          <p className="text-text-muted mb-3">Sin cuentas aún</p>
          <Button onClick={() => openForm()}>Crear primera cuenta</Button>
        </Card>
      )}

      {/* Form — bottom sheet on mobile, inline panel on desktop */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative w-full lg:max-w-md bg-surface rounded-t-2xl lg:rounded-2xl border border-surface-light/60 p-5 z-10">
            <div className="w-10 h-1 bg-surface-light rounded-full mx-auto mb-5 lg:hidden" />
            <h2 className="text-base font-semibold text-text mb-4">
              {editId ? 'Editar cuenta' : 'Nueva cuenta'}
            </h2>
            {error && <div className="bg-danger/10 border border-danger/30 rounded-xl px-3 py-2 text-sm text-danger mb-3">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-3">
              <Field label="Nombre">
                <Input value={form.name} onChange={e => f('name', e.target.value)} placeholder="Ej: Banco Nacional" required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tipo">
                  <Select value={form.type} onChange={e => f('type', e.target.value)}>
                    {ACC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </Select>
                </Field>
                <Field label="Moneda">
                  <Select value={form.currency} onChange={e => f('currency', e.target.value)}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Field>
              </div>
              <Field label="Saldo inicial">
                <Input type="number" step="any" value={form.initial_balance} onChange={e => f('initial_balance', e.target.value)} />
              </Field>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.include_in_net_worth} onChange={e => f('include_in_net_worth', e.target.checked)} className="w-4 h-4 accent-primary" />
                <span className="text-sm text-text">Incluir en patrimonio neto</span>
              </label>
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
