/**
 * M5.5 — RESERVED → provider submit automation boundary.
 * Stops before PAID. Confirmation remains applyProviderConfirmation authority.
 */

export type ReservedSubmitOutcomeClass =
  | 'submitted'
  | 'reused'
  | 'unknown'
  | 'failed'
  | 'deferred'
  | 'rejected';

export type ProcessReservedPayoutSubmitResult = {
  intentId: string;
  rewardId: string | null;
  outcome: ReservedSubmitOutcomeClass;
  reason: string;
  intentStatus: string | null;
  idempotencyKey: string | null;
  providerId: string | null;
  reused: boolean;
  /** True when this call invoked provider.submit (CAS winner). */
  providerSubmitInvoked: boolean;
  terminal: boolean;
  paid: boolean;
};

export type UnknownReconcileOutcomeClass =
  | 'reconciled_failed'
  | 'still_unknown'
  | 'reused'
  | 'deferred'
  | 'rejected'
  /** Evidence-only peek — never applies PAID in M5.5 automation default. */
  | 'evidence_observed';

export type ProcessUnknownPayoutReconcileResult = {
  intentId: string;
  rewardId: string | null;
  outcome: UnknownReconcileOutcomeClass;
  reason: string;
  intentStatus: string | null;
  idempotencyKey: string | null;
  providerId: string | null;
  reused: boolean;
  paid: boolean;
  /** When true, confirmation would be next — M5.5 does not auto-apply success. */
  confirmationPending: boolean;
};

export type ReconcileReservedPayoutSubmitBatchResult = {
  scanned: number;
  attempted: number;
  submitted: number;
  reused: number;
  unknown: number;
  failed: number;
  deferred: number;
  rejected: number;
  results: ProcessReservedPayoutSubmitResult[];
};

export type ReconcileUnknownPayoutBatchResult = {
  scanned: number;
  attempted: number;
  stillUnknown: number;
  reconciledFailed: number;
  reused: number;
  deferred: number;
  rejected: number;
  results: ProcessUnknownPayoutReconcileResult[];
};
