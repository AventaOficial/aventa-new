/**
 * M4.1 — Payout intent types.
 * creator_rewards = economic authority; payout_intents = claim/intent authority.
 * Legacy reward_payouts / execute_reward_payout are NOT this flow.
 */

export const PAYOUT_INTENT_STATUSES = [
  'RESERVED',
  'SUBMITTED',
  'SUCCEEDED',
  'FAILED',
  'UNKNOWN',
  'CANCELLED',
] as const;

export type PayoutIntentStatus = (typeof PAYOUT_INTENT_STATUSES)[number];

export const PAYOUT_INTENT_PROVIDER_STUB = 'stub' as const;

export type PayoutIntentProviderId = typeof PAYOUT_INTENT_PROVIDER_STUB | string;

export type PayoutIntentRow = {
  id: string;
  reward_id: string;
  creator_id: string;
  amount_cents: number;
  currency: string;
  status: PayoutIntentStatus;
  idempotency_key: string;
  provider: string;
  meta: Record<string, unknown>;
  reserved_at: string;
  submitted_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreatorRewardPayoutSnapshot = {
  id: string;
  creator_id: string;
  creator_share_cents: number;
  currency: string;
  status: string;
  ledger_entry_id: string;
  payout_id: string | null;
};

export type PayoutIntentRejectReason =
  | 'reward_not_found'
  | 'reward_not_available'
  | 'reward_terminal'
  | 'zero_amount'
  | 'currency_unsupported'
  | 'below_minimum_available'
  | 'amount_mismatch'
  | 'currency_mismatch'
  | 'creator_mismatch'
  | 'intent_not_found'
  | 'invalid_transition'
  | 'already_resolved'
  | 'schema_missing'
  | 'insert_failed'
  | 'update_failed'
  | 'mark_paid_failed'
  | 'money_path_frozen'
  | 'legacy_payout_forbidden'
  | 'evidence_missing'
  | 'provider_reference_mismatch'
  | 'idempotency_key_mismatch'
  | 'reward_mismatch'
  | 'provider_mismatch'
  | 'confirmation_not_allowed';

export type PayoutProviderSubmitResult =
  | { outcome: 'success'; externalRef?: string | null }
  | { outcome: 'failure'; reason?: string | null }
  | { outcome: 'timeout'; reason?: string | null }
  /** Submitted to provider / SPEI initiated — do NOT assume completed. */
  | { outcome: 'initiated'; externalRef?: string | null };

export type PayoutProviderReconcileResult =
  | { outcome: 'success'; externalRef?: string | null }
  | { outcome: 'failure'; reason?: string | null }
  | { outcome: 'unknown'; reason?: string | null };

export type PayoutProvider = {
  id: PayoutIntentProviderId;
  submit(intent: PayoutIntentRow): Promise<PayoutProviderSubmitResult>;
  reconcile(intent: PayoutIntentRow): Promise<PayoutProviderReconcileResult>;
};
