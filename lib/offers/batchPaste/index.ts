export {
  OFFER_BATCH_MAX,
  extractOfferUrlsFromText,
  offerBatchIdentityKey,
  recoverPastedOfferText,
} from './extractOfferUrls';
export { parsePastedOfferDump, buildOfferBatchDrafts, classifyEnrichmentFailure } from './parseOfferDump';
export type { EnrichmentFailureKind } from './parseOfferDump';
export { classifyPastedUrl, isRecognizedProductUrl } from './classifyPastedUrl';
export type { PastedUrlKind } from './classifyPastedUrl';
export type { PastedOfferHint, OfferBatchDraft } from './parseOfferDump';
export { batchAffiliatePlan, batchAffiliatePlanLabel } from './affiliatePlan';
export type { BatchAffiliatePlan } from './affiliatePlan';
