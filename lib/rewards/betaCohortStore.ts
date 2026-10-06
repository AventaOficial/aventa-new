import type { SupabaseClient } from '@supabase/supabase-js';
import {
  activeRewardsRule,
  nextBetaStatus,
  type RewardsBetaAction,
  type RewardsBetaMembership,
  type RewardsBetaStatus,
} from '@/lib/rewards/betaCohort';

const TABLE = 'rewards_beta_memberships';

function missingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? '';
  return error.code === 'PGRST205' || error.code === '42P01' || /rewards_beta_memberships/i.test(message);
}

function toMembership(row: {
  user_id: string;
  status: string;
  rule_version: string;
  reason: string;
  created_at: string;
}): RewardsBetaMembership | null {
  const status = row.status;
  if (status !== 'invited' && status !== 'enrolled' && status !== 'suspended' && status !== 'removed') return null;
  return {
    userId: row.user_id,
    status,
    ruleVersion: row.rule_version,
    reason: row.reason,
    at: row.created_at,
  };
}

/** Última fila. No se borra historia. Si la tabla no existe, la persona no está en la cohorte. */
export async function latestBetaMembership(
  supabase: SupabaseClient,
  userId: string,
): Promise<RewardsBetaMembership | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('user_id, status, rule_version, reason, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (!missingTable(error)) console.error('[rewards/beta] read', error.message);
    return null;
  }
  if (!data) return null;
  return toMembership(data as {
    user_id: string;
    status: string;
    rule_version: string;
    reason: string;
    created_at: string;
  });
}

export async function appendBetaMembership(
  supabase: SupabaseClient,
  input: {
    userId: string;
    action: RewardsBetaAction;
    reason: string;
    actedBy: string | null;
  },
): Promise<{ ok: true; membership: RewardsBetaMembership; unchanged: boolean } | { ok: false; error: string }> {
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: 'Falta el motivo.' };
  const current = await latestBetaMembership(supabase, input.userId);
  const next = nextBetaStatus(current?.status ?? null, input.action);
  if (!next) return { ok: false, error: 'Ese cambio no aplica al estado actual.' };
  if (current && current.status === next && input.action === 'enroll') {
    return { ok: true, membership: current, unchanged: true };
  }
  const ruleVersion = current?.ruleVersion && next !== 'invited' ? current.ruleVersion : activeRewardsRule().version;
  const row = {
    user_id: input.userId,
    status: next satisfies RewardsBetaStatus,
    rule_version: next === 'enrolled' ? activeRewardsRule().version : ruleVersion,
    reason,
    acted_by: input.actedBy,
  };
  const { data, error } = await supabase.from(TABLE).insert(row).select('user_id, status, rule_version, reason, created_at').single();
  if (error || !data) {
    if (missingTable(error)) return { ok: false, error: 'Falta aplicar la migración de la cohorte beta.' };
    return { ok: false, error: 'No se pudo guardar la cohorte.' };
  }
  const membership = toMembership(data as {
    user_id: string;
    status: string;
    rule_version: string;
    reason: string;
    created_at: string;
  });
  if (!membership) return { ok: false, error: 'La fila guardada no es válida.' };
  return { ok: true, membership, unchanged: false };
}
