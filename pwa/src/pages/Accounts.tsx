import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import type { CurrencyCode } from '@/types';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [txHistory, setTxHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReconcile, setShowReconcile] = useState(false);
  const [reconcileAmount, setReconcileAmount] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [realBalances, setRealBalances] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: '', type: 'asset' as 'asset' | 'liability', currency: 'USD' as CurrencyCode, initialBalance: '',
  });

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const list = await db.accounts.list();
      setAccounts(list);
    } catch (err) { console.error(err); setError('Error al cargar cuentas'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Nombre requerido'); return; }
    try {
      if (editingId) {
        await db.accounts.update(editingId, {
          name: form.name.trim(), type: form.type, currency: form.currency,
          initial_balance: parseFloat(form.initialBalance) || 0,
          current_balance: parseFloat(form.initialBalance) || 0,
        });
      } else {
        await db.accounts.create({
          name: form.name.trim(), type: form.type, currency: form.currency,
          initial_balance: parseFloat(form.initialBalance) || 0,
          current_balance: parseFloat(form.initialBalance) || 0,
        });
      }
      resetForm();
      fetchAccounts();
    } catch (err: any) { setError(err.message || 'Error'); }
  }

  function startEdit(acc: any) {
    setForm({ name: acc.name, type: acc.type, currency: acc.currency, initialBalance: acc.initial_balance?.toString() || '' });
    setEditingId(acc.id);
    setShowForm(true);
  }

  function resetForm() {
    setForm({ name: '', type: 'asset', currency: 'USD', initialBalance: '' });
    setEditingId(null);
    setShowForm(false);
  }

  async function loadTransactions(account: any) {
    setSelected(account);
    setTxHistory([]);
    try {
      const txs = await db.accounts.transactions(account.id, { limit: 100 });
      txs.sort((a: any, b: any) => a.date.localeCompare(b.date));
      setTxHistory(txs);
    } catch (err) { console.error(err); }
  }

  function getAmountForAccount(tx: any): number {
    if (tx.type === 'transfer' && tx.destination_account_id === selected?.id && tx.foreign_amount) {
      return parseFloat(String(tx.foreign_amount));
    }
    return parseFloat(tx.amount || '0');
  }

  function computeRunningBalance(tx: any, index: number): number {
    const initial = parseFloat(selected?.initial_balance || '0');
    let balance = initial;
    for (let i = 0; i <= index; i++) {
      const t = txHistory[i];
      if (!t) continue;
      const amt = getAmountForAccount(t);
      if (t.source_account_id === selected?.id) balance -= amt;
      if (t.destination_account_id === selected?.id) balance += amt;
    }
    return balance;
  }

  async function handleReconcile() {
    if (!selected || !reconcileAmount) return;
    const newBalance = parseFloat(reconcileAmount);
    if (isNaN(newBalance)) return;
    try {
      await db.accounts.update(selected.id, { current_balance: newBalance, initial_balance: newBalance });
      setShowReconcile(false); setReconcileAmount(''); fetchAccounts();
    } catch (err) { console.error(err); }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta cuenta?')) return;
    try { await db.accounts.delete(id); fetchAccounts(); } catch (err) { console.error(err); }
  }

  const totalUSD = accounts.reduce((sum: number, acc: any) => {
    const balance = parseFloat(acc.current_balance || '0');
    if (acc.currency === 'USD' || acc.currency === 'USDT') return sum + balance;
    return sum;
  }, 0);

  // ─── Account detail / ledger view ─────────────────────────
  if (selected) {
    const balance = parseFloat(selected.current_balance || '0');
    const currency = selected.currency || 'USD';
    return (
      <div className="p-4 lg:p-6 space-y-4 max-w-4xl">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="text-text-muted hover:text-text p-2 rounded-xl hover:bg-surface-elevated transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">{selected.name}</h1>
            <p className="text-xs text-text-muted">{currency} · {selected.type === 'asset' ? 'Activo' : 'Pasivo'}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-primary">{formatCurrency(balance, currency)}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowReconcile(!showReconcile)}>
            {showReconcile ? 'Cancelar' : 'Conciliar'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => { startEdit(selected); setSelected(null); }}>
            Editar cuenta
          </Button>
        </div>

        {showReconcile && (
          <Card>
            <p className="text-sm font-medium mb-3">Saldo real de la cuenta</p>
            <div className="space-y-3">
              <Input
                type="number"
                step="0.01"
                value={reconcileAmount}
                onChange={e => setReconcileAmount(e.target.value)}
                placeholder={balance.toString()}
              />
              {reconcileAmount && (
                <div className={`text-sm font-medium ${parseFloat(reconcileAmount) !== balance ? 'text-warning' : 'text-primary'}`}>
                  Diferencia: {formatCurrency(parseFloat(reconcileAmount) - balance, currency)}
                </div>
              )}
              <Button onClick={handleReconcile} size="md" className="w-full">Guardar saldo</Button>
            </div>
          </Card>
        )}

        {/* Ledger */}
        <Card padding="none">
          <div className="px-5 py-4 border-b border-surface-light/60">
            <CardTitle>Libro contable</CardTitle>
          </div>
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-light/40 bg-surface-elevated/30">
                  <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Fecha</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Descripción</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Debe</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Haber</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-light/30">
                {txHistory.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-10 text-text-muted text-sm">Sin movimientos</td></tr>
                ) : (
                  txHistory.map((tx: any, i: number) => {
                    const amount = getAmountForAccount(tx);
                    const isDebit = tx.destination_account_id === selected.id;
                    const isCredit = tx.source_account_id === selected.id;
                    const running = computeRunningBalance(tx, i);
                    return (
                      <tr key={tx.id} className="hover:bg-surface-elevated/40 transition-colors">
                        <td className="px-5 py-3 text-sm text-text-muted whitespace-nowrap">{tx.date}</td>
                        <td className="px-5 py-3">
                          <p className="text-sm font-medium truncate max-w-xs">{tx.description || 'Sin descripción'}</p>
                          {tx.type === 'transfer' && isDebit && <p className="text-[11px] text-text-muted">desde {tx.source_name || 'origen'}</p>}
                          {tx.type === 'transfer' && isCredit && <p className="text-[11px] text-text-muted">hacia {tx.destination_name || 'destino'}</p>}
                        </td>
                        <td className="px-5 py-3 text-right text-sm font-medium text-primary">{isDebit ? formatCurrency(amount, currency) : ''}</td>
                        <td className="px-5 py-3 text-right text-sm font-medium text-danger">{isCredit ? formatCurrency(amount, currency) : ''}</td>
                        <td className="px-5 py-3 text-right text-sm font-semibold text-text">{formatCurrency(running, currency)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="lg:hidden divide-y divide-surface-light/30">
            {txHistory.length === 0 ? (
              <div className="py-10 text-center text-text-muted text-sm">Sin movimientos</div>
            ) : (
              txHistory.map((tx: any, i: number) => {
                const amount = getAmountForAccount(tx);
                const isCredit = tx.source_account_id === selected.id;
                const running = computeRunningBalance(tx, i);
                return (
                  <div key={tx.id} className="flex items-center justify-between px-5 py-3.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{tx.description || 'Sin descripción'}</p>
                      <p className="text-xs text-text-muted">{tx.date}</p>
                    </div>
                    <div className="text-right ml-3">
                      <span className={`text-sm font-semibold ${isCredit ? 'text-danger' : 'text-primary'}`}>
                        {isCredit ? '−' : '+'}{formatCurrency(amount, currency)}
                      </span>
                      <p className="text-[11px] text-text-muted">{formatCurrency(running, currency)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>
    );
  }

  // ─── Account list ─────────────────────────────────────────
  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Cuentas</h1>
          <p className="text-sm text-text-muted">Gestiona tus cuentas bancarias</p>
        </div>
        <Button
          size="icon"
          onClick={() => { resetForm(); setShowForm(!showForm); }}
          className="rounded-full w-10 h-10"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            {showForm ? <path d="M6 18L18 6M6 6l12 12" /> : <path d="M12 5v14M5 12h14" />}
          </svg>
        </Button>
      </div>

      {error && <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-sm text-danger">{error}</div>}

      {showForm && (
        <Card>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <Field label="Nombre">
                <Input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej. Bco Familiar" required />
              </Field>
              <Field label="Tipo">
                <Select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}>
                  <option value="asset">Activo</option>
                  <option value="liability">Pasivo</option>
                </Select>
              </Field>
              <Field label="Moneda">
                <Select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value as CurrencyCode }))}>
                  <option value="USD">USD</option><option value="VES">VES</option><option value="EUR">EUR</option><option value="BTC">BTC</option><option value="USDT">USDT</option>
                </Select>
              </Field>
            </div>
            <Field label="Saldo inicial">
              <Input type="number" step="0.01" value={form.initialBalance} onChange={e => setForm(f => ({ ...f, initialBalance: e.target.value }))} placeholder="0.00" />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">{editingId ? 'Guardar' : 'Crear cuenta'}</Button>
              <Button type="button" variant="ghost" onClick={resetForm}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Total card */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1">Total (USD + USDT)</p>
            <p className="text-3xl font-bold text-primary">{formatCurrency(totalUSD)}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary">
              <path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
        </div>
      </Card>

      {/* Account list */}
      <div className="space-y-2">
        {loading ? (
          <Spinner fullPage />
        ) : accounts.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-3 opacity-40"><path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
            <p className="text-sm">No hay cuentas creadas</p>
          </div>
        ) : (
          accounts.map((acc: any) => {
            const balance = parseFloat(acc.current_balance || '0');
            const currency = acc.currency || 'USD';
            const realVal = realBalances[acc.id];
            const realNum = realVal ? parseFloat(realVal) : null;
            const diff = realNum !== null ? realNum - balance : null;
            return (
              <Card key={acc.id} className="hover:border-surface-elevated cursor-pointer transition-colors" padding="sm">
                <div className="flex items-center justify-between" onClick={() => loadTransactions(acc)}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-surface-elevated flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-text-muted">{acc.currency}</span>
                    </div>
                    <div>
                      <p className="font-medium text-sm">{acc.name}</p>
                      <p className="text-xs text-text-muted">{acc.type === 'asset' ? 'Activo' : 'Pasivo'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${balance >= 0 ? 'text-primary' : 'text-danger'}`}>
                      {formatCurrency(balance, currency)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-surface-light/40" onClick={e => e.stopPropagation()}>
                  <label className="text-[10px] text-text-muted whitespace-nowrap">Saldo real:</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={realVal || ''}
                    onChange={e => setRealBalances(prev => ({ ...prev, [acc.id]: e.target.value }))}
                    className="flex-1 py-1.5 text-xs rounded-lg"
                    placeholder={balance.toString()}
                  />
                  {diff !== null && diff !== 0 && (
                    <span className={`text-[10px] font-medium whitespace-nowrap ${diff > 0 ? 'text-primary' : 'text-danger'}`}>
                      {diff > 0 ? '+' : ''}{formatCurrency(diff, currency)}
                    </span>
                  )}
                  <button onClick={() => startEdit(acc)} className="text-[10px] text-primary hover:underline whitespace-nowrap">Editar</button>
                  <button onClick={() => handleDelete(acc.id)} className="text-[10px] text-danger hover:underline">✕</button>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
