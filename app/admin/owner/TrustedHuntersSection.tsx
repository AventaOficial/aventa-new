'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BowArrow, Loader2, Search, UserMinus, UserPlus } from 'lucide-react';

type TrustedHunter = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  reputation_level: number;
  owner_auto_approve_offers_at: string | null;
};

type SearchHit = {
  user_id: string;
  display_name: string | null;
  username: string | null;
};

export default function TrustedHuntersSection() {
  const [hunters, setHunters] = useState<TrustedHunter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setError('Sesión requerida');
      setLoading(false);
      return;
    }
    const res = await fetch('/api/admin/trusted-hunters', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data?.error === 'string' ? data.error : 'No se pudo cargar');
      setHunters([]);
      setLoading(false);
      return;
    }
    setHunters(Array.isArray(data?.hunters) ? data.hunters : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const searchUsers = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchHits([]);
      return;
    }
    setSearching(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setSearching(false);
      return;
    }
    const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}&limit=8`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json().catch(() => ({}));
    setSearching(false);
    if (!res.ok) {
      setSearchHits([]);
      return;
    }
    const users = (data?.users ?? []) as { id?: string; user_id?: string; display_name?: string | null; username?: string | null }[];
    setSearchHits(
      users.map((u) => ({
        user_id: u.user_id ?? u.id ?? '',
        display_name: u.display_name ?? null,
        username: u.username ?? null,
      })).filter((u) => u.user_id),
    );
  }, [query]);

  useEffect(() => {
    const t = setTimeout(() => {
      void searchUsers();
    }, 300);
    return () => clearTimeout(t);
  }, [query, searchUsers]);

  const addHunter = async (userId: string) => {
    setActingId(userId);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch('/api/admin/trusted-hunters', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: userId }),
    });
    setActingId(null);
    if (res.ok) {
      setQuery('');
      setSearchHits([]);
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(typeof data?.error === 'string' ? data.error : 'No se pudo agregar');
    }
  };

  const removeHunter = async (userId: string) => {
    setActingId(userId);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch('/api/admin/trusted-hunters', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: userId }),
    });
    setActingId(null);
    if (res.ok) await load();
  };

  const hunterIds = new Set(hunters.map((h) => h.user_id));

  return (
    <section className="rounded-3xl bg-white dark:bg-[#1C1C1E] border border-gray-200/70 dark:border-gray-800 p-5 md:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15">
          <BowArrow className="h-5 w-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[#1D1D1F] dark:text-gray-100">
            Cazadores sin moderación
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
            Personas de confianza que pueden subir ofertas y publicarlas al instante (sin cola de moderación).
            Independiente de la reputación. Útil para tu equipo de subida de ofertas.
          </p>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o usuario para agregar…"
          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-[#F5F5F7] dark:bg-[#111113] pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
        )}
      </div>

      {searchHits.length > 0 && (
        <ul className="mb-4 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
          {searchHits.map((hit) => {
            const label = hit.display_name || hit.username || hit.user_id.slice(0, 8);
            const already = hunterIds.has(hit.user_id);
            return (
              <li key={hit.user_id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-white dark:bg-[#141414]">
                <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{label}</span>
                <button
                  type="button"
                  disabled={already || actingId === hit.user_id}
                  onClick={() => addHunter(hit.user_id)}
                  className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:bg-violet-700"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {already ? 'Ya está' : 'Agregar'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : hunters.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-4 text-center">
          Nadie en la lista todavía. Busca arriba a quien quieres agregar.
        </p>
      ) : (
        <ul className="space-y-2">
          {hunters.map((h) => {
            const label = h.display_name || h.username || h.user_id.slice(0, 8);
            return (
              <li
                key={h.user_id}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-200/80 dark:border-gray-700 bg-[#F5F5F7]/60 dark:bg-[#111113] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Nivel rep. {h.reputation_level}
                    {h.owner_auto_approve_offers_at
                      ? ` · desde ${new Date(h.owner_auto_approve_offers_at).toLocaleDateString('es-MX')}`
                      : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={actingId === h.user_id}
                  onClick={() => removeHunter(h.user_id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                >
                  <UserMinus className="h-3.5 w-3.5" />
                  Quitar
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
