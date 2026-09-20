/**
 * M5.6 — Automated provider confirmation (orchestration only).
 * Economic authority remains applyProviderConfirmation / confirmPayoutIntentSuccess.
 */

export type ConfirmableOutcomeClass =
  | 'paid'
  | 'failed'
  | 'still_unknown'
  | 'still_submitted'
  | 'reused'
  | 'deferred'
  | 'rejected'
  | 'invalid_evidence';

export type ProcessConfirmablePayoutResult = {
  intentId: string;
  rewardId: string | null;
  outcome: ConfirmableOutcomeClass;
  reason: string;
  intentStatus: string | null;
  rewardStatus: string | null;
  idempotencyKey: string | null;
  providerId: string | null;
  providerReference: string | null;
  reused: boolean;
  paid: boolean;
  source: 'reconcile' | 'webhook' | 'admin' | 'automation';
};

export type ReconcileConfirmableBatchResult = {
  scanned: number;
  attempted: number;
  paid: number;
  failed: number;
  stillUnknown: number;
  stillSubmitted: number;
  reused: number;
  deferred: number;
  rejected: number;
  results: ProcessConfirmablePayoutResult[];
};
