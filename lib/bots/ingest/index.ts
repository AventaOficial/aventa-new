export { runIngestCycle } from './runIngestCycle';
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
export { isTrustedOriginalPriceProvenance } from './candidateInsertGate';
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
