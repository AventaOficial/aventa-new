'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import TeamManagementClient from '@/app/admin/owner/team-management/TeamManagementClient';
import { TeamRolesPanel } from './TeamRolesPanel';
import type { Role } from '@/lib/admin/roles';

function AdminTeamPageInner() {
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

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">Equipo</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Una sola lista: rol del panel, equipos de Team OS y contraseña para entrar a{' '}
        <Link href="/team/gate" className="text-emerald-600 hover:underline">Team OS</Link>.
        Al agregar moderador o asignar a un equipo, el owner genera contraseña automática (visible abajo en la tabla).
        Supervisión del trabajo en{' '}
        <Link href="/equipo" className="text-emerald-600 hover:underline">Team Hub</Link>.
      </p>

      <TeamRolesPanel onCallerRole={setCallerRole} />

      {callerRole === 'owner' ? (
        <section className="mt-10 rounded-2xl border border-gray-200 dark:border-gray-800">
          <div className="border-b border-gray-200 dark:border-gray-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Asignar y gestionar membresías</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Alta en Moderación, Marketing, etc. Al confirmar se genera contraseña Team OS automáticamente.
            </p>
          </div>
          <div className="rounded-b-2xl border border-gray-800 bg-[#0c0c0c] p-4 md:p-6">
            <TeamManagementClient />
          </div>
        </section>
      ) : null}
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
