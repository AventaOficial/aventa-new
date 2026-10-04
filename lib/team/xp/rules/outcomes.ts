import type { TeamMembership } from '../../roles/membership';
import type { TeamId } from '../../roles/teams';
import type { TeamXpRuleDecision } from './types';

/** Modelo de `team_ops.apply_team_xp_rule`. La base es la autoridad; esto fija el contrato. */
export type RuleOutcome = {
  idempotencyKey: string;
  ruleId: string;
  ruleVersion: number;
  teamId: TeamId;
  userId: string;
  actorId: string;
  eventRef: string;
  status: 'granted' | 'skipped';
  reason: string | null;
  amount: number;
  day: string;
};

export type RuleLedgerState = {
  outcomes: readonly RuleOutcome[];
  balances: Readonly<Record<string, number>>;
};

export const EMPTY_RULE_LEDGER: RuleLedgerState = { outcomes: [], balances: {} };

export function ruleBalance(state: RuleLedgerState, userId: string, teamId: TeamId): number {
  return state.balances[`${userId}:${teamId}`] ?? 0;
}

export function commitRuleDecision(
  state: RuleLedgerState,
  decision: TeamXpRuleDecision,
  recipientMemberships: readonly TeamMembership[],
  day: string,
): { state: RuleLedgerState; status: 'granted' | 'skipped' | 'duplicate'; reason: string | null } {
  const existing = state.outcomes.find((item) => item.idempotencyKey === decision.idempotencyKey);
  if (existing) return { state, status: 'duplicate', reason: existing.reason };

  const { rule } = decision;
  let reason: string | null = decision.skipReason;
  if (!reason) {
    const active = recipientMemberships.some(
      (item) => item.userId === decision.recipientUserId && item.teamId === rule.teamId && item.status === 'ACTIVE',
    );
    if (!active) reason = 'recipient_not_active';
  }
  if (!reason) {
    const grantedToday = state.outcomes.filter(
      (item) =>
        item.status === 'granted' &&
        item.userId === decision.recipientUserId &&
        item.teamId === rule.teamId &&
        item.ruleId === rule.id &&
        item.day === day,
    ).length;
    if (grantedToday >= rule.dailyCap) reason = 'daily_cap';
  }

  const status = reason ? 'skipped' : 'granted';
  const amount = status === 'granted' ? rule.amount : 0;
  const key = `${decision.recipientUserId}:${rule.teamId}`;
  const outcome: RuleOutcome = {
    idempotencyKey: decision.idempotencyKey,
    ruleId: rule.id,
    ruleVersion: rule.version,
    teamId: rule.teamId,
    userId: decision.recipientUserId,
    actorId: decision.actorUserId,
    eventRef: decision.eventRef,
    status,
    reason,
    amount,
    day,
  };
  return {
    status,
    reason,
    state: {
      outcomes: [...state.outcomes, outcome],
      balances: amount > 0 ? { ...state.balances, [key]: (state.balances[key] ?? 0) + amount } : state.balances,
    },
  };
}
