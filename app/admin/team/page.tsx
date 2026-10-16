import Link from 'next/link';
import TeamManagementClient from '@/app/admin/owner/team-management/TeamManagementClient';

export default function AdminTeamOsPage() {
  return (
    <div className="rounded-2xl border border-gray-800 bg-[#0c0c0c] p-4 md:p-6">
      <p className="mb-4 text-sm text-gray-400">
        Centro de <strong className="font-medium text-gray-200">Team OS</strong>: equipos, puestos y acceso a{' '}
        <Link href="/team/gate" className="text-emerald-500 hover:underline">/team</Link>.
        No concede acceso a <code className="text-xs">/admin</code>. Roles del panel CEO →{' '}
        <Link href="/admin/staff-roles" className="text-violet-400 hover:underline">Acceso al panel</Link>.
        Supervisión del trabajo →{' '}
        <Link href="/equipo" className="text-emerald-500 hover:underline">Team Hub</Link>.
      </p>
      <TeamManagementClient />
    </div>
  );
}
