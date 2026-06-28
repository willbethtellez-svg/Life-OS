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

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [recentTxs, setRecentTxs] = useState<any[]>([]);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [monthlyExpense, setMonthlyExpense] = useState(0);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<any[]>([]);
  const [netWorth, setNetWorth] = useState(0);
  const [period, setPeriod] = useState<"1m" | "3m" | "6m" | "12m">("3m");
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const now = new Date();
      const months = period === "1m" ? 1 : period === "3m" ? 3 : period === "6m" ? 6 : 12;
      const start = startOfMonth(subMonths(now, months)).toISOString().split("T")[0];
      const end = endOfMonth(now).toISOString().split("T")[0];

      const accountsList = await db.accounts.list({ type: "asset" });
      const nw = accountsList.reduce((sum: number, a: any) => {
        const bal = parseFloat(a.current_balance || "0");
        if (a.currency === "USD" || a.currency === "USDT") return sum + bal;
        return sum;
      }, 0);
      setNetWorth(nw);

      const txList = await db.transactions.list({ start, end, limit: 50 });
      setRecentTxs(txList.slice(0, 20));

      const income = txList
        .filter((t: any) => t.type === "deposit")
        .reduce((s: number, t: any) => s + (t.amount_usd || 0), 0);
      const expense = txList
        .filter((t: any) => t.type === "withdrawal")
        .reduce((s: number, t: any) => s + (t.amount_usd || 0), 0);
      setMonthlyIncome(income);
      setMonthlyExpense(expense);

      const cats: Record<string, number> = {};
      txList
        .filter((t: any) => t.type === "withdrawal")
        .forEach((t: any) => {
          const catName = t.category_name || "Sin categoría";
          cats[catName] = (cats[catName] || 0) + (t.amount_usd || 0);
        });
      setCategoryData(
        Object.entries(cats)
          .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
          .sort((a, b) => b.value - a.value)
      );

      const trendData = [];
      for (let i = months - 1; i >= 0; i--) {
        const mStart = startOfMonth(subMonths(now, i));
        const mEnd = endOfMonth(subMonths(now, i));
        const label = format(mStart, "MMM", { locale: es });
        const mTxList = await db.transactions.list({
          start: mStart.toISOString().split("T")[0],
          end: mEnd.toISOString().split("T")[0],
          limit: 200,
        });
        const mIncome = mTxList
          .filter((t: any) => t.type === "deposit")
          .reduce((s: number, t: any) => s + (t.amount_usd || 0), 0);
        const mExpense = mTxList
          .filter((t: any) => t.type === "withdrawal")
          .reduce((s: number, t: any) => s + (t.amount_usd || 0), 0);
        trendData.push({ month: label, income: Math.round(mIncome * 100) / 100, expense: Math.round(mExpense * 100) / 100 });
      }
      setMonthlyTrend(trendData);
    } catch (err) {
      console.error(err);
      setError("Error al cargar datos.");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as any)}
          className="bg-surface border border-surface-light rounded-lg px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="1m">1 mes</option>
          <option value="3m">3 meses</option>
          <option value="6m">6 meses</option>
          <option value="12m">12 meses</option>
        </select>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface rounded-xl p-4">
          <p className="text-text-muted text-xs uppercase tracking-wide">Patrimonio Neto</p>
          <p className="text-2xl font-bold text-primary mt-1">{formatCurrency(netWorth)}</p>
        </div>
        <div className="bg-surface rounded-xl p-4">
          <p className="text-text-muted text-xs uppercase tracking-wide">Balance del período</p>
          <p className={`text-2xl font-bold mt-1 ${monthlyIncome - monthlyExpense >= 0 ? "text-secondary" : "text-danger"}`}>
            {formatCurrency(monthlyIncome - monthlyExpense)}
          </p>
        </div>
        <div className="bg-surface rounded-xl p-4">
          <p className="text-text-muted text-xs uppercase tracking-wide">Ingresos</p>
          <p className="text-2xl font-bold text-secondary mt-1">{formatCurrency(monthlyIncome)}</p>
        </div>
        <div className="bg-surface rounded-xl p-4">
          <p className="text-text-muted text-xs uppercase tracking-wide">Gastos</p>
          <p className="text-2xl font-bold text-danger mt-1">{formatCurrency(monthlyExpense)}</p>
        </div>
      </div>

      <div className="bg-surface rounded-xl p-4">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">Ingresos vs Gastos</h2>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", color: "#f8fafc" }} formatter={(value: number) => formatCurrency(value)} />
              <Bar dataKey="income" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {categoryData.length > 0 && (
        <div className="bg-surface rounded-xl p-4">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">Gastos por Categoría</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {categoryData.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="bg-surface rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">Últimas Transacciones</h2>
          <Link to="/transactions" className="text-xs text-primary hover:underline">Ver todas</Link>
        </div>
        <div className="space-y-2">
          {recentTxs.length === 0 && <p className="text-text-muted text-sm text-center py-4">No hay transacciones</p>}
          {recentTxs.slice(0, 10).map((tx: any) => {
            const amount = parseFloat(tx.amount || "0");
            const isNegative = tx.type === "withdrawal";
            const currency = tx.currency || "USD";
            const isVES = currency === "VES";
            return (
              <div key={tx.id} className="flex items-center justify-between py-2 border-b border-surface-light last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{tx.description || "Sin descripción"}</p>
                  <p className="text-xs text-text-muted">
                    {tx.date}
                    {tx.category_name && ` · ${tx.category_name}`}
                  </p>
                </div>
                <div className="text-right ml-3">
                  <span className={`text-sm font-semibold block ${isNegative ? "text-danger" : "text-secondary"}`}>
                    {isNegative ? "-" : "+"}{formatCurrency(Math.abs(amount), currency)}
                  </span>
                  {isVES && (
                    <span className="text-[10px] text-text-muted block">
                      ≈ {formatCurrency(tx.amount_usd || 0)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
