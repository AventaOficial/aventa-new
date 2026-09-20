/**
 * M5.4 — AVAILABLE → payout_intent automation (architecture boundary).
 * reservePayoutIntent remains the sole claim authority.
 */

export type {
  AvailablePayoutIntentOutcomeClass,
  ProcessAvailablePayoutIntentResult,
  ReconcileAvailablePayoutIntentResult,
} from './types';
export { classifyReserveReject, isTerminalReserveReason } from './classify';
export { processAvailableRewardPayoutIntent } from './processAvailableRewardPayoutIntent';
export {
  reconcileAvailablePayoutIntents,
  type ReconcileAvailablePayoutIntentOptions,
} from './reconcile';
