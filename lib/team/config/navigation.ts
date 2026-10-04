import { roleHasPermission } from '../permissions/grants';
import type { TeamMembership } from '../roles/membership';
import { teamRoleLabel } from '../roles/catalog';
import type { TeamId } from '../roles/teams';
import { visibleActiveTeamIds } from '../gate/policy';
import { teamMetadata } from './catalog';
import type { TeamNavigationItem, TeamShellContext, TeamSwitcherEntry } from './types';

export function navigationFor(teamId: TeamId, role: string): TeamNavigationItem[] {
  const metadata = teamMetadata(teamId);
  const items: TeamNavigationItem[] = [];
  for (const item of metadata.navigation) {
    if (!roleHasPermission(teamId, role, item.permission)) continue;
    items.push({ ...item, href: `/team/${teamId}` });
  }
  return items;
}

export function switcherEntries(
  memberships: readonly TeamMembership[],
  currentTeamId: TeamId,
): TeamSwitcherEntry[] {
  return visibleActiveTeamIds(memberships).flatMap((teamId) => {
    const membership = memberships.find((item) => item.teamId === teamId && item.status === 'ACTIVE');
    if (!membership) return [];
    return [
      {
        teamId,
        displayName: teamMetadata(teamId).displayName,
        roleLabel: teamRoleLabel(teamId, membership.role),
        current: teamId === currentTeamId,
      },
    ];
  });
}

export function buildTeamShellContext(input: {
  membership: TeamMembership;
  memberships: readonly TeamMembership[];
  personName: string;
  greeting: string;
}): TeamShellContext | null {
  const allowed = visibleActiveTeamIds(input.memberships);
  if (!allowed.includes(input.membership.teamId) || input.membership.status !== 'ACTIVE') return null;
  const name = input.personName.trim();
  return {
    teamId: input.membership.teamId,
    roleLabel: teamRoleLabel(input.membership.teamId, input.membership.role),
    greeting: input.greeting,
    personName: name.length > 0 ? name : 'compañero',
    navigation: navigationFor(input.membership.teamId, input.membership.role),
    switcher: switcherEntries(input.memberships, input.membership.teamId),
  };
}

export function decideTeamHome(activeTeamIds: readonly TeamId[]): { kind: 'no-access' } | { kind: 'select' } | { kind: 'team'; teamId: TeamId } {
  if (activeTeamIds.length === 0) return { kind: 'no-access' };
  if (activeTeamIds.length === 1) {
    const teamId = activeTeamIds[0];
    if (!teamId) return { kind: 'no-access' };
    return { kind: 'team', teamId };
  }
  return { kind: 'select' };
}
