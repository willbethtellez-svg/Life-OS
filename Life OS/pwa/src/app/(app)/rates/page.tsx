'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { localDB } from '@/lib/db';
import { api } from '@/lib/firefly-api';
import { formatCurrency } from '@/lib/utils';
import type { ExchangeRate, CurrencyCode } from '@/types';

export default function RatesPage() {
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadRates();
  }, []);

  async function loadRates() {
    setLoading(true);
    try {
      const all = await localDB.exchangeRates.getAll();
      setRates(all.sort((a, b) => b.date.localeCompare(a.date)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function calculateDailyRate() {
    setCalculating(true);
    setMessage('Calculando tasa promedio del día...');

    try {
      const today = new Date().toISOString().split('T')[0];
      const start = today;
      const end = today;

      const res = await api.transactions.list({ start, end, limit: 200 });
      const txs = Array.isArray(res) ? res : res.data || [];

      const transfers = txs.filter((tx: any) => {
        const t = tx.attributes || tx;
        return t.type === 'transfer' &&
          t.currency_code === 'USDT' &&
          t.foreign_currency_code === 'VES';
      });

      if (transfers.length === 0) {
        const vesTxs = txs.filter((tx: any) => {
          const t = tx.attributes || tx;
          return t.type === 'transfer' && (
            (t.currency_code === 'USDT' || t.currency_code === 'USD') &&
            t.foreign_currency_code === 'VES'
          );
        });
        if (vesTxs.length === 0) {
          setMessage('No se encontraron transferencias USD→VES hoy. Buscando en los últimos 7 días...');

          const lastWeek = new Date();
          lastWeek.setDate(lastWeek.getDate() - 7);
          const weekRes = await api.transactions.list({
            start: lastWeek.toISOString().split('T')[0],
            end: today,
            limit: 500,
          });
          const weekTxs = Array.isArray(weekRes) ? weekRes : weekRes.data || [];
          const weekTransfers = weekTxs.filter((tx: any) => {
            const t = tx.attributes || tx;
            return t.type === 'transfer' &&
              (t.currency_code === 'USDT' || t.currency_code === 'USD') &&
              t.foreign_currency_code === 'VES';
          });

          if (weekTransfers.length === 0) {
            setMessage('No hay transferencias USD→VES en los últimos 7 días. Agrega la tasa manualmente.');
          } else {
            processTransfers(weekTransfers);
          }
        } else {
          processTransfers(vesTxs);
        }
      } else {
        processTransfers(transfers);
      }
    } catch (err) {
      console.error(err);
      setMessage('Error al calcular tasa de cambio');
    } finally {
      setCalculating(false);
    }
  }

  async function processTransfers(transfers: any[]) {
    const today = new Date().toISOString().split('T')[0];
    let totalUSD = 0;
    let totalVES = 0;
    let count = 0;

    for (const tx of transfers) {
      const t = tx.attributes || tx;
      const amount = Math.abs(parseFloat(t.amount || '0'));
      const foreignAmount = Math.abs(parseFloat(t.foreign_amount || '0'));

      if (t.currency_code === 'USDT' || t.currency_code === 'USD') {
        totalUSD += amount;
        totalVES += foreignAmount;
      } else {
        totalUSD += foreignAmount;
        totalVES += amount;
      }
      count++;
    }

    if (totalUSD > 0) {
      const avgRate = totalVES / totalUSD;

      const rate: ExchangeRate = {
        date: today,
        from: 'USDT' as CurrencyCode,
        to: 'VES' as CurrencyCode,
        rate: Math.round(avgRate * 100) / 100,
        source: 'p2p_average',
        transactionsUsed: count,
      };

      await localDB.exchangeRates.set(rate);
      setMessage(`Tasa del día calculada: 1 USDT = ${rate.rate.toFixed(2)} VES (basada en ${count} transferencias)`);
      loadRates();
    }
  }

  async function addOfficialRate() {
    try {
      const today = new Date().toISOString().split('T')[0];

      const eurRate: ExchangeRate = {
        date: today,
        from: 'EUR' as CurrencyCode,
        to: 'USD' as CurrencyCode,
        rate: 1.08,
        source: 'official',
        transactionsUsed: 0,
      };

      const btcRate: ExchangeRate = {
        date: today,
        from: 'BTC' as CurrencyCode,
        to: 'USD' as CurrencyCode,
        rate: 65000,
        source: 'official',
        transactionsUsed: 0,
      };

      await localDB.exchangeRates.set(eurRate);
      await localDB.exchangeRates.set(btcRate);
      setMessage('Tasas oficiales de EUR y BTC agregadas');
      loadRates();
    } catch (err) {
      setMessage('Error al agregar tasas');
    }
  }

  const latestRates = rates.reduce((acc, r) => {
    const key = `${r.from}→${r.to}`;
    if (!acc[key] || r.date > acc[key].date) {
      acc[key] = r;
    }
    return acc;
  }, {} as Record<string, ExchangeRate>);

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <h1 className="text-xl font-bold">Tasas de Cambio</h1>

      <div className="bg-surface rounded-xl p-4 space-y-3">
        <p className="text-sm text-text-muted">
          La tasa VES/USD se calcula automáticamente promediando las transferencias P2P del día.
        </p>

        <div className="flex gap-2">
          <button
            onClick={calculateDailyRate}
            disabled={calculating}
            className="flex-1 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 transition-colors"
          >
            {calculating ? 'Calculando...' : 'Calcular tasa P2P del día'}
          </button>
          <button
            onClick={addOfficialRate}
            className="bg-surface-light hover:bg-surface-light/80 text-text text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
          >
            Oficiales
          </button>
        </div>

        {message && (
          <div className="bg-primary/10 border border-primary/30 rounded-lg px-3 py-2 text-xs text-primary">
            {message}
          </div>
        )}
      </div>

      {/* Latest Rates */}
      <div className="bg-surface rounded-xl p-4">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
          Últimas tasas
        </h2>
        <div className="space-y-2">
          {Object.values(latestRates).length === 0 && (
            <p className="text-text-muted text-sm text-center py-2">
              Sin tasas registradas. Calcula o agrega una tasa.
            </p>
          )}
          {Object.entries(latestRates).map(([key, rate]) => (
            <div key={key} className="flex items-center justify-between py-2 border-b border-surface-light last:border-0">
              <div>
                <p className="text-sm font-medium">{rate.from} → {rate.to}</p>
                <p className="text-xs text-text-muted">
                  {rate.date} · {rate.source === 'p2p_average' ? 'P2P promedio' : rate.source === 'official' ? 'Oficial' : 'Manual'}
                  {rate.transactionsUsed > 0 && ` · ${rate.transactionsUsed} transacciones`}
                </p>
              </div>
              <span className="font-bold text-lg">{rate.rate}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Rate History */}
      <div className="bg-surface rounded-xl p-4">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
          Historial
        </h2>
        <div className="space-y-1">
          {rates.length === 0 && (
            <p className="text-text-muted text-sm text-center py-2">Sin historial</p>
          )}
          {rates.slice(0, 20).map((rate, idx) => (
            <div key={`${rate.date}-${rate.from}-${rate.to}-${idx}`} className="flex items-center justify-between py-1.5 border-b border-surface-light last:border-0 text-sm">
              <span className="text-text-muted">{rate.date}</span>
              <span className="font-medium">{rate.from}→{rate.to}</span>
              <span className="font-semibold">{rate.rate}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
