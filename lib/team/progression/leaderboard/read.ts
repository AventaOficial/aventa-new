import { createServerClient } from '@/lib/supabase/server';
import type { TeamMembership } from '../../roles/membership';
import type { TeamLeaderboard, TeamLeaderboardEntry, TeamLeaderboardPeriod, TeamLeaderboardSelf } from './types';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

export function readLeaderboardRows(data: unknown, selfUserId: string): TeamLeaderboardEntry[] {
  if (!Array.isArray(data)) return [];
  const entries: TeamLeaderboardEntry[] = [];
  for (const row of data) {
    if (!isRecord(row)) continue;
    const position = readInt(row.rank_position);
    const teamXp = readInt(row.xp);
    const memberId = typeof row.member_id === 'string' ? row.member_id : null;
    if (position === null || teamXp === null || !memberId) continue;
    const name = typeof row.display_name === 'string' && row.display_name.trim() ? row.display_name.trim() : 'Miembro del equipo';
    entries.push({ position, displayName: name, teamXp, isSelf: memberId === selfUserId });
  }
  return entries;
}

export function readLeaderboardSelf(data: unknown): TeamLeaderboardSelf | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!isRecord(row)) return null;
  const teamXp = readInt(row.xp);
  const rankedMembers = readInt(row.ranked_members);
  if (teamXp === null || rankedMembers === null) return null;
  return { position: readInt(row.rank_position), teamXp, rankedMembers };
}

/**
 * Equipo y usuario salen de la membresía ACTIVE ya resuelta por el gate.
 * Dos consultas acotadas: top N y la posición propia. Nunca el ranking completo.
 */
export async function loadTeamLeaderboard(
  membership: TeamMembership,
  period: TeamLeaderboardPeriod,
  limit = DEFAULT_LIMIT,
): Promise<TeamLeaderboard | null> {
  if (membership.status !== 'ACTIVE') return null;
  const capped = Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
  try {
    const supabase = createServerClient();
    const [top, self] = await Promise.all([
      supabase.rpc('team_leaderboard', { p_team_id: membership.teamId, p_period: period, p_limit: capped }),
      supabase.rpc('team_leaderboard_position', {
        p_team_id: membership.teamId,
        p_period: period,
        p_user_id: membership.userId,
      }),
    ]);
    if (top.error || self.error) return null;
    return {
      metric: 'team_xp',
      period,
      top: readLeaderboardRows(top.data, membership.userId),
      self: readLeaderboardSelf(self.data),
    };
  } catch {
    return null;
  }
}
