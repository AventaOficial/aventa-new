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
  getShadowCycleReport,
  recordAutonomousDecision,
  resetAutonomousDecisionMetrics,
  beginAutonomousShadowCycle,
  canonicalShadowSource,
  type AutonomousDecisionMetricsSnapshot,
  type AutonomousCycleSnapshot,
  type AutonomousSourceMetrics,
  type ShadowObservationSample,
} from './metrics';
export {
  buildShadowCycleRow,
  shadowCycleRowToReport,
  SHADOW_CYCLE_SCHEMA_VERSION,
  SHADOW_CYCLE_TABLE,
  type ShadowCycleReport,
  type ShadowCycleRow,
  type ShadowCycleTopReason,
} from './shadowCycle';
export {
  persistShadowCycleSnapshot,
  readRecentShadowCycles,
  type PersistShadowCycleOutcome,
} from './shadowCyclePersistence';
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
