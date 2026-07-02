import { useEffect, useMemo, useState } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, subDays, differenceInCalendarDays } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useAppStore } from '@/lib/store';
import { db } from '@/lib/db';
import { formatCurrency, formatDate, formatMonth } from '@/lib/utils';
import { toUSDClient } from '@/lib/ledger';
import { useAccountBalances } from '@/lib/hooks/useAccountBalances';
import { Card, CardHeader, CardTitle } from '@/components/ui';
import type { ExchangeRate, Transaction } from '@/types';

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

const CATEGORY_COLORS = ['#fb5a2e', '#d7bdff', 'rgba(251,90,46,0.55)', 'rgba(215,189,255,0.55)', 'rgba(234,232,237,0.3)'];

function IconArrowDownLeft() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 7L7 17M7 17h10M7 17V7" /></svg>;
}
function IconArrowUpRight() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17L17 7M17 7H7M17 7v10" /></svg>;
}
function IconTrendingUp() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 17l6-6 4 4 7-7M14 8h6v6" /></svg>;
}
function IconCalendar() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>;
}
function IconCategory() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" /></svg>;
}

function pctDelta(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function sumByType(list: Transaction[], type: string): number {
  return list.filter(t => t.type === type).reduce((s, t) => s + parseFloat(String(t.amount_usd ?? 0)), 0);
}

function latestRateFor(rates: ExchangeRate[], code: string): { latest?: ExchangeRate; prev?: ExchangeRate } {
  const matches = rates.filter(r => r.to_currency === code).sort((a, b) => b.date.localeCompare(a.date));
  return { latest: matches[0], prev: matches[1] };
}

function rateDisplay(code: 'VES' | 'EUR' | 'BTC', entry: { latest?: ExchangeRate; prev?: ExchangeRate }) {
  if (!entry.latest) return null;
  const value = code === 'VES' ? entry.latest.rate : 1 / entry.latest.rate;
  const prevValue = entry.prev ? (code === 'VES' ? entry.prev.rate : 1 / entry.prev.rate) : null;
  const up = prevValue == null ? null : value > prevValue;
  const label = code === 'VES'
    ? `Bs. ${value.toLocaleString('es-VE', { maximumFractionDigits: 2 })}`
    : formatCurrency(value, 'USD');
  return { label, up };
}

function StatCard({ label, value, delta, deltaInverted, icon, iconClass }: {
  label: string; value: number; delta: number | null; deltaInverted?: boolean; icon: React.ReactNode; iconClass: string;
}) {
  const good = delta == null ? null : (deltaInverted ? delta <= 0 : delta >= 0);
  return (
    <Card padding="sm">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${iconClass}`}>
        {icon}
      </div>
      <p className="text-[11px] lg:text-xs text-text-muted mb-1 truncate">{label}</p>
      <p className="text-sm lg:text-lg font-bold text-text truncate">{formatCurrency(value)}</p>
      {delta != null && (
        <p className={`text-[10px] lg:text-xs mt-1 truncate ${good ? 'text-secondary' : 'text-primary'}`}>
          {delta >= 0 ? '+' : ''}{delta.toFixed(0)}% vs periodo anterior
        </p>
      )}
    </Card>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-elevated border border-surface-light rounded-lg px-3 py-2 text-xs">
      <p className="text-text-muted mb-1">Día {label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {formatCurrency(p.value)}</p>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { accounts, exchangeRates } = useAppStore();
  const balances = useAccountBalances(accounts);

  const [rangeMode, setRangeMode] = useState<'month' | 'custom'>('month');
  const [monthValue, setMonthValue] = useState(() => format(new Date(), 'yyyy-MM'));
  const [customStart, setCustomStart] = useState(() => format(subDays(new Date(), 29), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const { start, end } = useMemo(() => {
    if (rangeMode === 'month') {
      const d = parseISO(`${monthValue}-01`);
      return { start: format(startOfMonth(d), 'yyyy-MM-dd'), end: format(endOfMonth(d), 'yyyy-MM-dd') };
    }
    return { start: customStart, end: customEnd };
  }, [rangeMode, monthValue, customStart, customEnd]);

  const [rangeTxs, setRangeTxs] = useState<Transaction[]>([]);
  const [prevRangeTxs, setPrevRangeTxs] = useState<Transaction[]>([]);
  const [recentTxs, setRecentTxs] = useState<Transaction[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const days = differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
    const prevEnd = format(subDays(parseISO(start), 1), 'yyyy-MM-dd');
    const prevStart = format(subDays(parseISO(start), days), 'yyyy-MM-dd');
    Promise.all([
      db.transactions.list({ start, end }),
      db.transactions.list({ start: prevStart, end: prevEnd }),
    ]).then(([cur, prev]) => {
      if (cancelled) return;
      setRangeTxs(cur);
      setPrevRangeTxs(prev);
    });
    return () => { cancelled = true; };
  }, [start, end]);

  useEffect(() => {
    db.transactions.list({ limit: 5 }).then(setRecentTxs).finally(() => setLoadingRecent(false));
  }, []);

  const incomeUsd = sumByType(rangeTxs, 'deposit');
  const expenseUsd = sumByType(rangeTxs, 'withdrawal');
  const gainUsd = incomeUsd - expenseUsd;
  const prevIncomeUsd = sumByType(prevRangeTxs, 'deposit');
  const prevExpenseUsd = sumByType(prevRangeTxs, 'withdrawal');
  const prevGainUsd = prevIncomeUsd - prevExpenseUsd;

  const totalBalanceUsd = accounts
    .filter(a => a.include_in_net_worth)
    .reduce((s, a) => s + toUSDClient(balances[a.id] ?? parseFloat(String(a.current_balance)), a.currency, exchangeRates), 0);

  const vesDisp = rateDisplay('VES', latestRateFor(exchangeRates, 'VES'));
  const eurDisp = rateDisplay('EUR', latestRateFor(exchangeRates, 'EUR'));
  const btcDisp = rateDisplay('BTC', latestRateFor(exchangeRates, 'BTC'));

  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    rangeTxs.filter(t => t.type === 'withdrawal').forEach(t => {
      const name = t.category_name || 'Sin categoría';
      map.set(name, (map.get(name) ?? 0) + parseFloat(String(t.amount_usd ?? 0)));
    });
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 4);
    const restTotal = sorted.slice(4).reduce((s, [, v]) => s + v, 0);
    const rows = [...top];
    if (restTotal > 0) rows.push(['Otros', restTotal]);
    const total = rows.reduce((s, [, v]) => s + v, 0);
    return rows.map(([name, value], i) => ({
      name, value,
      pct: total > 0 ? Math.round((value / total) * 100) : 0,
      color: CATEGORY_COLORS[i] ?? CATEGORY_COLORS[CATEGORY_COLORS.length - 1],
    }));
  }, [rangeTxs]);

  const dailySeries = useMemo(() => {
    const days = eachDayOfInterval({ start: parseISO(start), end: parseISO(end) });
    return days.map(d => {
      const key = format(d, 'yyyy-MM-dd');
      const dayTxs = rangeTxs.filter(t => t.date === key);
      return {
        day: format(d, 'd'),
        Ingresos: sumByType(dayTxs, 'deposit'),
        Gastos: sumByType(dayTxs, 'withdrawal'),
      };
    });
  }, [rangeTxs, start, end]);

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-text">Dashboard</h1>

      {/* Hero: total en cuentas */}
      <div className="rounded-2xl p-5 lg:p-6" style={{ background: 'linear-gradient(45deg, var(--color-secondary), var(--color-primary))' }}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm mb-1" style={{ color: 'rgba(28,28,28,0.62)' }}>Total en mis cuentas</p>
            <p className="text-3xl font-bold" style={{ color: 'var(--color-ink)' }}>{formatCurrency(totalBalanceUsd)}</p>
          </div>
          <span className="text-xs font-medium px-3 py-1 rounded-full shrink-0" style={{ background: 'rgba(28,28,28,0.22)', color: 'var(--color-text)' }}>
            {accounts.length} cuentas
          </span>
        </div>
      </div>

      {/* Filtro de rango de fechas */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setRangeMode('month')}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
            rangeMode === 'month' ? 'bg-secondary/15 text-secondary border-secondary/30' : 'bg-surface text-text-muted border-surface-light'
          }`}
        >
          <IconCalendar />
          {rangeMode === 'month' ? (
            <input
              type="month" value={monthValue} onChange={e => setMonthValue(e.target.value)}
              className="bg-transparent outline-none text-secondary [color-scheme:dark]"
              onClick={e => e.stopPropagation()}
            />
          ) : formatMonth(`${monthValue}-01`)}
        </button>
        <button
          onClick={() => setRangeMode('custom')}
          className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
            rangeMode === 'custom' ? 'bg-secondary/15 text-secondary border-secondary/30' : 'bg-surface text-text-muted border-surface-light'
          }`}
        >
          Rango personalizado
        </button>
        {rangeMode === 'custom' && (
          <>
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
              className="text-xs bg-surface border border-surface-light rounded-full px-3 py-1.5 text-text [color-scheme:dark]" />
            <span className="text-text-muted text-xs">–</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
              className="text-xs bg-surface border border-surface-light rounded-full px-3 py-1.5 text-text [color-scheme:dark]" />
          </>
        )}
      </div>

      {/* Ingresos / Gastos / Ganancia */}
      <div className="grid grid-cols-3 gap-2.5 lg:gap-3">
        <StatCard
          label="Ingresos del mes" value={incomeUsd} delta={pctDelta(incomeUsd, prevIncomeUsd)}
          icon={<IconArrowDownLeft />} iconClass="bg-secondary/15 text-secondary"
        />
        <StatCard
          label="Gastos del mes" value={expenseUsd} delta={pctDelta(expenseUsd, prevExpenseUsd)} deltaInverted
          icon={<IconArrowUpRight />} iconClass="bg-primary/15 text-primary"
        />
        <StatCard
          label="Ganancia del mes" value={gainUsd} delta={pctDelta(gainUsd, prevGainUsd)}
          icon={<IconTrendingUp />} iconClass="bg-secondary/15 text-secondary"
        />
      </div>

      {/* Tasas del día */}
      {(vesDisp || eurDisp || btcDisp) && (
        <div className="flex items-center gap-4 bg-surface border border-surface-light/60 rounded-full px-4 lg:px-5 py-2.5 overflow-x-auto">
          {vesDisp && <RateChip code="VES" label={vesDisp.label} up={vesDisp.up} />}
          {vesDisp && (eurDisp || btcDisp) && <span className="w-px h-3.5 bg-surface-light shrink-0" />}
          {eurDisp && <RateChip code="EUR" label={eurDisp.label} up={eurDisp.up} />}
          {eurDisp && btcDisp && <span className="w-px h-3.5 bg-surface-light shrink-0" />}
          {btcDisp && <RateChip code="BTC" label={btcDisp.label} up={btcDisp.up} />}
        </div>
      )}

      {/* Gráficas */}
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-3">
        <Card>
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-text">Ingresos vs gastos</p>
            <div className="flex gap-3 text-[11px] text-text-muted">
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-secondary" />Ingresos</span>
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-primary" />Gastos</span>
            </div>
          </div>
          <div style={{ height: 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailySeries} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="day" stroke="#86848a" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#86848a" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="Ingresos" stroke="#d7bdff" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Gastos" stroke="#fb5a2e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-text mb-1">Gastos por categoría</p>
          {categoryTotals.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-10">Sin gastos en este rango</p>
          ) : (
            <>
              <div style={{ height: 150 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryTotals} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="85%" stroke="none">
                      {categoryTotals.map(c => <Cell key={c.name} fill={c.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1.5">
                {categoryTotals.map(c => (
                  <div key={c.name} className="flex items-center gap-2 text-[11.5px] text-text-muted">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto text-text font-medium">{c.pct}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Transacciones recientes */}
      <Card>
        <CardHeader><CardTitle>Transacciones recientes</CardTitle></CardHeader>
        {loadingRecent ? (
          <div className="flex justify-center py-6">
            <span className="w-5 h-5 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : recentTxs.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-4">Sin transacciones aún</p>
        ) : (
          <div className="space-y-1">
            {recentTxs.map(tx => (
              <div key={tx.id} className="flex items-center gap-3 py-2 border-b border-surface-light/30 last:border-0">
                <span className="w-8 h-8 rounded-lg bg-surface-elevated flex items-center justify-center text-text-muted shrink-0">
                  <IconCategory />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text truncate">{tx.description || '—'}</p>
                  <p className="text-xs text-text-muted">{tx.category_name || typeLabel[tx.type]} · {formatDate(tx.date)}</p>
                </div>
                <span className={`text-sm font-semibold shrink-0 ${typeColor[tx.type]}`}>
                  {tx.type === 'withdrawal' ? '−' : tx.type === 'deposit' ? '+' : ''}{formatCurrency(parseFloat(String(tx.amount)), tx.currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function RateChip({ code, label, up }: { code: string; label: string; up: boolean | null }) {
  return (
    <span className="flex items-center gap-1.5 text-xs whitespace-nowrap shrink-0">
      <span className="font-medium text-text-muted">{code}</span>
      <span className="font-medium text-text">{label}</span>
      {up != null && (
        <span className={up ? 'text-secondary' : 'text-primary'}>
          {up ? <IconArrowUpRight /> : <IconArrowDownLeft />}
        </span>
      )}
    </span>
  );
}
