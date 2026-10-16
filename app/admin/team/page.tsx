import Link from 'next/link';
import { Suspense } from 'react';
import TeamManagementClient from '@/app/admin/owner/team-management/TeamManagementClient';
import { TeamOsPasswordTools } from './TeamOsPasswordTools';

function AdminTeamPageInner() {
  return (
    <div>
      <p className="mb-4 text-sm text-gray-400">
        Centro de <strong className="font-medium text-gray-200">Team OS</strong>: equipos, puestos y acceso a{' '}
        <Link href="/team/gate" className="text-emerald-500 hover:underline">/team</Link>.
        No concede acceso a <code className="text-xs">/admin</code>. Roles del panel CEO →{' '}
        <Link href="/admin/staff-roles" className="text-violet-400 hover:underline">Acceso al panel</Link>.
        Supervisión del trabajo →{' '}
        <Link href="/equipo" className="text-emerald-500 hover:underline">Team Hub</Link>.
      </p>
      <div className="rounded-2xl border border-gray-800 bg-[#0c0c0c] p-4 md:p-6">
        <TeamManagementClient />
      </div>
      <TeamOsPasswordTools />
    </div>
  );
}

export default function AdminTeamOsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] flex items-center justify-center">
          <p className="text-gray-500 dark:text-gray-400">Cargando Team OS…</p>
        </div>
      }
    >
      <AdminTeamPageInner />
    </Suspense>
  );
}
