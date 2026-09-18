export { runIngestCycle } from './runIngestCycle';
export { loadBotIngestConfig } from './config';
export type { IngestCycleReport, IngestSingleResult } from './types';
export {
  evaluateMachineCandidateGate,
  selectTopKByScore,
  resolveInsertBudget,
  DUPLICATE_POLICY,
} from './candidateInsertGate';
export type { CandidateGateResult, CandidateGateAction } from './candidateInsertGate';
