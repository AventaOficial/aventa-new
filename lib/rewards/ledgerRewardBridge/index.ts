/**
 * M5.1 — Ledger → Reward bridge (architecture D).
 * Settlement never calls createReward. Processor + reconcile only.
 */

export {
  LEDGER_REWARD_BRIDGE_META_KEY,
  LEDGER_REWARD_BRIDGE_VERSION,
  type LedgerRewardOutcomeClass,
  type LedgerRewardAttemptOutcome,
  type ProcessLedgerRewardAttemptResult,
  type ReconcileLedgerRewardBridgeResult,
} from './types';
export {
  classifyEngineReason,
  canAutoAttemptRewards,
  isTerminalRejectReason,
  isDeferredReason,
  isRetryableReason,
} from './classify';
export {
  readLedgerRewardOutcome,
  buildLedgerRewardOutcome,
  mergeOutcomeIntoMeta,
  persistLedgerRewardOutcome,
  extractCommissionIdFromMeta,
  isSettlementOriginLedger,
} from './outcomes';
export { scheduleLedgerRewardAttempt } from './schedule';
export { processLedgerRewardAttempt } from './processLedgerRewardAttempt';
export {
  reconcileLedgerRewardBridge,
  type ReconcileLedgerRewardBridgeOptions,
} from './reconcile';
