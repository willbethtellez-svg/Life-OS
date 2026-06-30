import { useAppStore } from '@/lib/store';
import { formatCurrency } from '@/lib/utils';
import { Card, CardHeader, CardTitle, Button } from '@/components/ui';

export default function Reconciliation() {
  const { accounts, jars, exchangeRates, refresh } = useAppStore();

  // Latest rate for a given pair
  function getRate(from: string, to: string): number | null {
    const rate = exchangeRates.find(r => r.from_currency === from && r.to_currency === to);
    return rate ? parseFloat(String(rate.rate)) : null;
  }

  function toUSD(amount: number, currency: string): number | null {
    if (currency === 'USD' || currency === 'USDT') return amount;
    const rate = getRate('USD', currency);
    if (!rate) return null;
    return amount / rate;
  }

  const totalUSDEquivalent = accounts
    .filter(a => a.type === 'asset' && a.include_in_net_worth)
    .reduce((sum, a) => {
      const usd = toUSD(parseFloat(String(a.current_balance)), a.currency);
      return sum + (usd ?? 0);
    }, 0);

  const totalLiabUSD = accounts
    .filter(a => a.type === 'liability')
    .reduce((sum, a) => {
      const usd = toUSD(parseFloat(String(a.current_balance)), a.currency);
      return sum + (usd ?? 0);
    }, 0);

  const totalJarsUSD = jars.reduce((sum, j) => {
    const usd = toUSD(parseFloat(String(j.current_amount)), j.currency);
    return sum + (usd ?? 0);
  }, 0);

  // Accounts missing a rate (can't convert to USD)
  const missingRates = [
    ...accounts.filter(a => {
      if (a.currency === 'USD' || a.currency === 'USDT') return false;
      return getRate('USD', a.currency) === null;
    }).map(a => ({ type: 'account' as const, name: a.name, currency: a.currency })),
    ...jars.filter(j => {
      if (j.currency === 'USD' || j.currency === 'USDT') return false;
      return getRate('USD', j.currency) === null;
    }).map(j => ({ type: 'jar' as const, name: j.name, currency: j.currency })),
  ];

  // All currencies with their latest rate
  const allCurrencies = [...new Set(exchangeRates.map(r => r.to_currency))];

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text">Conciliación</h1>
        <Button variant="outline" size="sm" onClick={() => refresh()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
          </svg>
          Actualizar
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card padding="sm">
          <p className="text-xs text-text-muted mb-1">Activos (eq. USD)</p>
          <p className="text-xl font-bold text-text">{formatCurrency(totalUSDEquivalent)}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-text-muted mb-1">Pasivos (eq. USD)</p>
          <p className="text-xl font-bold text-danger">{formatCurrency(totalLiabUSD)}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-text-muted mb-1">En jarras (eq. USD)</p>
          <p className="text-xl font-bold text-warning">{formatCurrency(totalJarsUSD)}</p>
        </Card>
      </div>

      {/* Missing rates alert */}
      {missingRates.length > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
          <p className="text-sm font-medium text-warning mb-2">Sin tasa de cambio para estas cuentas</p>
          <ul className="space-y-1">
            {missingRates.map((m, i) => (
              <li key={i} className="text-xs text-text-muted">
                {m.type === 'account' ? 'Cuenta' : 'Jarra'}: {m.name} ({m.currency}) — sin tasa USD/{m.currency}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Accounts breakdown */}
      <Card padding="none">
        <CardHeader className="px-5 pt-5">
          <CardTitle>Cuentas</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-light/40 text-xs text-text-muted">
                <th className="px-5 py-2 text-left">Cuenta</th>
                <th className="px-5 py-2 text-left">Tipo</th>
                <th className="px-5 py-2 text-right">Saldo</th>
                <th className="px-5 py-2 text-right">Eq. USD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-light/40">
              {accounts.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-6 text-center text-text-muted">Sin cuentas</td></tr>
              ) : accounts.map(a => {
                const usd = toUSD(parseFloat(String(a.current_balance)), a.currency);
                return (
                  <tr key={a.id} className="hover:bg-surface-elevated/50">
                    <td className="px-5 py-3 text-text font-medium">{a.name}</td>
                    <td className="px-5 py-3 text-text-muted capitalize">{a.type === 'asset' ? 'Activo' : 'Pasivo'}</td>
                    <td className="px-5 py-3 text-right font-mono text-text">
                      {formatCurrency(parseFloat(String(a.current_balance)), a.currency)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-text-muted">
                      {usd !== null ? formatCurrency(usd) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Jars breakdown */}
      {jars.length > 0 && (
        <Card padding="none">
          <CardHeader className="px-5 pt-5">
            <CardTitle>Jarras</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-light/40 text-xs text-text-muted">
                  <th className="px-5 py-2 text-left">Jarra</th>
                  <th className="px-5 py-2 text-right">Ahorrado</th>
                  <th className="px-5 py-2 text-right">Meta</th>
                  <th className="px-5 py-2 text-right">Eq. USD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-light/40">
                {jars.map(j => {
                  const current = parseFloat(String(j.current_amount));
                  const target = parseFloat(String(j.target_amount));
                  const usd = toUSD(current, j.currency);
                  return (
                    <tr key={j.id} className="hover:bg-surface-elevated/50">
                      <td className="px-5 py-3 text-text font-medium">{j.name}</td>
                      <td className="px-5 py-3 text-right font-mono text-secondary">{formatCurrency(current, j.currency)}</td>
                      <td className="px-5 py-3 text-right font-mono text-text-muted">{formatCurrency(target, j.currency)}</td>
                      <td className="px-5 py-3 text-right font-mono text-text-muted">
                        {usd !== null ? formatCurrency(usd) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Latest rates */}
      {allCurrencies.length > 0 && (
        <Card padding="none">
          <CardHeader className="px-5 pt-5">
            <CardTitle>Tasas activas (más recientes)</CardTitle>
          </CardHeader>
          <div className="divide-y divide-surface-light/40">
            {allCurrencies.map(cur => {
              const rate = exchangeRates.find(r => r.to_currency === cur);
              if (!rate) return null;
              return (
                <div key={cur} className="flex items-center justify-between px-5 py-3">
                  <p className="text-sm text-text">{rate.from_currency} → {rate.to_currency}</p>
                  <div className="text-right">
                    <p className="text-sm font-mono text-text">{Number(rate.rate).toLocaleString('es-VE', { maximumFractionDigits: 4 })}</p>
                    <p className="text-xs text-text-muted">{rate.date}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
