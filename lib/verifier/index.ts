export type {
  DealCheckResult,
  DealCheckStatus,
  DealVerifierChecks,
  DealVerifierDecision,
  DealVerifierInputSource,
  DealVerifierResult,
} from './types';

export { DEAL_VERIFIER_THRESHOLDS, confidenceForDecision } from './thresholds';
export { evaluateDeal, evaluateDealSafe, type EvaluateDealOptions } from './evaluateDeal';
export {
  getDealVerifierMetrics,
  resetDealVerifierMetrics,
  recordDealVerifierResult,
  type DealVerifierMetricsSnapshot,
} from './metrics';
export {
  checkDuplicateKnown,
  hasSuspiciousDiscountGap,
  discountGap,
} from './checks';
