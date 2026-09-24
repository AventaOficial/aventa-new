/** Client-safe ingestion surface. Server ingest lives in ingestOfferObservation.ts */
export type {
  DiscoveryOfferInput,
  EnrichmentSnapshot,
  FieldEvidence,
  OfferReadiness,
  UrlPipelineResult,
} from '@/lib/offers/ingestion/types';
export { processOfferUrl, offerIngestionIdentityKey } from '@/lib/offers/ingestion/urlPipeline';
export { mergeDiscoveryWithEnrichment, preferStrongerEvidence } from '@/lib/offers/ingestion/mergeFields';
export { evaluateOfferQuality } from '@/lib/offers/ingestion/qualityGate';
export {
  enrichmentFromParseResponse,
  buildLotRowFromDiscoveryAndParse,
} from '@/lib/offers/ingestion/fromParseResponse';
export {
  resolveIngestionIdentity,
  type IngestionIdentity,
  type IngestionIdentityStrategy,
} from '@/lib/offers/ingestion/identity';
export { mergePendingOfferFields } from '@/lib/offers/ingestion/mergePendingOffer';
