import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { STAFF_HUB_ROLES, isRole, pickEffectiveRole, type Role } from '@/lib/admin/roles';
import { createServerClient } from '@/lib/supabase/server';
import { readAuthenticatedUserId } from '@/lib/team/gate/session';
import StaffShell from './components/StaffShell';

export const metadata: Metadata = {
  title: 'Equipo AVENTA',
  robots: { index: false, follow: false },
};

async function staffRole(userId: string): Promise<Role | null> {
  try {
    const { data, error } = await createServerClient()
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', [...STAFF_HUB_ROLES]);
    if (error) return null;
    const roles = ((data ?? []) as { role: string }[])
      .map((row) => row.role)
      .filter(isRole);
    return pickEffectiveRole(roles);
  } catch {
    return null;
  }
}

export default async function EquipoLayout({ children }: { children: React.ReactNode }) {
  const userId = await readAuthenticatedUserId();
  if (!userId) redirect('/');
  const role = await staffRole(userId);
  if (!role || !STAFF_HUB_ROLES.includes(role)) redirect('/');
  return <StaffShell>{children}</StaffShell>;
}
