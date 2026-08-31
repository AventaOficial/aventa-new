import type { Role } from '@/lib/admin/roles';
import { TEAM_MANAGEMENT_ROLES } from '@/lib/server/requireAdmin';

/** Owner/admin pueden omitir ownership en operaciones masivas de moderación. */
export function canUseBulkModeration(role: Role): boolean {
  return TEAM_MANAGEMENT_ROLES.includes(role);
}

export function bulkModerationForbiddenResponse(): { error: string; status: 403 } {
  return {
    error: 'Solo owner o admin pueden usar acciones en lote.',
    status: 403,
  };
}
