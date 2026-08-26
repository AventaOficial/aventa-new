import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDefaultAdminHome } from '@/lib/admin/navigation';
import { pickEffectiveRole, ROLES, type Role } from '@/lib/admin/roles';
import { createServerAuthClient } from '@/lib/supabase/server-auth';

/**
 * `/admin` no tiene UI propia (solo layout + subrutas).
 * Sin este page.tsx, Next responde 404 a soft navigations / vuelos RSC (`/admin?_rsc=…`).
 */
export default async function AdminIndexPage() {
  const cookieStore = await cookies();
  const supabase = createServerAuthClient({
    getAll: async () => cookieStore.getAll(),
    set: () => {},
    delete: () => {},
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ROLES);

  const roles = ((data ?? []) as { role: Role }[]).map((row) => row.role);
  const role = pickEffectiveRole(roles);
  redirect(getDefaultAdminHome(role));
}
