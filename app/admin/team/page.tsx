'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers/AuthProvider';
import { getReputationLabel } from '@/lib/reputation';
import { ROLES, type Role } from '@/lib/admin/roles';

type TeamMember = {
  user_id: string;
  role: Role;
  display_name: string | null;
  avatar_url: string | null;
  reputation_level: number;
  reputation_score: number;
};

type SearchUser = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  moderator: 'Moderador',
  analyst: 'Analista',
};

const ADDABLE_ROLES: Role[] = ['moderator', 'analyst', 'admin'];

export default function TeamPage() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [searchName, setSearchName] = useState('');
  const [addSearch, setAddSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const addSearchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { session } = useAuth();

  const filteredTeam = team.filter((m) => {
    if (!searchName.trim()) return true;
    const q = searchName.toLowerCase().trim();
    const name = (m.display_name ?? '').toLowerCase();
    const id = m.user_id.toLowerCase();
    return name.includes(q) || id.includes(q);
  });

  const loadTeam = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch('/api/admin/team', { headers });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Error al cargar equipo');
      }
      const data = await res.json();
      setTeam(data.team ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
      setTeam([]);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  useEffect(() => {
    const q = addSearch.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    if (addSearchDebounce.current) clearTimeout(addSearchDebounce.current);
    addSearchDebounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const headers: Record<string, string> = {};
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
        const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}&limit=30`, { headers });
        const data = await res.json().catch(() => ({}));
        const raw = Array.isArray(data.users) ? data.users : [];
        setSearchResults(
          raw
            .map((u: { id?: string; user_id?: string; display_name?: string | null; avatar_url?: string | null }) => {
              const user_id = typeof u.user_id === 'string' && u.user_id.trim() ? u.user_id.trim() : typeof u.id === 'string' && u.id.trim() ? u.id.trim() : '';
              return {
                user_id,
                display_name: u.display_name ?? null,
                avatar_url: u.avatar_url ?? null,
              };
            })
            .filter((u: SearchUser) => u.user_id.length > 0)
        );
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (addSearchDebounce.current) clearTimeout(addSearchDebounce.current);
    };
  }, [addSearch, session?.access_token]);

  const handleAddMember = async (userId: string, role: Role) => {
    const uid = userId?.trim();
    if (!uid) {
      alert('No se pudo obtener el ID del usuario. Vuelve a buscar e intenta de nuevo.');
      return;
    }
    setAddingUserId(uid);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch('/api/admin/team', {
        method: 'POST',
        headers,
        body: JSON.stringify({ user_id: uid, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Error al agregar');
      setAddSearch('');
      setSearchResults([]);
      await loadTeam();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al agregar');
    } finally {
      setAddingUserId(null);
    }
  };

  const handleRoleChange = async (userId: string, newRole: Role, previousRole: Role) => {
    const uid = userId?.trim();
    if (!uid) {
      alert('ID de usuario no válido.');
      return;
    }
    if (newRole === previousRole || !ROLES.includes(newRole)) return;
    setUpdating(uid);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch('/api/admin/team', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ user_id: uid, role: newRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Error al actualizar');
      setTeam((prev) => prev.map((m) => (m.user_id === uid ? { ...m, role: newRole } : m)));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al actualizar');
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-gray-600 dark:text-gray-400">
        Cargando…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  const teamIds = new Set(team.map((m) => m.user_id));

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#141414] p-6">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
        Equipo
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Integra usuarios y asigna roles (moderador, analista, etc.). Busca por nombre para agregar al equipo.
      </p>

      {/* Bloque: Agregar al equipo — buscar usuarios registrados y asignar rol */}
      <section className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] p-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Agregar al equipo
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Escribe el nombre del usuario (mín. 2 letras). Solo aparecen quienes ya tienen cuenta.
        </p>
        <input
          type="search"
          placeholder="Buscar por nombre..."
          value={addSearch}
          onChange={(e) => setAddSearch(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1a1a1a] px-4 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 mb-3"
        />
        {searching && <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Buscando…</p>}
        {searchResults.length > 0 && (
          <ul className="space-y-2 max-h-48 overflow-y-auto">
            {searchResults.map((u) => {
              const alreadyInTeam = teamIds.has(u.user_id);
              return (
                <li
                  key={u.user_id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 p-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0 text-violet-600 dark:text-violet-400 text-xs font-semibold">
                        {(u.display_name || u.user_id).slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {u.display_name || u.user_id.slice(0, 8) + '…'}
                    </span>
                  </div>
                  {alreadyInTeam ? (
                    <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Ya en el equipo</span>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        id={`role-${u.user_id}`}
                        className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 text-xs py-1.5 px-2"
                        defaultValue="moderator"
                      >
                        {ADDABLE_ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={addingUserId === u.user_id}
                        onClick={() => {
                          const sel = document.getElementById(`role-${u.user_id}`) as HTMLSelectElement;
                          handleAddMember(u.user_id, (sel?.value as Role) ?? 'moderator');
                        }}
                        className="rounded-lg bg-violet-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-violet-700 disabled:opacity-50"
                      >
                        {addingUserId === u.user_id ? 'Agregando…' : 'Agregar'}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
        Miembros del equipo (buscar en la lista para cambiar rol):
      </p>
      <div className="mb-4">
        <input
          type="search"
          placeholder="Buscar por nombre..."
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1a1a1a] px-4 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500"
        />
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
              <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Usuario</th>
              <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Rol actual</th>
              <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Reputación</th>
              <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Asignar rol</th>
            </tr>
          </thead>
          <tbody>
            {filteredTeam.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-4 text-center text-gray-500 dark:text-gray-400">
                  {team.length === 0 ? 'No hay usuarios con rol' : 'No hay resultados para la búsqueda'}
                </td>
              </tr>
            ) : (
              filteredTeam.map((m) => (
                <tr key={m.user_id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0 text-violet-600 dark:text-violet-400 font-semibold text-sm">
                          {(m.display_name || m.user_id).slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {m.display_name || m.user_id.slice(0, 8) + '…'}
                        </span>
                        {m.display_name && (
                          <span className="block text-xs text-gray-500 dark:text-gray-400 font-mono">
                            {m.user_id.slice(0, 8)}…
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                      {ROLE_LABELS[m.role]}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {getReputationLabel(m.reputation_level)}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        ({m.reputation_score} pts)
                      </span>
                    </span>
                  </td>
                  <td className="p-3">
                    <select
                      value={m.role}
                      onChange={(e) =>
                        handleRoleChange(m.user_id, e.currentTarget.value as Role, m.role)
                      }
                      disabled={updating === m.user_id || m.role === 'owner'}
                      className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 px-3 py-2 text-sm disabled:opacity-50"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    {m.role === 'owner' && (
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">(no editable)</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
