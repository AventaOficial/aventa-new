import { criteriaMet, type TeamAchievementFacts } from './engine';
import type { AchievementAwardStatus, TeamAchievementDefinition } from './types';

/** Modelo puro de `award_team_achievement`: una vez por (user, team, key). */
export type AchievementLedgerState = {
  awards: ReadonlySet<string>;
  xpGranted: number;
};

export const EMPTY_ACHIEVEMENT_LEDGER: AchievementLedgerState = { awards: new Set(), xpGranted: 0 };

export function commitAchievementAward(
  state: AchievementLedgerState,
  input: {
    userId: string;
    activeMember: boolean;
    achievement: TeamAchievementDefinition;
    facts: TeamAchievementFacts;
  },
): { state: AchievementLedgerState; status: AchievementAwardStatus } {
  if (!input.activeMember) return { state, status: 'skipped' };
  const key = `${input.userId}:${input.achievement.teamId}:${input.achievement.key}`;
  if (state.awards.has(key)) return { state, status: 'duplicate' };
  if (!criteriaMet(input.achievement.criteria, input.facts)) return { state, status: 'not_met' };
  const awards = new Set(state.awards);
  awards.add(key);
  return { state: { awards, xpGranted: state.xpGranted + input.achievement.xpReward }, status: 'awarded' };
}
