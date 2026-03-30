'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { Plus, Pencil, Trash2, Eye, EyeOff, ExternalLink } from 'lucide-react';

type Announcement = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export default function AdminAnnouncementsPage() {
  const [list, setList] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formLink, setFormLink] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formSortOrder, setFormSortOrder] = useState(0);
  const [saving, setSaving] = useState(false);
  const { session } = useAuth();

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch('/api/admin/announcements', { headers });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Error al cargar');
      }
      const data = await res.json();
      setList(data.announcements ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const openCreate = () => {
    setEditingId(null);
    setFormTitle('');
    setFormBody('');
    setFormLink('');
    setFormActive(true);
    setFormSortOrder(0);
    setFormOpen(true);
  };

  const openEdit = (a: Announcement) => {
    setEditingId(a.id);
    setFormTitle(a.title);
    setFormBody(a.body ?? '');
    setFormLink(a.link ?? '');
    setFormActive(a.active);
    setFormSortOrder(a.sort_order);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
  };

  const save = async () => {
    if (!formTitle.trim()) return;
    setSaving(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      if (editingId) {
        const res = await fetch(`/api/admin/announcements/${editingId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            title: formTitle.trim(),
            body: formBody.trim() || null,
            link: formLink.trim() || null,
            active: formActive,
            sort_order: formSortOrder,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || 'Error al guardar');
        }
      } else {
        const res = await fetch('/api/admin/announcements', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            title: formTitle.trim(),
            body: formBody.trim() || null,
            link: formLink.trim() || null,
            active: formActive,
            sort_order: formSortOrder,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || 'Error al crear');
        }
      }
      closeForm();
      loadList();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar este aviso?')) return;
    try {
      const headers: Record<string, string> = {};
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch(`/api/admin/announcements/${id}`, { method: 'DELETE', headers });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Error al eliminar');
      }
      loadList();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al eliminar');
    }
  };

  const toggleActive = async (a: Announcement) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch(`/api/admin/announcements/${a.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ active: !a.active }),
      });
      if (!res.ok) throw new Error('Error al actualizar');
      loadList();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-gray-600 dark:text-gray-400">
        Cargando avisos…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Avisos del sitio
        </h1>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
        >
          <Plus className="h-4 w-4" />
          Nuevo aviso
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] overflow-hidden">
        {list.length === 0 ? (
          <p className="p-6 text-gray-500 dark:text-gray-400 text-sm">
            No hay avisos. Crea uno para que aparezca en la pestaña Avisos de la campana.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {list.map((a) => (
              <li key={a.id} className="p-4 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{a.title}</span>
                    {!a.active && (
                      <span className="rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-xs text-amber-800 dark:text-amber-200">
                        Oculto
                      </span>
                    )}
                  </div>
                  {a.body && (
                    <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                      {a.body}
                    </p>
                  )}
                  {a.link && (
                    <a
                      href={a.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400"
                    >
                      {a.link}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                    Orden: {a.sort_order} · {new Date(a.created_at).toLocaleDateString('es-MX')}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleActive(a)}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                    title={a.active ? 'Ocultar' : 'Mostrar'}
                  >
                    {a.active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(a)}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                    title="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(a.id)}
                    className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-[#1a1a1a] p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {editingId ? 'Editar aviso' : 'Nuevo aviso'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Título
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100"
                  placeholder="Ej. Descubre AVENTA"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Cuerpo (opcional)
                </label>
                <textarea
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100"
                  placeholder="Texto del aviso"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Enlace (opcional)
                </label>
                <input
                  type="text"
                  value={formLink}
                  onChange={(e) => setFormLink(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100"
                  placeholder="/descubre o https://..."
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formActive}
                    onChange={(e) => setFormActive(e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Visible en la campana</span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Orden (mayor = más arriba)
                </label>
                <input
                  type="number"
                  value={formSortOrder}
                  onChange={(e) => setFormSortOrder(Number(e.target.value) || 0)}
                  className="w-24 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !formTitle.trim()}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {saving ? 'Guardando…' : editingId ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
