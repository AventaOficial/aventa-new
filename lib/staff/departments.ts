import type { Role } from '@/lib/admin/roles';
import type { StaffDepartmentId } from '@/lib/staff/permissions';
import { roleDefaultDepartment as defaultDept } from '@/lib/staff/roleRouting';

export function staffTasksConfigKey(department: StaffDepartmentId): string {
  return `staff_tasks_${department}`;
}

export function roleDefaultDepartment(role: Role): StaffDepartmentId {
  return defaultDept(role);
}
