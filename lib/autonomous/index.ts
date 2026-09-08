export { AUTONOMOUS_DECISION_POLICY_V1, AUTONOMOUS_POLICY_V1 } from './policy';
export { decideAutonomous } from './decide';
export {
  buildAutonomousInput,
  observeAutonomousDecision,
  observeIngestShadow,
} from './observe';
export {
  lookupDuplicateForShadow,
  createDuplicateShadowContext,
  type ShadowDuplicateLookup,
  type DuplicateShadowContext,
} from './duplicateLookup';
export {
  getAutonomousDecisionMetrics,
  recordAutonomousDecision,
  resetAutonomousDecisionMetrics,
  beginAutonomousShadowCycle,
  canonicalShadowSource,
  type AutonomousDecisionMetricsSnapshot,
  type AutonomousCycleSnapshot,
  type ShadowObservationSample,
} from './metrics';
export {
  classifyShadowReasons,
  SHADOW_REASON_CODES,
  SHADOW_REASON_LABELS,
  type ShadowReasonCode,
} from './reasonCodes';
export type {
  AutonomousDecision,
  AutonomousDecisionChecks,
  AutonomousDecisionInput,
  AutonomousDecisionResult,
  AutonomousEngineCheck,
  AutonomousThresholds,
} from './types';
