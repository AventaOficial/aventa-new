import { isTeamRole, type TeamRole } from '../roles/catalog';
import type { TeamId } from '../roles/teams';
import {
  permissionTeam,
  type TeamPermission,
} from './registry';

const MODERATOR = [
  'moderation.offers.read',
  'moderation.offers.decide',
  'moderation.reports.read',
] as const satisfies readonly TeamPermission[];

const MODERATION_WITH_METRICS = [
  ...MODERATOR,
  'moderation.metrics.read',
] as const satisfies readonly TeamPermission[];

const HUNTER = [
  'hunter.offers.read',
  'hunter.activity.read',
] as const satisfies readonly TeamPermission[];

const HUNTER_LEAD = [
  ...HUNTER,
  'hunter.batches.decide',
] as const satisfies readonly TeamPermission[];

const GROWTH = ['growth.overview.read'] as const satisfies readonly TeamPermission[];
const PRODUCT = ['product.overview.read'] as const satisfies readonly TeamPermission[];
const COMMUNITY = ['community.overview.read'] as const satisfies readonly TeamPermission[];
const OPERATIONS = ['operations.overview.read'] as const satisfies readonly TeamPermission[];
const FINANCE = ['finance.overview.read'] as const satisfies readonly TeamPermission[];

export const ROLE_GRANTS = {
  moderation: {
    moderator: MODERATOR,
    senior_moderator: MODERATION_WITH_METRICS,
    moderation_lead: MODERATION_WITH_METRICS,
  },
  hunter: {
    hunter: HUNTER,
    hunter_lead: HUNTER_LEAD,
  },
  finance: {
    finance_viewer: FINANCE,
  },
  growth: {
    growth_member: GROWTH,
    growth_lead: GROWTH,
  },
  product: {
    product_member: PRODUCT,
    product_lead: PRODUCT,
  },
  community: {
    community_member: COMMUNITY,
    community_lead: COMMUNITY,
  },
  operations: {
    operations_member: OPERATIONS,
    operations_lead: OPERATIONS,
  },
} as const satisfies { [T in TeamId]: Record<TeamRole<T>, readonly TeamPermission[]> };

export function permissionsFor(teamId: TeamId, role: string): readonly TeamPermission[] {
  switch (teamId) {
    case 'moderation':
      if (!isTeamRole('moderation', role)) return [];
      return ROLE_GRANTS.moderation[role];
    case 'hunter':
      if (!isTeamRole('hunter', role)) return [];
      return ROLE_GRANTS.hunter[role];
    case 'finance':
      if (!isTeamRole('finance', role)) return [];
      return ROLE_GRANTS.finance[role];
    case 'growth':
      if (!isTeamRole('growth', role)) return [];
      return ROLE_GRANTS.growth[role];
    case 'product':
      if (!isTeamRole('product', role)) return [];
      return ROLE_GRANTS.product[role];
    case 'community':
      if (!isTeamRole('community', role)) return [];
      return ROLE_GRANTS.community[role];
    case 'operations':
      if (!isTeamRole('operations', role)) return [];
      return ROLE_GRANTS.operations[role];
    default: {
      const _exhaustive: never = teamId;
      return _exhaustive;
    }
  }
}

export function roleHasPermission(
  teamId: TeamId,
  role: string,
  permission: TeamPermission,
): boolean {
  if (permissionTeam(permission) !== teamId) return false;
  const granted: readonly string[] = permissionsFor(teamId, role);
  return granted.includes(permission);
}
