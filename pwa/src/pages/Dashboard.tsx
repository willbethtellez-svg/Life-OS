import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { db } from '@/lib/db';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card, CardHeader, CardTitle } from '@/components/ui';
import type { Transaction } from '@/types';

export default function Dashboard() {
  const { accounts, jars, liabilities } = useAppStore();
  const [recentTxs, setRecentTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.transactions.list({ limit: 10 }).then(txs => {
      setRecentTxs(txs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const assetAccounts = accounts.filter(a => a.type === 'asset' && a.include_in_net_worth);
  const totalAssets = assetAccounts.reduce((s, a) => s + parseFloat(String(a.current_balance)), 0);
  const totalLiabilities = liabilities
    .filter(l => !l.archived)
    .reduce((s, l) => s + parseFloat(String(l.current_balance)), 0);
  const netWorth = totalAssets - totalLiabilities;
  const totalJarsSaved = jars.reduce((s, j) => s + parseFloat(String(j.current_amount)), 0);

  const typeColor: Record<string, string> = {
    withdrawal: 'text-danger',
    deposit: 'text-secondary',
    transfer: 'text-transfer',
  };
  const typeLabel: Record<string, string> = {
    withdrawal: 'Gasto',
    deposit: 'Ingreso',
    transfer: 'Transfer',
  };

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-text">Dashboard</h1>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Patrimonio Neto" value={formatCurrency(netWorth)} color="text-secondary" />
        <MetricCard label="Total Activos" value={formatCurrency(totalAssets)} />
        <MetricCard label="Total Deudas" value={formatCurrency(totalLiabilities)} color="text-danger" />
        <MetricCard label="En Jarras" value={formatCurrency(totalJarsSaved)} color="text-warning" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Accounts summary */}
        <Card>
          <CardHeader><CardTitle>Cuentas</CardTitle></CardHeader>
          {accounts.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">Sin cuentas aún</p>
          ) : (
            <div className="space-y-2">
              {accounts.slice(0, 6).map(a => (
                <div key={a.id} className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm font-medium text-text">{a.name}</p>
                    <p className="text-xs text-text-muted capitalize">{a.type === 'asset' ? 'Activo' : 'Pasivo'} · {a.currency}</p>
                  </div>
                  <span className={`text-sm font-semibold ${a.type === 'liability' ? 'text-danger' : 'text-text'}`}>
                    {formatCurrency(parseFloat(String(a.current_balance)), a.currency)}
                  </span>
                </div>
              ))}
              {accounts.length > 6 && (
                <p className="text-xs text-text-muted text-center pt-1">+{accounts.length - 6} más</p>
              )}
            </div>
          )}
        </Card>

        {/* Recent transactions */}
        <Card>
          <CardHeader><CardTitle>Recientes</CardTitle></CardHeader>
          {loading ? (
            <div className="flex justify-center py-6">
              <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : recentTxs.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">Sin transacciones aún</p>
          ) : (
            <div className="space-y-2.5">
              {recentTxs.map(tx => (
                <div key={tx.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{tx.description || '—'}</p>
                    <p className="text-xs text-text-muted">{formatDate(tx.date)} · {typeLabel[tx.type]}</p>
                  </div>
                  <span className={`text-sm font-semibold ${typeColor[tx.type]}`}>
                    {tx.type === 'withdrawal' ? '−' : '+'}{formatCurrency(parseFloat(String(tx.amount)), tx.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Jars */}
      {jars.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Jarras</CardTitle></CardHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {jars.map(j => {
              const current = parseFloat(String(j.current_amount));
              const target = parseFloat(String(j.target_amount));
              const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
              return (
                <div key={j.id} className="bg-surface-elevated rounded-xl p-3">
                  <div className="flex justify-between items-baseline mb-2">
                    <p className="text-sm font-medium text-text truncate">{j.name}</p>
                    <p className="text-xs text-text-muted">{Math.round(pct)}%</p>
                  </div>
                  <div className="w-full h-1.5 bg-surface-light rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-text-muted mt-1.5">
                    {formatCurrency(current, j.currency)} / {formatCurrency(target, j.currency)}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function MetricCard({ label, value, color = 'text-text' }: { label: string; value: string; color?: string }) {
  return (
    <Card padding="sm">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </Card>
  );
}
