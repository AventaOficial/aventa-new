import type { Role } from '@/lib/admin/roles';
import type { StaffDepartmentMeta } from '@/lib/staff/permissions';

/** Respuesta de `GET /api/equipo/context` (hub colaboradores). */
export type EquipoContextResponse = {
  is_owner: boolean;
  role: Role | null;
  nav_label: string;
  home_path: string;
  display_name: string | null;
  departments: StaffDepartmentMeta[];
  can_advanced_moderation: boolean;
};

export function hasStaffDepartment(
  ctx: Pick<EquipoContextResponse, 'departments'>,
  departmentId: StaffDepartmentMeta['id'],
): boolean {
  return ctx.departments.some((d) => d.id === departmentId);
}
