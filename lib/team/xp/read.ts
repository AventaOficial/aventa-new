import { createServerClient } from '@/lib/supabase/server';
import type { TeamMembership } from '../roles/membership';
import { isTeamId, type TeamId } from '../roles/teams';

export type TeamXpHistoryEntry = {
  id: string;
  teamId: TeamId;
  amount: number;
  source: string;
  idempotencyKey: string;
  actorId: string;
  createdAt: string;
};

function readBalance(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Lectura del acumulado. No suma el ledger. */
export async function getTeamXP(userId: string, teamId: TeamId): Promise<number | null> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('team_xp_balances')
      .select('balance')
      .eq('user_id', userId)
      .eq('team_id', teamId)
      .maybeSingle();
    if (error) return null;
    if (!data || typeof data !== 'object' || !('balance' in data)) return 0;
    return readBalance(data.balance);
  } catch {
    return null;
  }
}

/** El id sale de las membresías ya resueltas. La página no recibe un id suelto. */
export async function loadVisibleTeamXp(
  memberships: readonly TeamMembership[],
): Promise<Partial<Record<TeamId, number>> | null> {
  const userId = memberships[0]?.userId;
  if (!userId) return null;
  return getTeamXPBreakdown(userId);
}

/** Una sola consulta para todas las membresías del usuario. */
export async function getTeamXPBreakdown(userId: string): Promise<Partial<Record<TeamId, number>> | null> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.from('team_xp_balances').select('team_id, balance').eq('user_id', userId);
    if (error) return null;
    const balances: Partial<Record<TeamId, number>> = {};
    for (const row of data ?? []) {
      if (!row || typeof row !== 'object') continue;
      const teamId = 'team_id' in row ? row.team_id : null;
      const balance = readBalance('balance' in row ? row.balance : null);
      if (typeof teamId !== 'string' || !isTeamId(teamId) || balance === null) continue;
      balances[teamId] = balance;
    }
    return balances;
  } catch {
    return null;
  }
}

export async function getTeamXPHistory(
  userId: string,
  teamId: TeamId,
  limit = 20,
): Promise<TeamXpHistoryEntry[] | null> {
  const capped = Math.max(1, Math.min(50, Math.floor(limit)));
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('team_xp_grants')
      .select('id, team_id, amount, source, idempotency_key, actor_id, created_at')
      .eq('user_id', userId)
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(capped);
    if (error) return null;
    const entries: TeamXpHistoryEntry[] = [];
    for (const row of data ?? []) {
      if (!row || typeof row !== 'object') continue;
      const id = 'id' in row && typeof row.id === 'string' ? row.id : null;
      const rowTeam = 'team_id' in row && typeof row.team_id === 'string' ? row.team_id : null;
      const amount = readBalance('amount' in row ? row.amount : null);
      const source = 'source' in row && typeof row.source === 'string' ? row.source : null;
      const idempotencyKey = 'idempotency_key' in row && typeof row.idempotency_key === 'string' ? row.idempotency_key : null;
      const actorId = 'actor_id' in row && typeof row.actor_id === 'string' ? row.actor_id : null;
      const createdAt = 'created_at' in row && typeof row.created_at === 'string' ? row.created_at : null;
      if (!id || !rowTeam || !isTeamId(rowTeam) || amount === null || !source || !idempotencyKey || !actorId || !createdAt) {
        continue;
      }
      entries.push({ id, teamId: rowTeam, amount, source, idempotencyKey, actorId, createdAt });
    }
    return entries;
  } catch {
    return null;
  }
}
