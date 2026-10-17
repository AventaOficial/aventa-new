import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { readAuthenticatedUserId } from '@/lib/team/gate/session';
import { loadActiveMemberships } from '@/lib/team/gate/memberships';
import { isPlatformOwner } from '@/lib/server/platformOwner';
import { userCanAccessStaffHub } from '@/lib/server/collaboratorAuth';
import StaffShell from './components/StaffShell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Equipo AVENTA',
  robots: { index: false, follow: false },
};

export default async function EquipoLayout({ children }: { children: React.ReactNode }) {
  const userId = await readAuthenticatedUserId();
  if (!userId) redirect('/');
  const canEnter = await userCanAccessStaffHub(userId);
  if (!canEnter) redirect('/');

  const isOwner = await isPlatformOwner(userId);
  const loaded = await loadActiveMemberships(userId);
  if (!loaded.ok && !isOwner) redirect('/');

  return <StaffShell>{children}</StaffShell>;
}
