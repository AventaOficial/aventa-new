import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireOwnerSession } from '@/lib/server/requireOwnerSession';

/**
 * Guard de Founder OS. Reutiliza requireOwnerSession (user_roles.role = owner).
 * 403 corta la ruta en el servidor. 401 deja el layout cliente, que ya exige la sesión.
 */
export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const auth = await requireOwnerSession(new Request('https://aventaofertas.com/admin/owner'), {
    getAll: async () => cookieStore.getAll(),
    set: () => {},
    delete: () => {},
  });
  if ('error' in auth && auth.status === 403) redirect('/');
  return children;
}
