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
