import { createServerClient } from '@/lib/supabase/server';
import { type Role } from '@/lib/admin/roles';
import type { User } from '@supabase/supabase-js';
import {
  loadCollaboratorMemberships,
  requireBearerUser,
  userCanAccessStaffHub,
} from '@/lib/server/collaboratorAuth';
import { requirePlatformOwnerBearer } from '@/lib/server/platformOwner';
import { compatibilityStaffRole } from '@/lib/staff/membershipNav';
import { TEAM_ROLES } from '@/lib/team/roles/catalog';
import type { TeamMembership } from '@/lib/team/roles/membership';

type AuthSuccess = { user: User; role: Role; displayName: string | null };
type AuthError = { error: string; status: 401 | 403 | 503 };
type AuthResult = AuthSuccess | AuthError;

function isAnyTeamLead(memberships: readonly TeamMembership[]): boolean {
  for (const m of memberships) {
    if (m.status !== 'ACTIVE') continue;
    const roles = TEAM_ROLES[m.teamId];
    if (roles.length < 2) continue;
    if (roles[roles.length - 1] === m.role) return true;
  }
  return false;
}

async function profileDisplayName(userId: string): Promise<string | null> {
  const supabase = createServerClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  return (profile as { display_name?: string | null } | null)?.display_name ?? null;
}

/** Cualquier colaborador con membresía ACTIVE en Team OS (o owner). */
export async function requireStaffHub(request: Request): Promise<AuthResult> {
  const owner = await requirePlatformOwnerBearer(request);
  if (!('error' in owner)) {
    const displayName = await profileDisplayName(owner.user.id);
    return { user: owner.user, role: 'owner', displayName };
  }
  if (owner.status === 401) return owner;

  const session = await requireBearerUser(request);
  if ('error' in session) return session;

  if (!(await userCanAccessStaffHub(session.user.id))) {
    return { error: 'Forbidden', status: 403 };
  }

  const loaded = await loadCollaboratorMemberships(session.user.id);
  if (!loaded.ok) return { error: 'Service unavailable', status: 503 };
  const role = compatibilityStaffRole(loaded.memberships, false);
  if (!role) return { error: 'Forbidden', status: 403 };
  const displayName = await profileDisplayName(session.user.id);
  return { user: session.user, role, displayName };
}

/** Supervisión: owner o cualquier rol `*_lead` activo en Team OS. */
export async function requireGerencia(request: Request): Promise<AuthResult> {
  const owner = await requirePlatformOwnerBearer(request);
  if (!('error' in owner)) {
    const displayName = await profileDisplayName(owner.user.id);
    return { user: owner.user, role: 'owner', displayName };
  }
  if (owner.status === 401) return owner;

  const session = await requireBearerUser(request);
  if ('error' in session) return session;

  const loaded = await loadCollaboratorMemberships(session.user.id);
  if (!loaded.ok) return { error: 'Service unavailable', status: 503 };
  if (!isAnyTeamLead(loaded.memberships)) {
    return { error: 'Forbidden', status: 403 };
  }
  const displayName = await profileDisplayName(session.user.id);
  return { user: session.user, role: 'gerente', displayName };
}
