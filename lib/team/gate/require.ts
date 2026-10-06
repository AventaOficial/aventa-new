import { cookies } from 'next/headers';
import { authorizeMinimumRole, authorizeTeamPermission } from '../authz/authorize';
import { teamHomePermission } from '../config/catalog';
import { roleHasPermission } from '../permissions/grants';
import type { TeamPermission } from '../permissions/registry';
import type { TeamMembership } from '../roles/membership';
import type { TeamId } from '../roles/teams';
import { logTeamGate } from './log';
import { loadActiveMemberships } from './memberships';
import { decideTeamEntry, interpretGate, visibleActiveTeamIds } from './policy';
import { readTeamActor, type TeamActor } from './session';
import { TEAM_GATE_COOKIE, verifyTeamGate } from './token';

export type TeamDenial = {
  ok: false;
  status: 401 | 403 | 503;
  code: 'unauthenticated' | 'gate_required' | 'forbidden' | 'schema_unavailable';
};

export type TeamGateOk = { ok: true; actor: TeamActor };
export type TeamMembershipOk = TeamGateOk & { membership: TeamMembership; memberships: TeamMembership[] };

export async function requireAuthenticatedUser(): Promise<TeamGateOk | TeamDenial> {
  const actor = await readTeamActor();
  if (!actor) return { ok: false, status: 401, code: 'unauthenticated' };
  return { ok: true, actor };
}

export async function requireTeamGate(): Promise<TeamGateOk | TeamDenial> {
  const actor = await readTeamActor();
  if (!actor) return { ok: false, status: 401, code: 'unauthenticated' };
  const cookieStore = await cookies();
  const token = cookieStore.get(TEAM_GATE_COOKIE)?.value;
  const verification = verifyTeamGate(token, { userId: actor.userId, sessionId: actor.sessionId });
  const decision = interpretGate({ actor, verification });
  if (decision !== 'ok') {
    if (!verification.ok) logTeamGate(verification.reason, actor.userId);
    return { ok: false, status: 401, code: decision === 'unauthenticated' ? 'unauthenticated' : 'gate_required' };
  }
  return { ok: true, actor };
}

async function guardedMemberships(
  teamId: TeamId,
): Promise<{ ok: true; actor: TeamActor; memberships: TeamMembership[] } | TeamDenial> {
  const gate = await requireTeamGate();
  if (!gate.ok) return gate;
  const loaded = await loadActiveMemberships(gate.actor.userId);
  if (!loaded.ok) return { ok: false, status: 503, code: 'schema_unavailable' };
  const allowed = visibleActiveTeamIds(loaded.memberships);
  if (!allowed.includes(teamId)) {
    logTeamGate('forbidden', gate.actor.userId);
    return { ok: false, status: 403, code: 'forbidden' };
  }
  return { ok: true, actor: gate.actor, memberships: loaded.memberships };
}

export async function requireTeamMembership(teamId: TeamId): Promise<TeamMembershipOk | TeamDenial> {
  const guarded = await guardedMemberships(teamId);
  if (!guarded.ok) return guarded;
  const membership = guarded.memberships.find((item) => item.teamId === teamId && item.status === 'ACTIVE');
  if (!membership) return { ok: false, status: 403, code: 'forbidden' };
  return { ok: true, actor: guarded.actor, membership, memberships: guarded.memberships };
}

export async function requireTeamRole(
  teamId: TeamId,
  minimumRole: string,
): Promise<TeamMembershipOk | TeamDenial> {
  const access = await requireTeamMembership(teamId);
  if (!access.ok) return access;
  const decision = authorizeMinimumRole({ memberships: access.memberships }, teamId, minimumRole);
  if (!decision.allowed) {
    logTeamGate(decision.reason, access.actor.userId);
    return { ok: false, status: 403, code: 'forbidden' };
  }
  return access;
}

export type TeamPageEntry =
  | { kind: 'login' | 'gate' | 'unavailable' | 'no-access' | 'forbidden' }
  | { kind: 'select'; memberships: TeamMembership[] }
  | { kind: 'allow'; membership: TeamMembership; memberships: TeamMembership[] };

/**
 * Resuelve la página sin consultar membresías si falta sesión o gate.
 * El equipo pedido solo se revela cuando el gate y la membresía ACTIVE coinciden.
 */
export async function resolveTeamPage(requestedTeam: string | null): Promise<TeamPageEntry> {
  const actor = await readTeamActor();
  if (!actor) return { kind: 'login' };
  const gate = await requireTeamGate();
  if (!gate.ok) return { kind: 'gate' };
  const loaded = await loadActiveMemberships(actor.userId);
  if (!loaded.ok) return { kind: 'unavailable' };
  const visible = visibleActiveTeamIds(loaded.memberships);
  const decision = decideTeamEntry({
    hasSession: true,
    gateValid: true,
    activeTeamIds: visible,
    requestedTeam,
  });
  const visibleMemberships = loaded.memberships.filter((item) => visible.includes(item.teamId));
  if (decision === 'no-access') return { kind: 'no-access' };
  if (decision === 'forbidden') return { kind: 'forbidden' };
  if (decision === 'select') return { kind: 'select', memberships: visibleMemberships };
  const membership = visibleMemberships.find((item) => item.teamId === requestedTeam);
  if (!membership) return { kind: 'forbidden' };
  if (!roleHasPermission(membership.teamId, membership.role, teamHomePermission(membership.teamId))) {
    return { kind: 'forbidden' };
  }
  return { kind: 'allow', membership, memberships: visibleMemberships };
}

export async function requireTeamPermission(
  teamId: TeamId,
  permission: TeamPermission,
): Promise<TeamMembershipOk | TeamDenial> {
  const access = await requireTeamMembership(teamId);
  if (!access.ok) return access;
  const decision = authorizeTeamPermission({ memberships: access.memberships }, teamId, permission);
  if (!decision.allowed) {
    logTeamGate(decision.reason, access.actor.userId);
    return { ok: false, status: 403, code: 'forbidden' };
  }
  return access;
}
