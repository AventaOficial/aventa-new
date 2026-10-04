import type { TeamMembership } from '../roles/membership';
import { heroAccess } from './access';
import { composeTeamHero } from './adapters';
import { loadCommunityXp, loadTeamHeroFacts } from './load';
import type { TeamHeroPayload } from './types';

/**
 * Arma el Hero solo para la membresía ACTIVE del usuario de la sesión.
 * `requestedTeam` elige contexto; no autoriza.
 */
export async function buildTeamHeroPayload(input: {
  requestedTeam: string;
  memberships: readonly TeamMembership[];
  greeting: string;
  personName: string;
}): Promise<TeamHeroPayload | null> {
  const access = heroAccess(input.requestedTeam, input.memberships);
  if (!access.ok) return null;
  const [facts, communityXp] = await Promise.all([
    loadTeamHeroFacts(access.teamId, access.membership.userId),
    loadCommunityXp(access.membership.userId),
  ]);
  return composeTeamHero({
    membership: access.membership,
    greeting: input.greeting,
    personName: input.personName,
    facts,
    communityXp,
  });
}
