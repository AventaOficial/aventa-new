import { windowToday } from '@/lib/owner/mxTime';
import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';
import { createServerClient } from '@/lib/supabase/server';
import type { TeamId } from '../roles/teams';
import type { HeroCount, TeamHeroFacts } from './types';

const DECISION_ACTIONS = ['approved', 'rejected'] as const;

function unavailable(): HeroCount {
  return { origin: 'UNAVAILABLE' };
}

function calculated(count: number): HeroCount {
  return { origin: 'CALCULATED', count };
}

function real(count: number): HeroCount {
  return { origin: 'REAL', count };
}

async function exactCount(
  run: () => PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number | null> {
  try {
    const { count, error } = await run();
    if (error || count === null) return null;
    return count;
  } catch {
    return null;
  }
}

async function moderationFacts(userId: string): Promise<TeamHeroFacts> {
  const supabase = createServerClient();
  const today = windowToday();
  const [pendingCount, decisionCount] = await Promise.all([
    exactCount(() => supabase.from('offers').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    exactCount(() =>
      supabase
        .from('moderation_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('action', [...DECISION_ACTIONS])
        .gte('created_at', today.start)
        .lte('created_at', today.end),
    ),
  ]);
  return {
    teamId: 'moderation',
    facts: {
      pending: pendingCount === null ? unavailable() : real(pendingCount),
      decisionsToday: decisionCount === null ? unavailable() : calculated(decisionCount),
    },
  };
}

async function hunterFacts(userId: string): Promise<TeamHeroFacts> {
  const supabase = createServerClient();
  const today = windowToday();
  const count = await exactCount(() =>
    supabase
      .from('offer_batch_item_events')
      .select('id', { count: 'exact', head: true })
      .eq('actor_id', userId)
      .gte('created_at', today.start)
      .lte('created_at', today.end),
  );
  return {
    teamId: 'hunter',
    facts: { ownBatchEventsToday: count === null ? unavailable() : calculated(count) },
  };
}

function quiet(teamId: 'growth' | 'product' | 'community' | 'operations'): TeamHeroFacts {
  return { teamId, facts: {} };
}

export async function loadTeamHeroFacts(teamId: TeamId, userId: string): Promise<TeamHeroFacts> {
  switch (teamId) {
    case 'moderation':
      return moderationFacts(userId);
    case 'hunter':
      return hunterFacts(userId);
    case 'finance':
      return { teamId: 'finance', facts: { frozen: isMoneyPathFrozen() } };
    case 'growth':
    case 'product':
    case 'community':
    case 'operations':
      return quiet(teamId);
    default: {
      const exhaustive: never = teamId;
      return exhaustive;
    }
  }
}

/** XP de la comunidad de esta cuenta. No es XP de equipo. */
export async function loadCommunityXp(userId: string): Promise<number | null> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.from('profiles').select('achievement_xp').eq('id', userId).maybeSingle();
    if (error || !data || typeof data !== 'object') return null;
    const xp = 'achievement_xp' in data ? data.achievement_xp : null;
    return typeof xp === 'number' && Number.isFinite(xp) ? xp : null;
  } catch {
    return null;
  }
}
