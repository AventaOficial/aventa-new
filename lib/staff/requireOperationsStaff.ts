import type { Role } from '@/lib/admin/roles';
import { canAccessHealth } from '@/lib/admin/roles';
import { requireStaffHub } from '@/lib/server/requireStaff';
import { canAccessStaffDepartment } from '@/lib/staff/permissions';

type AuthSuccess = Awaited<ReturnType<typeof requireStaffHub>> & { role: Role };
type AuthError = { error: string; status: 401 | 403 };

const OPERATIONS_READ_ROLES: Role[] = ['owner', 'admin', 'gerente', 'analyst'];

export async function requireOperationsRead(request: Request): Promise<AuthSuccess | AuthError> {
  const auth = await requireStaffHub(request);
  if ('error' in auth) return auth;
  if (!OPERATIONS_READ_ROLES.includes(auth.role) || !canAccessStaffDepartment(auth.role, 'operaciones')) {
    return { error: 'Forbidden', status: 403 };
  }
  return auth as AuthSuccess;
}

export function canOperationsMetrics(role: Role): boolean {
  return canAccessHealth(role);
}
