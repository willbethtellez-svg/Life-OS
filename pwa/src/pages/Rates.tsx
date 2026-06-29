import { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';
import type { ExchangeRate } from '@/types';

export default function RatesPage() {
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [message, setMessage] = useState('');
  const [manualFrom, setManualFrom] = useState('USDT');
  const [manualTo, setManualTo] = useState('VES');
  const [manualRate, setManualRate] = useState('');

  useEffect(() => { loadRates(); }, []);

  async function loadRates() {
    setLoading(true);
    try {
      const all = await db.exchangeRates.getAll();
      setRates(all);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function addManualRate() {
    const rate = parseFloat(manualRate);
    if (isNaN(rate) || rate <= 0) {
      setMessage('Ingresa una tasa válida');
      return;
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      await db.exchangeRates.set({
        date: today,
        from_currency: manualFrom,
        to_currency: manualTo,
        rate,
        source: 'manual',
        transactions_used: 0,
      });
      setMessage(`Tasa manual guardada: 1 ${manualFrom} = ${rate} ${manualTo}`);
      setManualRate('');
      loadRates();
    } catch (err) {
      console.error(err);
      setMessage('Error al guardar tasa');
    }
  }

  async function addOfficialRates() {
    try {
      const today = new Date().toISOString().split('T')[0];
      await Promise.all([
        db.exchangeRates.set({ date: today, from_currency: 'EUR', to_currency: 'USD', rate: 1.08, source: 'official', transactions_used: 0 }),
        db.exchangeRates.set({ date: today, from_currency: 'BTC', to_currency: 'USD', rate: 65000, source: 'official', transactions_used: 0 }),
      ]);
      setMessage('Tasas oficiales de EUR y BTC agregadas');
      loadRates();
    } catch (err) {
      setMessage('Error al agregar tasas');
    }
  }

  const latestRates = rates.reduce((acc, r) => {
    const key = `${r.from_currency}→${r.to_currency}`;
    if (!acc[key] || r.date > acc[key].date) {
      acc[key] = r;
    }
    return acc;
  }, {} as Record<string, ExchangeRate>);

  return (
    <div className="p-4 space-y-4 max-w-lg lg:max-w-4xl mx-auto">
      <h1 className="text-xl font-bold">Tasas de Cambio</h1>

      <div className="bg-surface rounded-xl p-4 space-y-3">
        <p className="text-sm text-text-muted">
          Registra las tasas de cambio manualmente o usa las tasas oficiales predefinidas.
        </p>

        <div className="grid grid-cols-3 gap-2">
          <select
            value={manualFrom}
            onChange={e => setManualFrom(e.target.value)}
            className="bg-background border border-surface-light rounded-lg px-2 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="USD">USD</option>
            <option value="USDT">USDT</option>
            <option value="EUR">EUR</option>
            <option value="BTC">BTC</option>
          </select>
          <span className="flex items-center justify-center text-text-muted text-sm">→</span>
          <select
            value={manualTo}
            onChange={e => setManualTo(e.target.value)}
            className="bg-background border border-surface-light rounded-lg px-2 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="VES">VES</option>
            <option value="USD">USD</option>
            <option value="USDT">USDT</option>
          </select>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            value={manualRate}
            onChange={e => setManualRate(e.target.value)}
            className="flex-1 bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Tasa (ej. 36.5)"
          />
          <button
            onClick={addManualRate}
            className="bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
          >
            Guardar
          </button>
        </div>

        <button
          onClick={addOfficialRates}
          className="w-full bg-surface-light hover:bg-surface-light/80 text-text text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
        >
          Agregar tasas oficiales (EUR/BTC)
        </button>

        {message && (
          <div className="bg-primary/10 border border-primary/30 rounded-lg px-3 py-2 text-xs text-primary">
            {message}
          </div>
        )}
      </div>

      <div className="bg-surface rounded-xl p-4">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">Últimas tasas</h2>
        <div className="space-y-2">
          {Object.values(latestRates).length === 0 && (
            <p className="text-text-muted text-sm text-center py-2">Sin tasas registradas.</p>
          )}
          {Object.entries(latestRates).map(([key, rate]) => (
            <div key={key} className="flex items-center justify-between py-2 border-b border-surface-light last:border-0">
              <div>
                <p className="text-sm font-medium">{rate.from_currency} → {rate.to_currency}</p>
                <p className="text-xs text-text-muted">
                  {rate.date} · {rate.source === 'p2p_average' ? 'P2P promedio' : rate.source === 'official' ? 'Oficial' : 'Manual'}
                  {rate.transactions_used > 0 && ` · ${rate.transactions_used} transacciones`}
                </p>
              </div>
              <span className="font-bold text-lg">{rate.rate}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-surface rounded-xl p-4">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">Historial</h2>
        <div className="space-y-1">
          {rates.length === 0 && <p className="text-text-muted text-sm text-center py-2">Sin historial</p>}
          {rates.slice(0, 20).map((rate, idx) => (
            <div key={`${rate.date}-${rate.from_currency}-${rate.to_currency}-${idx}`} className="flex items-center justify-between py-1.5 border-b border-surface-light last:border-0 text-sm">
              <span className="text-text-muted">{rate.date}</span>
              <span className="font-medium">{rate.from_currency}→{rate.to_currency}</span>
              <span className="font-semibold">{rate.rate}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
