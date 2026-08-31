import type { Role } from '@/lib/admin/roles';
import type { ModerationLevel } from './classifyModerationLevel';

/**
 * Nivel máximo de oferta que puede reclamar un rol.
 * moderator → A+B; owner/admin → A+B+C.
 */
export function moderationMaxLevelForRole(role: Role): ModerationLevel {
  if (role === 'owner' || role === 'admin') return 'enforcement';
  return 'review';
}
