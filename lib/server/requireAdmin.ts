import { createServerClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

type Role = 'owner' | 'admin' | 'moderator' | 'analyst'

type AuthSuccess = { user: User; role: Role }
type AuthError = { error: string; status: 401 | 403 }
type AuthResult = AuthSuccess | AuthError

const ROLE_PRIORITY: Role[] = ['owner', 'admin', 'moderator', 'analyst']

/** Roles que pueden moderar ofertas */
export const MODERATION_ROLES: Role[] = ['owner', 'admin', 'moderator']

/** Roles que pueden ver/refrescar métricas */
export const METRICS_ROLES: Role[] = ['owner', 'admin', 'analyst']

async function requireRole(
  request: Request,
  allowedRoles: Role[]
): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null

  if (!token) {
    return { error: 'Unauthorized', status: 401 }
  }

  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return { error: 'Unauthorized', status: 401 }
  }

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', allowedRoles)

  const userRoles = ((roles ?? []) as { role: Role }[]).map((r) => r.role)
  const role = ROLE_PRIORITY.find((p) => userRoles.includes(p)) ?? null

  if (!role || !allowedRoles.includes(role)) {
    return { error: 'Forbidden', status: 403 }
  }

  return { user, role }
}

/** Para moderación (aprobar/rechazar ofertas, increment-approved) */
export async function requireModeration(request: Request): Promise<AuthResult> {
  return requireRole(request, MODERATION_ROLES)
}

/** Para métricas (refresh-metrics) */
export async function requireMetrics(request: Request): Promise<AuthResult> {
  return requireRole(request, METRICS_ROLES)
}

/** Cualquier rol admin (compatibilidad con código existente) */
export async function requireAdmin(request: Request): Promise<AuthResult> {
  return requireRole(request, ROLE_PRIORITY)
}
