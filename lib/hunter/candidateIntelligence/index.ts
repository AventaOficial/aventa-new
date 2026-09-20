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
  classifyLabelOutcome,
  persistHunterHumanLabel,
  type HunterHumanDecision,
  type HunterHumanLabelInput,
} from './humanLabels';
export {
  validateOfferImageUrl,
  IMAGE_VALIDATION_STATUSES,
  type ImageValidationResult,
  type ImageValidationStatus,
} from '@/lib/offers/imageValidation';
export type { HunterCandidateRecord, HunterIntelligenceRunSummary } from './types';
