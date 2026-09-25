/**
 * M1 Settlement Bridge — types & event vocabulary.
 * Settlement lifecycle is separate from commission status (no COMMISSION_SETTLED).
 */

export const SETTLEMENT_EVENT_TYPES = [
  'settlement_requested',
  'settlement_eligible',
  'settlement_created',
  'settlement_reused',
  'settlement_rejected',
  'settlement_failed',
  /** Compensating ledger entry created (or reused). */
  'settlement_reversed',
  'settlement_reversal_reused',
  'settlement_reversal_blocked',
  /** @deprecated kept for historical audit rows; new path uses settlement_reversed */
  'settlement_reversal_required',
] as const;

export type SettlementEventType = (typeof SETTLEMENT_EVENT_TYPES)[number];

export const SETTLEMENT_REJECT_REASONS = [
  'settlement_disabled',
  'money_path_frozen',
  'commission_not_found',
  'commission_malformed',
  'commission_not_approved',
  'commission_reversed',
  'conversion_not_found',
  'currency_mismatch',
  'invalid_amount',
  'invalid_allocation',
  'ledger_write_failed',
  'link_failed',
] as const;

export type SettlementRejectReason = (typeof SETTLEMENT_REJECT_REASONS)[number];

export type SettlementAllocation = {
  grossCommissionCents: number;
  creatorAllocationCents: number;
  platformAllocationCents: number;
  creatorShareBps: number;
  currency: string;
  /** M1 always false — no withdrawable balance. */
  withdrawable: false;
  /** M1 always false — ledger booked ≠ user settled payout. */
  settled: false;
};

export type SettlementBridgeResult = {
  ok: boolean;
  event: SettlementEventType;
  reason?: SettlementRejectReason | string;
  commissionId: string;
  conversionId: string | null;
  ledgerEntryId: string | null;
  externalRef: string | null;
  network: string | null;
  allocation: SettlementAllocation | null;
  reused: boolean;
  /** Explicit future hook — M1 never calls this. */
  rewardBoundary: 'future_createRewardFromLedgerEntry';
  createdCreatorReward: false;
  createdPayout: false;
};

export const SETTLEMENT_EXTERNAL_REF_PREFIX = 'settlement:commission:' as const;

/** Compensating reversal — net ledger movement to zero. */
export type SettlementReversalContract = {
  kind: 'settlement_reversal_executed';
  commissionId: string;
  ledgerEntryId: string;
  externalRef: string;
  reversalExternalRef: string;
  reversedAt: string;
  moneyMovement: 'compensating_ledger_entry';
  compensatingLedgerEntryId: string | null;
  amountCents: number | null;
  note: 'commission_reversed_with_compensating_ledger_entry';
};

export type SettlementReversalResult = {
  ok: boolean;
  reason:
    | 'money_path_frozen'
    | 'original_ledger_not_found'
    | 'invalid_original_amount'
    | 'ledger_write_failed'
    | 'audit_append_failed'
    | null;
  contract: SettlementReversalContract;
  reused: boolean;
  compensatingLedgerEntryId: string | null;
};
