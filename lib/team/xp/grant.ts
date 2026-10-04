import { createServerClient } from '@/lib/supabase/server';
import { loadActiveMemberships } from '../gate/memberships';
import { isTeamId, type TeamId } from '../roles/teams';
import type { MembershipStatus } from '../roles/membership';
import { decideTeamXpGrant, type TeamXpKind } from './policy';

export type GrantTeamXpResult =
  | { ok: true; applied: boolean; balance: number }
  | { ok: false; reason: string };

async function recipientStatus(userId: string, teamId: TeamId): Promise<MembershipStatus | 'none'> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('team_memberships')
    .select('status')
    .eq('user_id', userId)
    .eq('team_id', teamId);
  if (error || !data) return 'none';
  const statuses = data.flatMap((row) => {
    if (!row || typeof row !== 'object' || !('status' in row) || typeof row.status !== 'string') return [];
    return [row.status];
  });
  if (statuses.includes('ACTIVE')) return 'ACTIVE';
  if (statuses.includes('SUSPENDED')) return 'SUSPENDED';
  if (statuses.includes('REMOVED')) return 'REMOVED';
  return 'none';
}

function readRpc(data: unknown): { applied: boolean; balance: number } | null {
  if (!data || typeof data !== 'object') return null;
  const applied = 'applied' in data ? data.applied : null;
  const balance = 'balance' in data ? data.balance : null;
  if (typeof applied !== 'boolean') return null;
  if (typeof balance !== 'number' || !Number.isFinite(balance)) return null;
  return { applied, balance };
}

/**
 * Concede Team XP. La identidad y el equipo los resuelve el servidor
 * antes de llamar. No hay ruta que acepte amount, userId o teamId del cliente.
 */
export async function grantTeamXP(input: {
  actorUserId: string;
  recipientUserId: string;
  teamId: TeamId;
  amount: number;
  source: string;
  idempotencyKey: string;
  kind: TeamXpKind;
  compensatesKey?: string | null;
}): Promise<GrantTeamXpResult> {
  if (!isTeamId(input.teamId)) return { ok: false, reason: 'invalid_team' };
  const loaded = await loadActiveMemberships(input.actorUserId);
  if (!loaded.ok) return { ok: false, reason: 'schema_unavailable' };
  const status = await recipientStatus(input.recipientUserId, input.teamId);
  const decision = decideTeamXpGrant({
    actorUserId: input.actorUserId,
    actorMemberships: loaded.memberships,
    recipientUserId: input.recipientUserId,
    recipientStatus: status,
    teamId: input.teamId,
    amount: input.amount,
    source: input.source,
    idempotencyKey: input.idempotencyKey,
    kind: input.kind,
    compensatesKey: input.compensatesKey,
  });
  if (!decision.ok) return decision;

  const supabase = createServerClient();
  const { data, error } = await supabase.rpc('grant_team_xp', {
    p_actor_id: decision.grant.actorUserId,
    p_user_id: decision.grant.recipientUserId,
    p_team_id: decision.grant.teamId,
    p_amount: decision.grant.amount,
    p_source: decision.grant.source,
    p_idempotency_key: decision.grant.idempotencyKey,
    p_metadata: decision.grant.compensatesKey ? { compensates_key: decision.grant.compensatesKey } : {},
  });
  if (error) return { ok: false, reason: 'grant_failed' };
  const parsed = readRpc(data);
  if (!parsed) return { ok: false, reason: 'grant_failed' };
  return { ok: true, applied: parsed.applied, balance: parsed.balance };
}
