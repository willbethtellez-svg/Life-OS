import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db';
import { formatCurrency, formatDate } from '@/lib/utils';
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
    try { setTxHistory(await db.accounts.transactions(account.id, { limit: 30 })); }
    catch (err) { console.error(err); }
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

  const totalRealUSD = accounts.reduce((sum: number, acc: any) => {
    const real = realBalances[acc.id] ? parseFloat(realBalances[acc.id]) : null;
    if (real === null) return sum;
    if (acc.currency === 'USD' || acc.currency === 'USDT') return sum + real;
    return sum;
  }, 0);

  const totalDiff = totalRealUSD - totalUSD;

  if (selected) {
    const balance = parseFloat(selected.current_balance || '0');
    const currency = selected.currency || 'USD';
    return (
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <button onClick={() => setSelected(null)} className="text-text-muted hover:text-text flex items-center gap-1 text-sm">← Volver</button>
        <div className="bg-surface rounded-xl p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{selected.name}</h2>
            <button onClick={() => { startEdit(selected); setSelected(null); }} className="text-xs text-primary hover:underline">Editar</button>
          </div>
          <p className="text-3xl font-bold mt-2 text-primary">{formatCurrency(balance, currency)}</p>
          <p className="text-sm text-text-muted mt-1">{currency} · {selected.type}</p>
        </div>

        <button onClick={() => setShowReconcile(!showReconcile)}
          className="w-full bg-surface border border-surface-light rounded-lg py-2.5 text-sm font-medium text-text-muted hover:text-text transition-colors">
          {showReconcile ? 'Cancelar' : 'Conciliar saldo real'}
        </button>

        {showReconcile && (
          <div className="bg-surface rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium">Saldo real</p>
            <input type="number" step="0.01" value={reconcileAmount} onChange={e => setReconcileAmount(e.target.value)}
              className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary" placeholder={balance.toString()} />
            {reconcileAmount && (
              <div className={`text-sm font-medium ${parseFloat(reconcileAmount) !== balance ? 'text-warning' : 'text-secondary'}`}>
                Diferencia: {formatCurrency(parseFloat(reconcileAmount) - balance, currency)}
              </div>
            )}
            <button onClick={handleReconcile} className="w-full bg-primary hover:bg-primary-dark text-white font-medium rounded-lg py-2 transition-colors">Guardar</button>
          </div>
        )}

        <div className="bg-surface rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">Historial</h3>
          <div className="space-y-2">
            {txHistory.length === 0 && <p className="text-text-muted text-sm text-center py-4">Sin movimientos</p>}
            {txHistory.map((tx: any) => {
              const amount = parseFloat(tx.amount || '0');
              const isNeg = tx.type === 'withdrawal' || amount < 0;
              return (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b border-surface-light last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tx.description || 'Sin descripción'}</p>
                    <p className="text-xs text-text-muted">{formatDate(tx.date || tx.created_at)}</p>
                  </div>
                  <span className={`text-sm font-semibold ml-3 ${isNeg ? 'text-danger' : 'text-secondary'}`}>
                    {isNeg ? '-' : '+'}{formatCurrency(Math.abs(amount), currency)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Cuentas</h1>
        <button onClick={() => { resetForm(); setShowForm(!showForm); }}
          className="bg-primary hover:bg-primary-dark text-white rounded-full w-10 h-10 flex items-center justify-center text-xl font-bold transition-colors">
          {showForm ? '×' : '+'}
        </button>
      </div>

      {error && <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-surface rounded-xl p-4 space-y-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">Nombre</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Ej. Bco Familiar" required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-text-muted mb-1">Tipo</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="asset">Activo</option><option value="liability">Pasivo</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Moneda</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value as CurrencyCode }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="USD">USD</option><option value="VES">VES</option><option value="EUR">EUR</option><option value="BTC">BTC</option><option value="USDT">USDT</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Saldo inicial</label>
            <input type="number" step="0.01" value={form.initialBalance} onChange={e => setForm(f => ({ ...f, initialBalance: e.target.value }))}
              className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary" placeholder="0.00" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg py-2.5 transition-colors">
              {editingId ? 'Guardar' : 'Crear cuenta'}
            </button>
            <button type="button" onClick={resetForm} className="px-4 py-2.5 text-text-muted hover:text-text">Cancelar</button>
          </div>
        </form>
      )}

      <div className="bg-surface rounded-xl p-4">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-text-muted text-xs uppercase tracking-wide">Total en USD</p>
            <p className="text-2xl font-bold text-primary mt-1">{formatCurrency(totalUSD)}</p>
          </div>
          {Object.values(realBalances).some(v => v) && (
            <div className="text-right">
              <p className="text-text-muted text-xs uppercase tracking-wide">Real en USD</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(totalRealUSD)}</p>
              <p className={`text-xs font-medium ${totalDiff >= 0 ? 'text-secondary' : 'text-danger'}`}>
                Diferencia: {totalDiff >= 0 ? '+' : ''}{formatCurrency(totalDiff)}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" /></div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-8 text-text-muted">
            <p className="text-lg mb-1">♢</p>
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
              <div key={acc.id} className="bg-surface rounded-xl p-4">
                <div className="flex items-center justify-between cursor-pointer" onClick={() => loadTransactions(acc)}>
                  <div>
                    <p className="font-medium">{acc.name}</p>
                    <p className="text-xs text-text-muted mt-0.5">{currency} · {acc.type}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold text-lg ${balance >= 0 ? 'text-secondary' : 'text-danger'}`}>
                      {formatCurrency(balance, currency)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <label className="text-[10px] text-text-muted whitespace-nowrap">Real:</label>
                  <input type="number" step="0.01" value={realVal || ''} onClick={e => e.stopPropagation()}
                    onChange={e => setRealBalances(prev => ({ ...prev, [acc.id]: e.target.value }))}
                    className="flex-1 bg-background border border-surface-light rounded px-2 py-1 text-xs text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder={balance.toString()} />
                  {diff !== null && diff !== 0 && (
                    <span className={`text-[10px] font-medium whitespace-nowrap ${diff > 0 ? 'text-secondary' : 'text-danger'}`}>
                      {diff > 0 ? '+' : ''}{formatCurrency(diff, currency)}
                    </span>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); startEdit(acc); }}
                    className="text-[10px] text-primary hover:underline whitespace-nowrap">Editar</button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(acc.id); }}
                    className="text-[10px] text-danger hover:underline">✕</button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
