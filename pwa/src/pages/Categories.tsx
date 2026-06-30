import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { db } from '@/lib/db';
import { generateId } from '@/lib/utils';
import { Card, CardHeader, CardTitle, Button, Input, Field } from '@/components/ui';

export default function Categories() {
  const { categories, addCategory, updateCategory, removeCategory } = useAppStore();
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setError('');
    const tempId = generateId();
    const optimistic = { id: tempId, user_id: '', name, created_at: new Date().toISOString() };
    addCategory(optimistic);
    setNewName('');
    try {
      const real = await db.categories.create(name);
      updateCategory(tempId, real);
    } catch {
      removeCategory(tempId);
      setNewName(name);
      setError('Error al crear la categoría');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(id: string, name: string) {
    setEditId(id);
    setEditName(name);
  }

  async function handleUpdate(id: string) {
    const name = editName.trim();
    if (!name) return;
    const prev = categories.find(c => c.id === id)!;
    updateCategory(id, { ...prev, name });
    setEditId(null);
    try {
      const real = await db.categories.update(id, name);
      updateCategory(id, real);
    } catch {
      updateCategory(id, prev);
      setError('Error al actualizar');
    }
  }

  async function handleDelete(id: string) {
    const prev = categories.find(c => c.id === id)!;
    removeCategory(id);
    try {
      await db.categories.delete(id);
    } catch {
      addCategory(prev);
      setError('Error al eliminar');
    }
  }

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-text">Categorías</h1>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {/* Add form */}
      <Card>
        <form onSubmit={handleCreate} className="flex gap-3 items-end">
          <Field label="Nueva categoría" className="flex-1">
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Ej: Alimentación, Transporte..."
              required
            />
          </Field>
          <Button type="submit" loading={saving} className="mb-0.5">
            Agregar
          </Button>
        </form>
      </Card>

      {/* List */}
      <Card padding="none">
        <CardHeader className="px-5 pt-5">
          <CardTitle>Categorías ({categories.length})</CardTitle>
        </CardHeader>
        {categories.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-8">Sin categorías. Agrega una arriba.</p>
        ) : (
          <ul className="divide-y divide-surface-light/40">
            {categories.map(cat => (
              <li key={cat.id} className="flex items-center gap-3 px-5 py-3">
                {editId === cat.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleUpdate(cat.id)}
                      autoFocus
                      className="flex-1"
                    />
                    <Button size="sm" onClick={() => handleUpdate(cat.id)}>Guardar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancelar</Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium text-text">{cat.name}</span>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(cat.id, cat.name)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => handleDelete(cat.id)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4h6v2" />
                      </svg>
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
