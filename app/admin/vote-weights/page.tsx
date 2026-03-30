'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { Scale, Search } from 'lucide-react';

type AdminUserRow = {
  id: string;
  username: string | null;
  display_name: string | null;
};

export default function VoteWeightsPage() {
  const { session } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [multiplier, setMultiplier] = useState('1');
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : undefined;

  useEffect(() => {
    if (!authHeaders) {
      setListLoading(false);
      return;
    }
    setListLoading(true);
    fetch('/api/admin/users', { headers: authHeaders })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('No se pudo cargar usuarios'))))
      .then((data) => {
        setUsers(Array.isArray(data?.users) ? data.users : []);
      })
      .catch(() => setUsers([]))
      .finally(() => setListLoading(false));
  }, [session?.access_token]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const dn = (u.display_name ?? '').toLowerCase();
      const un = (u.username ?? '').toLowerCase();
      return u.id.toLowerCase().includes(q) || dn.includes(q) || un.includes(q);
    });
  }, [users, search]);

  const loadMultiplier = (userId: string) => {
    if (!authHeaders) return;
    setSelectedId(userId);
    setLoading(true);
    setError(null);
    setMessage(null);
    fetch(`/api/admin/vote-weight?user_id=${encodeURIComponent(userId)}`, { headers: authHeaders })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? 'Error');
        setDisplayName(typeof data.display_name === 'string' ? data.display_name : null);
        setMultiplier(String(data.vote_weight_multiplier ?? 1));
        setMessage('Listo para editar.');
      })
      .catch((e) => setError(e?.message ?? 'Error'))
      .finally(() => setLoading(false));
  };

  const save = () => {
    if (!authHeaders || !selectedId) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    fetch('/api/admin/vote-weight', {
      method: 'PATCH',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: selectedId,
        vote_weight_multiplier: parseInt(multiplier, 10),
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? 'Error');
        setMessage(data.warning ?? 'Guardado. Rankings recalculados.');
      })
      .catch((e) => setError(e?.message ?? 'Error'))
      .finally(() => setLoading(false));
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Scale className="h-6 w-6 text-purple-600 dark:text-purple-400" />
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200">Peso de voto (ranking)</h1>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
        Solo owner. Cada like suma <strong className="text-gray-700 dark:text-gray-300">2 × multiplicador</strong> al ranking de{' '}
        la oferta. Elige un usuario en la lista (búsqueda por nombre o UUID).
      </p>
      <p className="text-xs text-amber-700 dark:text-amber-300/90 mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
        Ejecuta en Supabase el SQL si aún no está:{' '}
        <code className="text-[11px]">docs/supabase-migrations/profiles_vote_weight_multiplier.sql</code>
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] p-4">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o UUID…"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#141414] pl-9 pr-3 py-2 text-sm"
            />
          </div>
          <div className="max-h-[min(420px,50vh)] overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
            {listLoading ? (
              <p className="p-4 text-sm text-gray-500">Cargando usuarios…</p>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">Ningún resultado.</p>
            ) : (
              filtered.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => loadMultiplier(u.id)}
                  className={`w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/80 ${
                    selectedId === u.id ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200' : 'text-gray-900 dark:text-gray-100'
                  }`}
                >
                  <span className="font-medium block truncate">{u.display_name?.trim() || u.username || 'Sin nombre'}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate block">{u.id}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] p-4 space-y-3">
          {!selectedId ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Selecciona un usuario a la izquierda.</p>
          ) : (
            <>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <span className="font-semibold text-gray-900 dark:text-gray-100">{displayName ?? '—'}</span>
              </p>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Multiplicador (1–1000)</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={multiplier}
                onChange={(e) => setMultiplier(e.target.value)}
                disabled={loading}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#141414] px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={loading || !session}
                onClick={save}
                className="w-full rounded-lg bg-purple-600 dark:bg-purple-500 text-white py-2.5 text-sm font-semibold hover:opacity-95 disabled:opacity-50"
              >
                Guardar y recalcular ofertas
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="mt-4 text-sm text-green-700 dark:text-green-400">
          {message}
        </p>
      )}
    </div>
  );
}
