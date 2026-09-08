export type {
  HunterCandidate,
  HunterCollectResult,
  HunterEngineCollectResult,
  HunterSource,
  HunterSourceHealth,
  HunterSourceId,
  HunterHealthStatus,
  HunterBreakerState,
} from './types';

export { runHunterCollect, recordExternalSourceBatchHealth } from './engine';
export {
  getHunterHealth,
  recordHunterRun,
  recordHunterSuccess,
  recordHunterFailure,
  resetHunterHealthMemoryForTests,
  defaultHealthRow,
} from './healthStore';
export { evaluateIsHunting, isHunterHealthy, getHunterHealthSummary } from './isHunting';
export { dedupeHunterCandidates, ingestItemToCandidate } from './normalize';
export {
  applyBreakerTransition,
  shouldAttemptCollect,
  cooldownMsForErrorCode,
  HUNTER_FAILURE_THRESHOLD,
} from './circuitBreaker';
export { HUNTER_METRIC_UNIVERSES } from './metricUniverses';
export type { HunterMetricUniverses } from './metricUniverses';
export { HUNTER_MODULES } from './modules';
export type { HunterModule, HunterModuleStatus } from './modules';
export {
  DAY_TO_DAY_SOURCES,
  classifyOfferMonetization,
  summarizeDayToDaySupply,
  isDayToDaySourceId,
} from './dayToDay';
export type { DayToDaySupplySnapshot, OfferMonetizationStatus } from './dayToDay';
