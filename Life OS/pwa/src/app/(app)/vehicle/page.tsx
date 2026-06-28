'use client';

import { useState, useEffect } from 'react';
import { localDB } from '@/lib/db';
import { formatCurrency, generateId } from '@/lib/utils';
import { format } from 'date-fns';
import type { VehicleRecord, CurrencyCode } from '@/types';

export default function VehiclePage() {
  const [records, setRecords] = useState<VehicleRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [currentMileage, setCurrentMileage] = useState(0);

  const [form, setForm] = useState({
    type: 'fuel' as VehicleRecord['type'],
    description: '',
    mileage: '',
    cost: '',
    date: new Date().toISOString().split('T')[0],
    nextMileage: '',
    notes: '',
  });

  useEffect(() => {
    localDB.vehicleRecords.getAll().then(all => {
      setRecords(all.sort((a, b) => b.date.localeCompare(a.date) || b.mileage - a.mileage));
      if (all.length > 0) {
        setCurrentMileage(Math.max(...all.map(r => r.mileage)));
      }
    });
  }, []);

  async function addRecord(e: React.FormEvent) {
    e.preventDefault();
    const mileage = parseInt(form.mileage) || currentMileage;
    const record: VehicleRecord = {
      id: generateId(),
      date: form.date,
      type: form.type,
      description: form.description,
      mileage,
      cost: parseFloat(form.cost) || 0,
      currency: 'VES' as CurrencyCode,
      nextMileage: form.nextMileage ? parseInt(form.nextMileage) : null,
      nextDate: null,
      notes: form.notes,
      transactionId: null,
    };
    await localDB.vehicleRecords.set(record);
    setRecords(prev => [record, ...prev]);
    setCurrentMileage(Math.max(currentMileage, mileage));
    setShowForm(false);
    setForm({ type: 'fuel', description: '', mileage: '', cost: '', date: new Date().toISOString().split('T')[0], nextMileage: '', notes: '' });
  }

  const lastMaintenance = records.filter(r => r.type === 'maintenance' || r.type === 'repair');
  const nextService = lastMaintenance.find(r => r.nextMileage);

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Vehículo</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-primary hover:bg-primary-dark text-white rounded-full w-10 h-10 flex items-center justify-center text-xl font-bold transition-colors"
        >
          {showForm ? '×' : '+'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface rounded-xl p-4">
          <p className="text-text-muted text-xs uppercase tracking-wide">Kilometraje actual</p>
          <p className="text-2xl font-bold text-primary mt-1">
            {currentMileage.toLocaleString()} km
          </p>
        </div>
        <div className="bg-surface rounded-xl p-4">
          <p className="text-text-muted text-xs uppercase tracking-wide">Total gastado</p>
          <p className="text-2xl font-bold text-danger mt-1">
            {formatCurrency(records.reduce((s, r) => s + r.cost, 0))}
          </p>
        </div>
      </div>

      {nextService && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
          <p className="text-sm font-medium text-warning">Próximo mantenimiento</p>
          <p className="text-xs text-text-muted mt-1">
            {nextService.description} · Cada {nextService.nextMileage?.toLocaleString()} km
          </p>
        </div>
      )}

      {showForm && (
        <form onSubmit={addRecord} className="bg-surface rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-text-muted mb-1">Tipo</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as VehicleRecord['type'] }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="fuel">Combustible</option>
                <option value="maintenance">Mantenimiento</option>
                <option value="repair">Reparación</option>
                <option value="insurance">Seguro</option>
                <option value="other">Otro</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Fecha</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <input
            type="text"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Descripción (ej. Cambio de aceite)"
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-text-muted mb-1">Kilometraje</label>
              <input
                type="number"
                value={form.mileage}
                onChange={e => setForm(f => ({ ...f, mileage: e.target.value }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={currentMileage.toString()}
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Costo</label>
              <input
                type="number"
                step="0.01"
                value={form.cost}
                onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="0.00"
              />
            </div>
          </div>
          {form.type === 'maintenance' && (
            <div>
              <label className="block text-xs text-text-muted mb-1">Próximo servicio (km)</label>
              <input
                type="number"
                value={form.nextMileage}
                onChange={e => setForm(f => ({ ...f, nextMileage: e.target.value }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="ej. 5000"
              />
            </div>
          )}
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Notas"
            rows={2}
          />
          <button
            type="submit"
            className="w-full bg-primary hover:bg-primary-dark text-white font-medium rounded-lg py-2.5 transition-colors"
          >
            Agregar registro
          </button>
        </form>
      )}

      <div className="space-y-2">
        {records.length === 0 && (
          <div className="text-center py-8 text-text-muted">
            <p className="text-lg mb-1">◈</p>
            <p className="text-sm">Sin registros del vehículo</p>
          </div>
        )}
        {records.map((r) => (
          <div key={r.id} className="bg-surface rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs bg-surface-light px-2 py-0.5 rounded-full text-text-muted uppercase">{r.type}</span>
              <span className="text-xs text-text-muted">{format(new Date(r.date), 'dd/MM/yy')}</span>
            </div>
            <p className="font-medium mt-1">{r.description}</p>
            <div className="flex items-center gap-3 mt-1.5 text-sm text-text-muted">
              <span>📍 {r.mileage.toLocaleString()} km</span>
              {r.cost > 0 && <span className="font-medium text-text">💵 {formatCurrency(r.cost)}</span>}
            </div>
            {r.nextMileage && (
              <div className="mt-2 text-xs text-warning">
                Próximo: {r.nextMileage.toLocaleString()} km
                {currentMileage > 0 && (
                  <span className="text-text-muted ml-1">
                    (en {(r.nextMileage - currentMileage).toLocaleString()} km)
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
