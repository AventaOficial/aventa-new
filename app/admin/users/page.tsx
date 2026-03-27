'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/app/providers/AuthProvider';

type UserRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  created_at: string;
  reputation_score: number;
  offers_submitted_count: number;
  offers_approved_count: number;
  offers_rejected_count: number;
  roles: string[];
  banned: boolean;
  ban_reason: string | null;
  ban_expires_at: string | null;
  last_seen_at: string | null;
  commissions_accepted_at: string | null;
  commissions_terms_version: string | null;
  commission_qualifying_offers: number;
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60_000) return 'Ahora';
    if (diff < 3600_000) return `Hace ${Math.floor(diff / 60_000)} min`;
    if (diff < 86400_000) return `Hace ${Math.floor(diff / 3600_000)} h`;
    if (diff < 604800_000) return `Hace ${Math.floor(diff / 86400_000)} días`;
    return d.toLocaleDateString('es-MX');
  } catch {
    return iso;
  }
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { session } = useAuth();

  useEffect(() => {
    if (!session?.access_token) {
      setLoading(false);
      setError('Inicia sesión para ver usuarios.');
      return;
    }
    setLoading(true);
    setError(null);
    fetch('/api/admin/users', { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((res) => {
        if (!res.ok) return res.json().then((j) => Promise.reject(new Error(j?.error ?? 'Error')));
        return res.json();
      })
      .then((data) => {
        setUsers(Array.isArray(data?.users) ? data.users : []);
      })
      .catch((e) => setError(e?.message ?? 'Error al cargar usuarios'))
      .finally(() => setLoading(false));
  }, [session?.access_token]);

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">Usuarios</h1>
        <p className="text-gray-500 dark:text-gray-400">Cargando…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">Usuarios</h1>
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
          <p className="text-amber-800 dark:text-amber-200">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">Usuarios</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Listado de perfiles con roles, ofertas y baneos. Baneos se gestionan en Moderación → Baneos.
      </p>
      {users.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">No hay usuarios.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Usuario</th>
                  <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Roles</th>
                  <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Rep.</th>
                  <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Ofertas</th>
                  <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Comisiones</th>
                  <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Última actividad</th>
                  <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Registro</th>
                  <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Estado</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td className="p-3">
                      <span className="font-medium text-gray-800 dark:text-gray-200">
                        {u.display_name || u.username || u.id.slice(0, 8) + '…'}
                      </span>
                      {u.username && (
                        <Link
                          href={`/u/${u.username}`}
                          className="block text-purple-600 dark:text-purple-400 hover:underline text-xs"
                        >
                          @{u.username}
                        </Link>
                      )}
                    </td>
                    <td className="p-3 text-gray-600 dark:text-gray-400">
                      {u.roles.length ? u.roles.join(', ') : '—'}
                    </td>
                    <td className="p-3 text-gray-700 dark:text-gray-300">{u.reputation_score}</td>
                    <td className="p-3 text-gray-600 dark:text-gray-400">
                      {u.offers_submitted_count} / {u.offers_approved_count} aprob. / {u.offers_rejected_count} rech.
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {u.commission_qualifying_offers}/15 calificadas
                        </span>
                        {u.commissions_accepted_at ? (
                          <span className="inline-flex w-fit items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200">
                            Activo ({u.commissions_terms_version ?? 'sin versión'})
                          </span>
                        ) : (
                          <span className="inline-flex w-fit items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                            No activo
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-gray-600 dark:text-gray-400">
                      {u.last_seen_at ? formatRelative(u.last_seen_at) : '—'}
                    </td>
                    <td className="p-3 text-gray-500 dark:text-gray-500">{formatDate(u.created_at)}</td>
                    <td className="p-3">
                      {u.banned ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200" title={u.ban_reason ?? undefined}>
                          Baneado
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
