import type { SupabaseClient } from '@supabase/supabase-js';
import { canAccessAdmin, type Role } from '@/lib/admin/roles';
import { canAccessEquipoPathFromMemberships } from '@/lib/staff/equipoTeamAccess';
import { loadActiveMemberships } from '@/lib/team/gate/memberships';
import type { TeamMembership } from '@/lib/team/roles/membership';
import { isPlatformOwner } from '@/lib/server/platformOwner';
import { syntheticMembershipsForLegacyStaffRole } from '@/lib/staff/legacyStaffMapping';

export async function resolveUserStaffRole(
  supabase: SupabaseClient,
  userId: string,
): Promise<Role | null> {
  if (await isPlatformOwner(userId)) return 'owner';
  const loaded = await loadActiveMemberships(userId);
  if (!loaded.ok || loaded.memberships.length === 0) return null;
  return 'moderator';
}

/** Comprueba acceso server-side a rutas /admin y /equipo (middleware). */
export async function isStaffPathAllowed(
  pathname: string,
  userId: string,
  _supabase: SupabaseClient,
): Promise<boolean> {
  const isOwner = await isPlatformOwner(userId);
  const loaded = await loadActiveMemberships(userId);
  const memberships = loaded.ok ? loaded.memberships : [];
  return evaluateStaffPathAccess(pathname, { isOwner, memberships });
}

/** Evaluación pura para tests y documentación (sin I/O). */
export function evaluateStaffPathAccess(
  pathname: string,
  input: { isOwner: boolean; memberships: readonly TeamMembership[] },
): boolean {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return input.isOwner && canAccessAdmin('owner');
  }
  if (pathname === '/equipo' || pathname.startsWith('/equipo/')) {
    return canAccessEquipoPathFromMemberships(input.memberships, pathname, input.isOwner);
  }
  return true;
}

/** Atajo para tests que aún hablan en términos de rol staff legacy. */
export function evaluateStaffPathAccessForLegacyRole(pathname: string, role: Role | null): boolean {
  if (!role) return false;
  return evaluateStaffPathAccess(pathname, {
    isOwner: role === 'owner',
    memberships: syntheticMembershipsForLegacyStaffRole(role),
  });
}
