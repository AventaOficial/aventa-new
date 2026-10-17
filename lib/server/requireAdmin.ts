import type { User } from '@supabase/supabase-js';
import { type Role } from '@/lib/admin/roles';
import {
  requireCollaboratorPermission,
  requireBearerUser,
  type CollaboratorAuthOk,
} from '@/lib/server/collaboratorAuth';
import { requirePlatformOwnerBearer } from '@/lib/server/platformOwner';

type AuthSuccess = { user: User; role: Role };
type AuthError = { error: string; status: 401 | 403 | 503 };
type AuthResult = AuthSuccess | AuthError;

function asModeratorRole(auth: CollaboratorAuthOk): AuthSuccess {
  return { user: auth.user, role: auth.via === 'owner' ? 'owner' : 'moderator' };
}

/** Compatibilidad de tests y mapas legacy; la autorización real es Team OS. */
export const MODERATION_ROLES: Role[] = ['owner', 'admin', 'moderator'];

export async function requireModeration(request: Request): Promise<AuthResult> {
  const auth = await requireCollaboratorPermission(request, 'moderation.offers.decide');
  if ('error' in auth) return auth;
  return asModeratorRole(auth);
}

export async function requireTeamBoard(request: Request): Promise<AuthResult> {
  return requireModeration(request);
}

export const METRICS_ROLES: Role[] = ['owner', 'admin', 'analyst'];

export async function requireMetrics(request: Request): Promise<AuthResult> {
  const ops = await requireCollaboratorPermission(request, 'operations.overview.read');
  if (!('error' in ops)) {
    return { user: ops.user, role: ops.via === 'owner' ? 'owner' : 'analyst' };
  }
  const mod = await requireCollaboratorPermission(request, 'moderation.metrics.read');
  if ('error' in mod) return mod.status === 503 ? mod : { error: 'Forbidden', status: 403 };
  return { user: mod.user, role: mod.via === 'owner' ? 'owner' : 'analyst' };
}

export const USERS_LOGS_ROLES: Role[] = ['owner'];

export async function requireUsersLogs(request: Request): Promise<AuthResult> {
  return requireOwner(request);
}

export const OWNER_ROLES: Role[] = ['owner'];

export async function requireOwner(request: Request): Promise<AuthResult> {
  return requirePlatformOwnerBearer(request);
}

/** Owner o admin: roles de panel (`user_roles`) en `/api/admin/staff-roles`. */
export const TEAM_MANAGEMENT_ROLES: Role[] = ['owner', 'admin'];

export async function requireTeamManagement(request: Request): Promise<AuthResult> {
  return requireOwner(request);
}

export const AFFILIATE_IMPORT_ROLES: Role[] = ['owner', 'finance'];

export async function requireAffiliateImport(request: Request): Promise<AuthResult> {
  const owner = await requireOwner(request);
  if (!('error' in owner)) return owner;
  if (owner.status === 401) return owner;
  const fin = await requireCollaboratorPermission(request, 'finance.overview.read');
  if ('error' in fin) return { error: 'Forbidden', status: 403 };
  return { user: fin.user, role: 'finance' };
}

export async function requireAnnouncements(request: Request): Promise<AuthResult> {
  return requireOwner(request);
}

export async function requireAdmin(request: Request): Promise<AuthResult> {
  const owner = await requireOwner(request);
  if (!('error' in owner)) return owner;
  if (owner.status === 401) return owner;
  const mod = await requireCollaboratorPermission(request, 'moderation.offers.decide');
  if (!('error' in mod)) return asModeratorRole(mod);
  const ops = await requireCollaboratorPermission(request, 'operations.overview.read');
  if (!('error' in ops)) return { user: ops.user, role: 'analyst' };
  return { error: 'Forbidden', status: 403 };
}
