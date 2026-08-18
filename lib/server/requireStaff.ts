import { createServerClient } from '@/lib/supabase/server';
import {
  STAFF_HUB_ROLES,
  GERENCIA_ROLES,
  type Role,
  pickEffectiveRole,
} from '@/lib/admin/roles';
import type { User } from '@supabase/supabase-js';

type AuthSuccess = { user: User; role: Role; displayName: string | null };
type AuthError = { error: string; status: 401 | 403 };
type AuthResult = AuthSuccess | AuthError;

async function requireStaffRole(
  request: Request,
  allowedRoles: Role[],
): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return { error: 'Unauthorized', status: 401 };
  }

  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return { error: 'Unauthorized', status: 401 };
  }

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', STAFF_HUB_ROLES);

  const userRoles = ((roles ?? []) as { role: Role }[]).map((r) => r.role);
  const role = pickEffectiveRole(userRoles);

  if (!role || !allowedRoles.includes(role)) {
    return { error: 'Forbidden', status: 403 };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  const displayName = (profile as { display_name?: string | null } | null)?.display_name ?? null;

  return { user, role, displayName };
}

/** Cualquier rol con acceso al hub `/equipo`. */
export async function requireStaffHub(request: Request): Promise<AuthResult> {
  return requireStaffRole(request, STAFF_HUB_ROLES);
}

/** Gerencia: owner, admin, gerente. */
export async function requireGerencia(request: Request): Promise<AuthResult> {
  return requireStaffRole(request, GERENCIA_ROLES);
}
