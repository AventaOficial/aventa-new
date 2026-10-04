import { createServerClient } from '@/lib/supabase/server';
import type { TeamMembership } from '../../roles/membership';
import type { TeamId } from '../../roles/teams';
import { evaluateTeamXpEvent } from './engine';
import type { TeamXpDomainEvent, TeamXpRuleDecision } from './types';

export type TeamXpApplyResult = {
  ruleId: string;
  ruleVersion: number;
  teamId: TeamId;
  recipientUserId: string;
  idempotencyKey: string;
  status: 'granted' | 'skipped' | 'duplicate' | 'failed';
  reason: string | null;
  /** Solo en `duplicate`: lo que se decidió la primera vez. */
  previous: 'granted' | 'skipped' | null;
};

type RpcStatus = Pick<TeamXpApplyResult, 'status' | 'reason' | 'previous'>;

function readStatus(data: unknown): RpcStatus {
  if (!data || typeof data !== 'object' || !('status' in data)) {
    return { status: 'failed', reason: 'bad_response', previous: null };
  }
  const status = data.status;
  const reason = 'reason' in data && typeof data.reason === 'string' ? data.reason : null;
  const rawPrevious = 'previous' in data ? data.previous : null;
  const previous = rawPrevious === 'granted' || rawPrevious === 'skipped' ? rawPrevious : null;
  if (status === 'granted' || status === 'skipped') return { status, reason, previous: null };
  if (status === 'duplicate') return { status, reason, previous };
  return { status: 'failed', reason: 'bad_response', previous: null };
}

export async function persistTeamXpDecision(decision: TeamXpRuleDecision): Promise<TeamXpApplyResult> {
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
  const base = {
    ruleId: decision.rule.id,
    ruleVersion: decision.rule.version,
    teamId: decision.rule.teamId,
    recipientUserId: decision.recipientUserId,
    idempotencyKey: decision.idempotencyKey,
  };
  if (error) return { ...base, status: 'failed', reason: 'rpc_error', previous: null };
  return { ...base, ...readStatus(data) };
}

/**
 * Evento de dominio ya persistido → reglas → resultado idempotente.
 * Las membresías son las congeladas con el evento, no las actuales.
 * Un fallo queda para la reconciliación; no se reintenta en caliente.
 */
export async function applyTeamXpEvent(
  event: TeamXpDomainEvent,
  memberships: ReadonlyMap<string, readonly TeamMembership[]>,
): Promise<TeamXpApplyResult[]> {
  if (event.actorKind !== 'human') return [];
  const results: TeamXpApplyResult[] = [];
  for (const decision of evaluateTeamXpEvent(event, memberships)) {
    results.push(await persistTeamXpDecision(decision));
  }
  return results;
}
