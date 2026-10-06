import { TEAM_IDS, type TeamId } from './teams';

/**
 * Roles por equipo. El orden es el rango: el primero es el más bajo.
 * No reutiliza los roles globales de `user_roles`.
 */
export const TEAM_ROLES = {
  moderation: ['moderator', 'senior_moderator', 'moderation_lead'],
  hunter: ['hunter', 'hunter_lead'],
  finance: ['finance_viewer'],
  growth: ['growth_member', 'growth_lead'],
  product: ['product_member', 'product_lead'],
  community: ['community_member', 'community_lead'],
  operations: ['operations_member', 'operations_lead'],
} as const satisfies Record<TeamId, readonly string[]>;

export type TeamRole<T extends TeamId = TeamId> = (typeof TEAM_ROLES)[T][number];

export const TEAM_ROLE_LABELS = {
  moderation: {
    moderator: 'Moderador',
    senior_moderator: 'Moderador senior',
    moderation_lead: 'Líder de moderación',
  },
  hunter: {
    hunter: 'Cazador',
    hunter_lead: 'Líder de cazadores',
  },
  finance: {
    finance_viewer: 'Lectura de finanzas',
  },
  growth: {
    growth_member: 'Miembro de growth',
    growth_lead: 'Líder de growth',
  },
  product: {
    product_member: 'Miembro de producto',
    product_lead: 'Líder de producto',
  },
  community: {
    community_member: 'Miembro de comunidad',
    community_lead: 'Líder de comunidad',
  },
  operations: {
    operations_member: 'Miembro de operaciones',
    operations_lead: 'Líder de operaciones',
  },
} as const satisfies { [T in TeamId]: Record<TeamRole<T>, string> };

export function teamRoleLabel(teamId: TeamId, role: string): string {
  switch (teamId) {
    case 'moderation':
      return isTeamRole('moderation', role) ? TEAM_ROLE_LABELS.moderation[role] : role;
    case 'hunter':
      return isTeamRole('hunter', role) ? TEAM_ROLE_LABELS.hunter[role] : role;
    case 'finance':
      return isTeamRole('finance', role) ? TEAM_ROLE_LABELS.finance[role] : role;
    case 'growth':
      return isTeamRole('growth', role) ? TEAM_ROLE_LABELS.growth[role] : role;
    case 'product':
      return isTeamRole('product', role) ? TEAM_ROLE_LABELS.product[role] : role;
    case 'community':
      return isTeamRole('community', role) ? TEAM_ROLE_LABELS.community[role] : role;
    case 'operations':
      return isTeamRole('operations', role) ? TEAM_ROLE_LABELS.operations[role] : role;
    default: {
      const _exhaustive: never = teamId;
      return _exhaustive;
    }
  }
}

export function isTeamRole<T extends TeamId>(teamId: T, value: string): value is TeamRole<T> {
  const roles: readonly string[] = TEAM_ROLES[teamId];
  return roles.includes(value);
}

/** Rango dentro del equipo. `null` si el rol no pertenece a ese equipo. */
export function roleRank(teamId: TeamId, role: string): number | null {
  const roles: readonly string[] = TEAM_ROLES[teamId];
  const index = roles.indexOf(role);
  return index === -1 ? null : index;
}

export function meetsRoleRank(teamId: TeamId, role: string, minimumRole: string): boolean {
  const actual = roleRank(teamId, role);
  const minimum = roleRank(teamId, minimumRole);
  if (actual === null || minimum === null) return false;
  return actual >= minimum;
}

export function rolesForTeam(teamId: TeamId): readonly string[] {
  return TEAM_ROLES[teamId];
}

export function everyTeamHasRoles(): boolean {
  return TEAM_IDS.every((teamId) => TEAM_ROLES[teamId].length > 0);
}

/** El rol de mayor rango ya definido para ese equipo. */
export function leadRole<T extends TeamId>(teamId: T): TeamRole<T> {
  const roles = TEAM_ROLES[teamId];
  return roles[roles.length - 1];
}
