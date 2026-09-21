export {
  HUNTER_VERSION,
  NORMALIZATION_VERSION,
  SCORING_VERSION,
  DECISION_POLICY_VERSION,
  LABEL_SCHEMA_VERSION,
} from './versions';
export {
  HUNTER_CANDIDATE_DECISIONS,
  HUNTER_REJECTION_STAGES,
  classifyIngestDisposition,
  type HunterCandidateDecision,
  type HunterRejectionStage,
  type Disposition,
} from './taxonomy';
export { explainScoreBreakdown, type ScoreExplanation, type ScoreSignal } from './scoreExplanation';
export { isHunterCandidateIntelligenceEnabled } from './flags';
export { classifyDiscountClass, classifyDiscountClassV1, classifyDiscountEvidence, DISCOUNT_CLASSES, DISCOUNT_CLASSES_V1, SHADOW_REAL_GOOD_MIN_PCT, type DiscountClass, type DiscountClassV1, type DiscountClassification } from './discountClass';
export {
  auditDiscountGateReason,
  aggregateDiscountPathStats,
  deriveFunnelDecision,
  simulateWithoutDiscountGate,
  REJECTED_DISCOUNT_PATHS,
  type DiscountGateAudit,
  type FunnelDecision,
  type HypotheticalDecision,
} from './discountAudit';
export {
  summarizeOpportunities,
  emptyOpportunityCounts,
  accumulateOpportunity,
  type OpportunityCounts,
  type OpportunityRow,
} from './opportunityMetrics';
export {
  isHunterDiscoveryExperimentEnabled,
  getDiscoveryExperimentVariant,
  getDiscoveryExperimentCaps,
  HUNTER_DISCOVERY_EXPERIMENT_ENV,
  HUNTER_DISCOVERY_EXPERIMENT_ID,
  HUNTER_DISCOVERY_EXPERIMENT_ID_V1,
} from './discoveryExperiment';
export {
  computeNovelProductRate,
  jaccardOverlap,
  productIdentityKey,
  repeatRate,
} from './discoveryMetrics';
export {
  computeNoveltyRunMetrics,
  noveltyUrlKey,
  noveltyIdentityKey,
  noveltyProductKey,
  type NoveltyRunMetrics,
  type NoveltyCandidateInput,
} from './noveltyMetrics';
export {
  buildLossFunnelReport,
  classifyLossBucket,
  annotateFunnelStage,
  LOSS_BUCKETS,
  type LossBucket,
  type LossFunnelReport,
  type LossFunnelRow,
} from './lossFunnel';
export {
  buildMissionControlReport,
  type MissionControlReport,
  type MissionControlCandidate,
} from './missionControl';
export {
  parseUniverseFilters,
  fetchUniversePage,
  fetchMissionControlReport,
  type UniverseFilters,
} from './universeQuery';
export {
  resolveCandidateIdentity,
  IDENTITY_TYPES,
  type CandidateIdentity,
  type IdentityType,
  type ResolveIdentityInput,
} from './candidateIdentity';
export {
  reconcileDiscoveryCompleteness,
  type CompletenessReconciliation,
  type ReconTerminalRow,
} from './completenessReconciliation';
export {
  computeTemporalNovelty,
  buildTemporalWindows,
  type TemporalNoveltyReport,
  type TemporalWindowSpec,
} from './temporalNovelty';
export {
  computeStickinessReport,
  type StickinessReport,
} from './stickinessMetrics';
export {
  buildSourceCoverageMatrix,
  type SourceCoverageRow,
} from './sourceCoverage';
export {
  validateCandidateTelemetry,
  type CandidateDqReport,
  type CandidateDqInput,
  type DqStatus,
} from './dataQualityContract';
export {
  scanDiscountTruthStatic,
  DISCOUNT_TRUTH_CRITICAL_GLOBS,
  DISCOUNT_ZERO_ALLOWLIST,
} from './discountTruthStaticGuard';
export {
  computeLabelAvailability,
  type LabelAvailability,
} from './labelAvailability';
export {
  assertObservationOnlyEnv,
  assertZeroInsertAttempts,
  scanSourceForForbiddenMint,
  OBSERVATION_FORBIDDEN_SYMBOLS,
  type ObservationBoundaryCheck,
} from './observationBoundary';
export { buildRotationPlan, rotateSubset, emptyAxisBitmap } from './discoveryRotation';
export {
  buildAdaptiveDiscoveryPlan,
  computeRunSlot,
  nextSchedulerState,
  parseDiscoverySourceDetail,
  formatMlSourceDetail,
  DIMENSION_LEVERAGE_RANKING,
  ML_EXPLORATION_QUERY_FAMILIES,
  ML_EXPLORATION_CATEGORY_IDS,
  type AdaptiveDiscoveryPlan,
  type DiscoveryDimension,
} from './discoveryScheduler';
export {
  loadSchedulerState,
  saveSchedulerState,
  resetSchedulerStateMemoryForTests,
  HUNTER_DISCOVERY_SCHEDULER_STATE_TABLE,
} from './schedulerStateStore';
export {
  buildExplorationQueryCatalog,
  buildExplorationCategoryCatalog,
  isStickyExploitQueryList,
} from './queryFamilyCatalog';
export {
  recoverUnknownDiscountShadow,
  type UnknownRecoveryResult,
} from './unknownDiscountRecovery';
export {
  computeDiscoveryEfficiency,
  type DiscoveryEfficiencyReport,
} from './discoveryEfficiency';
export {
  buildUnknownDiscountBreakdown,
  type UnknownBreakdownReport,
} from './unknownDiscountBreakdown';
export {
  buildCausalBottleneckReport,
  CAUSAL_STAGES,
  type CausalBottleneckReport,
} from './causalBottleneck';
export {
  resolveIdentityHierarchy,
  type IdentityHierarchy,
  type IdentityStrength,
} from './identityHierarchy';
export {
  getSourceExpansionArchitecture,
  SOURCE_EXPANSION_ARCHITECTURE,
} from './sourceExpansionArchitecture';
export { persistDiscoveryEvents, HUNTER_DISCOVERY_EVENTS_TABLE } from './persistDiscoveryEvents';
export { earlyPersistDiscoverySightings, applyWouldCutAnnotations } from './earlyPersist';
export { priceBandForSale } from './priceBand';
export { buildHunterCandidateRecord, candidateKeyForUrl, inferRetailer } from './buildCandidateRecord';
export {
  persistHunterCandidates,
  persistHunterIntelligenceRun,
  HUNTER_OFFER_CANDIDATES_TABLE,
  HUNTER_INTELLIGENCE_RUNS_TABLE,
  HUNTER_CANDIDATE_LABELS_TABLE,
} from './persist';
export { buildHunterIntelligenceRunSummary, isRejectedDecision } from './runReport';
export { observeExternalWorkerBatch, observeIngestBatch, assertZeroSilentDrops, type ObservedResolved } from './observeBatch';
export {
  HUNTER_HUMAN_DECISIONS,
  LAB_CANONICAL_LABELS,
  classifyLabelOutcome,
  persistHunterHumanLabel,
  type HunterHumanDecision,
  type HunterHumanLabelInput,
  type LabCanonicalLabel,
} from './humanLabels';
export {
  LAB_PRIMARY_LABELS,
  LAB_FN_RATE_MIN_REVIEWED,
  LAB_FN_RATE_MIN_FP_FN,
  LAB_CANDIDATE_SELECT,
  displayOrNd,
  parseLabListFilters,
  latestLabelsByCandidate,
  computeLabLabelCounters,
  computeLabReconciliation,
  computeLabMetricsPrep,
  derivePipelineStages,
  type LabMetricKind,
  type LabPipelineStage,
  type LabPipelineStageName,
  type LabStageStatus,
  type LabCandidateRow,
  type LabListFilters,
  type LabLabelCounters,
  type LabReconciliation,
  type LabMetricsPrep,
} from './labReview';
export { fetchLatestLabelsForRun, fetchLabReviewPage } from './labReviewQuery';
export {
  validateOfferImageUrl,
  IMAGE_VALIDATION_STATUSES,
  type ImageValidationResult,
  type ImageValidationStatus,
} from '@/lib/offers/imageValidation';
export type { HunterCandidateRecord, HunterIntelligenceRunSummary } from './types';
