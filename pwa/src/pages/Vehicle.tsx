import { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select } from '@/components/ui/Input';
import type { VehicleRecord, CurrencyCode } from '@/types';

const typeLabels: Record<string, string> = {
  fuel: 'Combustible', maintenance: 'Mantenimiento', repair: 'Reparación', insurance: 'Seguro', other: 'Otro',
};

export default function VehiclePage() {
  const [records, setRecords] = useState<VehicleRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [currentMileage, setCurrentMileage] = useState(0);
  const [form, setForm] = useState({
    type: 'fuel' as VehicleRecord['type'], description: '', mileage: '',
    cost: '', date: new Date().toISOString().split('T')[0], nextMileage: '', notes: '',
  });

  useEffect(() => {
    db.vehicleRecords.getAll().then(all => {
      const sorted = all.sort((a, b) => b.date.localeCompare(a.date) || b.mileage - a.mileage);
      setRecords(sorted);
      if (sorted.length > 0) setCurrentMileage(Math.max(...sorted.map(r => r.mileage)));
    });
  }, []);

  async function addRecord(e: React.FormEvent) {
    e.preventDefault();
    const mileage = parseInt(form.mileage) || currentMileage;
    const record = await db.vehicleRecords.set({
      date: form.date, type: form.type, description: form.description, mileage,
      cost: parseFloat(form.cost) || 0, currency: 'VES' as CurrencyCode,
      next_mileage: form.nextMileage ? parseInt(form.nextMileage) : null, notes: form.notes,
    });
    setRecords(prev => [record, ...prev]);
    setCurrentMileage(Math.max(currentMileage, mileage));
    setShowForm(false);
    setForm({ type: 'fuel', description: '', mileage: '', cost: '', date: new Date().toISOString().split('T')[0], nextMileage: '', notes: '' });
  }

  const nextService = records.filter(r => r.type === 'maintenance' || r.type === 'repair').find(r => r.next_mileage);
  const totalCost = records.reduce((s, r) => s + r.cost, 0);

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Vehículo</h1>
        <Button size="icon" onClick={() => setShowForm(!showForm)} className="rounded-full w-10 h-10">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            {showForm ? <path d="M6 18L18 6M6 6l12 12" /> : <path d="M12 5v14M5 12h14" />}
          </svg>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card padding="sm">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1">Kilometraje actual</p>
          <p className="text-2xl font-bold text-primary">{currentMileage.toLocaleString()} km</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1">Total gastado</p>
          <p className="text-2xl font-bold text-danger">{formatCurrency(totalCost)}</p>
        </Card>
      </div>

      {nextService && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
          <p className="text-sm font-medium text-warning">Próximo mantenimiento</p>
          <p className="text-xs text-text-muted mt-1">
            {nextService.description} · Cada {nextService.next_mileage?.toLocaleString()} km
          </p>
        </div>
      )}

      {showForm && (
        <Card>
          <form onSubmit={addRecord} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tipo">
                <Select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as VehicleRecord['type'] }))}>
                  <option value="fuel">Combustible</option>
                  <option value="maintenance">Mantenimiento</option>
                  <option value="repair">Reparación</option>
                  <option value="insurance">Seguro</option>
                  <option value="other">Otro</option>
                </Select>
              </Field>
              <Field label="Fecha">
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </Field>
            </div>
            <Field label="Descripción">
              <Input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Ej. Cambio de aceite" required />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Kilometraje">
                <Input type="number" value={form.mileage} onChange={e => setForm(f => ({ ...f, mileage: e.target.value }))} placeholder={currentMileage.toString()} />
              </Field>
              <Field label="Costo">
                <Input type="number" step="0.01" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} placeholder="0.00" />
              </Field>
            </div>
            {form.type === 'maintenance' && (
              <Field label="Próximo servicio (km)">
                <Input type="number" value={form.nextMileage} onChange={e => setForm(f => ({ ...f, nextMileage: e.target.value }))} placeholder="ej. 5000" />
              </Field>
            )}
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full bg-background border border-surface-light rounded-xl px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              placeholder="Notas" rows={2} />
            <Button type="submit" className="w-full">Agregar registro</Button>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {records.length === 0 && (
          <div className="text-center py-10 text-text-muted">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-3 opacity-40"><path d="M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3m-9 7h8a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 002 2zm9 0h2a2 2 0 002-2v-5a2 2 0 00-2-2h-2" /></svg>
            <p className="text-sm">Sin registros del vehículo</p>
          </div>
        )}
        {records.map((r) => (
          <Card key={r.id} padding="sm">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs bg-surface-elevated border border-surface-light px-2 py-0.5 rounded-full text-text-muted">{typeLabels[r.type] || r.type}</span>
              <span className="text-xs text-text-muted">{format(new Date(r.date), 'dd/MM/yy')}</span>
            </div>
            <p className="font-medium">{r.description}</p>
            <div className="flex items-center gap-4 mt-1.5 text-sm text-text-muted">
              <span>{r.mileage.toLocaleString()} km</span>
              {r.cost > 0 && <span className="font-medium text-text">{formatCurrency(r.cost)}</span>}
            </div>
            {r.next_mileage && (
              <div className="mt-2 text-xs text-warning">
                Próximo: {r.next_mileage.toLocaleString()} km
                {currentMileage > 0 && (
                  <span className="text-text-muted ml-1">(en {(r.next_mileage - currentMileage).toLocaleString()} km)</span>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
