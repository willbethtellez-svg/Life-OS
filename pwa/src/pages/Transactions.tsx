import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '@/lib/db';
import { formatCurrency, generateId } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import type { PendingTransaction, CurrencyCode, TransactionType } from '@/types';

async function getVesRateForDate(date: string): Promise<number | null> {
  try {
    const rates = await db.exchangeRates.getByDate(date);
    const r = rates.find(r => r.from_currency === 'USDT' && r.to_currency === 'VES')
      || rates.find(r => r.from_currency === 'USD' && r.to_currency === 'VES');
    if (r) return r.rate;
    const allRates = await db.exchangeRates.getAll();
    const vesRates = allRates
      .filter(r => (r.from_currency === 'USDT' || r.from_currency === 'USD') && r.to_currency === 'VES')
      .sort((a, b) => b.date.localeCompare(a.date));
    return vesRates[0]?.rate || null;
  } catch { return null; }
}

const COLUMN_DEFAULTS: Record<string, number> = {
  date: 100, description: 220, account: 160, category: 130, jar: 150, amount: 150, actions: 72,
};

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'all' | 'pending'>('all');
  const [pending, setPending] = useState<PendingTransaction[]>([]);
  const [showFee, setShowFee] = useState(false);
  const [previewRate, setPreviewRate] = useState<number | null>(null);
  const [editingTx, setEditingTx] = useState<string | null>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try { return { ...COLUMN_DEFAULTS, ...JSON.parse(localStorage.getItem('tx_col_widths') || '{}') }; }
    catch { return { ...COLUMN_DEFAULTS }; }
  });
  const [popover, setPopover] = useState<{ id: string; field: string; options: { label: string; value: any }[]; rect: DOMRect } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    amount: '',
    currency: 'VES' as CurrencyCode,
    description: '',
    accountId: '',
    destinationAccountId: '',
    type: 'withdrawal' as TransactionType,
    categoryId: '',
    piggyBankId: '',
    destinationPiggyBankId: '',
    foreignAmount: '',
    foreignCurrency: 'USD' as CurrencyCode,
    fee: '',
    feeCurrency: 'VES' as CurrencyCode,
    feeCategoryId: '',
    date: new Date().toISOString().split('T')[0],
  });

  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [jars, setJars] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [txList, accList, catList, pendingList, jarList] = await Promise.all([
        db.transactions.list({ limit: 100 }),
        db.accounts.list({ type: 'asset' }),
        db.categories.list(),
        db.pendingTransactions.getAll(),
        db.piggyBanks.list(),
      ]);
      setTransactions(txList);
      setAccounts(accList);
      setCategories(catList);
      setPending(pendingList);
      setJars(jarList);
    } catch (err) {
      setError('Error al cargar transacciones');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (form.date && form.currency === 'VES') {
      getVesRateForDate(form.date).then(setPreviewRate);
    }
  }, [form.date, form.currency]);

  function getAccountName(id: string): string {
    return accounts.find(a => a.id === id)?.name || id;
  }
  function getCategoryName(id: string): string | null {
    return categories.find(c => c.id === id)?.name || null;
  }
  function getJarName(id: string): string {
    return jars.find(j => j.id === id)?.name || '';
  }

  function resetForm() {
    setForm({
      amount: '', currency: 'VES', description: '', accountId: '', destinationAccountId: '',
      type: 'withdrawal', categoryId: '', piggyBankId: '', destinationPiggyBankId: '',
      foreignAmount: '', foreignCurrency: 'USD', fee: '', feeCurrency: 'VES', feeCategoryId: '',
      date: new Date().toISOString().split('T')[0],
    });
    setShowFee(false);
    setEditingTx(null);
  }

  async function handleSubmit(e: React.FormEvent) {
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
    if (isNaN(amount) || amount <= 0) { setError('Monto inválido'); return; }

    const fee = form.fee ? parseFloat(form.fee) : null;
    const foreignAmount = form.foreignAmount ? parseFloat(form.foreignAmount) : null;

    const txData: any = {
      date: form.date,
      description: form.description,
      amount,
      currency: form.currency,
      type: form.type,
      source_account_id: form.type === 'deposit' ? null : form.accountId,
      destination_account_id: form.type === 'withdrawal' ? null : (form.destinationAccountId || form.accountId),
      category_id: form.type === 'transfer' ? null : (form.categoryId || null),
      piggy_bank_id: form.type === 'withdrawal' || form.type === 'transfer' ? (form.piggyBankId || null) : null,
      destination_piggy_bank_id: form.type === 'transfer' ? (form.destinationPiggyBankId || null) : null,
      foreign_amount: foreignAmount,
      foreign_currency: foreignAmount ? form.foreignCurrency : null,
      fee: fee && fee > 0 ? fee : 0,
      fee_currency: fee && fee > 0 ? form.feeCurrency : null,
      confirmed: true,
    };

    try {
      if (editingTx) {
        await db.transactions.update(editingTx, txData);
      } else {
        await db.transactions.create(txData);

        if (fee && fee > 0) {
          await db.transactions.create({
            date: form.date,
            description: `Comisión: ${form.description}`,
            amount: fee,
            currency: form.feeCurrency,
            type: 'withdrawal',
            source_account_id: form.accountId,
            category_id: form.feeCategoryId || null,
            confirmed: true,
          });
        }

        if (form.type === 'transfer' && foreignAmount && foreignAmount > 0 && amount > 0) {
          const sourceCurrency = form.currency;
          const destCurrency = accounts.find(a => a.id === form.destinationAccountId)?.currency;
          if (sourceCurrency !== destCurrency) {
            let fromCur: string, toCur: string, rate: number;
            if ((sourceCurrency === 'USD' || sourceCurrency === 'USDT') && destCurrency === 'VES') {
              fromCur = sourceCurrency; toCur = 'VES'; rate = foreignAmount / amount;
            } else if (sourceCurrency === 'VES' && (destCurrency === 'USD' || destCurrency === 'USDT')) {
              fromCur = destCurrency; toCur = 'VES'; rate = amount / foreignAmount;
            } else {
              fromCur = sourceCurrency; toCur = destCurrency; rate = foreignAmount / amount;
            }
            await db.exchangeRates.set({
              date: form.date, from_currency: fromCur, to_currency: toCur,
              rate: Math.round(rate * 100) / 100, source: 'p2p_average', transactions_used: 1,
            });
          }
        }
      }

      resetForm();
      fetchData();
    } catch (err) {
      console.error(err);
      setError(editingTx ? 'Error al editar la transacción' : 'Error al crear la transacción');
    }
  }

  async function handleInlineUpdate(txId: string, field: string, value: any) {
    try {
      await db.transactions.update(txId, { [field]: value });
      setPopover(null);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  }

  function startResize(col: string, e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = colWidths[col] || COLUMN_DEFAULTS[col] || 120;
    function onMove(e: MouseEvent) {
      const w = Math.max(60, startW + e.clientX - startX);
      setColWidths(p => {
        const next = { ...p, [col]: w };
        localStorage.setItem('tx_col_widths', JSON.stringify(next));
        return next;
      });
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function openPopover(id: string, field: string, options: { label: string; value: any }[], e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopover({ id, field, options, rect });
  }

  // Close popover on outside click
  useEffect(() => {
    if (!popover) return;
    function onClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [popover]);

  function startEdit(tx: any) {
    setForm({
      date: tx.date,
      description: tx.description || '',
      amount: tx.amount?.toString() || '',
      currency: tx.currency || 'USD',
      type: tx.type || 'withdrawal',
      accountId: tx.source_account_id || '',
      destinationAccountId: tx.destination_account_id || '',
      categoryId: tx.category_id || '',
      piggyBankId: tx.piggy_bank_id || '',
      destinationPiggyBankId: tx.destination_piggy_bank_id || '',
      foreignAmount: tx.foreign_amount?.toString() || '',
      foreignCurrency: tx.foreign_currency || 'USD',
      fee: tx.fee > 0 ? tx.fee.toString() : '',
      feeCurrency: tx.fee_currency || 'VES',
      feeCategoryId: '',
    });
    setEditingTx(tx.id);
    setShowForm(true);
    setShowFee(tx.fee > 0);
    setTab('all');
  }

  async function handleDeleteTx(id: string) {
    if (!confirm('¿Eliminar esta transacción?')) return;
    try {
      await db.transactions.delete(id);
      fetchData();
    } catch (err) { console.error(err); }
  }

  async function confirmTransaction(id: string) {
    const tx = pending.find(p => p.id === id);
    if (!tx) return;
    setError('');
    try {
      await db.transactions.create({
        date: tx.date, description: tx.description, amount: tx.amount, currency: tx.currency,
        type: tx.type, source_account_id: tx.type === 'deposit' ? null : tx.accountId,
        destination_account_id: tx.type === 'withdrawal' ? null : (tx.destinationAccountId || tx.accountId),
        category_id: tx.categoryId || null, piggy_bank_id: tx.piggyBankId || null,
        destination_piggy_bank_id: tx.destinationPiggyBankId || null,
        fee: tx.fee || 0, fee_currency: tx.feeCurrency || null, confirmed: true,
      });
      await db.pendingTransactions.delete(id);
      setPending(prev => prev.filter(p => p.id !== id));
      fetchData();
    } catch (err) {
      console.error(err);
      setError('Error al confirmar');
    }
  }

  async function deletePending(id: string) {
    await db.pendingTransactions.delete(id);
    setPending(prev => prev.filter(p => p.id !== id));
  }

  const activePending = pending.filter(p => !p.confirmed);
  const isMultiCurrencyTransfer = form.type === 'transfer' && form.currency !== accounts.find(a => a.id === form.destinationAccountId)?.currency;

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Transacciones</h1>
        <Button size="icon" onClick={() => { resetForm(); setShowForm(!showForm); }} className="rounded-full w-10 h-10">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            {showForm ? <path d="M6 18L18 6M6 6l12 12" /> : <path d="M12 5v14M5 12h14" />}
          </svg>
        </Button>
      </div>

      {error && <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">{error}</div>}

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface rounded-xl p-4 lg:p-5 space-y-3 border border-surface-light">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">Fecha</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="lg:col-span-2">
              <label className="block text-xs text-text-muted mb-1">Descripción</label>
              <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="¿En qué gastaste?" required />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">
                {form.type === 'transfer' ? 'Cuenta origen' : 'Cuenta'}
              </label>
              <select value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value, currency: accounts.find(a => a.id === e.target.value)?.currency || f.currency }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary" required>
                <option value="">Selecciona</option>
                {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
              </select>
            </div>

            {form.type === 'transfer' && (
              <div>
                <label className="block text-xs text-text-muted mb-1">Cuenta destino</label>
                <select value={form.destinationAccountId} onChange={e => setForm(f => ({ ...f, destinationAccountId: e.target.value }))}
                  className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary" required>
                  <option value="">Selecciona destino</option>
                  {accounts.filter(a => a.id !== form.accountId).map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs text-text-muted mb-1">Tipo</label>
              <div className="flex gap-1">
                {(['withdrawal', 'deposit', 'transfer'] as TransactionType[]).map(t => (
                  <button key={t} type="button" onClick={() => setForm(f => ({ ...f, type: t, categoryId: '', piggyBankId: '', destinationPiggyBankId: '' }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      form.type === t ? t === 'withdrawal' ? 'bg-danger text-white' : t === 'deposit' ? 'bg-secondary text-white' : 'bg-primary text-white' : 'bg-surface-light text-text-muted'
                    }`}>
                    {t === 'withdrawal' ? 'Gasto' : t === 'deposit' ? 'Ingreso' : 'Transf'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Amount row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs text-text-muted mb-1">
                {isMultiCurrencyTransfer ? `Monto enviado (${form.currency})` : 'Monto'}
              </label>
              <input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-lg font-bold text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="0.00" required autoFocus />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Moneda</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value as CurrencyCode }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="VES">VES</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="BTC">BTC</option><option value="USDT">USDT</option>
              </select>
            </div>
            <div>
              {form.type !== 'transfer' && (
                <div>
                  <label className="block text-xs text-text-muted mb-1">Categoría</label>
                  <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                    className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">Sin categoría</option>
                    {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Multi-currency transfer detail */}
          {isMultiCurrencyTransfer && (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-primary">Monto recibido en la cuenta destino</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <input type="number" step="0.01" value={form.foreignAmount} onChange={e => setForm(f => ({ ...f, foreignAmount: e.target.value }))}
                    className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={`Monto en ${accounts.find(a => a.id === form.destinationAccountId)?.currency || '?'}`} />
                </div>
                <div>
                  <input type="text" disabled value={accounts.find(a => a.id === form.destinationAccountId)?.currency || ''}
                    className="w-full bg-surface border border-surface-light rounded-lg px-3 py-2.5 text-text text-center" />
                </div>
              </div>
              {form.foreignAmount && form.amount && parseFloat(form.foreignAmount) > 0 && parseFloat(form.amount) > 0 && (
                <p className="text-xs text-primary">
                  Tasa implícita: {form.currency === 'VES'
                    ? `1 ${accounts.find(a => a.id === form.destinationAccountId)?.currency} = ${(parseFloat(form.amount) / parseFloat(form.foreignAmount)).toFixed(2)} VES`
                    : `1 ${form.currency} = ${(parseFloat(form.foreignAmount) / parseFloat(form.amount)).toFixed(2)} ${accounts.find(a => a.id === form.destinationAccountId)?.currency}`
                  }
                </p>
              )}
            </div>
          )}

          {!isMultiCurrencyTransfer && form.currency === 'VES' && previewRate && form.amount && (
            <div className="bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 text-xs text-primary">
              ≈ {formatCurrency(parseFloat(form.amount) / previewRate)} USD (a {previewRate.toFixed(2)} VES/USD)
            </div>
          )}

          {/* Jars */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {(form.type === 'withdrawal' || form.type === 'transfer') && jars.length > 0 && (
              <div>
                <label className="block text-xs text-text-muted mb-1">Jarra (origen)</label>
                <select value={form.piggyBankId} onChange={e => setForm(f => ({ ...f, piggyBankId: e.target.value }))}
                  className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">Sin jarra</option>
                  {jars.map((j: any) => <option key={j.id} value={j.id}>{j.name} ({formatCurrency(j.current_amount || 0, j.currency)})</option>)}
                </select>
              </div>
            )}
            {form.type === 'transfer' && jars.length > 0 && (
              <div>
                <label className="block text-xs text-text-muted mb-1">Jarra (destino)</label>
                <select value={form.destinationPiggyBankId} onChange={e => setForm(f => ({ ...f, destinationPiggyBankId: e.target.value }))}
                  className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">Sin jarra</option>
                  {jars.map((j: any) => <option key={j.id} value={j.id}>{j.name} ({formatCurrency(j.current_amount || 0, j.currency)})</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Fee toggle */}
          {form.type !== 'transfer' && (
            <div>
              <button type="button" onClick={() => setShowFee(!showFee)} className="flex items-center gap-2 text-xs text-text-muted hover:text-text transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${showFee ? 'rotate-90' : ''}`}><path d="M9 18l6-6-6-6" /></svg>
                {showFee ? 'Ocultar comisión' : '+ Agregar comisión'}
              </button>
            </div>
          )}

          {showFee && (
            <div className="bg-background rounded-lg p-3 space-y-2 border border-surface-light">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <input type="number" step="0.01" value={form.fee} onChange={e => setForm(f => ({ ...f, fee: e.target.value }))}
                    className="w-full bg-surface border border-surface-light rounded-lg px-3 py-2 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Monto comisión" />
                </div>
                <select value={form.feeCurrency} onChange={e => setForm(f => ({ ...f, feeCurrency: e.target.value as CurrencyCode }))}
                  className="w-full bg-surface border border-surface-light rounded-lg px-2 py-2 text-text focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="VES">VES</option><option value="USD">USD</option><option value="USDT">USDT</option>
                </select>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" className="flex-1">{editingTx ? 'Guardar cambios' : 'Registrar'}</Button>
            <Button type="button" variant="ghost" onClick={resetForm}>Cancelar</Button>
          </div>
        </form>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface rounded-lg p-1 w-fit">
        <button onClick={() => setTab('all')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'all' ? 'bg-primary text-white' : 'text-text-muted'}`}>Todas</button>
        <button onClick={() => setTab('pending')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors relative ${tab === 'pending' ? 'bg-warning text-black' : 'text-text-muted'}`}>
          Pendientes
          {activePending.length > 0 && <span className="ml-1.5 bg-danger text-white text-[10px] rounded-full px-1.5 py-0.5">{activePending.length}</span>}
        </button>
      </div>

      {/* Pending tab */}
      {tab === 'pending' && (
        <div className="space-y-2">
          {activePending.length === 0 && <div className="text-center py-8 text-text-muted"><p className="text-sm">No hay pendientes</p></div>}
          {activePending.map((tx) => (
            <div key={tx.id} className="bg-surface rounded-xl p-4 border border-warning/30">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{tx.description}</p>
                  <p className="text-xs text-text-muted mt-0.5">{tx.date} · {tx.accountName}</p>
                </div>
                <span className={`text-lg font-bold ml-3 ${tx.type === 'withdrawal' ? 'text-danger' : 'text-secondary'}`}>
                  {tx.type === 'withdrawal' ? '-' : '+'}{formatCurrency(tx.amount, tx.currency)}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => confirmTransaction(tx.id)} className="flex-1 bg-secondary hover:bg-secondary/80 text-white text-sm font-medium rounded-lg py-2 transition-colors">✓ Confirmar</button>
                <button onClick={() => deletePending(tx.id)} className="px-4 py-2 text-sm text-danger hover:bg-danger/10 rounded-lg transition-colors">Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* All transactions - Table view (desktop) / Card list (mobile) */}
      {tab === 'all' && (
        <div>
          {loading ? (
            <Spinner fullPage />
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 text-text-muted"><p className="text-sm">No hay transacciones</p></div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden lg:block bg-surface rounded-xl border border-surface-light overflow-hidden">
                <table className="w-full" style={{ tableLayout: 'fixed' }}>
                  <thead>
                    <tr className="border-b border-surface-light">
                      {[
                        { key: 'date', label: 'Fecha', align: 'text-left' },
                        { key: 'description', label: 'Descripción', align: 'text-left' },
                        { key: 'account', label: 'Cuenta', align: 'text-left' },
                        { key: 'category', label: 'Categoría', align: 'text-left' },
                        { key: 'jar', label: 'Jarra', align: 'text-left' },
                        { key: 'amount', label: 'Monto', align: 'text-right' },
                        { key: 'actions', label: '', align: 'text-center', noResize: true },
                      ].map(col => (
                        <th key={col.key}
                          className={`px-3 py-3 text-xs font-medium text-text-muted uppercase tracking-wider ${col.align} select-none relative`}
                          style={{ width: colWidths[col.key] || undefined, minWidth: col.noResize ? 72 : 60 }}>
                          {col.label}
                          {!col.noResize && (
                            <div className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/30 active:bg-primary/50"
                              onMouseDown={e => startResize(col.key, e)} />
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx: any) => {
                      const amount = parseFloat(tx.amount || '0');
                      const currency = tx.currency || 'USD';
                      const isNegative = tx.type === 'withdrawal';
                      const isTransfer = tx.type === 'transfer';
                      const desc = tx.description || 'Sin descripción';
                      const isFee = desc.toLowerCase().startsWith('comisión:');

                      return (
                        <tr key={tx.id} className={`border-b border-surface-light last:border-0 hover:bg-surface-light/30 transition-colors ${isFee ? 'opacity-50' : ''}`}>
                          <td className="px-3 py-3 text-sm text-text-muted whitespace-nowrap">{tx.date}</td>
                          <td className="px-3 py-3">
                            <p className="text-sm font-medium truncate" style={{ maxWidth: colWidths.description - 24 || 196 }}>
                              {isFee && <span className="text-text-muted mr-1">↳</span>}
                              {isTransfer && <span className="text-transfer mr-1">⟷</span>}
                              {desc}
                            </p>
                          </td>
                          {/* Account chip */}
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              <button onClick={e => openPopover(tx.id, 'source_account_id',
                                [{ label: 'Sin cuenta', value: null }, ...accounts.map(a => ({ label: `${a.name} (${a.currency})`, value: a.id }))], e)}
                                className="text-xs px-2 py-0.5 rounded-full border border-surface-light text-text-muted hover:border-text-muted">
                                {tx.source_name || (tx.type === 'deposit' ? tx.destination_name : 'Seleccionar')}
                              </button>
                              {isTransfer && (
                                <button onClick={e => openPopover(tx.id, 'destination_account_id',
                                  [{ label: 'Sin destino', value: null }, ...accounts.map(a => ({ label: `${a.name} (${a.currency})`, value: a.id }))], e)}
                                  className="text-xs px-2 py-0.5 rounded-full border border-surface-light text-text-muted hover:border-text-muted">
                                  {tx.destination_name || 'Destino'}
                                </button>
                              )}
                            </div>
                          </td>
                          {/* Category chip */}
                          <td className="px-3 py-3">
                            <button onClick={e => openPopover(tx.id, 'category_id',
                              [{ label: 'Sin categoría', value: null }, ...categories.map(c => ({ label: c.name, value: c.id }))], e)}
                              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                                tx.category_name
                                  ? 'border-primary/30 text-primary bg-primary/5 hover:bg-primary/10'
                                  : 'border-surface-light text-text-muted hover:border-text-muted'
                              }`}>
                              {tx.category_name || '+ Categoría'}
                            </button>
                          </td>
                          {/* Jar chips */}
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              <button onClick={e => openPopover(tx.id, 'piggy_bank_id',
                                [{ label: 'Sin jarra', value: null }, ...jars.map(j => ({ label: `${j.name} (${formatCurrency(j.current_amount || 0, j.currency)})`, value: j.id }))], e)}
                                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                                  tx.piggy_bank_name
                                    ? 'border-transfer/30 text-transfer bg-transfer/5 hover:bg-transfer/10'
                                    : 'border-surface-light text-text-muted hover:border-text-muted'
                                }`}>
                                {tx.piggy_bank_name ? `🏺 ${tx.piggy_bank_name}` : '+ Jarra'}
                              </button>
                              {isTransfer && (
                                <button onClick={e => openPopover(tx.id, 'destination_piggy_bank_id',
                                  [{ label: 'Sin jarra destino', value: null }, ...jars.map(j => ({ label: `${j.name} (${formatCurrency(j.current_amount || 0, j.currency)})`, value: j.id }))], e)}
                                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                                    tx.destination_piggy_bank_name
                                      ? 'border-secondary/30 text-secondary bg-secondary/5 hover:bg-secondary/10'
                                      : 'border-surface-light text-text-muted hover:border-text-muted'
                                  }`}>
                                  {tx.destination_piggy_bank_name ? `→ 🏺 ${tx.destination_piggy_bank_name}` : '+ Jarra dest'}
                                </button>
                              )}
                            </div>
                          </td>
                          {/* Amount */}
                          <td className="px-3 py-3 text-right">
                            <div className="flex flex-col items-end">
                              <span className={`text-sm font-semibold ${
                                isNegative ? 'text-danger' : isTransfer ? 'text-transfer' : 'text-secondary'
                              }`}>
                                {isTransfer ? '±' : isNegative ? '−' : '+'}
                                {formatCurrency(Math.abs(amount), currency)}
                              </span>
                              {tx.amount_usd != null && tx.currency !== 'USD' && tx.currency !== 'USDT' && (
                                <span className="text-[11px] text-text-muted">≈ {formatCurrency(tx.amount_usd)} USD</span>
                              )}
                              {tx.foreign_amount > 0 && tx.foreign_currency && (
                                <span className="text-[10px] text-text-muted">
                                  Recibido: {formatCurrency(tx.foreign_amount, tx.foreign_currency)}
                                </span>
                              )}
                            </div>
                          </td>
                          {/* Actions */}
                          <td className="px-3 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => startEdit(tx)} className="text-text-muted hover:text-primary p-1" title="Editar">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button onClick={() => handleDeleteTx(tx.id)} className="text-text-muted hover:text-danger p-1" title="Eliminar">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Popover flotante para chips */}
                {popover && (
                  <div ref={popoverRef}
                    className="fixed z-50 bg-surface border border-surface-light rounded-lg shadow-xl py-1 min-w-[170px] max-h-[220px] overflow-y-auto"
                    style={{ left: popover.rect.left, top: popover.rect.bottom + 4 }}>
                    {popover.options.map((opt, i) => (
                      <button key={i} onClick={() => handleInlineUpdate(popover.id, popover.field, opt.value)}
                        className="w-full text-left px-3 py-2 text-sm text-text hover:bg-surface-light transition-colors">
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Mobile card list */}
              <div className="lg:hidden space-y-1">
                {transactions.map((tx: any) => {
                  const amount = parseFloat(tx.amount || '0');
                  const currency = tx.currency || 'USD';
                  const isNegative = tx.type === 'withdrawal';
                  const isTransfer = tx.type === 'transfer';
                  const desc = tx.description || 'Sin descripción';
                  const isFee = desc.toLowerCase().startsWith('comisión:');

                  return (
                    <div key={tx.id} className={`bg-surface rounded-xl p-3 border-b border-surface-light ${isFee ? 'opacity-60' : ''}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {isFee ? '↳ ' : ''}{isTransfer ? '⟷ ' : ''}{desc}
                          </p>
                          <p className="text-xs text-text-muted">
                            {tx.date}
                            {tx.category_name && ` · ${tx.category_name}`}
                            {tx.source_name && ` · ${tx.source_name}`}
                            {isTransfer && tx.destination_name && ` → ${tx.destination_name}`}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {tx.piggy_bank_name && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-transfer/30 text-transfer">🏺 {tx.piggy_bank_name}</span>
                            )}
                            {tx.destination_piggy_bank_name && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-secondary/30 text-secondary">→ 🏺 {tx.destination_piggy_bank_name}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right ml-3 flex flex-col items-end">
                          <span className={`text-sm font-semibold ${isNegative ? 'text-danger' : isTransfer ? 'text-transfer' : 'text-secondary'}`}>
                            {isTransfer ? '±' : isNegative ? '−' : '+'}{formatCurrency(Math.abs(amount), currency)}
                          </span>
                          {tx.amount_usd != null && currency !== 'USD' && currency !== 'USDT' && (
                            <span className="text-[10px] text-text-muted">≈ {formatCurrency(tx.amount_usd)} USD</span>
                          )}
                          <div className="flex gap-1 mt-1">
                            <button onClick={() => startEdit(tx)} className="text-[10px] text-primary hover:underline">Editar</button>
                            <button onClick={() => handleDeleteTx(tx.id)} className="text-[10px] text-danger hover:underline">Eliminar</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
