import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { db } from '@/lib/db';
import { formatDate } from '@/lib/utils';
import { Card, CardHeader, CardTitle, Button, Input, Select, Field } from '@/components/ui';
import type { CurrencyCode } from '@/types';

const CURRENCIES: CurrencyCode[] = ['USD', 'VES', 'EUR', 'BTC', 'USDT'];
const SOURCES = [
  { value: 'manual', label: 'Manual' },
  { value: 'official', label: 'Oficial' },
  { value: 'p2p_average', label: 'P2P promedio' },
] as const;

interface RateForm {
  date: string;
  from: CurrencyCode;
  to: CurrencyCode;
  rate: string;
  source: 'official' | 'p2p_average' | 'manual';
}

export default function Rates() {
  const { exchangeRates, addOrUpdateRate } = useAppStore();
  const [form, setForm] = useState<RateForm>({
    date: new Date().toISOString().split('T')[0],
    from: 'USD',
    to: 'VES',
    rate: '',
    source: 'manual',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filterPair, setFilterPair] = useState('');

  const allPairs = [...new Set(exchangeRates.map(r => `${r.from_currency}→${r.to_currency}`))];
  const filtered = filterPair
    ? exchangeRates.filter(r => `${r.from_currency}→${r.to_currency}` === filterPair)
    : exchangeRates;

  const f = (k: keyof RateForm, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const real = await db.exchangeRates.set({
        date: form.date,
        from_currency: form.from,
        to_currency: form.to,
        rate: parseFloat(form.rate),
        source: form.source,
        transactions_used: 0,
      });
      addOrUpdateRate(real);
      setForm(prev => ({ ...prev, rate: '' }));
    } catch {
      setError('Error al guardar la tasa');
    } finally {
      setSaving(false);
    }
  }

  const sourceLabel: Record<string, string> = { official: 'Oficial', p2p_average: 'P2P', manual: 'Manual' };

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-text">Tasas de Cambio</h1>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {/* Form */}
      <Card>
        <CardHeader><CardTitle>Registrar tasa</CardTitle></CardHeader>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Fecha">
            <Input type="date" value={form.date} onChange={e => f('date', e.target.value)} required />
          </Field>
          <Field label="De">
            <Select value={form.from} onChange={e => f('from', e.target.value as CurrencyCode)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="A">
            <Select value={form.to} onChange={e => f('to', e.target.value as CurrencyCode)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Tasa">
            <Input type="number" step="any" min="0" value={form.rate} onChange={e => f('rate', e.target.value)} placeholder="0.00" required />
          </Field>
          <Field label="Fuente">
            <Select value={form.source} onChange={e => f('source', e.target.value as RateForm['source'])}>
              {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button type="submit" loading={saving} className="w-full">Guardar</Button>
          </div>
        </form>
      </Card>

      {/* History */}
      <Card padding="none">
        <div className="flex items-center justify-between px-5 py-4 gap-3">
          <CardTitle>Historial ({filtered.length})</CardTitle>
          <Select
            value={filterPair}
            onChange={e => setFilterPair(e.target.value)}
            className="w-auto text-xs py-1.5 px-2"
          >
            <option value="">Todos los pares</option>
            {allPairs.map(p => <option key={p} value={p}>{p}</option>)}
          </Select>
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-light/40 text-xs text-text-muted">
                <th className="px-5 py-2 text-left font-medium">Fecha</th>
                <th className="px-5 py-2 text-left font-medium">Par</th>
                <th className="px-5 py-2 text-right font-medium">Tasa</th>
                <th className="px-5 py-2 text-left font-medium">Fuente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-light/40">
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-text-muted">Sin tasas registradas</td></tr>
              ) : filtered.slice(0, 100).map(r => (
                <tr key={r.id} className="hover:bg-surface-elevated/50">
                  <td className="px-5 py-3 text-text-muted">{formatDate(r.date)}</td>
                  <td className="px-5 py-3 font-medium text-text">{r.from_currency} → {r.to_currency}</td>
                  <td className="px-5 py-3 text-right font-mono text-text">{Number(r.rate).toLocaleString('es-VE', { maximumFractionDigits: 4 })}</td>
                  <td className="px-5 py-3 text-text-muted">{sourceLabel[r.source] ?? r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile list */}
        <div className="sm:hidden divide-y divide-surface-light/40">
          {filtered.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-text-muted">Sin tasas registradas</p>
          ) : filtered.slice(0, 100).map(r => (
            <div key={r.id} className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text">{r.from_currency} → {r.to_currency}</p>
                <p className="text-xs text-text-muted">{formatDate(r.date)} · {sourceLabel[r.source] ?? r.source}</p>
              </div>
              <span className="text-sm font-mono text-text">
                {Number(r.rate).toLocaleString('es-VE', { maximumFractionDigits: 4 })}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
