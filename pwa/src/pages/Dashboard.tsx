import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";

const PIE_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

type Period = "1m" | "3m" | "6m" | "12m";

function TrendIndicator({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${positive ? "text-primary" : "text-danger"}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d={positive ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
      </svg>
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

interface MetricCardProps {
  label: string;
  value: number;
  currency?: string;
  colorClass: string;
  trend?: number;
  icon?: string;
}

function MetricCard({ label, value, colorClass, trend, icon }: MetricCardProps) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">{label}</p>
        {icon && <span className="text-base">{icon}</span>}
      </div>
      <div>
        <p className={`text-2xl font-bold tracking-tight ${colorClass}`}>
          {formatCurrency(value)}
        </p>
        {trend !== undefined && (
          <div className="flex items-center gap-2 mt-1">
            <TrendIndicator value={trend} />
            <span className="text-[11px] text-text-muted">vs período anterior</span>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [recentTxs, setRecentTxs] = useState<any[]>([]);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [monthlyExpense, setMonthlyExpense] = useState(0);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<any[]>([]);
  const [netWorth, setNetWorth] = useState(0);
  const [period, setPeriod] = useState<Period>("3m");
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const now = new Date();
      const months = period === "1m" ? 1 : period === "3m" ? 3 : period === "6m" ? 6 : 12;
      const start = startOfMonth(subMonths(now, months)).toISOString().split("T")[0];
      const end = endOfMonth(now).toISOString().split("T")[0];

      // Net worth from asset accounts (USD/USDT only for simplicity)
      const accountsList = await db.accounts.list({ type: "asset" });
      const nw = accountsList.reduce((sum: number, a: any) => {
        const bal = parseFloat(a.current_balance || "0");
        if (a.currency === "USD" || a.currency === "USDT") return sum + bal;
        return sum;
      }, 0);
      setNetWorth(nw);

      const txList = await db.transactions.list({ start, end, limit: 50 });
      setRecentTxs(txList.slice(0, 10));

      const income = txList.filter((t: any) => t.type === "deposit").reduce((s: number, t: any) => s + (t.amount_usd || 0), 0);
      const expense = txList.filter((t: any) => t.type === "withdrawal").reduce((s: number, t: any) => s + (t.amount_usd || 0), 0);
      setMonthlyIncome(income);
      setMonthlyExpense(expense);

      const cats: Record<string, number> = {};
      txList.filter((t: any) => t.type === "withdrawal").forEach((t: any) => {
        const catName = t.category_name || "Sin categoría";
        cats[catName] = (cats[catName] || 0) + (t.amount_usd || 0);
      });
      setCategoryData(
        Object.entries(cats)
          .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 8)
      );

      const trendData = [];
      for (let i = months - 1; i >= 0; i--) {
        const mStart = startOfMonth(subMonths(now, i));
        const mEnd = endOfMonth(subMonths(now, i));
        const label = format(mStart, months > 6 ? "MMM yy" : "MMM", { locale: es });
        const mTxList = await db.transactions.list({
          start: mStart.toISOString().split("T")[0],
          end: mEnd.toISOString().split("T")[0],
          limit: 200,
        });
        const mIncome = mTxList.filter((t: any) => t.type === "deposit").reduce((s: number, t: any) => s + (t.amount_usd || 0), 0);
        const mExpense = mTxList.filter((t: any) => t.type === "withdrawal").reduce((s: number, t: any) => s + (t.amount_usd || 0), 0);
        trendData.push({ month: label, income: Math.round(mIncome * 100) / 100, expense: Math.round(mExpense * 100) / 100 });
      }
      setMonthlyTrend(trendData);
    } catch (err) {
      console.error(err);
      setError("Error al cargar datos del dashboard.");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <Spinner fullPage />;

  const balance = monthlyIncome - monthlyExpense;
  const savingsRate = monthlyIncome > 0 ? ((balance / monthlyIncome) * 100) : 0;

  const tooltipStyle = {
    backgroundColor: "#0e1827",
    border: "1px solid #1a2535",
    borderRadius: "10px",
    color: "#e2e8f0",
    fontSize: "12px",
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">Dashboard</h1>
          <p className="text-sm text-text-muted">Resumen financiero</p>
        </div>
        <div className="flex items-center gap-1 bg-surface border border-surface-light/60 rounded-xl p-1">
          {(["1m", "3m", "6m", "12m"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                period === p ? "bg-primary/15 text-primary" : "text-text-muted hover:text-text"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {/* Net Worth Hero Card */}
      <Card className="relative overflow-hidden bg-gradient-to-br from-surface to-surface-elevated">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="relative">
          <p className="text-xs font-semibold text-text-muted/70 uppercase tracking-widest mb-2">Patrimonio Neto</p>
          <p className="text-4xl font-bold text-primary tracking-tight">{formatCurrency(netWorth)}</p>
          <p className="text-sm text-text-muted mt-2">Cuentas activas en USD / USDT</p>
        </div>
      </Card>

      {/* 3 metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard label="Ingresos" value={monthlyIncome} colorClass="text-primary" />
        <MetricCard label="Gastos" value={monthlyExpense} colorClass="text-danger" />
        <MetricCard
          label="Balance"
          value={balance}
          colorClass={balance >= 0 ? "text-primary" : "text-danger"}
        />
      </div>

      {/* Savings rate pill */}
      {monthlyIncome > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-surface border border-surface-light/60 rounded-xl">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Tasa de ahorro del período</span>
              <span className={`text-xs font-bold ${savingsRate >= 20 ? "text-primary" : savingsRate >= 0 ? "text-warning" : "text-danger"}`}>
                {savingsRate.toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 bg-surface-light rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${savingsRate >= 20 ? "bg-primary" : savingsRate >= 0 ? "bg-warning" : "bg-danger"}`}
                style={{ width: `${Math.min(100, Math.max(0, savingsRate))}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Bar chart */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Ingresos vs Gastos</CardTitle>
          </CardHeader>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrend} barSize={16} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2535" vertical={false} />
                <XAxis dataKey="month" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number) => formatCurrency(value)}
                  cursor={{ fill: "#1a2535", radius: 6 }}
                />
                <Bar dataKey="income" name="Ingresos" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Pie chart */}
        {categoryData.length > 0 ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Por categoría</CardTitle>
            </CardHeader>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={72}
                    innerRadius={40}
                    paddingAngle={2}
                  >
                    {categoryData.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
              {categoryData.slice(0, 5).map((cat, idx) => (
                <div key={cat.name} className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }} />
                  <span className="text-text-muted truncate flex-1">{cat.name}</span>
                  <span className="text-text font-medium shrink-0">{formatCurrency(cat.value)}</span>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card className="lg:col-span-2 flex items-center justify-center">
            <p className="text-sm text-text-muted text-center">Sin gastos categorizados en el período</p>
          </Card>
        )}
      </div>

      {/* Recent transactions */}
      <Card padding="none">
        <div className="px-5 py-4 border-b border-surface-light/60 flex items-center justify-between">
          <CardTitle>Últimas transacciones</CardTitle>
          <Link to="/transactions" className="text-xs text-primary hover:text-primary-dark font-medium transition-colors">
            Ver todas →
          </Link>
        </div>
        <div className="divide-y divide-surface-light/40">
          {recentTxs.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-text-muted text-sm">No hay transacciones en el período</p>
            </div>
          ) : (
            recentTxs.map((tx: any) => {
              const amount = parseFloat(tx.amount || "0");
              const isNegative = tx.type === "withdrawal";
              const isTransfer = tx.type === "transfer";
              const currency = tx.currency || "USD";
              return (
                <div key={tx.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-elevated/50 transition-colors">
                  {/* Type indicator */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    isTransfer ? "bg-transfer/10" : isNegative ? "bg-danger/10" : "bg-primary/10"
                  }`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d={
                        isTransfer ? "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" :
                        isNegative ? "M12 19V5M5 12l7-7 7 7" : "M12 5v14M19 12l-7 7-7-7"
                      } />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{tx.description || "Sin descripción"}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {tx.date}
                      {tx.category_name && <span> · {tx.category_name}</span>}
                      {tx.source_name && !isTransfer && <span> · {tx.source_name}</span>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-semibold ${isNegative ? "text-danger" : isTransfer ? "text-transfer" : "text-primary"}`}>
                      {isTransfer ? "±" : isNegative ? "−" : "+"}{formatCurrency(Math.abs(amount), currency)}
                    </p>
                    {currency !== "USD" && currency !== "USDT" && tx.amount_usd != null && (
                      <p className="text-[11px] text-text-muted">≈ {formatCurrency(tx.amount_usd)}</p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
