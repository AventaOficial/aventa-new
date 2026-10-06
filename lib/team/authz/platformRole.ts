import { createServerClient } from '@/lib/supabase/server';
import { mergePlatformOwnerMemberships } from './platformOwner';
import type { TeamMembership } from '../roles/membership';

/**
 * Proyecta el rol global owner sobre las membresías de equipo.
 * Un error de lectura no concede acceso.
 */
export async function withPlatformOwner(
  userId: string,
  memberships: readonly TeamMembership[],
): Promise<TeamMembership[]> {
  try {
    const { data, error } = await createServerClient()
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'owner')
      .limit(1);
    if (error || !(data ?? []).length) return [...memberships];
    return mergePlatformOwnerMemberships(userId, memberships);
  } catch {
    return [...memberships];
  }
}
