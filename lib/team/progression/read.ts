import { createServerClient } from '@/lib/supabase/server';
import type { TeamMembership } from '../roles/membership';
import { getTeamXP } from '../xp/read';
import { rulesForTeam } from '../xp/rules/catalog';
import { TEAM_ACHIEVEMENTS } from './achievements/catalog';
import { getTeamLevel, type TeamLevel } from './levels';
import { loadTeamLeaderboard } from './leaderboard/read';
import type { TeamLeaderboard, TeamLeaderboardPeriod } from './leaderboard/types';
import { activeMissionsForTeam, missionPeriodKey } from './missions/engine';
import { recognitionLine } from './present';
import { visibleStreak } from './streaks';
import { teamDay } from './time';

export type TeamProgressView = {
  teamXp: number | null;
  level: TeamLevel | null;
  streak: { current: number; longest: number } | null;
  recognition: string[];
  missions: { id: string; title: string; description: string; progress: number; target: number; completed: boolean }[];
  achievements: { key: string; title: string; awardedAt: string }[];
  leaderboard: TeamLeaderboard | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

async function loadStreak(membership: TeamMembership, today: string): Promise<TeamProgressView['streak']> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('team_streaks')
    .select('current_streak, longest_streak, last_activity_date')
    .eq('user_id', membership.userId)
    .eq('team_id', membership.teamId)
    .maybeSingle();
  if (error) return null;
  if (!isRecord(data)) return { current: 0, longest: 0 };
  const current = readInt(data.current_streak);
  const longest = readInt(data.longest_streak);
  const last = typeof data.last_activity_date === 'string' ? data.last_activity_date : null;
  if (current === null || longest === null || !last) return null;
  return {
    current: visibleStreak({ currentStreak: current, longestStreak: longest, lastActivityDate: last }, today),
    longest,
  };
}

/** Una consulta `count` por regla del equipo (índice team_xp_grants_rule_day_idx). */
async function loadRecognition(membership: TeamMembership): Promise<string[]> {
  const supabase = createServerClient();
  const rules = rulesForTeam(membership.teamId);
  const counts = await Promise.all(
    rules.map(async (rule) => {
      const { count, error } = await supabase
        .from('team_xp_grants')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', membership.userId)
        .eq('team_id', membership.teamId)
        .eq('rule_id', rule.id)
        .eq('origin', 'rule');
      return error || count === null ? null : recognitionLine(rule.id, count);
    }),
  );
  return counts.filter((line): line is string => line !== null);
}

async function loadMissions(membership: TeamMembership, now: Date): Promise<TeamProgressView['missions']> {
  const missions = activeMissionsForTeam(membership.teamId, now);
  if (missions.length === 0) return [];
  const supabase = createServerClient();
  const iso = now.toISOString();
  const { data, error } = await supabase
    .from('team_mission_progress')
    .select('mission_id, mission_version, period_key, progress, completed_at')
    .eq('user_id', membership.userId)
    .eq('team_id', membership.teamId)
    .in('mission_id', missions.map((mission) => mission.id));
  if (error) return [];
  const rows = (data ?? []).filter(isRecord);
  return missions.map((mission) => {
    const periodKey = missionPeriodKey(mission.period, iso);
    const row = rows.find(
      (item) => item.mission_id === mission.id && item.mission_version === mission.version && item.period_key === periodKey,
    );
    const progress = row ? (readInt(row.progress) ?? 0) : 0;
    return {
      id: mission.id,
      title: mission.title,
      description: mission.description,
      progress,
      target: mission.target,
      completed: Boolean(row && row.completed_at),
    };
  });
}

async function loadAchievements(membership: TeamMembership): Promise<TeamProgressView['achievements']> {
  const known = TEAM_ACHIEVEMENTS.filter((achievement) => achievement.teamId === membership.teamId);
  if (known.length === 0) return [];
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('team_achievement_awards')
    .select('achievement_key, awarded_at')
    .eq('user_id', membership.userId)
    .eq('team_id', membership.teamId)
    .order('awarded_at', { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []).flatMap((row) => {
    if (!isRecord(row) || typeof row.achievement_key !== 'string' || typeof row.awarded_at !== 'string') return [];
    const definition = known.find((achievement) => achievement.key === row.achievement_key);
    return definition ? [{ key: definition.key, title: definition.title, awardedAt: row.awarded_at }] : [];
  });
}

async function settle<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

/**
 * Progreso del usuario de la sesión en su equipo. Usuario y equipo salen de la
 * membresía ACTIVE resuelta por el gate. Lecturas acotadas en paralelo; sin N+1.
 */
export async function loadTeamProgress(
  membership: TeamMembership,
  period: TeamLeaderboardPeriod = 'weekly',
  now = new Date(),
): Promise<TeamProgressView | null> {
  if (membership.status !== 'ACTIVE') return null;
  const today = teamDay(now.toISOString());
  if (!today) return null;
  const [teamXp, streak, recognition, missions, achievements, leaderboard] = await Promise.all([
    getTeamXP(membership.userId, membership.teamId),
    settle(() => loadStreak(membership, today), null),
    settle(() => loadRecognition(membership), []),
    settle(() => loadMissions(membership, now), []),
    settle(() => loadAchievements(membership), []),
    loadTeamLeaderboard(membership, period),
  ]);
  return {
    teamXp,
    level: teamXp === null ? null : getTeamLevel(membership.teamId, teamXp),
    streak,
    recognition,
    missions,
    achievements,
    leaderboard,
  };
}
