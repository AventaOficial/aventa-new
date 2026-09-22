import type { Role } from '@/lib/admin/roles';
import { requireStaffHub } from '@/lib/server/requireStaff';
import { canAccessStaffDepartment } from '@/lib/staff/permissions';

type AuthSuccess = Awaited<ReturnType<typeof requireStaffHub>> & { role: Role };
type AuthError = { error: string; status: 401 | 403 };

const FINANCE_WRITE_ROLES: Role[] = ['owner', 'admin', 'finance'];
const FINANCE_READ_ROLES: Role[] = ['owner', 'admin', 'finance', 'gerente'];

export async function requireFinanceRead(request: Request): Promise<AuthSuccess | AuthError> {
  const auth = await requireStaffHub(request);
  if ('error' in auth) return auth;
  if (!FINANCE_READ_ROLES.includes(auth.role) || !canAccessStaffDepartment(auth.role, 'contabilidad')) {
    return { error: 'Forbidden', status: 403 };
  }
  return auth as AuthSuccess;
}

export async function requireFinanceWrite(request: Request): Promise<AuthSuccess | AuthError> {
  const auth = await requireStaffHub(request);
  if ('error' in auth) return auth;
  if (!FINANCE_WRITE_ROLES.includes(auth.role) || !canAccessStaffDepartment(auth.role, 'contabilidad')) {
    return { error: 'Forbidden', status: 403 };
  }
  return auth as AuthSuccess;
}

export function canFinanceWrite(role: Role): boolean {
  return FINANCE_WRITE_ROLES.includes(role);
}

/**
 * Centro de Pagos (docs/SYSTEMS/SYSTEM_payout_operations.md §3).
 * Solo quien decide (owner) y quien opera la contabilidad (finance).
 * Para ampliar acceso se edita únicamente esta constante.
 */
export const PAYOUT_OPS_ROLES: Role[] = ['owner', 'finance'];

export function canAccessPayoutOps(role: Role | null): boolean {
  return role != null && PAYOUT_OPS_ROLES.includes(role);
}

export async function requirePayoutOps(request: Request): Promise<AuthSuccess | AuthError> {
  const auth = await requireStaffHub(request);
  if ('error' in auth) return auth;
  if (!canAccessPayoutOps(auth.role) || !canAccessStaffDepartment(auth.role, 'contabilidad')) {
    return { error: 'Forbidden', status: 403 };
  }
  return auth as AuthSuccess;
}
