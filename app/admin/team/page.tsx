'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers/AuthProvider';
import type { Role } from '@/lib/admin/roles';

type TeamMember = {
  user_id: string;
  role: Role;
  display_name: string | null;
};

const ROLES: Role[] = ['owner', 'admin', 'moderator', 'analyst'];
const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  moderator: 'Moderador',
  analyst: 'Analista',
};

export default function TeamPage() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const { session } = useAuth();

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

  const handleRoleChange = async (userId: string, newRole: Role) => {
    setUpdating(userId);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch('/api/admin/team', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ user_id: userId, role: newRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Error al actualizar');
      setTeam((prev) => prev.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m)));
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

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-6">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
        Equipo
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Solo el owner puede ver y editar roles. Aquí aparecen quienes tienen rol en el panel (owner, admin, moderador, analista).
      </p>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
              <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Usuario</th>
              <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Rol actual</th>
              <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Cambiar a</th>
            </tr>
          </thead>
          <tbody>
            {team.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-4 text-center text-gray-500 dark:text-gray-400">
                  No hay usuarios con rol
                </td>
              </tr>
            ) : (
              team.map((m) => (
                <tr key={m.user_id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="p-3">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {m.display_name || m.user_id.slice(0, 8) + '…'}
                    </span>
                    {m.display_name && (
                      <span className="block text-xs text-gray-500 dark:text-gray-400 font-mono">
                        {m.user_id}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                      {ROLE_LABELS[m.role]}
                    </span>
                  </td>
                  <td className="p-3">
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.user_id, e.target.value as Role)}
                      disabled={updating === m.user_id || m.role === 'owner'}
                      className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm disabled:opacity-50"
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
