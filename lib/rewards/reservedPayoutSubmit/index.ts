/**
 * M5.5 — RESERVED → provider submit automation (architecture boundary).
 * Stops before PAID. Confirmation = applyProviderConfirmation only.
 */

export type {
  ReservedSubmitOutcomeClass,
  ProcessReservedPayoutSubmitResult,
  UnknownReconcileOutcomeClass,
  ProcessUnknownPayoutReconcileResult,
  ReconcileReservedPayoutSubmitBatchResult,
  ReconcileUnknownPayoutBatchResult,
} from './types';

export { classifySubmitReject } from './classify';
export {
  processReservedPayoutSubmit,
  type ProcessReservedPayoutSubmitOptions,
} from './processReservedPayoutSubmit';
export {
  processUnknownPayoutReconcile,
  type ProcessUnknownPayoutReconcileOptions,
} from './processUnknownPayoutReconcile';
export {
  reconcileReservedPayoutSubmits,
  type ReconcileReservedPayoutSubmitOptions,
} from './reconcileReserved';
export {
  reconcileUnknownPayoutIntents,
  type ReconcileUnknownPayoutBatchOptions,
} from './reconcileUnknown';
