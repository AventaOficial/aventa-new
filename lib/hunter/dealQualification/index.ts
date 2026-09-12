export type {
  DealQualification,
  DealQualificationInput,
  DealQualificationReasonCode,
  DealQualificationResult,
  DealSignals,
  DiscountProvenance,
  PriceEvidence,
  PriceProvenance,
  PromotionKind,
} from './types';
export { DEAL_QUALIFICATION_REASON_CODES } from './types';
export { DEAL_QUALIFICATION_RULES } from './thresholds';
export { qualifyCandidate } from './qualifyCandidate';
export { scanProductBoundPromotionText, joinProductBoundTexts } from './signals';
export {
  attachQualification,
  filterQualifiedHunterCandidates,
  qualifyHunterCandidate,
  qualifyParsedOfferMetadata,
  qualificationInputFromParsedMeta,
} from './applyToCandidates';
export {
  getDealQualificationMetrics,
  recordDealQualification,
  resetDealQualificationMetrics,
  qualificationSourceId,
} from './metrics';
export type { DealQualificationMetricsSnapshot } from './metrics';
