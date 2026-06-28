import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [txHistory, setTxHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReconcile, setShowReconcile] = useState(false);
  const [reconcileAmount, setReconcileAmount] = useState('');
  const [error, setError] = useState('');

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const list = await db.accounts.list();
      setAccounts(list);
    } catch (err) {
      console.error(err);
      setError('Error al cargar cuentas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  async function loadTransactions(account: any) {
    setSelected(account);
    setTxHistory([]);
    try {
      const txs = await db.accounts.transactions(account.id, { limit: 30 });
      setTxHistory(txs);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleReconcile() {
    if (!selected || !reconcileAmount) return;
    const newBalance = parseFloat(reconcileAmount);
    if (isNaN(newBalance)) return;
    try {
      await db.accounts.update(selected.id, {
        current_balance: newBalance,
        initial_balance: newBalance,
      });
      setShowReconcile(false);
      setReconcileAmount('');
      fetchAccounts();
    } catch (err) {
      console.error(err);
    }
  }

  const totalUSD = accounts.reduce((sum: number, acc: any) => {
    const balance = parseFloat(acc.current_balance || '0');
    const currency = acc.currency || 'USD';
    if (currency === 'USD' || currency === 'USDT') return sum + balance;
    return sum;
  }, 0);

  if (selected) {
    const balance = parseFloat(selected.current_balance || '0');
    const currency = selected.currency || 'USD';

    return (
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <button
          onClick={() => setSelected(null)}
          className="text-text-muted hover:text-text flex items-center gap-1 text-sm"
        >
          ← Volver a cuentas
        </button>

        <div className="bg-surface rounded-xl p-4">
          <h2 className="text-lg font-bold">{selected.name}</h2>
          <p className="text-3xl font-bold mt-2 text-primary">
            {formatCurrency(balance, currency)}
          </p>
          <p className="text-sm text-text-muted mt-1">
            {currency} · {selected.type}
          </p>
        </div>

        <button
          onClick={() => setShowReconcile(!showReconcile)}
          className="w-full bg-surface border border-surface-light rounded-lg py-2.5 text-sm font-medium text-text-muted hover:text-text transition-colors"
        >
          {showReconcile ? 'Cancelar' : 'Conciliar saldo real'}
        </button>

        {showReconcile && (
          <div className="bg-surface rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium">Ingresa el saldo real de la cuenta</p>
            <input
              type="number"
              step="0.01"
              value={reconcileAmount}
              onChange={(e) => setReconcileAmount(e.target.value)}
              className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={balance.toString()}
            />
            {reconcileAmount && (
              <div className={`text-sm font-medium ${parseFloat(reconcileAmount) !== balance ? 'text-warning' : 'text-secondary'}`}>
                Diferencia: {formatCurrency(parseFloat(reconcileAmount) - balance, currency)}
              </div>
            )}
            <button
              onClick={handleReconcile}
              className="w-full bg-primary hover:bg-primary-dark text-white font-medium rounded-lg py-2 transition-colors"
            >
              Guardar conciliación
            </button>
          </div>
        )}

        <div className="bg-surface rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
            Historial
          </h3>
          <div className="space-y-2">
            {txHistory.length === 0 && (
              <p className="text-text-muted text-sm text-center py-4">
                Sin movimientos registrados
              </p>
            )}
            {txHistory.map((tx: any) => {
              const amount = parseFloat(tx.amount || '0');
              const isNegative = tx.type === 'withdrawal' || amount < 0;
              return (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b border-surface-light last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tx.description || 'Sin descripción'}</p>
                    <p className="text-xs text-text-muted">{formatDate(tx.date || tx.created_at)}</p>
                  </div>
                  <span className={`text-sm font-semibold ml-3 ${isNegative ? 'text-danger' : 'text-secondary'}`}>
                    {isNegative ? '-' : '+'}{formatCurrency(Math.abs(amount), currency)}
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
      <h1 className="text-xl font-bold">Cuentas</h1>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="bg-surface rounded-xl p-4">
        <p className="text-text-muted text-xs uppercase tracking-wide">Total en USD (excluye EUR/BTC)</p>
        <p className="text-2xl font-bold text-primary mt-1">
          {formatCurrency(totalUSD)}
        </p>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          accounts.map((acc: any) => {
            const balance = parseFloat(acc.current_balance || '0');
            const currency = acc.currency || 'USD';
            return (
              <button
                key={acc.id}
                onClick={() => loadTransactions(acc)}
                className="w-full bg-surface rounded-xl p-4 text-left hover:bg-surface-light transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{acc.name}</p>
                    <p className="text-xs text-text-muted mt-0.5">{currency}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold text-lg ${balance >= 0 ? 'text-secondary' : 'text-danger'}`}>
                      {formatCurrency(balance, currency)}
                    </p>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
