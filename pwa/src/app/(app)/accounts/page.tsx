'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/firefly-api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';

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
      const res = await api.accounts.list();
      setAccounts(Array.isArray(res) ? res : res.data || []);
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
      const res = await api.accounts.transactions(account.id, { limit: 30 });
      setTxHistory(Array.isArray(res) ? res : res.data || []);
    } catch (err) {
      console.error(err);
    }
  }

  const totalUSD = accounts.reduce((sum: number, acc: any) => {
    const attrs = acc.attributes || acc;
    const balance = parseFloat(attrs.current_balance || attrs.currentBalance || '0');
    const currency = attrs.currency_code || attrs.currency || 'USD';
    if (currency === 'USD') return sum + balance;
    if (currency === 'USDT') return sum + balance;
    if (currency === 'VES') return sum;
    if (currency === 'EUR') return sum;
    if (currency === 'BTC') return sum;
    return sum + balance;
  }, 0);

  if (selected) {
    const attrs = selected.attributes || selected;
    const balance = parseFloat(attrs.current_balance || attrs.currentBalance || '0');
    const currency = attrs.currency_code || attrs.currency || 'USD';

    return (
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <button
          onClick={() => setSelected(null)}
          className="text-text-muted hover:text-text flex items-center gap-1 text-sm"
        >
          ← Volver a cuentas
        </button>

        <div className="bg-surface rounded-xl p-4">
          <h2 className="text-lg font-bold">{attrs.name}</h2>
          <p className="text-3xl font-bold mt-2 text-primary">
            {formatCurrency(balance, currency)}
          </p>
          <p className="text-sm text-text-muted mt-1">
            {currency} · {attrs.type}
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
              const t = tx.attributes || tx;
              const amount = parseFloat(t.amount || '0');
              const isNegative = t.type === 'withdrawal' || amount < 0;
              return (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b border-surface-light last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.description || 'Sin descripción'}</p>
                    <p className="text-xs text-text-muted">{formatDate(t.date || t.createdAt)}</p>
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
            const attrs = acc.attributes || acc;
            const balance = parseFloat(attrs.current_balance || attrs.currentBalance || '0');
            const currency = attrs.currency_code || attrs.currency || 'USD';
            return (
              <button
                key={acc.id}
                onClick={() => loadTransactions(acc)}
                className="w-full bg-surface rounded-xl p-4 text-left hover:bg-surface-light transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{attrs.name}</p>
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
