import { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { api } from '@/lib/firefly-api';
import { formatCurrency, generateId } from '@/lib/utils';
import { localDB } from '@/lib/db';
import type { PendingTransaction, CurrencyCode, TransactionType } from '@/types';

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'all' | 'pending'>('all');
  const [pending, setPending] = useState<PendingTransaction[]>([]);
  const [showFee, setShowFee] = useState(false);

  const [form, setForm] = useState({
    amount: '',
    currency: 'VES' as CurrencyCode,
    description: '',
    accountId: '',
    type: 'withdrawal' as TransactionType,
    categoryId: '',
    fee: '',
    feeCurrency: 'VES' as CurrencyCode,
    feeCategoryId: '',
  });

  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [txRes, accRes, catRes, pendingList] = await Promise.all([
        api.transactions.list({ limit: 50 }),
        api.accounts.list({ type: 'asset' }),
        api.categories.list(),
        localDB.pendingTransactions.getAll(),
      ]);

      setTransactions(Array.isArray(txRes) ? txRes : txRes.data || []);
      setAccounts(Array.isArray(accRes) ? accRes : accRes.data || []);
      setCategories(Array.isArray(catRes) ? catRes : catRes.data || []);
      setPending(pendingList);
    } catch (err) {
      setError('Error al cargar transacciones');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function getAccountName(id: string): string {
    const acc = accounts.find(a => {
      const aid = a.id || a.attributes?.id;
      return aid === id;
    });
    return acc?.attributes?.name || acc?.name || id;
  }

  function getCategoryName(id: string): string | null {
    const cat = categories.find(c => {
      const cid = c.id || c.attributes?.id;
      return cid === id;
    });
    return cat?.attributes?.name || cat?.name || null;
  }

  async function handleQuickSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.amount || !form.description || !form.accountId) {
      setError('Completa todos los campos obligatorios');
      return;
    }

    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      setError('Monto inválido');
      return;
    }

    const fee = form.fee ? parseFloat(form.fee) : null;
    if (fee !== null && (isNaN(fee) || fee < 0)) {
      setError('Comisión inválida');
      return;
    }

    const pendingTx: PendingTransaction = {
      id: generateId(),
      date: new Date().toISOString().split('T')[0],
      description: form.description,
      amount,
      currency: form.currency,
      accountId: form.accountId,
      accountName: getAccountName(form.accountId),
      type: form.type,
      categoryId: form.categoryId || null,
      categoryName: getCategoryName(form.categoryId),
      fee: fee && fee > 0 ? fee : null,
      feeCurrency: fee && fee > 0 ? form.feeCurrency : null,
      feeCategoryId: fee && fee > 0 && form.feeCategoryId ? form.feeCategoryId : null,
      confirmed: false,
      synced: false,
      createdAt: new Date().toISOString(),
    };

    await localDB.pendingTransactions.set(pendingTx);
    setPending(prev => [pendingTx, ...prev]);
    setForm({
      amount: '', currency: 'VES', description: '', accountId: '',
      type: 'withdrawal', categoryId: '',
      fee: '', feeCurrency: 'VES', feeCategoryId: '',
    });
    setShowFee(false);
    setShowForm(false);
  }

  async function confirmTransaction(id: string) {
    const tx = pending.find(p => p.id === id);
    if (!tx) return;

    setError('');

    try {
      const transactionList: Record<string, unknown>[] = [];

      const mainTx: Record<string, unknown> = {
        type: tx.type === 'withdrawal' ? 'withdrawal' : tx.type === 'deposit' ? 'deposit' : 'transfer',
        date: tx.date,
        amount: tx.amount.toString(),
        description: tx.description,
        currency_code: tx.currency,
        category_id: tx.categoryId || undefined,
        source_id: tx.type === 'deposit' ? undefined : tx.accountId,
        source_name: tx.type === 'deposit' ? 'Saldo inicial' : tx.accountName,
        destination_id: tx.type === 'withdrawal' ? undefined : tx.accountId,
        destination_name: tx.type === 'withdrawal' ? 'Gasto' : tx.accountName,
      };

      transactionList.push(mainTx);

      if (tx.fee && tx.fee > 0) {
        const feeTx: Record<string, unknown> = {
          type: 'withdrawal',
          date: tx.date,
          amount: tx.fee.toString(),
          description: `Comisión: ${tx.description}`,
          currency_code: tx.feeCurrency || tx.currency,
          category_id: tx.feeCategoryId || undefined,
          source_id: tx.accountId,
          source_name: tx.accountName,
        };
        transactionList.push(feeTx);
      }

      await api.transactions.create({ transactions: transactionList });
      await localDB.pendingTransactions.set({ ...tx, confirmed: true, synced: true });
      setPending(prev => prev.filter(p => p.id !== id));
      fetchData();
    } catch (err) {
      console.error(err);
      setError('Error al confirmar la transacción');
    }
  }

  async function deletePending(id: string) {
    await localDB.pendingTransactions.delete(id);
    setPending(prev => prev.filter(p => p.id !== id));
  }

  const activePending = pending.filter(p => !p.confirmed);

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Transacciones</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-primary hover:bg-primary-dark text-white rounded-full w-10 h-10 flex items-center justify-center text-xl font-bold transition-colors"
        >
          {showForm ? '×' : '+'}
        </button>
      </div>

      {/* Quick Entry Form */}
      {showForm && (
        <form onSubmit={handleQuickSubmit} className="bg-surface rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-xs text-text-muted mb-1">Monto</label>
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-lg font-bold text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="0.00"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Moneda</label>
              <select
                value={form.currency}
                onChange={(e) => setForm(f => ({ ...f, currency: e.target.value as CurrencyCode }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="VES">VES</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="BTC">BTC</option>
                <option value="USDT">USDT</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1">Descripción</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="¿En qué gastaste?"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1">Cuenta</label>
            <select
              value={form.accountId}
              onChange={(e) => setForm(f => ({ ...f, accountId: e.target.value }))}
              className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary"
              required
            >
              <option value="">Selecciona una cuenta</option>
              {accounts.map((acc: any) => {
                const attrs = acc.attributes || acc;
                const id = acc.id || attrs.id;
                return (
                  <option key={id} value={id}>
                    {attrs.name} ({attrs.currency_code || attrs.currency})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-text-muted mb-1">Tipo</label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: 'withdrawal' as TransactionType }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.type === 'withdrawal' ? 'bg-danger text-white' : 'bg-surface-light text-text-muted'
                  }`}
                >
                  Gasto
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: 'deposit' as TransactionType }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.type === 'deposit' ? 'bg-secondary text-white' : 'bg-surface-light text-text-muted'
                  }`}
                >
                  Ingreso
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Categoría</label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm(f => ({ ...f, categoryId: e.target.value }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Sin categoría</option>
                {categories.map((cat: any) => {
                  const attrs = cat.attributes || cat;
                  const id = cat.id || attrs.id;
                  return (
                    <option key={id} value={id}>{attrs.name}</option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Comisión toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowFee(!showFee)}
              className="flex items-center gap-2 text-xs text-text-muted hover:text-text transition-colors"
            >
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`transition-transform ${showFee ? 'rotate-90' : ''}`}
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
              {showFee ? 'Ocultar comisión' : '+ Agregar comisión'}
            </button>
          </div>

          {showFee && (
            <div className="bg-background rounded-lg p-3 space-y-2 border border-surface-light">
              <p className="text-xs font-medium text-text-muted">Comisión de la transacción</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <input
                    type="number"
                    step="0.01"
                    value={form.fee}
                    onChange={(e) => setForm(f => ({ ...f, fee: e.target.value }))}
                    className="w-full bg-surface border border-surface-light rounded-lg px-3 py-2 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Monto comisión"
                  />
                </div>
                <div>
                  <select
                    value={form.feeCurrency}
                    onChange={(e) => setForm(f => ({ ...f, feeCurrency: e.target.value as CurrencyCode }))}
                    className="w-full bg-surface border border-surface-light rounded-lg px-2 py-2 text-text focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="VES">VES</option>
                    <option value="USD">USD</option>
                    <option value="USDT">USDT</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Categoría de la comisión</label>
                <select
                  value={form.feeCategoryId}
                  onChange={(e) => setForm(f => ({ ...f, feeCategoryId: e.target.value }))}
                  className="w-full bg-surface border border-surface-light rounded-lg px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Sin categoría</option>
                  {categories.map((cat: any) => {
                    const attrs = cat.attributes || cat;
                    const id = cat.id || attrs.id;
                    return (
                      <option key={id} value={id}>{attrs.name}</option>
                    );
                  })}
                </select>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg py-2.5 transition-colors"
            >
              Registrar
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2.5 text-text-muted hover:text-text"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface rounded-lg p-1">
        <button
          onClick={() => setTab('all')}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'all' ? 'bg-primary text-white' : 'text-text-muted'
          }`}
        >
          Todas
        </button>
        <button
          onClick={() => setTab('pending')}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors relative ${
            tab === 'pending' ? 'bg-warning text-black' : 'text-text-muted'
          }`}
        >
          Pendientes
          {activePending.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-danger text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
              {activePending.length}
            </span>
          )}
        </button>
      </div>

      {/* Pending Transactions */}
      {tab === 'pending' && (
        <div className="space-y-2">
          {activePending.length === 0 && (
            <div className="text-center py-8 text-text-muted">
              <p className="text-lg mb-1">✓</p>
              <p className="text-sm">No hay transacciones pendientes</p>
            </div>
          )}
          {activePending.map((tx) => (
            <div key={tx.id} className="bg-surface rounded-xl p-4 border border-warning/30">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{tx.description}</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {format(new Date(tx.date), 'dd/MM/yy')} · {tx.accountName}
                    {tx.categoryName && ` · ${tx.categoryName}`}
                  </p>
                  {tx.fee && tx.fee > 0 && (
                    <p className="text-xs text-text-muted mt-1">
                      + Comisión: {formatCurrency(tx.fee, tx.feeCurrency || tx.currency)}
                    </p>
                  )}
                </div>
                <span className={`text-lg font-bold ml-3 ${
                  tx.type === 'withdrawal' ? 'text-danger' : 'text-secondary'
                }`}>
                  {tx.type === 'withdrawal' ? '-' : '+'}
                  {formatCurrency(tx.amount, tx.currency)}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => confirmTransaction(tx.id)}
                  className="flex-1 bg-secondary hover:bg-secondary/80 text-white text-sm font-medium rounded-lg py-2 transition-colors"
                >
                  ✓ Confirmar
                </button>
                <button
                  onClick={() => deletePending(tx.id)}
                  className="px-4 py-2 text-sm text-danger hover:bg-danger/10 rounded-lg transition-colors"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* All Transactions */}
      {tab === 'all' && (
        <div className="space-y-1">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
              {transactions.length === 0 && (
                <div className="text-center py-8 text-text-muted">
                  <p className="text-sm">No hay transacciones registradas</p>
                </div>
              )}
              {transactions.map((tx: any) => {
                const attrs = tx.attributes || tx;
                const type = attrs.type;
                const amount = parseFloat(attrs.amount || '0');
                const currency = attrs.currency_code || attrs.currency || 'USD';
                const isNegative = type === 'withdrawal' || amount < 0;
                const date = attrs.date || attrs.createdAt;
                const desc = attrs.description || attrs.notes || 'Sin descripción';
                const isFee = desc.toLowerCase().startsWith('comisión:');

                return (
                  <div
                    key={tx.id}
                    className={`flex items-center justify-between py-3 border-b border-surface-light last:border-0 ${
                      isFee ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {isFee ? '↳ ' : ''}{desc}
                      </p>
                      <p className="text-xs text-text-muted">
                        {date ? format(parseISO(date), 'dd/MM/yy') : ''}
                        {attrs.category_name && ` · ${attrs.category_name}`}
                        {attrs.source_name && ` · ${attrs.source_name}`}
                        {isFee && <span className="text-text-muted"> · Comisión</span>}
                      </p>
                    </div>
                    <span className={`text-sm font-semibold ml-3 ${
                      isNegative ? 'text-danger' : 'text-secondary'
                    }`}>
                      {isNegative ? '-' : '+'}
                      {formatCurrency(Math.abs(amount), currency)}
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
