export type {
  CandidateTrustContext,
  GlobalSupplyStatus,
  SupplyBoardSnapshot,
  SupplyCandidate,
  SupplyCapabilities,
  SupplyCollectContext,
  SupplyCollectResult,
  SupplyContributionRow,
  SupplyFamily,
  SupplyLimits,
  SupplyPriorityPolicy,
  SupplyRouterReport,
  SupplyRuntimeStatus,
  SupplySource,
  SupplySourceId,
  SupplySourceRun,
  SupplySourceType,
} from './types';
export { DEFAULT_SUPPLY_PRIORITY_POLICY, mergeSupplyPriorityPolicy, sortSupplySources, allocateSourceSlots } from './priority';
export { toSupplyCandidate, fromHunterCandidate, dedupeSupplyCandidates, emptyTrust } from './candidate';
export { resolveCommunityUrl } from './resolve';
export { communitySupplySource } from './community';
export {
  SUPPLY_SOURCES,
  supplySourceById,
  hunterBackedSupplySources,
  assertSupplyInvariants,
  isCommunitySourceId,
  isMachineSourceId,
} from './registry';
export { runSupplyRouter } from './router';
export type { RunSupplyRouterOptions } from './router';
export {
  NICHE_HUNTER_PROFILES,
  NICHE_BEAUTY,
  NICHE_ELECTRONICS,
  NICHE_DAY_TO_DAY,
  nicheProfileById,
  enabledNicheProfiles,
  pickNicheForWave,
  parseSupplyEngineMode,
} from './nicheProfiles';
export type { NicheHunterProfile, SupplyEngineMode, SupplyNicheLane } from './nicheProfiles';
export { applyNicheProfileToIngestConfig, candidateMatchesNiche } from './applyNicheProfile';
export {
  computeDealSignals,
  moderationPriorityFromDealSignals,
} from './dealSignals';
export type { DealSignals, DealPriceClass, DealLaneHint } from './dealSignals';
export { runSupplyEngine, summarizeSupplyEngineReport } from './engine';
export type {
  RunSupplyEngineOptions,
  SupplyEngineReport,
  SupplyEngineMetrics,
  SupplyEngineCandidateView,
} from './engine';
export {
  computeGlobalSupplyStatus,
  mapHunterStatus,
  runtimeStatusForSource,
  recommendedSupplyAction,
} from './health';
export {
  recordSupplyRouterRun,
  peekLastSupplyRouterRun,
  resetSupplyOrchestrationMetrics,
  summarizeLastSupplyRun,
  contributionRows,
} from './metrics';
export { summarizeSupplyBoard } from './board';
export { evaluateCommunitySubmission, communityPersistStatus } from './communityPipeline';
export type { CommunitySubmissionInput, CommunityQualityEvaluation } from './communityPipeline';
export {
  getCommunityQualityMetrics,
  resetCommunityQualityMetrics,
  recordCommunityQuality,
  recordCommunityDuplicateOnly,
  recordCommunityInvalidUrl,
} from './communityQualityMetrics';
export type { CommunityQualitySnapshot } from './communityQualityMetrics';
export {
  recordSupplyRun,
  recordSupplyRuns,
  clampSupplyCounter,
  normalizeSupplyRunInput,
  inferSupplyRunStatus,
  supplyLaneForFamily,
} from './recordSupplyRun';
export {
  persistSupplyRouterReport,
  persistIngestSupplyRuns,
  persistCommunitySupplyRun,
  bumpQualificationCounts,
  emptyQualificationCounts,
  trackIngestQualification,
} from './persistSnapshots';
export {
  getSupplyTruth,
  mapAggregateRows,
  summarizeWindow,
  computePersistedGlobalHealth,
  recommendedSupplyTruthAction,
  buildSupplyAlerts,
  windowSince,
} from './getSupplyTruth';
export type {
  SupplyTruthSnapshot,
  SupplyTruthWindow,
  SupplyTruthWindowId,
  SupplyRunInput,
  SupplyRunRow,
  RecordSupplyRunOutcome,
  SupplyTruthAlertConditions,
} from './truthTypes';
export { SUPPLY_RUN_TABLE, SUPPLY_TRUTH_SCHEMA_VERSION } from './truthTypes';
