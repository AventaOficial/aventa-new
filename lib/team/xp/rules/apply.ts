import { createServerClient } from '@/lib/supabase/server';
import { loadActiveMemberships } from '../../gate/memberships';
import type { TeamMembership } from '../../roles/membership';
import { evaluateTeamXpEvent } from './engine';
import type { TeamXpDomainEvent, TeamXpRuleDecision } from './types';

export type TeamXpApplyResult = {
  ruleId: string;
  ruleVersion: number;
  status: 'granted' | 'skipped' | 'duplicate' | 'failed';
  reason: string | null;
};

function readStatus(data: unknown): Pick<TeamXpApplyResult, 'status' | 'reason'> {
  if (!data || typeof data !== 'object' || !('status' in data)) return { status: 'failed', reason: 'bad_response' };
  const status = data.status;
  const reason = 'reason' in data && typeof data.reason === 'string' ? data.reason : null;
  if (status === 'granted' || status === 'skipped' || status === 'duplicate') return { status, reason };
  return { status: 'failed', reason: 'bad_response' };
}

async function persist(decision: TeamXpRuleDecision): Promise<TeamXpApplyResult> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc('apply_team_xp_rule', {
    p_actor_id: decision.actorUserId,
    p_user_id: decision.recipientUserId,
    p_team_id: decision.rule.teamId,
    p_rule_id: decision.rule.id,
    p_rule_version: decision.rule.version,
    p_event_type: decision.rule.eventType,
    p_event_ref: decision.eventRef,
    p_idempotency_key: decision.idempotencyKey,
    p_amount: decision.rule.amount,
    p_daily_cap: decision.rule.dailyCap,
    p_skip_reason: decision.skipReason,
  });
  const base = { ruleId: decision.rule.id, ruleVersion: decision.rule.version };
  if (error) return { ...base, status: 'failed', reason: 'rpc_error' };
  return { ...base, ...readStatus(data) };
}

/**
 * Evento de dominio ya persistido → reglas → resultado idempotente.
 * Un fallo queda para la reconciliación; no se reintenta en caliente.
 */
export async function applyTeamXpEvent(event: TeamXpDomainEvent): Promise<TeamXpApplyResult[]> {
  if (event.actorKind !== 'human') return [];
  const recipients = new Set<string>([event.actorUserId]);
  if (event.batchItem) recipients.add(event.batchItem.submittedBy);

  const memberships = new Map<string, readonly TeamMembership[]>();
  for (const userId of recipients) {
    const loaded = await loadActiveMemberships(userId);
    if (!loaded.ok) return [];
    memberships.set(userId, loaded.memberships);
  }

  const decisions = evaluateTeamXpEvent(event, memberships);
  const results: TeamXpApplyResult[] = [];
  for (const decision of decisions) {
    results.push(await persist(decision));
  }
  return results;
}
