import type { User } from '@supabase/supabase-js';
import { OWNER_ROLES } from '@/lib/server/requireAdmin';
import { createServerClient } from '@/lib/supabase/server';
import { createServerAuthClient } from '@/lib/supabase/server-auth';
import { pickEffectiveRole, type Role } from '@/lib/admin/roles';

type AuthSuccess = { user: User; role: Role };
type AuthError = { error: string; status: 401 | 403 };
type AuthResult = AuthSuccess | AuthError;

async function resolveOwnerFromUserId(userId: string): Promise<Role | null> {
  const supabase = createServerClient();
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .in('role', OWNER_ROLES);

  const userRoles = ((roles ?? []) as { role: Role }[]).map((r) => r.role);
  const role = pickEffectiveRole(userRoles);
  if (!role || !OWNER_ROLES.includes(role)) return null;
  return role;
}

async function requireOwnerFromBearer(request: Request): Promise<AuthResult | null> {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return null;

  const supabase = createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) return { error: 'Unauthorized', status: 401 };

  const role = await resolveOwnerFromUserId(user.id);
  if (!role) return { error: 'Forbidden', status: 403 };
  return { user, role };
}

type CookieStoreLike = {
  getAll: () => Promise<{ name: string; value: string }[]>;
  set: (name: string, value: string, options?: Record<string, unknown>) => Promise<void> | void;
  delete: (name: string, options?: Record<string, unknown>) => Promise<void> | void;
};

async function requireOwnerFromCookies(cookieStore: CookieStoreLike): Promise<AuthResult | null> {
  const supabase = createServerAuthClient({
    getAll: async () => cookieStore.getAll(),
    set: (name, value, options) => {
      cookieStore.set(name, value, options as Record<string, unknown>);
    },
    delete: (name, options) => {
      cookieStore.delete(name, options as Record<string, unknown>);
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const role = await resolveOwnerFromUserId(user.id);
  if (!role) return { error: 'Forbidden', status: 403 };
  return { user, role };
}

/**
 * Owner gate para OAuth ML: Bearer (APIs) o sesión Supabase en cookies (navegación GET).
 */
export async function requireOwnerSession(
  request: Request,
  cookieStore: CookieStoreLike,
): Promise<AuthResult> {
  const fromBearer = await requireOwnerFromBearer(request);
  if (fromBearer) {
    if ('error' in fromBearer) return fromBearer;
    return fromBearer;
  }

  const fromCookies = await requireOwnerFromCookies(cookieStore);
  if (fromCookies) {
    if ('error' in fromCookies) return fromCookies;
    return fromCookies;
  }

  return { error: 'Unauthorized', status: 401 };
}

export type { User };
