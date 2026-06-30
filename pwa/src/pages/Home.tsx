import { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select } from '@/components/ui/Input';
import type { HouseholdTask, CurrencyCode } from '@/types';

type Tab = 'tasks' | 'maintenance';

export default function HomePage() {
  const [tab, setTab] = useState<Tab>('tasks');
  const [tasks, setTasks] = useState<HouseholdTask[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', date: new Date().toISOString().split('T')[0],
    estimatedCost: '', category: 'otro' as HouseholdTask['category'], notes: '',
  });

  useEffect(() => { db.householdTasks.getAll().then(setTasks); }, []);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const task = await db.householdTasks.set({
      title: form.title, description: form.description, date: form.date, completed: false,
      estimated_cost: parseFloat(form.estimatedCost) || 0, currency: 'VES' as CurrencyCode,
      category: form.category, notes: form.notes,
    });
    setTasks(prev => [task, ...prev]);
    setShowForm(false);
    setForm({ title: '', description: '', date: new Date().toISOString().split('T')[0], estimatedCost: '', category: 'otro', notes: '' });
  }

  async function toggleTask(id: string) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const updated = await db.householdTasks.set({ ...task, completed: !task.completed });
    setTasks(prev => prev.map(t => t.id === id ? updated : t));
  }

  async function deleteTask(id: string) {
    await db.householdTasks.delete(id);
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  const totalCost = tasks.filter(t => !t.completed).reduce((s, t) => s + t.estimated_cost, 0);
  const upcoming = tasks.filter(t => !t.completed).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Hogar</h1>
        <Button size="icon" onClick={() => setShowForm(!showForm)} className="rounded-full w-10 h-10">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            {showForm ? <path d="M6 18L18 6M6 6l12 12" /> : <path d="M12 5v14M5 12h14" />}
          </svg>
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface border border-surface-light rounded-xl p-1">
        {(['tasks', 'maintenance'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-primary text-white' : 'text-text-muted hover:text-text'}`}>
            {t === 'tasks' ? 'Tareas' : 'Mantenimiento'}
          </button>
        ))}
      </div>

      {showForm && (
        <Card>
          <form onSubmit={addTask} className="space-y-3">
            <Field label="Título">
              <Input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Título de la tarea" required autoFocus />
            </Field>
            <Input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción (opcional)" />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Fecha">
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </Field>
              <Field label="Costo estimado">
                <Input type="number" step="0.01" value={form.estimatedCost} onChange={e => setForm(f => ({ ...f, estimatedCost: e.target.value }))} placeholder="0.00" />
              </Field>
            </div>
            <Select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as HouseholdTask['category'] }))}>
              <option value="mantenimiento">Mantenimiento</option>
              <option value="limpieza">Limpieza</option>
              <option value="reparacion">Reparación</option>
              <option value="compra">Compra</option>
              <option value="otro">Otro</option>
            </Select>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full bg-background border border-surface-light rounded-xl px-3 py-2.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              placeholder="Notas adicionales" rows={2} />
            <Button type="submit" className="w-full">Agregar tarea</Button>
          </form>
        </Card>
      )}

      {tab === 'tasks' && (
        <>
          {upcoming.length > 0 && (
            <Card>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1">Costo pendiente total</p>
              <p className="text-2xl font-bold text-warning">{formatCurrency(totalCost)}</p>
            </Card>
          )}
          <div className="space-y-2">
            {tasks.length === 0 && (
              <div className="text-center py-10 text-text-muted">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-3 opacity-40"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                <p className="text-sm">No hay tareas del hogar</p>
              </div>
            )}
            {[...tasks].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((task) => (
              <div key={task.id} className={`bg-surface border-l-4 rounded-xl p-4 ${task.completed ? 'border-primary/40' : 'border-warning'}`}>
                <div className="flex items-start gap-3">
                  <button onClick={() => toggleTask(task.id)}
                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${task.completed ? 'bg-primary border-primary' : 'border-text-muted hover:border-primary'}`}>
                    {task.completed && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium ${task.completed ? 'line-through text-text-muted' : ''}`}>{task.title}</p>
                    {task.description && <p className="text-sm text-text-muted mt-0.5">{task.description}</p>}
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      <span className="text-xs text-text-muted">{format(new Date(task.date), 'dd/MM/yy')}</span>
                      <span className="text-xs bg-surface-elevated border border-surface-light px-2 py-0.5 rounded-full text-text-muted">{task.category}</span>
                      {task.estimated_cost > 0 && <span className="text-xs text-warning font-medium">{formatCurrency(task.estimated_cost)}</span>}
                    </div>
                  </div>
                  <button onClick={() => deleteTask(task.id)} className="text-text-muted hover:text-danger transition-colors ml-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'maintenance' && (
        <div className="text-center py-10 text-text-muted">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-3 opacity-40"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /></svg>
          <p className="text-sm">Registros de mantenimiento próximamente</p>
        </div>
      )}
    </div>
  );
}
