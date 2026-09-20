/**
 * M5.6 — Provider confirmation automation (orchestration only).
 * Sole PAID path: applyProviderConfirmation.
 */

export type {
  ConfirmableOutcomeClass,
  ProcessConfirmablePayoutResult,
  ReconcileConfirmableBatchResult,
} from './types';

export {
  classifyConfirmReject,
  isConfirmableIntentStatus,
} from './classify';

export {
  processConfirmablePayoutIntent,
  type ProcessConfirmablePayoutOptions,
} from './processConfirmablePayoutIntent';

export {
  reconcileConfirmablePayouts,
  type ReconcileConfirmablePayoutsOptions,
} from './reconcileConfirmable';
