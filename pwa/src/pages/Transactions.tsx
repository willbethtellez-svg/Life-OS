import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { db } from '@/lib/db';
import { formatCurrency, generateId } from '@/lib/utils';
import type { PendingTransaction, CurrencyCode, TransactionType } from '@/types';

async function getVesRate(): Promise<number | null> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const rates = await db.exchangeRates.getByDate(today);
    const r = rates.find(r => r.from_currency === 'USDT' && r.to_currency === 'VES')
      || rates.find(r => r.from_currency === 'USD' && r.to_currency === 'VES');
    return r?.rate || null;
  } catch { return null; }
}

function toUSD(amount: number, currency: string, vesRate: number | null): number {
  if (currency === 'USD' || currency === 'USDT') return amount;
  if (currency === 'VES' && vesRate) return amount / vesRate;
  return 0;
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'all' | 'pending'>('all');
  const [pending, setPending] = useState<PendingTransaction[]>([]);
  const [showFee, setShowFee] = useState(false);
  const [vesRate, setVesRate] = useState<number | null>(null);

  const [form, setForm] = useState({
    amount: '',
    currency: 'VES' as CurrencyCode,
    description: '',
    accountId: '',
    destinationAccountId: '',
    type: 'withdrawal' as TransactionType,
    categoryId: '',
    piggyBankId: '',
    fee: '',
    feeCurrency: 'VES' as CurrencyCode,
    feeCategoryId: '',
  });

  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [jars, setJars] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [txList, accList, catList, pendingList, jarList, rate] = await Promise.all([
        db.transactions.list({ limit: 50 }),
        db.accounts.list({ type: 'asset' }),
        db.categories.list(),
        db.pendingTransactions.getAll(),
        db.piggyBanks.list(),
        getVesRate(),
      ]);

      setTransactions(txList);
      setAccounts(accList);
      setCategories(catList);
      setPending(pendingList);
      setJars(jarList);
      setVesRate(rate);
    } catch (err) {
      setError('Error al cargar transacciones');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function getAccountName(id: string): string {
    const acc = accounts.find(a => a.id === id);
    return acc?.name || id;
  }

  function getCategoryName(id: string): string | null {
    const cat = categories.find(c => c.id === id);
    return cat?.name || null;
  }

  function getJarName(id: string): string {
    const jar = jars.find(j => j.id === id);
    return jar?.name || '';
  }

  async function handleQuickSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.amount || !form.description || !form.accountId) {
      setError('Completa todos los campos obligatorios');
      return;
    }
    if (form.type === 'transfer' && !form.destinationAccountId) {
      setError('Selecciona la cuenta destino');
      return;
    }
    if (form.type === 'transfer' && form.accountId === form.destinationAccountId) {
      setError('Las cuentas origen y destino deben ser diferentes');
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
      destinationAccountId: form.type === 'transfer' ? form.destinationAccountId : undefined,
      type: form.type,
      categoryId: form.type === 'transfer' ? null : (form.categoryId || null),
      categoryName: form.type === 'transfer' ? null : getCategoryName(form.categoryId),
      piggyBankId: form.piggyBankId || undefined,
      fee: fee && fee > 0 ? fee : null,
      feeCurrency: fee && fee > 0 ? form.feeCurrency : null,
      feeCategoryId: fee && fee > 0 && form.feeCategoryId ? form.feeCategoryId : null,
      confirmed: false,
      synced: false,
      createdAt: new Date().toISOString(),
    };

    await db.pendingTransactions.set(pendingTx);
    setPending(prev => [pendingTx, ...prev]);
    setForm({
      amount: '', currency: 'VES', description: '', accountId: '', destinationAccountId: '',
      type: 'withdrawal', categoryId: '', piggyBankId: '',
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
      await db.transactions.create({
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        currency: tx.currency,
        type: tx.type,
        source_account_id: tx.type === 'deposit' ? null : tx.accountId,
        destination_account_id: tx.type === 'withdrawal' ? null : (tx.destinationAccountId || tx.accountId),
        category_id: tx.categoryId || null,
        piggy_bank_id: tx.piggyBankId || null,
        fee: tx.fee || 0,
        fee_currency: tx.feeCurrency || null,
        confirmed: true,
      });

      if (tx.fee && tx.fee > 0) {
        await db.transactions.create({
          date: tx.date,
          description: `Comisión: ${tx.description}`,
          amount: tx.fee,
          currency: tx.feeCurrency || tx.currency,
          type: 'withdrawal',
          source_account_id: tx.accountId,
          category_id: tx.feeCategoryId || null,
          confirmed: true,
        });
      }

      await db.pendingTransactions.delete(id);
      setPending(prev => prev.filter(p => p.id !== id));
      fetchData();
    } catch (err) {
      console.error(err);
      setError('Error al confirmar la transacción');
    }
  }

  async function deletePending(id: string) {
    await db.pendingTransactions.delete(id);
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

      {showForm && (
        <form onSubmit={handleQuickSubmit} className="bg-surface rounded-xl p-4 space-y-3">
          {/* Tipo de transacción */}
          <div>
            <label className="block text-xs text-text-muted mb-1">Tipo</label>
            <div className="flex gap-1">
              {(['withdrawal', 'deposit', 'transfer'] as TransactionType[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: t }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.type === t
                      ? t === 'withdrawal' ? 'bg-danger text-white' : t === 'deposit' ? 'bg-secondary text-white' : 'bg-primary text-white'
                      : 'bg-surface-light text-text-muted'
                  }`}
                >
                  {t === 'withdrawal' ? 'Gasto' : t === 'deposit' ? 'Ingreso' : 'Transferencia'}
                </button>
              ))}
            </div>
          </div>

          {/* Monto y moneda */}
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

          {/* Preview conversión VES→USD */}
          {form.currency === 'VES' && vesRate && form.amount && (
            <div className="bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 text-xs text-primary">
              ≈ {formatCurrency(parseFloat(form.amount) / vesRate)} USD (a {vesRate.toFixed(2)} VES/USD)
            </div>
          )}

          {/* Descripción */}
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

          {/* Cuenta origen */}
          <div>
            <label className="block text-xs text-text-muted mb-1">
              {form.type === 'transfer' ? 'Cuenta origen' : 'Cuenta'}
            </label>
            <select
              value={form.accountId}
              onChange={(e) => setForm(f => ({ ...f, accountId: e.target.value }))}
              className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary"
              required
            >
              <option value="">Selecciona una cuenta</option>
              {accounts.map((acc: any) => (
                <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
              ))}
            </select>
          </div>

          {/* Cuenta destino (solo para transferencias) */}
          {form.type === 'transfer' && (
            <div>
              <label className="block text-xs text-text-muted mb-1">Cuenta destino</label>
              <select
                value={form.destinationAccountId}
                onChange={(e) => setForm(f => ({ ...f, destinationAccountId: e.target.value }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary"
                required
              >
                <option value="">Selecciona destino</option>
                {accounts.filter(a => a.id !== form.accountId).map((acc: any) => (
                  <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                ))}
              </select>
            </div>
          )}

          {/* Categoría (no para transferencias) */}
          {form.type !== 'transfer' && (
            <div>
              <label className="block text-xs text-text-muted mb-1">Categoría</label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm(f => ({ ...f, categoryId: e.target.value }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Sin categoría</option>
                {categories.map((cat: any) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Jarra (opcional) */}
          {jars.length > 0 && (
            <div>
              <label className="block text-xs text-text-muted mb-1">
                {form.type === 'withdrawal' ? 'Jarra de donde sale' : form.type === 'deposit' ? 'Jarra donde entra' : 'Jarra (opcional)'}
              </label>
              <select
                value={form.piggyBankId}
                onChange={(e) => setForm(f => ({ ...f, piggyBankId: e.target.value }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Sin jarra</option>
                {jars.map((jar: any) => (
                  <option key={jar.id} value={jar.id}>{jar.name} ({formatCurrency(jar.current_amount || 0, jar.currency)})</option>
                ))}
              </select>
            </div>
          )}

          {/* Comisión toggle */}
          {form.type !== 'transfer' && (
            <div>
              <button
                type="button"
                onClick={() => setShowFee(!showFee)}
                className="flex items-center gap-2 text-xs text-text-muted hover:text-text transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={`transition-transform ${showFee ? 'rotate-90' : ''}`}>
                  <path d="M9 18l6-6-6-6" />
                </svg>
                {showFee ? 'Ocultar comisión' : '+ Agregar comisión'}
              </button>
            </div>
          )}

          {showFee && (
            <div className="bg-background rounded-lg p-3 space-y-2 border border-surface-light">
              <p className="text-xs font-medium text-text-muted">Comisión de la transacción</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <input type="number" step="0.01" value={form.fee}
                    onChange={(e) => setForm(f => ({ ...f, fee: e.target.value }))}
                    className="w-full bg-surface border border-surface-light rounded-lg px-3 py-2 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Monto comisión" />
                </div>
                <div>
                  <select value={form.feeCurrency}
                    onChange={(e) => setForm(f => ({ ...f, feeCurrency: e.target.value as CurrencyCode }))}
                    className="w-full bg-surface border border-surface-light rounded-lg px-2 py-2 text-text focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="VES">VES</option><option value="USD">USD</option><option value="USDT">USDT</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Categoría de la comisión</label>
                <select value={form.feeCategoryId}
                  onChange={(e) => setForm(f => ({ ...f, feeCategoryId: e.target.value }))}
                  className="w-full bg-surface border border-surface-light rounded-lg px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">Sin categoría</option>
                  {categories.map((cat: any) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 text-xs text-danger">{error}</div>
          )}

          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg py-2.5 transition-colors">Registrar</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 text-text-muted hover:text-text">Cancelar</button>
          </div>
        </form>
      )}

      <div className="flex gap-1 bg-surface rounded-lg p-1">
        <button onClick={() => setTab('all')}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'all' ? 'bg-primary text-white' : 'text-text-muted'}`}>
          Todas
        </button>
        <button onClick={() => setTab('pending')}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors relative ${tab === 'pending' ? 'bg-warning text-black' : 'text-text-muted'}`}>
          Pendientes
          {activePending.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-danger text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{activePending.length}</span>
          )}
        </button>
      </div>

      {tab === 'pending' && (
        <div className="space-y-2">
          {activePending.length === 0 && (
            <div className="text-center py-8 text-text-muted"><p className="text-sm">No hay transacciones pendientes</p></div>
          )}
          {activePending.map((tx) => (
            <div key={tx.id} className="bg-surface rounded-xl p-4 border border-warning/30">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{tx.description}</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {tx.date} · {tx.accountName}
                    {tx.categoryName && ` · ${tx.categoryName}`}
                  </p>
                  {tx.fee && tx.fee > 0 && (
                    <p className="text-xs text-text-muted mt-1">+ Comisión: {formatCurrency(tx.fee, tx.feeCurrency || tx.currency)}</p>
                  )}
                </div>
                <span className={`text-lg font-bold ml-3 ${tx.type === 'withdrawal' ? 'text-danger' : 'text-secondary'}`}>
                  {tx.type === 'withdrawal' ? '-' : '+'}{formatCurrency(tx.amount, tx.currency)}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => confirmTransaction(tx.id)}
                  className="flex-1 bg-secondary hover:bg-secondary/80 text-white text-sm font-medium rounded-lg py-2 transition-colors">✓ Confirmar</button>
                <button onClick={() => deletePending(tx.id)}
                  className="px-4 py-2 text-sm text-danger hover:bg-danger/10 rounded-lg transition-colors">Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'all' && (
        <div className="space-y-1">
          {loading ? (
            <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" /></div>
          ) : (
            <>
              {transactions.length === 0 && <div className="text-center py-8 text-text-muted"><p className="text-sm">No hay transacciones</p></div>}
              {transactions.map((tx: any) => {
                const amount = parseFloat(tx.amount || '0');
                const currency = tx.currency || 'USD';
                const isNegative = tx.type === 'withdrawal';
                const isTransfer = tx.type === 'transfer';
                const desc = tx.description || 'Sin descripción';
                const isFee = desc.toLowerCase().startsWith('comisión:');
                const usdAmount = toUSD(amount, currency, vesRate);
                const isVES = currency === 'VES';

                return (
                  <div key={tx.id} className={`flex items-center justify-between py-3 border-b border-surface-light last:border-0 ${isFee ? 'opacity-60' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {isFee ? '↳ ' : ''}{isTransfer ? '↔ ' : ''}{desc}
                      </p>
                      <p className="text-xs text-text-muted">
                        {tx.date}
                        {tx.category_name && ` · ${tx.category_name}`}
                        {tx.source_name && ` · ${tx.source_name}`}
                        {isTransfer && tx.destination_name && ` → ${tx.destination_name}`}
                        {isFee && <span> · Comisión</span>}
                      </p>
                    </div>
                    <div className="text-right ml-3">
                      <span className={`text-sm font-semibold block ${isNegative || isTransfer ? 'text-danger' : 'text-secondary'}`}>
                        {isNegative ? '-' : isTransfer ? '' : '+'}{formatCurrency(Math.abs(amount), currency)}
                      </span>
                      {isVES && vesRate && (
                        <span className="text-[10px] text-text-muted block">≈ {formatCurrency(usdAmount)}</span>
                      )}
                    </div>
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
