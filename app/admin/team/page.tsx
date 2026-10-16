'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/app/providers/AuthProvider';
import TeamManagementClient from '@/app/admin/owner/team-management/TeamManagementClient';
import { TeamRolesPanel } from './TeamRolesPanel';
import type { Role } from '@/lib/admin/roles';

type TabId = 'roles' | 'membresias';

function tabFromParam(raw: string | null): TabId {
  return raw === 'membresias' ? 'membresias' : 'roles';
}

function AdminTeamPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = tabFromParam(searchParams.get('tab'));
  const [callerRole, setCallerRole] = useState<Role | null>(null);
  const { session } = useAuth();

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    fetch('/api/admin/team', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.caller_role === 'string') setCallerRole(data.caller_role as Role);
      })
      .catch(() => {});
  }, [session?.access_token]);

  const setTab = useCallback(
    (next: TabId) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'roles') params.delete('tab');
      else params.set('tab', next);
      const q = params.toString();
      router.replace(q ? `/admin/team?${q}` : '/admin/team');
    },
    [router, searchParams],
  );

  const showMemberships = tab === 'membresias';

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">Equipo</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Un solo lugar para roles de staff, contraseñas de Team OS y membresías (Moderación, Marketing, Contabilidad…).
        El trabajo diario sigue en{' '}
        <Link href="/equipo" className="text-emerald-600 hover:underline">Team Hub</Link>.
      </p>

      <div
        className="mb-6 flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-2"
        role="tablist"
        aria-label="Secciones de equipo"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'roles'}
          onClick={() => setTab('roles')}
          className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
            tab === 'roles'
              ? 'bg-violet-600 text-white'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          Roles y contraseña Team OS
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={showMemberships}
          onClick={() => setTab('membresias')}
          className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
            showMemberships
              ? 'bg-violet-600 text-white'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          Membresías Team OS
          {callerRole !== 'owner' && callerRole !== null ? (
            <span className="ml-1 text-xs opacity-80">(owner)</span>
          ) : null}
        </button>
      </div>

      {showMemberships ? (
        callerRole === null ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Cargando permisos…</p>
        ) : callerRole === 'owner' ? (
          <div className="rounded-2xl border border-gray-800 bg-[#0c0c0c] p-4 md:p-6">
            <TeamManagementClient />
          </div>
        ) : (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Solo el owner puede gestionar membresías de Team OS (Moderación, Marketing…). En la otra pestaña
            puedes cambiar roles de staff y enviar enlaces de contraseña.
          </p>
        )
      ) : (
        <TeamRolesPanel onCallerRole={setCallerRole} />
      )}
    </div>
  );
}

export default function TeamPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-500">Cargando…</div>}>
      <AdminTeamPageInner />
    </Suspense>
  );
}
