import type { TeamId } from '../../roles/teams';

/**
 * Team Achievement: reconocimiento por equipo, separado de los logros de comunidad
 * (`lib/achievements`, `profiles.achievement_xp`). Se concede una sola vez por
 * (user_id, team_id, key); la versión documenta el criterio vigente al concederse.
 */
export type TeamAchievementCriteria =
  | { kind: 'rule_grants'; ruleId: string; threshold: number }
  | { kind: 'longest_streak'; threshold: number };

export type TeamAchievementDefinition = {
  key: string;
  teamId: TeamId;
  version: number;
  title: string;
  description: string;
  criteria: TeamAchievementCriteria;
  xpReward: number;
  active: boolean;
};

export type TeamAchievementAward = {
  key: string;
  version: number;
  xp: number;
  awardedAt: string;
};

export type AchievementAwardStatus = 'awarded' | 'duplicate' | 'not_met' | 'skipped';
