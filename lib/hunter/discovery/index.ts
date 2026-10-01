export {
  STICKY_NEAR_READY_SOURCE_ID,
  STICKY_HISTORY_READY_SOURCE_ID,
  PM_EVIDENCE_SOURCE_ID,
  collectStickyNearReadyCandidates,
  collectPmEvidenceBackedCandidates,
  collectHistoryReadyReactivationCandidates,
  nearReadyTargetToIngestItem,
  nearReadyBucketForDays,
} from './stickyNearReadySource';
export type { StickyNearReadySourceId, NearReadyBucket } from './stickyNearReadySource';

export {
  buildHistoryReadyActivationFromTraces,
  loadHistoryReadyCensus,
  isHistoryReadyFromDistinctDays,
  isApproxActivatedToday,
  DAY10_PRODUCTION_BASELINE,
  emptyHistoryReadyCensus,
} from './historyReadyActivation';
export type {
  HistoryReadyActivationReport,
  HistoryReadyCensus,
} from './historyReadyActivation';

export {
  selectHistoryReadyReactivationTargets,
} from './historyReadyReactivation';
export type {
  HistoryReadyReactivationTarget,
  HistoryReadyReactivationReport,
} from './historyReadyReactivation';

export {
  diagnoseProvenanceCompleteness,
  appendProvenanceDiagnostics,
  resolveStickyIdentityMatch,
  PROVENANCE_GAP_KINDS,
  PROVENANCE_DIAGNOSTIC_CODES,
  ML_IDENTITY_MATCH_METHODS,
} from './provenanceCompleteness';
export type {
  ProvenanceCompletenessReport,
  ProvenanceGapKind,
  ProvenanceDiagnosticCode,
  MlIdentityMatchMethod,
} from './provenanceCompleteness';

export {
  ORIGINAL_RECOVERED_VIA,
  ACQUISITION_PATHS,
  normalizeOriginalRecoveredVia,
  buildCandidateObservation,
} from './discoveryObservability';
export type {
  OriginalRecoveredVia,
  AcquisitionPath,
  DiscoveryCandidateObservation,
} from './discoveryObservability';

export {
  VERIFIED_YIELD_TERMINAL_REASONS,
  assignPrimaryTerminalReason,
  isQualityBlockedTerminal,
  isExternalBlockedTerminal,
} from './verifiedYieldTerminal';
export type {
  VerifiedYieldTerminalReason,
  VerifiedYieldCandidateTrace,
} from './verifiedYieldTerminal';

export {
  emptyNearReadyBuckets,
  emptyVerifiedYieldFunnel,
  bumpTerminalReason,
  finalizeVerifiedYieldRates,
  allocateNearReadyBudget,
} from './verifiedYieldFunnel';
export type {
  NearReadyDayBuckets,
  VerifiedYieldRates,
  VerifiedYieldFunnel,
} from './verifiedYieldFunnel';

export {
  metaFromDiscoveryEvidenceForProduct,
  listDiscoveryEvidenceProductIds,
} from './censusSeedEnrichment';

export {
  runContinuousDiscoveryCycle,
  explainDiscoveryCycleVerdict,
} from './continuousDiscoveryCycle';
export type {
  DiscoveryCycleFunnel,
  DiscoveryCycleReport,
  DiscoverySourceOutcome,
  DiscoverySourceStatus,
  RunContinuousDiscoveryCycleOptions,
} from './continuousDiscoveryCycle';

export {
  classifySourceDiscoveryStatus,
  legacyStatusFromCanonical,
  explainZeroYield,
  SOURCE_DISCOVERY_STATUSES,
} from './sourceDiscoveryStatus';
export type { SourceDiscoveryStatus } from './sourceDiscoveryStatus';

export {
  persistContinuousDiscoveryTruth,
  persistDiscoveryCycleSnapshot,
  seedDiscoveryCycleSnapshot,
  persistDeadlineDiscoverySnapshot,
  supplyInputsFromDiscoveryReport,
  DISCOVERY_CYCLE_SNAPSHOT_TABLE,
} from './persistContinuousDiscoveryTruth';
export type { PersistDiscoveryTruthResult } from './persistContinuousDiscoveryTruth';

export {
  claimDiscoveryCycle,
  DISCOVERY_CYCLE_LEASE_MS,
} from './discoveryCycleLease';
export type { DiscoveryCycleClaim } from './discoveryCycleLease';

export {
  createDeadlineContext,
  raceWithBudget,
  DEFAULT_CRON_STAGE_CAPS,
} from './deadlineBudget';
export type {
  DeadlineContext,
  DeadlineStage,
  DeadlineBudgetSnapshot,
} from './deadlineBudget';

export {
  resolveContinuousExecutionMode,
  scheduledContinuousCycleId,
  SCHEDULED_CONTINUOUS_DEADLINE_MS,
  SCHEDULED_CONTINUOUS_MAX_PRIORITIZED,
  CONTINUOUS_DISCOVERY_CRON_PATH,
  CONTINUOUS_DISCOVERY_CRON_SCHEDULE,
} from './continuousCronContract';
export type { ContinuousExecutionMode } from './continuousCronContract';
