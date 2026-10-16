'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { getReputationLabel } from '@/lib/reputation';
import {
  ROLES,
  ROLE_LABELS,
  ASSIGNABLE_STAFF_ROLES,
  type Role,
} from '@/lib/admin/roles';

type RosterMembership = {
  team_id: string;
  team_label: string;
  role: string;
  role_label: string;
  status: string;
};

type TeamMember = {
  user_id: string;
  staff_role: Role | null;
  display_name: string | null;
  avatar_url: string | null;
  reputation_level: number;
  reputation_score: number;
  email: string | null;
  has_email_password: boolean;
  memberships: RosterMembership[];
  last_equipo_password: { password: string; generated_at: string } | null;
};

type SearchUser = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

const ADDABLE_ROLES: Role[] = ASSIGNABLE_STAFF_ROLES.filter((r) => r !== 'admin');

export function TeamRolesPanel({ onCallerRole }: { onCallerRole?: (role: Role | null) => void }) {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [searchName, setSearchName] = useState('');
  const [addSearch, setAddSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const [callerRole, setCallerRole] = useState<Role | null>(null);
  const [passwordBusy, setPasswordBusy] = useState<string | null>(null);
  const [passwordNote, setPasswordNote] = useState<string | null>(null);
  const addSearchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { session } = useAuth();

  const filteredTeam = team.filter((m) => {
    if (!searchName.trim()) return true;
    const q = searchName.toLowerCase().trim();
    const name = (m.display_name ?? '').toLowerCase();
    const id = m.user_id.toLowerCase();
    const memb = m.memberships.some(
      (x) =>
        x.team_label.toLowerCase().includes(q) ||
        x.role_label.toLowerCase().includes(q),
    );
    return name.includes(q) || id.includes(q) || memb;
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
      const role = typeof data.caller_role === 'string' ? (data.caller_role as Role) : null;
      setCallerRole(role);
      onCallerRole?.(role);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
      setTeam([]);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, onCallerRole]);

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
              const user_id =
                typeof u.user_id === 'string' && u.user_id.trim()
                  ? u.user_id.trim()
                  : typeof u.id === 'string' && u.id.trim()
                    ? u.id.trim()
                    : '';
              return {
                user_id,
                display_name: u.display_name ?? null,
                avatar_url: u.avatar_url ?? null,
              };
            })
            .filter((u: SearchUser) => u.user_id.length > 0),
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

  const handleEquipoPassword = async (userId: string, action: 'recovery_email' | 'generate_temporary') => {
    setPasswordBusy(userId);
    setPasswordNote(null);
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch(`/api/admin/users/${userId}/equipo-password`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'No se pudo completar');
      if (typeof data.temporary_password === 'string') {
        setPasswordNote(
          `Contraseña Team OS para ${userId.slice(0, 8)}…: ${data.temporary_password} (también en la columna «Para copiar»).`,
        );
      } else {
        setPasswordNote(typeof data.message === 'string' ? data.message : 'Correo enviado.');
      }
      await loadTeam();
    } catch (e) {
      setPasswordNote(e instanceof Error ? e.message : 'Error al gestionar contraseña');
    } finally {
      setPasswordBusy(null);
    }
  };

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
      if (typeof data.temporary_password === 'string') {
        setPasswordNote(
          `Nuevo staff — contraseña Team OS: ${data.temporary_password} (queda en la tabla para copiar).`,
        );
      }
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
    if (!previousRole || newRole === previousRole || !ROLES.includes(newRole)) return;
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
      setTeam((prev) => prev.map((m) => (m.user_id === uid ? { ...m, staff_role: newRole } : m)));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al actualizar');
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return <div className="text-gray-600 dark:text-gray-400">Cargando…</div>;
  }

  if (error) {
    return <div className="text-red-600 dark:text-red-400">{error}</div>;
  }

  const staffUserIds = new Set(team.filter((m) => m.staff_role).map((m) => m.user_id));

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        <strong className="font-medium text-gray-700 dark:text-gray-300">Rol panel</strong> = Admin/CEO.
        <strong className="font-medium text-gray-700 dark:text-gray-300"> Membresías</strong> = equipo en Team OS (Moderación…).
        La contraseña es la misma para entrar a{' '}
        <Link href="/team/gate" className="text-emerald-600 hover:underline">/team</Link>
        {callerRole === 'owner'
          ? ' (se genera al dar de alta o al asignar membresía; el owner la ve en «Para copiar»).'
          : '.'}
      </p>
      {passwordNote ? (
        <p className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 px-4 py-3 text-sm text-violet-900 dark:text-violet-100">
          {passwordNote}
        </p>
      ) : null}

      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] p-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Agregar rol de staff</h2>
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
              const alreadyInTeam = staffUserIds.has(u.user_id);
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
                      {u.display_name || `${u.user_id.slice(0, 8)}…`}
                    </span>
                  </div>
                  {alreadyInTeam ? (
                    <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Ya tiene rol</span>
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

      <div>
        <input
          type="search"
          placeholder="Buscar en la lista..."
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
              <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Rol panel</th>
              <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Membresías Team OS</th>
              <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Contraseña entrada</th>
              <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Asignar rol panel</th>
            </tr>
          </thead>
          <tbody>
            {filteredTeam.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-500 dark:text-gray-400">
                  {team.length === 0 ? 'No hay personas en el equipo' : 'No hay resultados para la búsqueda'}
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
                          {m.display_name || `${m.user_id.slice(0, 8)}…`}
                        </span>
                        {m.display_name ? (
                          <span className="block text-xs text-gray-500 dark:text-gray-400 font-mono">
                            {m.user_id.slice(0, 8)}…
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    {m.staff_role ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                        {ROLE_LABELS[m.staff_role]}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500 dark:text-gray-400">Sin rol panel</span>
                    )}
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                      {getReputationLabel(m.reputation_level)} ({m.reputation_score} pts)
                    </span>
                  </td>
                  <td className="p-3 align-top">
                    {m.memberships.length === 0 ? (
                      <span className="text-xs text-gray-500 dark:text-gray-400">Ninguna</span>
                    ) : (
                      <ul className="space-y-1 text-xs">
                        {m.memberships.map((mem) => (
                          <li key={`${mem.team_id}-${mem.role}`}>
                            <span className="font-medium text-gray-800 dark:text-gray-200">
                              {mem.team_label} · {mem.role_label}
                            </span>
                            <span className="text-gray-500 dark:text-gray-400"> — {mem.status}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="p-3 align-top">
                    <div className="flex flex-col gap-1.5 max-w-[16rem]">
                      {callerRole === 'owner' && m.last_equipo_password ? (
                        <div className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1.5">
                          <span className="text-[10px] uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                            Para copiar
                          </span>
                          <code className="mt-0.5 block break-all text-xs font-mono text-emerald-950 dark:text-emerald-100">
                            {m.last_equipo_password.password}
                          </code>
                        </div>
                      ) : null}
                      <span
                        className={`text-xs font-medium ${m.has_email_password ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}
                      >
                        {m.has_email_password ? 'Con contraseña' : 'Solo Google / sin clave'}
                      </span>
                      <button
                        type="button"
                        disabled={passwordBusy === m.user_id || !m.email}
                        onClick={() => void handleEquipoPassword(m.user_id, 'recovery_email')}
                        className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-xs font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 text-left"
                      >
                        {passwordBusy === m.user_id ? 'Enviando…' : 'Enviar enlace por correo'}
                      </button>
                      {callerRole === 'owner' ? (
                        <button
                          type="button"
                          disabled={passwordBusy === m.user_id}
                          onClick={() => void handleEquipoPassword(m.user_id, 'generate_temporary')}
                          className="rounded-lg border border-amber-300 dark:border-amber-700 px-2.5 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-100 hover:bg-amber-50 dark:hover:bg-amber-950/40 disabled:opacity-50 text-left"
                        >
                          Generar contraseña temporal
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className="p-3">
                    {m.staff_role ? (
                      <>
                        <select
                          value={m.staff_role}
                          onChange={(e) => {
                            const prev = m.staff_role;
                            if (!prev) return;
                            handleRoleChange(m.user_id, e.currentTarget.value as Role, prev);
                          }}
                          disabled={updating === m.user_id || m.staff_role === 'owner'}
                          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 px-3 py-2 text-sm disabled:opacity-50"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                        {m.staff_role === 'owner' ? (
                          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">(no editable)</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Agrégalo arriba con «Agregar rol de staff»
                      </span>
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
