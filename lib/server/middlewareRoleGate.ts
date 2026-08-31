import type { SupabaseClient } from '@supabase/supabase-js';
import { canAccessAdmin, isRole, pickEffectiveRole, type Role } from '@/lib/admin/roles';
import { canAccessEquipoPath } from '@/lib/staff/equipoAccess';

export async function resolveUserStaffRole(
  supabase: SupabaseClient,
  userId: string,
): Promise<Role | null> {
  const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', userId);
  if (error) {
    console.error('[middlewareRoleGate] user_roles', error.message);
    return null;
  }
  const roles = ((data ?? []) as { role: string }[])
    .map((row) => row.role)
    .filter(isRole);
  return pickEffectiveRole(roles);
}

/** Comprueba acceso server-side a rutas /admin y /equipo (capa adicional al layout cliente). */
export function isStaffPathAllowed(pathname: string, role: Role | null): boolean {
  if (!role) return false;

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return canAccessAdmin(role);
  }

  if (pathname === '/equipo' || pathname.startsWith('/equipo/')) {
    return canAccessEquipoPath(role, pathname);
  }

  return true;
}
