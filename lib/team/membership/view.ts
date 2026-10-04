import { isMembershipStatus, type MembershipStatus } from '../roles/membership';

/** `live` = ACTIVE o SUSPENDED: quien pertenece hoy al equipo. REMOVED es historial. */
export type MemberStatusFilter = MembershipStatus | 'live' | '';

export const LIVE_STATUSES: readonly MembershipStatus[] = ['ACTIVE', 'SUSPENDED'];

export function readMemberStatusFilter(value: string | null): MemberStatusFilter | null {
  if (value === null || value === '') return '';
  if (value === 'live') return 'live';
  return isMembershipStatus(value) ? value : null;
}

export function matchesMemberFilter(
  member: { teamId: string; status: string },
  filter: { team: string; status: MemberStatusFilter },
): boolean {
  if (filter.team && member.teamId !== filter.team) return false;
  if (filter.status === 'live') return member.status === 'ACTIVE' || member.status === 'SUSPENDED';
  if (filter.status) return member.status === filter.status;
  return true;
}

/**
 * Aplica la membresía que devolvió el servidor tras una mutación.
 * La fila persistida reemplaza a la local; si ya no cumple el filtro, sale de la lista.
 */
export function reconcileMember<T extends { id: string; teamId: string; status: string }>(
  members: readonly T[],
  persisted: T,
  filter: { team: string; status: MemberStatusFilter },
): T[] {
  const visible = matchesMemberFilter(persisted, filter);
  const exists = members.some((member) => member.id === persisted.id);
  if (!visible) return members.filter((member) => member.id !== persisted.id);
  if (exists) return members.map((member) => (member.id === persisted.id ? persisted : member));
  return [persisted, ...members];
}

export type CandidateMembership = { membershipId: string; teamId: string; role: string; status: string };

export type CandidateState = 'assignable' | 'returning' | 'member' | 'suspended' | 'self';

/**
 * Estado de un usuario respecto al equipo elegido.
 * `returning` tuvo una membresía REMOVED y puede recibir una nueva.
 */
export function candidateState(
  candidate: { self: boolean; memberships: readonly CandidateMembership[] },
  teamId: string,
): CandidateState {
  if (candidate.self) return 'self';
  const current = candidate.memberships.find((membership) => membership.teamId === teamId);
  if (!current) return 'assignable';
  if (current.status === 'ACTIVE') return 'member';
  if (current.status === 'SUSPENDED') return 'suspended';
  return 'returning';
}

export function canAssignCandidate(state: CandidateState): boolean {
  return state === 'assignable' || state === 'returning';
}
