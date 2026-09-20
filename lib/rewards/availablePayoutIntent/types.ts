/**
 * M5.4 — AVAILABLE → payout_intent boundary (automation only).
 * Canonical claim: reservePayoutIntent. Never submit / provider / PAID.
 */

export type AvailablePayoutIntentOutcomeClass =
  | 'reserved'
  | 'reused'
  | 'deferred'
  | 'rejected';

export type ProcessAvailablePayoutIntentResult = {
  rewardId: string;
  outcome: AvailablePayoutIntentOutcomeClass;
  reason: string;
  intentId: string | null;
  intentStatus: string | null;
  idempotencyKey: string | null;
  reused: boolean;
  terminal: boolean;
};

export type ReconcileAvailablePayoutIntentResult = {
  scanned: number;
  attempted: number;
  reserved: number;
  reused: number;
  deferred: number;
  rejected: number;
  skipped: number;
  results: ProcessAvailablePayoutIntentResult[];
};
