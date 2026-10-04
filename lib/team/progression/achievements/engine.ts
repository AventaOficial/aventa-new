import { TEAM_XP_RULES } from '../../xp/rules/catalog';
import type { TeamXpRule } from '../../xp/rules/types';
import type { TeamId } from '../../roles/teams';
import { TEAM_ACHIEVEMENTS } from './catalog';
import type { TeamAchievementCriteria, TeamAchievementDefinition } from './types';

const KEY_PATTERN = /^[a-z]+\.[a-z0-9_]+$/;

export function achievementProblems(
  achievement: TeamAchievementDefinition,
  rules: readonly TeamXpRule[] = TEAM_XP_RULES,
): string[] {
  const problems: string[] = [];
  if (!KEY_PATTERN.test(achievement.key) || achievement.key.length > 64) problems.push('key');
  if (achievement.key.split('.')[0] !== achievement.teamId) problems.push('team');
  if (!Number.isInteger(achievement.version) || achievement.version < 1) problems.push('version');
  if (!Number.isInteger(achievement.xpReward) || achievement.xpReward < 0 || achievement.xpReward > 1000) {
    problems.push('xp');
  }
  const { criteria } = achievement;
  if (!Number.isInteger(criteria.threshold) || criteria.threshold < 1 || criteria.threshold > 100000) {
    problems.push('threshold');
  }
  if (criteria.kind === 'rule_grants') {
    const rule = rules.find((item) => item.id === criteria.ruleId);
    if (!rule || rule.teamId !== achievement.teamId) problems.push('rule');
  }
  if (achievement.title.trim().length === 0 || achievement.description.trim().length === 0) problems.push('copy');
  return problems;
}

/** Achievements que vale la pena verificar tras un resultado concedido de ese equipo. */
export function achievementsForGrant(
  grant: { teamId: TeamId; ruleId: string },
  achievements: readonly TeamAchievementDefinition[] = TEAM_ACHIEVEMENTS,
  rules: readonly TeamXpRule[] = TEAM_XP_RULES,
): TeamAchievementDefinition[] {
  return achievements.filter((achievement) => {
    if (!achievement.active || achievement.teamId !== grant.teamId) return false;
    if (achievementProblems(achievement, rules).length > 0) return false;
    return achievement.criteria.kind === 'longest_streak' || achievement.criteria.ruleId === grant.ruleId;
  });
}

export type TeamAchievementFacts = {
  ruleGrants: Readonly<Record<string, number>>;
  longestStreak: number;
};

/** Modelo puro del criterio que `award_team_achievement` verifica en SQL. */
export function criteriaMet(criteria: TeamAchievementCriteria, facts: TeamAchievementFacts): boolean {
  if (criteria.kind === 'rule_grants') return (facts.ruleGrants[criteria.ruleId] ?? 0) >= criteria.threshold;
  return facts.longestStreak >= criteria.threshold;
}

/** Args del RPC. El llamador no pasa métricas: el SQL las cuenta. */
export function achievementRpcArgs(
  achievement: TeamAchievementDefinition,
  grant: { userId: string; sourceKey: string },
): Record<string, string | number | null> {
  return {
    p_user_id: grant.userId,
    p_team_id: achievement.teamId,
    p_achievement_key: achievement.key,
    p_achievement_version: achievement.version,
    p_criteria_kind: achievement.criteria.kind,
    p_criteria_rule_id: achievement.criteria.kind === 'rule_grants' ? achievement.criteria.ruleId : null,
    p_threshold: achievement.criteria.threshold,
    p_xp: achievement.xpReward,
    p_source_key: grant.sourceKey,
  };
}
