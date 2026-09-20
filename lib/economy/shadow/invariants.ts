/**
 * Money System Foundation — invariant catalog (documentation + pure checks).
 * Does not activate settlement or payouts.
 */

export const MONEY_SYSTEM_PRESENT_INVARIANTS = [
  'click_idempotency: reward_outbound_clicks via buildClickIdempotencyKey',
  'conversion_idempotency: UNIQUE(source, network, external_conversion_id)',
  'commission_external_idempotency: UNIQUE(source, network, external_commission_id)',
  'commission_per_conversion: UNIQUE(conversion_id) — double-credit DB guard',
  'ledger_external_idempotency: UNIQUE(network, external_ref) WHERE external_ref set',
  'reward_per_ledger: UNIQUE(creator_rewards.ledger_entry_id)',
  'attribution_no_invented_click: resolveConversionAttribution never fabricates clicks',
  'anonymous_distinguishable: actorKey u:|ip:|anon — never silent user assign',
  'commission_statuses_distinct: reported≠approved≠settled (settled not a DB status)',
  'settlement_boundary: ECONOMIC_LEDGER_BOUNDARY.settlementEnabled === false',
  'foundation_no_ledger_write: recordCommission forces ledger_entry_id null',
  'settlement_bridge_idempotency: external_ref settlement:commission:{id} + UNIQUE(network,external_ref)',
  'settlement_one_ledger_per_commission: CAS ledger_entry_id + UNIQUE(ledger_entry_id) WHERE set',
  'gross_non_negative: CHECK gross_commission_cents >= 0 + app integer guard',
] as const;

/**
 * Gaps that remain before live money — not blockers for shadow foundation.
 */
export const MONEY_SYSTEM_MISSING_INVARIANTS = [
  'settlement_bridge_runtime_OFF: SETTLEMENT_BRIDGE_ENABLED default false (M1 code present)',
  'ledger→reward auto-bridge owned by processLedgerRewardAttempt/reconcile (settleCommission still never calls createRewardFromLedgerEntry)',
  'no_currency_match CHECK between conversion.currency and commission.currency (app-level)',
  'no_COMMISSION_SETTLED status column (settlement is bridge/events, not commission enum)',
  'no_live_affiliate_network_ingest confirmation authority (adapters not_connected)',
  'settlement_reversal_money_movement deferred (settlement_reversal_required contract only)',
] as const;

export type MoneyCurrencyCheck = {
  ok: boolean;
  reason?: 'missing' | 'mismatch' | 'empty';
};

/** App-level currency consistency (DB does not yet CHECK cross-table). */
export function checkCurrencyMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): MoneyCurrencyCheck {
  const left = (a ?? '').trim().toUpperCase();
  const right = (b ?? '').trim().toUpperCase();
  if (!left || !right) return { ok: false, reason: !left && !right ? 'empty' : 'missing' };
  if (left !== right) return { ok: false, reason: 'mismatch' };
  return { ok: true };
}

export function assertNonNegativeIntegerCents(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  );
}
