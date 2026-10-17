import type { User } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { authorizeTeamPermission } from '@/lib/team/authz/authorize';
import { withPlatformOwner } from '@/lib/team/authz/platformRole';
import { loadActiveMemberships } from '@/lib/team/gate/memberships';
import type { TeamPermission } from '@/lib/team/permissions/registry';
import type { TeamMembership } from '@/lib/team/roles/membership';
import { bearerToken, isPlatformOwner } from './platformOwner';

export { bearerToken } from './platformOwner';

export type CollaboratorAuthOk = {
  user: User;
  memberships: TeamMembership[];
  via: 'owner' | 'team';
};

export type CollaboratorAuthErr = { error: string; status: 401 | 403 | 503 };

export async function loadCollaboratorMemberships(userId: string): Promise<
  { ok: true; memberships: TeamMembership[] } | { ok: false; status: 503 }
> {
  const loaded = await loadActiveMemberships(userId);
  if (!loaded.ok) return { ok: false, status: 503 };
  const memberships = await withPlatformOwner(userId, loaded.memberships);
  return { ok: true, memberships };
}

export function subjectHasTeamPermission(
  memberships: readonly TeamMembership[],
  permission: TeamPermission,
): boolean {
  for (const membership of memberships) {
    if (membership.status !== 'ACTIVE') continue;
    const decision = authorizeTeamPermission({ memberships }, membership.teamId, permission);
    if (decision.allowed) return true;
  }
  return false;
}

export async function requireBearerUser(request: Request): Promise<
  { user: User } | CollaboratorAuthErr
> {
  const token = bearerToken(request);
  if (!token) return { error: 'Unauthorized', status: 401 };
  const supabase = createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: 'Unauthorized', status: 401 };
  return { user };
}

/**
 * Permiso de colaborador vía membresía ACTIVE (+ proyección owner).
 * No exige team gate: sirve para APIs del panel y herramientas con Bearer.
 */
export async function requireCollaboratorPermission(
  request: Request,
  permission: TeamPermission,
): Promise<CollaboratorAuthOk | CollaboratorAuthErr> {
  const session = await requireBearerUser(request);
  if ('error' in session) return session;

  const loaded = await loadCollaboratorMemberships(session.user.id);
  if (!loaded.ok) return { error: 'Service unavailable', status: 503 };

  if (await isPlatformOwner(session.user.id)) {
    return { user: session.user, memberships: loaded.memberships, via: 'owner' };
  }

  if (!subjectHasTeamPermission(loaded.memberships, permission)) {
    return { error: 'Forbidden', status: 403 };
  }
  return { user: session.user, memberships: loaded.memberships, via: 'team' };
}

export async function requireOwnerOrCollaboratorPermission(
  request: Request,
  permission: TeamPermission,
): Promise<CollaboratorAuthOk | CollaboratorAuthErr> {
  return requireCollaboratorPermission(request, permission);
}

/** Acceso al hub `/equipo`: al menos una membresía ACTIVE o owner. */
export async function userCanAccessStaffHub(userId: string): Promise<boolean> {
  if (await isPlatformOwner(userId)) return true;
  const loaded = await loadActiveMemberships(userId);
  if (!loaded.ok) return false;
  return loaded.memberships.length > 0;
}
