import Link from 'next/link';
import { TeamRolesPanel } from '@/app/admin/staff-roles/TeamRolesPanel';

export default function AdminStaffRolesPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">Acceso al panel</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Quién puede entrar a <code className="text-xs">/admin</code> (tabla <code className="text-xs">user_roles</code>).
        Para equipos de trabajo y contraseñas de Team OS sin hacerlos staff, usa{' '}
        <Link href="/admin/team" className="text-violet-600 hover:underline">Team OS — miembros</Link>.
      </p>
      <TeamRolesPanel />
    </div>
  );
}
