import { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import type { ExchangeRate } from '@/types';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';

export default function RatesPage() {
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [manualFrom, setManualFrom] = useState('USDT');
  const [manualTo, setManualTo] = useState('VES');
  const [manualRate, setManualRate] = useState('');

  useEffect(() => { loadRates(); }, []);

  async function loadRates() {
    setLoading(true);
    try { setRates(await db.exchangeRates.getAll()); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function addManualRate() {
    const rate = parseFloat(manualRate);
    if (isNaN(rate) || rate <= 0) { setMessage('Ingresa una tasa válida'); return; }
    try {
      await db.exchangeRates.set({
        date: new Date().toISOString().split('T')[0],
        from_currency: manualFrom, to_currency: manualTo,
        rate, source: 'manual', transactions_used: 0,
      });
      setMessage(`Tasa guardada: 1 ${manualFrom} = ${rate} ${manualTo}`);
      setManualRate('');
      loadRates();
    } catch (err) { console.error(err); setMessage('Error al guardar tasa'); }
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
    } catch { setMessage('Error al agregar tasas'); }
  }

  const latestRates = rates.reduce((acc, r) => {
    const key = `${r.from_currency}→${r.to_currency}`;
    if (!acc[key] || r.date > acc[key].date) acc[key] = r;
    return acc;
  }, {} as Record<string, ExchangeRate>);

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-lg">
      <h1 className="text-xl font-bold">Tasas de Cambio</h1>

      {/* Agregar tasa */}
      <Card>
        <p className="text-sm text-text-muted mb-4">Registra las tasas de cambio manualmente o usa las predefinidas.</p>

        <div className="flex items-center gap-2 mb-3">
          <Select value={manualFrom} onChange={e => setManualFrom(e.target.value)} className="flex-1">
            <option value="USD">USD</option><option value="USDT">USDT</option>
            <option value="EUR">EUR</option><option value="BTC">BTC</option>
          </Select>
          <span className="text-text-muted font-bold">→</span>
          <Select value={manualTo} onChange={e => setManualTo(e.target.value)} className="flex-1">
            <option value="VES">VES</option><option value="USD">USD</option><option value="USDT">USDT</option>
          </Select>
        </div>

        <div className="flex gap-2 mb-3">
          <Input
            type="number" step="0.01" value={manualRate}
            onChange={e => setManualRate(e.target.value)}
            placeholder="Tasa (ej. 36.5)"
          />
          <Button onClick={addManualRate}>Guardar</Button>
        </div>

        <Button variant="outline" className="w-full" onClick={addOfficialRates}>
          Agregar tasas oficiales (EUR/BTC)
        </Button>

        {message && (
          <div className="mt-3 bg-primary/10 border border-primary/30 rounded-xl px-3 py-2 text-xs text-primary">{message}</div>
        )}
      </Card>

      {/* Últimas tasas */}
      <Card>
        <CardHeader>
          <CardTitle>Últimas tasas</CardTitle>
        </CardHeader>
        {loading ? <Spinner fullPage /> : (
          <div className="space-y-0 divide-y divide-surface-light/50">
            {Object.values(latestRates).length === 0 ? (
              <p className="text-text-muted text-sm text-center py-4">Sin tasas registradas</p>
            ) : Object.entries(latestRates).map(([key, rate]) => (
              <div key={key} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">{rate.from_currency} → {rate.to_currency}</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {rate.date} · {rate.source === 'p2p_average' ? 'P2P promedio' : rate.source === 'official' ? 'Oficial' : 'Manual'}
                    {rate.transactions_used > 0 && ` · ${rate.transactions_used} transacciones`}
                  </p>
                </div>
                <span className="font-bold text-lg text-text">{rate.rate}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Historial */}
      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
        </CardHeader>
        <div className="space-y-0 divide-y divide-surface-light/50">
          {rates.length === 0 ? (
            <p className="text-text-muted text-sm text-center py-3">Sin historial</p>
          ) : rates.slice(0, 20).map((rate, idx) => (
            <div key={`${rate.date}-${rate.from_currency}-${rate.to_currency}-${idx}`}
              className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-text-muted">{rate.date}</span>
              <span className="font-medium">{rate.from_currency}→{rate.to_currency}</span>
              <span className="font-semibold">{rate.rate}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
