import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';
import { Card, CardTitle } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import type { AccountAcquisition, ExchangeRate } from '@/types';

interface AccountBreakdown {
  id: string;
  name: string;
  currency: string;
  balance: number;
  usdValue: number;
  usdCost: number | null;
  rate: number | null;
  excluded: boolean;
}

interface JarTotal {
  id: string;
  name: string;
  amount: number;
  currency: string;
  usdValue: number;
  target: number;
}

export default function ReconciliationPage() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountBreakdown[]>([]);
  const [jars, setJars] = useState<JarTotal[]>([]);
  const [todayRates, setTodayRates] = useState<ExchangeRate[]>([]);
  const [acquisitions, setAcquisitions] = useState<AccountAcquisition[]>([]);
  const [editingAcq, setEditingAcq] = useState<string | null>(null);
  const [acqForm, setAcqForm] = useState({ rate: '' });
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const today = new Date().toISOString().split('T')[0];
      const [accList, jarList, rates, acqs] = await Promise.all([
        db.accounts.list({ type: 'asset' }),
        db.piggyBanks.list(),
        db.exchangeRates.getByDate(today),
        db.accountAcquisition.getAll(),
      ]);

      setTodayRates(rates);
      setAcquisitions(acqs);

      let vesRate = rates.find(r => r.from_currency === 'USDT' && r.to_currency === 'VES')?.rate
        || rates.find(r => r.from_currency === 'USD' && r.to_currency === 'VES')?.rate
        || null;

      // Fallback: most recent VES rate from any date
      if (!vesRate) {
        const allRates = await db.exchangeRates.getAll();
        const fallback = allRates
          .filter(r => (r.from_currency === 'USDT' || r.from_currency === 'USD') && r.to_currency === 'VES')
          .sort((a, b) => b.date.localeCompare(a.date));
        vesRate = fallback[0]?.rate || null;
      }

      const parsed: AccountBreakdown[] = accList.map((acc: any) => {
        const currency = acc.currency || 'USD';
        const balance = parseFloat(acc.current_balance || '0');
        const excluded = currency === 'EUR' || currency === 'BTC';
        const acq = acqs.find(a => a.account_id === acc.id);
        let usdValue: number;
        let usdCost: number | null = null;

        if (currency === 'USD' || currency === 'USDT') {
          usdValue = balance;
          usdCost = balance;
        } else if (currency === 'VES' && vesRate) {
          usdValue = balance / vesRate;
          usdCost = acq?.average_rate ? balance / acq.average_rate : null;
        } else {
          usdValue = 0;
          usdCost = null;
        }

        return {
          id: acc.id,
          name: acc.name,
          currency,
          balance,
          usdValue,
          usdCost,
          rate: currency === 'VES' ? vesRate : null,
          excluded,
        };
      });

      setAccounts(parsed);

      const jarParsed: JarTotal[] = jarList.map((jar: any) => {
        const amount = parseFloat(jar.current_amount || '0');
        const target = parseFloat(jar.target_amount || '0');
        const currency = jar.currency || 'USD';
        return {
          id: jar.id,
          name: jar.name,
          amount,
          currency,
          usdValue: currency === 'VES' && vesRate ? amount / vesRate : amount,
          target,
        };
      });

      setJars(jarParsed);
    } catch (err) {
      console.error(err);
      setError('Error al cargar datos para conciliación');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function saveAcquisition(accountId: string) {
    const rate = parseFloat(acqForm.rate);
    if (isNaN(rate) || rate <= 0) return;

    await db.accountAcquisition.set({
      account_id: accountId,
      average_rate: rate,
      notes: 'Configurado manualmente',
    });

    setEditingAcq(null);
    setAcqForm({ rate: '' });
    fetchData();
  }

  const usdAccounts = accounts.filter(a => !a.excluded);
  const totalUsdDirect = usdAccounts
    .filter(a => a.currency === 'USD' || a.currency === 'USDT')
    .reduce((s, a) => s + a.usdValue, 0);
  const vesAccounts = usdAccounts.filter(a => a.currency === 'VES');
  const totalVesAtToday = vesAccounts.reduce((s, a) => s + a.usdValue, 0);
  const totalVesAtCost = vesAccounts.reduce((s, a) => s + (a.usdCost ?? a.usdValue), 0);
  const totalUsdAccounts = totalUsdDirect + totalVesAtToday;
  const totalUsdCost = totalUsdDirect + totalVesAtCost;
  const rateAdjustment = totalUsdAccounts - totalUsdCost;
  const totalJarsUsd = jars.reduce((s, j) => s + j.usdValue, 0);
  const gap = totalUsdAccounts - totalJarsUsd;
  const gapAfterRate = totalUsdCost - totalJarsUsd;

  if (loading) return <Spinner fullPage />;

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-lg lg:max-w-4xl pb-24">
      <h1 className="text-xl font-bold">Conciliación</h1>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-sm text-danger">{error}</div>
      )}

      <Card>
        <CardTitle className="mb-3">Resumen General</CardTitle>
        <div className="space-y-2">
          <div className="flex justify-between text-lg">
            <span className="text-text-muted">Cuentas disponibles</span>
            <span className="font-bold text-primary">{formatCurrency(totalUsdAccounts)}</span>
          </div>
          <div className="flex justify-between text-lg">
            <span className="text-text-muted">Jarras asignadas</span>
            <span className="font-bold text-secondary">{formatCurrency(totalJarsUsd)}</span>
          </div>
          <hr className="border-surface-light my-2" />
          <div className="flex justify-between text-xl">
            <span className={`font-semibold ${Math.abs(gap) < 0.01 * totalUsdAccounts ? 'text-secondary' : 'text-warning'}`}>
              Diferencia total
            </span>
            <span className={`font-bold ${Math.abs(gap) < 0.01 * totalUsdAccounts ? 'text-secondary' : Math.abs(gap) > Math.abs(rateAdjustment) ? 'text-danger' : 'text-warning'}`}>
              {gap >= 0 ? '+' : ''}{formatCurrency(gap)}
            </span>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-3">Análisis de la Diferencia</CardTitle>
        <div className="space-y-3">
          <div className="bg-background rounded-xl p-3">
            <div className="flex justify-between text-sm mb-1">
              <span>Cuentas al costo histórico USD</span>
              <span className="font-medium">{formatCurrency(totalUsdCost)}</span>
            </div>
            <div className="flex justify-between text-sm text-warning">
              <span>+ Ajuste por tasa de cambio VES</span>
              <span className="font-medium">
                {rateAdjustment >= 0 ? '+' : ''}{formatCurrency(rateAdjustment)}
              </span>
            </div>
            <hr className="border-surface-light my-1" />
            <div className="flex justify-between text-sm font-semibold">
              <span>= Cuentas al cambio actual</span>
              <span>{formatCurrency(totalUsdAccounts)}</span>
            </div>
          </div>

          <div className="flex justify-between text-sm px-1 mb-1">
            <span className="text-text-muted">Jarras total</span>
            <span className="font-medium">{formatCurrency(totalJarsUsd)}</span>
          </div>

          <hr className="border-surface-light" />

          <div className="bg-background rounded-xl p-3 space-y-2">
            <p className="text-sm font-semibold mb-2">Diagnóstico</p>
            {Math.abs(gap) < 1 && (
              <div className="flex items-center gap-2 text-secondary text-sm">
                <span>✓</span><span>¡Todo cuadra! Cuentas y jarras están alineadas.</span>
              </div>
            )}
            {Math.abs(rateAdjustment) > 1 && (
              <div className="flex items-center gap-2 text-warning text-sm">
                <span>⟳</span>
                <span>
                  <strong>Ajuste por tasa de cambio:</strong> {formatCurrency(Math.abs(rateAdjustment))}
                  {rateAdjustment > 0 ? ' (el VES subió vs USD)' : ' (el VES bajó vs USD)'}
                </span>
              </div>
            )}
            {Math.abs(gapAfterRate) > 1 && (
              <div className="flex items-center gap-2 text-danger text-sm">
                <span>!</span>
                <span>
                  <strong>Diferencia real:</strong> {formatCurrency(Math.abs(gapAfterRate))}
                  {gapAfterRate > 0 ? ' — Dinero sin asignar en jarras.' : ' — Faltan transacciones por registrar.'}
                </span>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-3">Cuentas Disponibles</CardTitle>
        <div className="space-y-3">
          {usdAccounts.map((acc) => {
            const isVES = acc.currency === 'VES';
            const acq = acquisitions.find(a => a.account_id === acc.id);
            return (
              <div key={acc.id} className="border-b border-surface-light last:border-0 pb-3 last:pb-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{acc.name}</p>
                    {isVES && (
                      <p className="text-xs text-text-muted">
                        {acc.balance.toLocaleString()} {acc.currency}
                        {acc.rate && ` · 1 USD = ${acc.rate.toFixed(2)} VES`}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatCurrency(acc.usdValue)}</p>
                    {isVES && acc.usdCost !== null && acc.usdCost !== acc.usdValue && (
                      <p className="text-xs text-text-muted">Costo: {formatCurrency(acc.usdCost)}</p>
                    )}
                  </div>
                </div>
                {isVES && (
                  <div className="mt-2 flex items-center gap-2">
                    {editingAcq === acc.id ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={acqForm.rate}
                          onChange={e => setAcqForm({ rate: e.target.value })}
                          className="flex-1 bg-background border border-surface-light rounded-lg px-2 py-1 text-xs text-text focus:outline-none focus:ring-1 focus:ring-primary"
                          placeholder="Tasa de adquisición"
                        />
                        <button onClick={() => saveAcquisition(acc.id)} className="bg-primary text-white text-xs px-2 py-1 rounded-lg">Guardar</button>
                        <button onClick={() => { setEditingAcq(null); setAcqForm({ rate: '' }); }} className="text-text-muted text-xs">×</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingAcq(acc.id);
                          setAcqForm({ rate: acq?.average_rate?.toString() || acc.rate?.toString() || '' });
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        {acq?.average_rate ? `Tasa adquisición: 1 USD = ${acq.average_rate.toFixed(2)} VES (editar)` : 'Configurar tasa de adquisición histórica'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {accounts.filter(a => a.excluded).length > 0 && (
            <div className="pt-3 border-t border-surface-light">
              <p className="text-xs text-text-muted mb-2">Excluidas de conciliación:</p>
              {accounts.filter(a => a.excluded).map(acc => (
                <div key={acc.id} className="flex justify-between text-sm text-text-muted py-1">
                  <span>{acc.name}</span>
                  <span>{formatCurrency(acc.balance, acc.currency as any)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-3">Jarras Asignadas</CardTitle>
        <div className="space-y-2">
          {jars.length === 0 && <p className="text-text-muted text-sm text-center py-2">Sin jarras configuradas</p>}
          {jars.map(jar => (
            <div key={jar.id} className="flex items-center justify-between py-2 border-b border-surface-light last:border-0">
              <div>
                <p className="text-sm font-medium">{jar.name}</p>
                {jar.target > 0 && (
                  <p className="text-xs text-text-muted">
                    Meta: {formatCurrency(jar.target, jar.currency as any)}
                    {jar.target > 0 && ` (${Math.round((jar.amount / jar.target) * 100)}%)`}
                  </p>
                )}
              </div>
              <p className="text-sm font-semibold">{formatCurrency(jar.usdValue)}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="bg-background border border-surface-light rounded-xl p-4 text-xs text-text-muted space-y-2">
        <p className="font-semibold text-text">¿Cómo leer esto?</p>
        <p><strong className="text-text">Diferencia total</strong> = Cuentas (USD) − Jarras. Incluye el efecto de tasa de cambio.</p>
        <p><strong className="text-text">Ajuste por tasa</strong> = Diferencia entre costo histórico y valor actual de VES.</p>
        <p><strong className="text-text">Diferencia real</strong> = Diferencia total − Ajuste por tasa. Si es distinto de cero, faltan o sobran registros.</p>
      </div>
    </div>
  );
}
