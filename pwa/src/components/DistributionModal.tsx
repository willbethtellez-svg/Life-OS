import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { db } from '@/lib/db';
import { formatCurrency, generateId } from '@/lib/utils';
import { computeJarFinalBalance } from '@/lib/ledger';
import { Card, Button, Input, Select, Field } from '@/components/ui';
import type { DistributionTemplate, Transaction } from '@/types';

interface Row {
  key: string;
  description: string;
  destinationJarId: string;
  amount: string;
}

const emptyRow = (): Row => ({ key: generateId(), description: '', destinationJarId: '', amount: '' });

export default function DistributionModal({ onClose }: { onClose: () => void }) {
  const { jars, exchangeRates, refresh } = useAppStore();

  const [templates, setTemplates] = useState<DistributionTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [sourceJarId, setSourceJarId] = useState('');
  const [rows, setRows] = useState<Row[]>([emptyRow()]);

  const [sourceBalance, setSourceBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<{ description: string; ok: boolean }[] | null>(null);

  useEffect(() => {
    db.distributionTemplates.list().then(setTemplates);
  }, []);

  useEffect(() => {
    if (!sourceJarId) {
      setSourceBalance(null);
      return;
    }
    let cancelled = false;
    const jar = jars.find(j => j.id === sourceJarId);
    if (!jar) return;
    setBalanceLoading(true);
    db.piggyBanks.transactions(sourceJarId).then((txs: Transaction[]) => {
      if (cancelled) return;
      setSourceBalance(computeJarFinalBalance(jar, txs, exchangeRates));
      setBalanceLoading(false);
    });
    return () => { cancelled = true; };
  }, [sourceJarId, jars, exchangeRates]);

  function loadTemplate(id: string) {
    setSelectedTemplateId(id);
    if (!id) return;
    const tpl = templates.find(t => t.id === id);
    if (!tpl) return;
    setSourceJarId(tpl.source_jar_id && jars.some(j => j.id === tpl.source_jar_id) ? tpl.source_jar_id : '');
    setRows(
      tpl.items.length > 0
        ? tpl.items.map(it => ({ key: generateId(), description: it.description, destinationJarId: it.destination_jar_id, amount: it.default_amount ? String(it.default_amount) : '' }))
        : [emptyRow()]
    );
    setTemplateName(tpl.name);
  }

  function addRow() {
    setRows(prev => [...prev, emptyRow()]);
  }

  function removeRow(key: string) {
    setRows(prev => prev.length > 1 ? prev.filter(r => r.key !== key) : prev);
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r));
  }

  const sourceJar = jars.find(j => j.id === sourceJarId);
  const total = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const remaining = sourceBalance !== null ? sourceBalance - total : null;

  async function handleSaveTemplate() {
    if (!templateName.trim()) {
      setError('Ponle un nombre a la plantilla');
      return;
    }
    setSavingTemplate(true);
    setError('');
    const items = rows
      .filter(r => r.destinationJarId)
      .map(r => ({ description: r.description, destination_jar_id: r.destinationJarId, default_amount: parseFloat(r.amount) || 0 }));
    const payload = { name: templateName.trim(), source_jar_id: sourceJarId || null, items };
    try {
      if (selectedTemplateId) {
        const real = await db.distributionTemplates.update(selectedTemplateId, payload);
        setTemplates(prev => prev.map(t => t.id === selectedTemplateId ? real : t));
      } else {
        const real = await db.distributionTemplates.create(payload);
        setTemplates(prev => [...prev, real]);
        setSelectedTemplateId(real.id);
      }
    } catch {
      setError('Error al guardar la plantilla');
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleDeleteTemplate() {
    if (!selectedTemplateId) return;
    const id = selectedTemplateId;
    setTemplates(prev => prev.filter(t => t.id !== id));
    setSelectedTemplateId('');
    setTemplateName('');
    try {
      await db.distributionTemplates.delete(id);
    } catch {
      setError('Error al eliminar la plantilla');
    }
  }

  async function handleExecute() {
    setError('');
    if (!sourceJarId) {
      setError('Selecciona la jarra origen');
      return;
    }
    const validRows = rows.filter(r => r.destinationJarId && (parseFloat(r.amount) || 0) > 0);
    if (validRows.length === 0) {
      setError('Agrega al menos una fila con jarra destino y monto');
      return;
    }

    setExecuting(true);
    const outcomes: { description: string; ok: boolean }[] = [];
    // Secuencial a propósito: varias filas modifican el saldo de la MISMA
    // jarra origen, y crear las transacciones una por una evita condiciones
    // de carrera sobre ese saldo.
    for (const row of validRows) {
      const destJar = jars.find(j => j.id === row.destinationJarId);
      const label = row.description || `→ ${destJar?.name || 'jarra'}`;
      try {
        await db.transactions.create({
          date,
          description: row.description || `Distribución → ${destJar?.name || ''}`,
          type: 'transfer',
          amount: parseFloat(row.amount),
          currency: sourceJar?.currency || 'USD',
          source_account_id: null,
          destination_account_id: null,
          category_id: null,
          piggy_bank_id: sourceJarId,
          destination_piggy_bank_id: row.destinationJarId,
          foreign_amount: null,
          foreign_currency: null,
          fee: 0,
          notes: '',
          confirmed: true,
          reconciled: false,
        });
        outcomes.push({ description: label, ok: true });
      } catch {
        outcomes.push({ description: label, ok: false });
      }
    }
    setResults(outcomes);
    setExecuting(false);
    void refresh();
  }

  const allOk = results !== null && results.every(r => r.ok);

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full lg:max-w-2xl bg-surface rounded-t-2xl lg:rounded-2xl border border-surface-light/60 p-5 z-10 max-h-[90vh] overflow-y-auto">
        <div className="w-10 h-1 bg-surface-light rounded-full mx-auto mb-5 lg:hidden" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text">Distribución de jarras</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {results ? (
          <div className="space-y-4">
            <div className={`rounded-xl p-4 ${allOk ? 'bg-secondary/10 border border-secondary/30' : 'bg-warning/10 border border-warning/30'}`}>
              <p className={`text-sm font-medium ${allOk ? 'text-secondary' : 'text-warning'}`}>
                {allOk ? 'Distribución completada' : 'Distribución completada con errores'}
              </p>
            </div>
            <div className="space-y-1.5">
              {results.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-text">{r.description}</span>
                  <span className={r.ok ? 'text-secondary' : 'text-danger'}>{r.ok ? '✓ Creada' : '✕ Falló'}</span>
                </div>
              ))}
            </div>
            <Button className="w-full" onClick={onClose}>Cerrar</Button>
          </div>
        ) : (
          <>
            {error && <div className="bg-danger/10 border border-danger/30 rounded-xl px-3 py-2 text-sm text-danger mb-3">{error}</div>}

            <div className="grid grid-cols-2 gap-3 mb-3">
              <Field label="Plantilla">
                <Select value={selectedTemplateId} onChange={e => loadTemplate(e.target.value)}>
                  <option value="">— Ninguna —</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Field>
              <Field label="Fecha">
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </Field>
            </div>

            <Field label="Jarra origen" className="mb-3">
              <Select value={sourceJarId} onChange={e => setSourceJarId(e.target.value)}>
                <option value="">— Selecciona —</option>
                {jars.map(j => <option key={j.id} value={j.id}>{j.name} ({j.currency})</option>)}
              </Select>
            </Field>

            <div className="space-y-2 mb-3">
              {rows.map(row => (
                <div key={row.key} className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center">
                  <Input
                    value={row.description}
                    onChange={e => updateRow(row.key, { description: e.target.value })}
                    placeholder="Descripción"
                  />
                  <Input
                    type="number" step="any" min="0"
                    value={row.amount}
                    onChange={e => updateRow(row.key, { amount: e.target.value })}
                    placeholder="Monto"
                    className="w-24"
                  />
                  <Select value={row.destinationJarId} onChange={e => updateRow(row.key, { destinationJarId: e.target.value })}>
                    <option value="">— Jarra destino —</option>
                    {jars.filter(j => j.id !== sourceJarId).map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                  </Select>
                  <button type="button" onClick={() => removeRow(row.key)} className="text-text-muted hover:text-danger p-1">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={addRow} className="mb-4">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
              Agregar fila
            </Button>

            <Card padding="sm" className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-text-muted">Total a distribuir</span>
                <span className="font-semibold text-text font-mono">{formatCurrency(total, sourceJar?.currency)}</span>
              </div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-text-muted">Saldo en jarra origen</span>
                <span className="font-mono text-text-muted">
                  {balanceLoading ? '…' : sourceBalance !== null ? formatCurrency(sourceBalance, sourceJar?.currency) : '—'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Quedaría</span>
                <span className={`font-semibold font-mono ${remaining !== null && remaining < 0 ? 'text-danger' : 'text-text'}`}>
                  {remaining !== null ? formatCurrency(remaining, sourceJar?.currency) : '—'}
                </span>
              </div>
              {remaining !== null && remaining < 0 && (
                <p className="text-[11px] text-danger mt-2">La distribución supera el saldo disponible en la jarra origen.</p>
              )}
            </Card>

            <div className="flex items-end gap-2 mb-4">
              <Field label="Nombre de plantilla" className="flex-1">
                <Input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Ej: Ingresos mensuales" />
              </Field>
              <Button variant="outline" size="md" loading={savingTemplate} onClick={handleSaveTemplate}>
                {selectedTemplateId ? 'Actualizar plantilla' : 'Guardar como plantilla'}
              </Button>
              {selectedTemplateId && (
                <Button variant="danger" size="icon" onClick={handleDeleteTemplate}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></svg>
                </Button>
              )}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={onClose} type="button">Cancelar</Button>
              <Button className="flex-1" loading={executing} onClick={handleExecute}>Ejecutar distribución</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
