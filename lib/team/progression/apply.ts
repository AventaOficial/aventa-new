import type { SupabaseClient } from '@supabase/supabase-js';
import type { TeamXpApplyResult } from '../xp/rules/apply';
import { TEAM_ACHIEVEMENTS } from './achievements/catalog';
import { achievementRpcArgs, achievementsForGrant } from './achievements/engine';
import type { TeamAchievementDefinition } from './achievements/types';
import { TEAM_MISSIONS } from './missions/catalog';
import { missionsForGrant } from './missions/engine';
import type { TeamMissionDefinition } from './missions/types';

export type ProgressRpc = (
  name: 'record_team_activity' | 'advance_team_mission' | 'award_team_achievement',
  args: Record<string, string | number | null>,
) => Promise<{ ok: true; data: unknown } | { ok: false; message: string }>;

export type ProgressStore = {
  rpc: ProgressRpc;
  insertReceipt: (sourceKey: string) => Promise<boolean>;
};

export type TeamProgressOutcome =
  | { status: 'not_eligible' }
  | { status: 'applied'; streak: 'recorded' | 'duplicate' | 'stale'; missions: number; achievements: number }
  | { status: 'failed'; step: 'streak' | 'mission' | 'achievement' | 'receipt' };

/** Solo un resultado concedido (ahora o la primera vez) mueve la progresión. */
export function progressEligible(result: Pick<TeamXpApplyResult, 'status' | 'previous'>): boolean {
  return result.status === 'granted' || (result.status === 'duplicate' && result.previous === 'granted');
}

export function supabaseProgressStore(supabase: SupabaseClient): ProgressStore {
  return {
    rpc: async (name, args) => {
      const { data, error } = await supabase.rpc(name, args);
      return error ? { ok: false, message: error.message ?? 'rpc_error' } : { ok: true, data };
    },
    insertReceipt: async (sourceKey) => {
      const { error } = await supabase
        .from('team_xp_progress_receipts')
        .upsert({ source_key: sourceKey }, { onConflict: 'source_key', ignoreDuplicates: true });
      return !error;
    },
  };
}

function streakStatus(data: unknown): 'recorded' | 'duplicate' {
  return data && typeof data === 'object' && 'status' in data && data.status === 'duplicate' ? 'duplicate' : 'recorded';
}

/**
 * Racha → misiones → achievements → recibo. Cada paso es idempotente en SQL;
 * sin recibo, la reconciliación repite todo. Usuario, equipo y regla salen del
 * resultado persistido, nunca de una petición.
 */
export async function applyTeamProgress(
  store: ProgressStore,
  result: TeamXpApplyResult,
  occurredAt: string,
  catalogs: {
    missions: readonly TeamMissionDefinition[];
    achievements: readonly TeamAchievementDefinition[];
  } = { missions: TEAM_MISSIONS, achievements: TEAM_ACHIEVEMENTS },
): Promise<TeamProgressOutcome> {
  if (!progressEligible(result)) return { status: 'not_eligible' };
  const grant = { teamId: result.teamId, ruleId: result.ruleId, occurredAt };
  const sourceKey = result.idempotencyKey;

  const streakCall = await store.rpc('record_team_activity', {
    p_user_id: result.recipientUserId,
    p_team_id: result.teamId,
    p_source_key: sourceKey,
    p_occurred_at: occurredAt,
  });
  let streak: 'recorded' | 'duplicate' | 'stale';
  if (streakCall.ok) streak = streakStatus(streakCall.data);
  else if (streakCall.message.includes('stale_event')) streak = 'stale';
  else return { status: 'failed', step: 'streak' };

  const missionSteps = missionsForGrant(grant, catalogs.missions);
  for (const step of missionSteps) {
    const call = await store.rpc('advance_team_mission', {
      p_user_id: result.recipientUserId,
      p_team_id: step.mission.teamId,
      p_mission_id: step.mission.id,
      p_mission_version: step.mission.version,
      p_period_key: step.periodKey,
      p_source_key: sourceKey,
      p_target: step.mission.target,
      p_xp: step.mission.xpReward,
    });
    if (!call.ok) return { status: 'failed', step: 'mission' };
  }

  const achievements = achievementsForGrant(grant, catalogs.achievements);
  for (const achievement of achievements) {
    const call = await store.rpc(
      'award_team_achievement',
      achievementRpcArgs(achievement, { userId: result.recipientUserId, sourceKey }),
    );
    if (!call.ok) return { status: 'failed', step: 'achievement' };
  }

  if (!(await store.insertReceipt(sourceKey))) return { status: 'failed', step: 'receipt' };
  return { status: 'applied', streak, missions: missionSteps.length, achievements: achievements.length };
}
