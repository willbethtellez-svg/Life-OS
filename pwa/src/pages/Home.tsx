import { useState, useEffect } from 'react';
import { localDB } from '@/lib/db';
import { formatCurrency, generateId } from '@/lib/utils';
import { format } from 'date-fns';
import type { HouseholdTask, MaintenanceLog, CurrencyCode } from '@/types';

type Tab = 'tasks' | 'maintenance';

export default function HomePage() {
  const [tab, setTab] = useState<Tab>('tasks');
  const [tasks, setTasks] = useState<HouseholdTask[]>([]);
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    estimatedCost: '',
    category: 'otro' as HouseholdTask['category'],
    notes: '',
  });

  useEffect(() => {
    localDB.householdTasks.getAll().then(setTasks);
    localDB.maintenanceLogs.getAll().then(setLogs);
  }, []);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const task: HouseholdTask = {
      id: generateId(),
      title: form.title,
      description: form.description,
      date: form.date,
      completed: false,
      estimatedCost: parseFloat(form.estimatedCost) || 0,
      currency: 'VES' as CurrencyCode,
      jarId: null,
      jarName: null,
      category: form.category,
      notes: form.notes,
      createdAt: new Date().toISOString(),
    };
    await localDB.householdTasks.set(task);
    setTasks(prev => [task, ...prev]);
    setShowForm(false);
    setForm({ title: '', description: '', date: new Date().toISOString().split('T')[0], estimatedCost: '', category: 'otro', notes: '' });
  }

  async function toggleTask(id: string) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const updated = { ...task, completed: !task.completed };
    await localDB.householdTasks.set(updated);
    setTasks(prev => prev.map(t => t.id === id ? updated : t));
  }

  async function deleteTask(id: string) {
    await localDB.householdTasks.delete(id);
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  const totalCost = tasks.filter(t => !t.completed).reduce((s, t) => s + t.estimatedCost, 0);
  const upcoming = tasks.filter(t => !t.completed).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Hogar</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-primary hover:bg-primary-dark text-white rounded-full w-10 h-10 flex items-center justify-center text-xl font-bold transition-colors"
        >
          {showForm ? '×' : '+'}
        </button>
      </div>

      <div className="flex gap-1 bg-surface rounded-lg p-1">
        <button
          onClick={() => setTab('tasks')}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'tasks' ? 'bg-primary text-white' : 'text-text-muted'}`}
        >
          Tareas
        </button>
        <button
          onClick={() => setTab('maintenance')}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'maintenance' ? 'bg-primary text-white' : 'text-text-muted'}`}
        >
          Mantenimiento
        </button>
      </div>

      {showForm && (
        <form onSubmit={addTask} className="bg-surface rounded-xl p-4 space-y-3">
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Título de la tarea"
            required
          />
          <input
            type="text"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Descripción (opcional)"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-text-muted mb-1">Fecha</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Costo estimado</label>
              <input
                type="number"
                step="0.01"
                value={form.estimatedCost}
                onChange={e => setForm(f => ({ ...f, estimatedCost: e.target.value }))}
                className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="0.00"
              />
            </div>
          </div>
          <select
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value as HouseholdTask['category'] }))}
            className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="mantenimiento">Mantenimiento</option>
            <option value="limpieza">Limpieza</option>
            <option value="reparacion">Reparación</option>
            <option value="compra">Compra</option>
            <option value="otro">Otro</option>
          </select>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className="w-full bg-background border border-surface-light rounded-lg px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Notas adicionales"
            rows={2}
          />
          <button
            type="submit"
            className="w-full bg-primary hover:bg-primary-dark text-white font-medium rounded-lg py-2.5 transition-colors"
          >
            Agregar tarea
          </button>
        </form>
      )}

      {tab === 'tasks' && (
        <>
          {upcoming.length > 0 && (
            <div className="bg-surface rounded-xl p-4">
              <p className="text-text-muted text-xs uppercase tracking-wide">Costo pendiente total</p>
              <p className="text-2xl font-bold text-warning mt-1">
                {formatCurrency(totalCost)}
              </p>
            </div>
          )}

          <div className="space-y-2">
            {tasks.length === 0 && (
              <div className="text-center py-8 text-text-muted">
                <p className="text-lg mb-1">⌂</p>
                <p className="text-sm">No hay tareas del hogar</p>
              </div>
            )}
            {tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((task) => (
              <div
                key={task.id}
                className={`bg-surface rounded-xl p-4 border-l-4 ${task.completed ? 'border-secondary/50' : 'border-warning'}`}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleTask(task.id)}
                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      task.completed ? 'bg-secondary border-secondary' : 'border-text-muted'
                    }`}
                  >
                    {task.completed && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium ${task.completed ? 'line-through text-text-muted' : ''}`}>
                      {task.title}
                    </p>
                    {task.description && (
                      <p className="text-sm text-text-muted mt-0.5">{task.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      <span className="text-xs text-text-muted">{format(new Date(task.date), 'dd/MM/yy')}</span>
                      <span className="text-xs bg-surface-light px-2 py-0.5 rounded-full">{task.category}</span>
                      {task.estimatedCost > 0 && (
                        <span className="text-xs text-warning font-medium">
                          {formatCurrency(task.estimatedCost)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="text-text-muted hover:text-danger text-sm transition-colors"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'maintenance' && (
        <div className="space-y-2">
          {logs.length === 0 && (
            <div className="text-center py-8 text-text-muted">
              <p className="text-sm">Registros de mantenimiento próximamente</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
