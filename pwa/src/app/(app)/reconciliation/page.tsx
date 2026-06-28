'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/firefly-api';
import { localDB, type AccountAcquisition } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import type { ExchangeRate } from '@/types';

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
  const { token, baseUrl } = useAuth();
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
      const [accRes, jarRes, rates, acqs] = await Promise.all([
        api.accounts.list({ type: 'asset' }),
        api.piggyBanks.list(),
        localDB.exchangeRates.getByDate(new Date().toISOString().split('T')[0]),
        localDB.accountAcquisition.getAll(),
      ]);

      const accList = (Array.isArray(accRes) ? accRes : accRes.data || []) as any[];
      const jarList = (Array.isArray(jarRes) ? jarRes : jarRes.data || []) as any[];

      setTodayRates(rates);
      setAcquisitions(acqs);

      const vesRate = rates.find(r => r.from === 'USDT' && r.to === 'VES')?.rate
        || rates.find(r => r.from === 'USD' && r.to === 'VES')?.rate
        || null;

      const parsed: AccountBreakdown[] = accList.map((acc: any) => {
        const attrs = acc.attributes || acc;
        const currency = attrs.currency_code || attrs.currency || 'USD';
        const balance = parseFloat(attrs.current_balance || attrs.currentBalance || '0');
        const excluded = currency === 'EUR' || currency === 'BTC';
        const acq = acqs.find(a => a.accountId === acc.id || a.accountId === attrs.id);
        let usdValue: number;
        let usdCost: number | null = null;

        if (currency === 'USD') {
          usdValue = balance;
          usdCost = balance;
        } else if (currency === 'USDT') {
          usdValue = balance;
          usdCost = balance;
        } else if (currency === 'VES' && vesRate) {
          usdValue = balance / vesRate;
          usdCost = acq?.averageRate ? balance / acq.averageRate : null;
        } else {
          usdValue = 0;
          usdCost = null;
        }

        return {
          id: acc.id || attrs.id,
          name: attrs.name,
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
        const attrs = jar.attributes || jar;
        const amount = parseFloat(attrs.current_amount || '0');
        const target = parseFloat(attrs.target_amount || '0');
        const currency = attrs.currency_code || 'USD';
        return {
          id: jar.id || attrs.id,
          name: attrs.name,
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
  }, [token, baseUrl]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function saveAcquisition(accountId: string) {
    const rate = parseFloat(acqForm.rate);
    if (isNaN(rate) || rate <= 0) return;

    await localDB.accountAcquisition.set({
      accountId,
      averageRate: rate,
      notes: 'Configurado manualmente',
      updatedAt: new Date().toISOString(),
    });

    setEditingAcq(null);
    setAcqForm({ rate: '' });
    fetchData();
  }

  // Calcular resumen
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
      <h1 className="text-xl font-bold">Conciliación</h1>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Resumen principal */}
      <div className="bg-surface rounded-xl p-4">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
          Resumen General
        </h2>
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
      </div>

      {/* Análisis de la diferencia */}
      <div className="bg-surface rounded-xl p-4">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
          Análisis de la Diferencia
        </h2>
        <div className="space-y-3">
          <div className="bg-background rounded-lg p-3">
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

          <div className="bg-background rounded-lg p-3 space-y-2">
            <p className="text-sm font-semibold mb-2">Diagnóstico</p>

            {Math.abs(gap) < 1 && (
              <div className="flex items-center gap-2 text-secondary text-sm">
                <span>✓</span>
                <span>¡Todo cuadra! Cuentas y jarras están alineadas.</span>
              </div>
            )}

            {Math.abs(rateAdjustment) > 1 && (
              <div className="flex items-center gap-2 text-warning text-sm">
                <span>⟳</span>
                <span>
                  <strong>Ajuste por tasa de cambio:</strong> {formatCurrency(Math.abs(rateAdjustment))}
                  {rateAdjustment > 0
                    ? ' (el VES subió vs USD, las cuentas valen más)'
                    : ' (el VES bajó vs USD, las cuentas valen menos)'}
                </span>
              </div>
            )}

            {Math.abs(gapAfterRate) > 1 && (
              <div className="flex items-center gap-2 text-danger text-sm">
                <span>!</span>
                <span>
                  <strong>Diferencia real (después de tasa):</strong> {formatCurrency(Math.abs(gapAfterRate))}
                  {gapAfterRate > 0
                    ? ' — Hay más dinero en cuentas del que está asignado en jarras. ¿Dinero sin asignar?'
                    : ' — Hay menos dinero en cuentas del que está asignado en jarras. ¿Faltan transacciones por registrar?'}
                </span>
              </div>
            )}

            {Math.abs(gap) > 1 && Math.abs(rateAdjustment) < 1 && Math.abs(gapAfterRate) < 1 && (
              <div className="flex items-center gap-2 text-text-muted text-sm">
                <span>i</span>
                <span>
                  La diferencia es explicada completamente por el ajuste de tasa de cambio.
                  No hay registros faltantes.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detalle de cuentas */}
      <div className="bg-surface rounded-xl p-4">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
          Cuentas Disponibles
        </h2>
        <div className="space-y-3">
          {usdAccounts.map((acc) => {
            const isVES = acc.currency === 'VES';
            const acq = acquisitions.find(a => a.accountId === acc.id);
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
                      <p className="text-xs text-text-muted">
                        Costo: {formatCurrency(acc.usdCost)}
                      </p>
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
                        <button
                          onClick={() => saveAcquisition(acc.id)}
                          className="bg-primary text-white text-xs px-2 py-1 rounded-lg"
                        >
                          Guardar
                        </button>
                        <button
                          onClick={() => { setEditingAcq(null); setAcqForm({ rate: '' }); }}
                          className="text-text-muted text-xs"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingAcq(acc.id);
                          setAcqForm({ rate: acq?.averageRate?.toString() || acc.rate?.toString() || '' });
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        {acq?.averageRate
                          ? `Tasa adquisición: 1 USD = ${acq.averageRate.toFixed(2)} VES (editar)`
                          : 'Configurar tasa de adquisición histórica'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Excluidas */}
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
      </div>

      {/* Detalle de jarras */}
      <div className="bg-surface rounded-xl p-4">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
          Jarras Asignadas
        </h2>
        <div className="space-y-2">
          {jars.length === 0 && (
            <p className="text-text-muted text-sm text-center py-2">Sin jarras configuradas</p>
          )}
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
      </div>

      {/* Explicación */}
      <div className="bg-background border border-surface-light rounded-xl p-4 text-xs text-text-muted space-y-2">
        <p className="font-semibold text-text">¿Cómo leer esto?</p>
        <p>
          <strong className="text-text">Diferencia total</strong> = Cuentas (USD) − Jarras.
          Incluye el efecto de tasa de cambio.
        </p>
        <p>
          <strong className="text-text">Ajuste por tasa</strong> = La diferencia entre lo que
          pagaste por tus VES (costo histórico) y lo que valen hoy.
          Si la tasa se movió, esto aparece como diferencia aunque no falten registros.
        </p>
        <p>
          <strong className="text-text">Diferencia real</strong> = Diferencia total − Ajuste por tasa.
          Si esto es distinto de cero, faltan o sobran registros. Posibles causas:
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>Un gasto registrado en jarras pero no como transacción</li>
          <li>Un ingreso recibido pero no asignado a ninguna jarra</li>
          <li>Transferencias entre cuentas no registradas</li>
          <li>Comisiones bancarias no contabilizadas</li>
        </ul>
        {vesAccounts.length > 0 && (
          <p className="mt-2">
            Para cuentas VES, configura la <strong className="text-text">tasa de adquisición histórica</strong>
            {' '}tocando el botón azul. Si no sabes la tasa exacta, usa la tasa del día en que
            abriste la cuenta o la tasa promedio del mes.
          </p>
        )}
      </div>
    </div>
  );
}
