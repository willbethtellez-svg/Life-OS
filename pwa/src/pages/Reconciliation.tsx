import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { db } from '@/lib/db';
import { formatCurrency, generateId } from '@/lib/utils';
import { Card, CardHeader, CardTitle, Button, Input, Field } from '@/components/ui';
import {
  toUSDClient,
  computeAccountFinalBalance, computeAccountHistoricalUsdBasis,
  computeJarFinalBalance, computeJarHistoricalUsdBasis,
  transactionMissingRate,
} from '@/lib/ledger';
import type { Account, PiggyBank, Transaction, ExchangeRate, ReconciliationGroup } from '@/types';

interface ReconciliationResult {
  aNow: number;
  jNow: number;
  aHist: number;
  jHist: number;
  gapNow: number;
  gapHist: number;
  rateDiff: number;
  missingRateLabels: string[];
  mismatchLabels: string[];
}

// El corazón de la conciliación: para el conjunto de cuentas/jarras dado,
// compara el valor en USD "a tasa de hoy" contra el valor "a tasa histórica"
// (la que aplicó en cada movimiento real, vía amount_usd). La resta entre
// ambas vistas aísla cuánto de la brecha de hoy es solo ruido de tipo de
// cambio — el resto es la brecha estructural real (dinero en cuentas que
// nunca se asignó a una jarra). Por construcción:
//   rateDiff + gapHist === gapNow
function computeReconciliation(
  accountIds: string[],
  jarIds: string[],
  accounts: Account[],
  jars: PiggyBank[],
  allTxs: Transaction[],
  rates: ExchangeRate[],
): ReconciliationResult {
  let aNow = 0, aHist = 0, jNow = 0, jHist = 0;
  const missingRateLabels: string[] = [];
  const mismatchLabels: string[] = [];

  for (const accId of accountIds) {
    const acc = accounts.find(a => a.id === accId);
    if (!acc) continue;
    const txs = allTxs.filter(t => t.source_account_id === accId || t.destination_account_id === accId);
    const computedNative = computeAccountFinalBalance(acc, txs);
    aNow += toUSDClient(computedNative, acc.currency, rates, null);
    aHist += computeAccountHistoricalUsdBasis(acc, txs, rates);

    const stored = parseFloat(String(acc.current_balance));
    if (Math.abs(stored - computedNative) > 0.01) {
      mismatchLabels.push(`Cuenta "${acc.name}": guardado ${formatCurrency(stored, acc.currency)} vs. calculado ${formatCurrency(computedNative, acc.currency)}`);
    }
    if (txs.some(transactionMissingRate)) missingRateLabels.push(`Cuenta "${acc.name}"`);
  }

  for (const jarId of jarIds) {
    const jar = jars.find(j => j.id === jarId);
    if (!jar) continue;
    const txs = allTxs.filter(t => t.piggy_bank_id === jarId || t.destination_piggy_bank_id === jarId);
    const computedNative = computeJarFinalBalance(jar, txs, rates);
    jNow += toUSDClient(computedNative, jar.currency, rates, null);
    jHist += computeJarHistoricalUsdBasis(jar, txs, rates);

    const stored = parseFloat(String(jar.current_amount));
    if (Math.abs(stored - computedNative) > 0.01) {
      mismatchLabels.push(`Jarra "${jar.name}": guardado ${formatCurrency(stored, jar.currency)} vs. calculado ${formatCurrency(computedNative, jar.currency)}`);
    }
    if (txs.some(transactionMissingRate)) missingRateLabels.push(`Jarra "${jar.name}"`);
  }

  const gapNow = aNow - jNow;
  const gapHist = aHist - jHist;
  const rateDiff = gapNow - gapHist;

  return { aNow, jNow, aHist, jHist, gapNow, gapHist, rateDiff, missingRateLabels, mismatchLabels };
}

function ReconciliationCard({
  title, result, onEdit, onDelete,
}: {
  title: string;
  result: ReconciliationResult;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between mb-4">
        <CardTitle>{title}</CardTitle>
        {(onEdit || onDelete) && (
          <div className="flex gap-1">
            {onEdit && (
              <Button size="icon" variant="ghost" onClick={onEdit}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              </Button>
            )}
            {onDelete && (
              <Button size="icon" variant="danger" onClick={onDelete}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></svg>
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="mb-4">
        <p className="text-xs text-text-muted mb-1">Brecha total (hoy)</p>
        <p className={`text-2xl font-bold ${result.gapNow >= 0 ? 'text-text' : 'text-danger'}`}>
          {formatCurrency(result.gapNow)}
        </p>
        <p className="text-xs text-text-muted mt-1">Cuentas {formatCurrency(result.aNow)} − Jarras {formatCurrency(result.jNow)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-surface-elevated rounded-xl p-3">
          <p className="text-xs text-text-muted mb-1">Diferencia por tasa</p>
          <p className="text-base font-semibold text-warning">{formatCurrency(result.rateDiff)}</p>
          <p className="text-[11px] text-text-muted mt-1">Solo por el movimiento del tipo de cambio desde que el dinero se movió — no es dinero faltante.</p>
        </div>
        <div className="bg-surface-elevated rounded-xl p-3">
          <p className="text-xs text-text-muted mb-1">Diferencia estructural</p>
          <p className="text-base font-semibold text-text">{formatCurrency(result.gapHist)}</p>
          <p className="text-[11px] text-text-muted mt-1">Dinero en cuentas que no está asignado a ninguna jarra — esto es lo normal/esperado.</p>
        </div>
      </div>

      {result.missingRateLabels.length > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 mb-2">
          <p className="text-xs font-medium text-warning mb-1">⚠ Transacciones sin tasa</p>
          {result.missingRateLabels.map((l, i) => <p key={i} className="text-[11px] text-text-muted">{l}</p>)}
        </div>
      )}
      {result.mismatchLabels.length > 0 && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-3">
          <p className="text-xs font-medium text-danger mb-1">⚠ Saldo incorrecto</p>
          {result.mismatchLabels.map((l, i) => <p key={i} className="text-[11px] text-text-muted">{l}</p>)}
        </div>
      )}
    </Card>
  );
}

function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Card padding="none">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <CardTitle>{label}</CardTitle>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && <div className="border-t border-surface-light/40">{children}</div>}
    </Card>
  );
}

interface GroupForm {
  name: string;
  accountIds: string[];
  jarIds: string[];
}

const emptyGroupForm = (): GroupForm => ({ name: '', accountIds: [], jarIds: [] });

export default function Reconciliation() {
  const { accounts, jars, exchangeRates, refresh } = useAppStore();
  const [allTxs, setAllTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<ReconciliationGroup[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<GroupForm>(emptyGroupForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function loadAll() {
    setLoading(true);
    const [txs, gs] = await Promise.all([
      db.transactions.list({}),
      db.reconciliationGroups.list(),
    ]);
    setAllTxs(txs);
    setGroups(gs);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  async function handleRefresh() {
    await Promise.all([refresh(), loadAll()]);
  }

  const netWorthAccountIds = accounts
    .filter(a => a.type === 'asset' && a.include_in_net_worth)
    .map(a => a.id);
  const allJarIds = jars.map(j => j.id);

  const generalResult = computeReconciliation(netWorthAccountIds, allJarIds, accounts, jars, allTxs, exchangeRates);

  function openCreate() {
    setEditId(null);
    setForm(emptyGroupForm());
    setError('');
    setShowForm(true);
  }

  function openEdit(g: ReconciliationGroup) {
    setEditId(g.id);
    setForm({ name: g.name, accountIds: g.account_ids, jarIds: g.jar_ids });
    setError('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditId(null);
    setForm(emptyGroupForm());
    setError('');
  }

  function toggleId(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter(x => x !== id) : [...list, id];
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.accountIds.length === 0 && form.jarIds.length === 0) {
      setError('Selecciona al menos una cuenta o jarra');
      return;
    }
    setSaving(true);
    setError('');
    const payload = { name: form.name, account_ids: form.accountIds, jar_ids: form.jarIds };
    try {
      if (editId) {
        const real = await db.reconciliationGroups.update(editId, payload);
        setGroups(prev => prev.map(g => g.id === editId ? real : g));
      } else {
        const tempId = generateId();
        const optimistic: ReconciliationGroup = { id: tempId, user_id: '', created_at: new Date().toISOString(), ...payload };
        setGroups(prev => [...prev, optimistic]);
        const real = await db.reconciliationGroups.create(payload);
        setGroups(prev => prev.map(g => g.id === tempId ? real : g));
      }
      closeForm();
    } catch {
      setError('Error al guardar la conciliación');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteGroup(g: ReconciliationGroup) {
    setGroups(prev => prev.filter(x => x.id !== g.id));
    try {
      await db.reconciliationGroups.delete(g.id);
    } catch {
      setGroups(prev => [...prev, g]);
    }
  }

  const allCurrencies = [...new Set(exchangeRates.map(r => r.to_currency))];

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text">Conciliación</h1>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
          </svg>
          Actualizar
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <ReconciliationCard title="Conciliación general" result={generalResult} />
      )}

      {/* Detalle plegable */}
      <div className="space-y-3">
        <Disclosure label="Ver detalle de cuentas">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-light/40 text-xs text-text-muted">
                  <th className="px-5 py-2 text-left">Cuenta</th>
                  <th className="px-5 py-2 text-left">Tipo</th>
                  <th className="px-5 py-2 text-right">Saldo</th>
                  <th className="px-5 py-2 text-right">Eq. USD (hoy)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-light/40">
                {accounts.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-6 text-center text-text-muted">Sin cuentas</td></tr>
                ) : accounts.map(a => {
                  const bal = parseFloat(String(a.current_balance));
                  const usd = toUSDClient(bal, a.currency, exchangeRates, null);
                  return (
                    <tr key={a.id} className="hover:bg-surface-elevated/50">
                      <td className="px-5 py-3 text-text font-medium">{a.name}</td>
                      <td className="px-5 py-3 text-text-muted capitalize">{a.type === 'asset' ? 'Activo' : 'Pasivo'}</td>
                      <td className="px-5 py-3 text-right font-mono text-text">{formatCurrency(bal, a.currency)}</td>
                      <td className="px-5 py-3 text-right font-mono text-text-muted">{formatCurrency(usd)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Disclosure>

        <Disclosure label="Ver detalle de jarras">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-light/40 text-xs text-text-muted">
                  <th className="px-5 py-2 text-left">Jarra</th>
                  <th className="px-5 py-2 text-right">Ahorrado</th>
                  <th className="px-5 py-2 text-right">Meta</th>
                  <th className="px-5 py-2 text-right">Eq. USD (hoy)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-light/40">
                {jars.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-6 text-center text-text-muted">Sin jarras</td></tr>
                ) : jars.map(j => {
                  const current = parseFloat(String(j.current_amount));
                  const target = parseFloat(String(j.target_amount));
                  const usd = toUSDClient(current, j.currency, exchangeRates, null);
                  return (
                    <tr key={j.id} className="hover:bg-surface-elevated/50">
                      <td className="px-5 py-3 text-text font-medium">{j.name}</td>
                      <td className="px-5 py-3 text-right font-mono text-secondary">{formatCurrency(current, j.currency)}</td>
                      <td className="px-5 py-3 text-right font-mono text-text-muted">{formatCurrency(target, j.currency)}</td>
                      <td className="px-5 py-3 text-right font-mono text-text-muted">{formatCurrency(usd)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Disclosure>

        <Disclosure label="Ver tasas activas">
          <div className="divide-y divide-surface-light/40">
            {allCurrencies.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-text-muted">Sin tasas registradas</p>
            ) : allCurrencies.map(cur => {
              const rate = exchangeRates.find(r => r.to_currency === cur);
              if (!rate) return null;
              return (
                <div key={cur} className="flex items-center justify-between px-5 py-3">
                  <p className="text-sm text-text">{rate.from_currency} → {rate.to_currency}</p>
                  <div className="text-right">
                    <p className="text-sm font-mono text-text">{Number(rate.rate).toLocaleString('es-VE', { maximumFractionDigits: 4 })}</p>
                    <p className="text-xs text-text-muted">{rate.date}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Disclosure>
      </div>

      {/* Conciliaciones personalizadas */}
      <div className="flex items-center justify-between pt-2">
        <h2 className="text-lg font-bold text-text">Conciliaciones personalizadas</h2>
        <Button size="sm" onClick={openCreate}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
          Nueva
        </Button>
      </div>

      {!loading && groups.length === 0 && (
        <Card className="text-center py-8">
          <p className="text-text-muted text-sm mb-3">
            Útil para conciliar por separado cuentas y jarras "custodia" u otros grupos específicos.
          </p>
          <Button size="sm" onClick={openCreate}>Crear la primera</Button>
        </Card>
      )}

      {!loading && groups.map(g => (
        <ReconciliationCard
          key={g.id}
          title={g.name}
          result={computeReconciliation(g.account_ids, g.jar_ids, accounts, jars, allTxs, exchangeRates)}
          onEdit={() => openEdit(g)}
          onDelete={() => handleDeleteGroup(g)}
        />
      ))}

      {/* Form — bottom sheet on mobile, modal on desktop */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative w-full lg:max-w-md bg-surface rounded-t-2xl lg:rounded-2xl border border-surface-light/60 p-5 z-10 max-h-[85vh] overflow-y-auto">
            <div className="w-10 h-1 bg-surface-light rounded-full mx-auto mb-5 lg:hidden" />
            <h2 className="text-base font-semibold text-text mb-4">
              {editId ? 'Editar conciliación' : 'Nueva conciliación'}
            </h2>
            {error && <div className="bg-danger/10 border border-danger/30 rounded-xl px-3 py-2 text-sm text-danger mb-3">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Nombre">
                <Input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Ej: Custodia" required />
              </Field>

              <div>
                <p className="text-xs text-text-muted mb-2">Cuentas</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto border border-surface-light/40 rounded-xl p-2">
                  {accounts.length === 0 ? (
                    <p className="text-xs text-text-muted px-1">Sin cuentas</p>
                  ) : accounts.map(a => (
                    <label key={a.id} className="flex items-center gap-2 cursor-pointer px-1 py-0.5">
                      <input
                        type="checkbox"
                        checked={form.accountIds.includes(a.id)}
                        onChange={() => setForm(prev => ({ ...prev, accountIds: toggleId(prev.accountIds, a.id) }))}
                        className="w-4 h-4 accent-primary"
                      />
                      <span className="text-sm text-text">{a.name} <span className="text-text-muted">({a.currency})</span></span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-text-muted mb-2">Jarras</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto border border-surface-light/40 rounded-xl p-2">
                  {jars.length === 0 ? (
                    <p className="text-xs text-text-muted px-1">Sin jarras</p>
                  ) : jars.map(j => (
                    <label key={j.id} className="flex items-center gap-2 cursor-pointer px-1 py-0.5">
                      <input
                        type="checkbox"
                        checked={form.jarIds.includes(j.id)}
                        onChange={() => setForm(prev => ({ ...prev, jarIds: toggleId(prev.jarIds, j.id) }))}
                        className="w-4 h-4 accent-primary"
                      />
                      <span className="text-sm text-text">{j.name} <span className="text-text-muted">({j.currency})</span></span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <Button variant="outline" className="flex-1" onClick={closeForm} type="button">Cancelar</Button>
                <Button type="submit" loading={saving} className="flex-1">Guardar</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
