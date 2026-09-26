export {
  STICKY_NEAR_READY_SOURCE_ID,
  PM_EVIDENCE_SOURCE_ID,
  collectStickyNearReadyCandidates,
  collectPmEvidenceBackedCandidates,
  nearReadyTargetToIngestItem,
  nearReadyBucketForDays,
} from './stickyNearReadySource';
export type { StickyNearReadySourceId, NearReadyBucket } from './stickyNearReadySource';

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
  resolveContinuousExecutionMode,
  scheduledContinuousCycleId,
  SCHEDULED_CONTINUOUS_DEADLINE_MS,
  SCHEDULED_CONTINUOUS_MAX_PRIORITIZED,
  CONTINUOUS_DISCOVERY_CRON_PATH,
  CONTINUOUS_DISCOVERY_CRON_SCHEDULE,
} from './continuousCronContract';
export type { ContinuousExecutionMode } from './continuousCronContract';
