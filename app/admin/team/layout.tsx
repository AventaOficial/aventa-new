import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireOwnerSession } from '@/lib/server/requireOwnerSession';

/** Team OS (membresías): solo owner. No confundir con roles de panel en /admin/staff-roles. */
export default async function AdminTeamOsLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const auth = await requireOwnerSession(new Request('https://www.aventaofertas.com/admin/team'), {
    getAll: async () => cookieStore.getAll(),
    set: () => {},
    delete: () => {},
  });
  if ('error' in auth && auth.status === 403) redirect('/admin');
  return children;
}
