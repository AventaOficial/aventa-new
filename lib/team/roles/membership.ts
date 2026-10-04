import type { TeamId } from './teams';
import type { TeamRole } from './catalog';

/** ACTIVE entra. SUSPENDED y REMOVED no. REMOVED se conserva como historial. */
export const MEMBERSHIP_STATUSES = ['ACTIVE', 'SUSPENDED', 'REMOVED'] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

const MEMBERSHIP_STATUS_SET: ReadonlySet<string> = new Set(MEMBERSHIP_STATUSES);

export function isMembershipStatus(value: string): value is MembershipStatus {
  return MEMBERSHIP_STATUS_SET.has(value);
}

export function membershipGrantsAccess(status: MembershipStatus): boolean {
  return status === 'ACTIVE';
}

/**
 * Una membresía es de un solo equipo y un solo rol de ese equipo.
 * Varias membresías del mismo usuario son independientes.
 */
export type TeamMembership = {
  [T in TeamId]: {
    userId: string;
    teamId: T;
    role: TeamRole<T>;
    status: MembershipStatus;
  };
}[TeamId];
