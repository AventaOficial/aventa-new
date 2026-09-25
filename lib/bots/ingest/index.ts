export { runIngestCycle, S91_DISCOVERY_ONLY_SKIP_REASON } from './runIngestCycle';
export {
  assertMachineOfferWriteAuthorized,
  resolveMachineInsertStatus,
} from './machineWriteAuth';
export type { MachineWriteAuthFailure, MachineWriteAuthOk } from './machineWriteAuth';
export { loadBotIngestConfig } from './config';
export type { IngestCycleReport, IngestSingleResult } from './types';
export {
  evaluateMachineCandidateGate,
  selectTopKByScore,
  resolveInsertBudget,
  DUPLICATE_POLICY,
} from './candidateInsertGate';
export type {
  CandidateGateResult,
  CandidateGateAction,
  MachineQualityDecision,
  MachineQualityReasonCode,
  MachineEvidenceLevel,
} from './candidateInsertGate';
export { isTrustedOriginalPriceProvenance, mintTrustedOriginalPrice } from './candidateInsertGate';
export { buildHunterDecisionTrace, labelFromGateAndDqe } from './hunterDecisionTrace';
export type { HunterDecisionTrace, HunterFinalLabel } from './hunterDecisionTrace';
export {
  preserveMachinePriceProvenance,
  isLegalProvenanceTransition,
  isTrustedMachineOriginalProvenance,
} from './machinePriceProvenance';
export type {
  PreserveMachinePriceProvenanceInput,
  PreservedMachinePriceProvenance,
} from './machinePriceProvenance';
export {
  decomposeIngestScores,
  classifyCandidateSignals,
  toWorkerCardDiagnosticRow,
} from './workerCardScoreDiagnostics';
export type {
  ScoreDecomposition,
  WorkerCardContribution,
} from './workerCardScoreDiagnostics';
export {
  buildAutomationCycleMetrics,
  classifyAutomationOutcome,
  metricsFromWorkerResults,
  emptyAutomationCycleCounts,
} from './automationCycleMetrics';
export type {
  AutomationCycleMetrics,
  AutomationCycleCounts,
  AutomationCycleOutcome,
} from './automationCycleMetrics';
export {
  classifyDay2Candidate,
  assertDay2StagingWritable,
  readDay2SafetySnapshot,
  emptyDay2FunnelCounts,
} from './day2StagingCanary';
export type { Day2CandidateClass, Day2FunnelCounts, Day2SafetySnapshot } from './day2StagingCanary';
export {
  evaluateMachineLiveInsertEligibility,
  isMachinePendingWriteEnabled,
  machineGateSkipReason,
} from './machineLiveInsertEligibility';
export type { MachineLiveInsertEligibility } from './machineLiveInsertEligibility';
export {
  buildSupplyOpsRunSummary,
  diagnoseSupplyOpsBottleneck,
  formatSupplyOpsRunSummaryLog,
} from './supplyOpsRunSummary';
export type { SupplyOpsRunSummary, SupplyOpsBottleneck } from './supplyOpsRunSummary';
export {
  buildCycleFunnelSummary,
  explainCycleVerdict,
  formatCycleFunnelLog,
} from './cycleFunnelSummary';
export type { CycleFunnelSummary } from './cycleFunnelSummary';
export { processExternalWorkerBatch } from './externalWorker';
export type { ExternalWorkerBatchPayload, ExternalWorkerCandidate } from './externalWorker';
export {
  S71_SEED_AUTHOR_ID,
  S72_STAGING_WINDOW_DEFAULT_CAP,
  S72_STAGING_WINDOW_HARD_CAP,
  assertDedicatedMachineAuthor,
  resolveStagingSupplyWindowCap,
} from './stagingSupplyWindow';
