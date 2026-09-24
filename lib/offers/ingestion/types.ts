/**
 * Offer ingestion contracts — discovery vs enrichment vs readiness.
 * Does not invent DB columns. Does not publish or mint.
 */

export type FieldSource =
  | 'hunter'
  | 'paste'
  | 'json_ld'
  | 'open_graph'
  | 'dom'
  | 'retailer_api'
  | 'url_resolver'
  | 'unknown';

export type FieldEvidence<T = string | number | null> = {
  field: string;
  value: T;
  source: FieldSource;
  observedAt: string;
  confidence: number;
  reason?: string | null;
};

export type DiscoveryOfferInput = {
  rawText?: string | null;
  rawUrl: string;
  title?: string | null;
  store?: string | null;
  price?: number | null;
  originalPrice?: number | null;
  image?: string | null;
  why?: string | null;
  discoveredAt?: string | null;
  source?: FieldSource;
};

export type EnrichmentSnapshot = {
  title?: string | null;
  image?: string | null;
  images?: string[];
  store?: string | null;
  price?: number | null;
  originalPrice?: number | null;
  category?: string | null;
  extractionStatus?: 'success' | 'partial' | 'failed' | null;
  missing?: string[];
  source?: FieldSource;
  observedAt?: string | null;
};

export type MergedField<T> = {
  value: T;
  source: FieldSource | null;
  conflict: boolean;
  discoveryValue: T;
  enrichmentValue: T;
  evidence: FieldEvidence<T>[];
};

export type OfferReadiness =
  | 'discovered'
  | 'enriched'
  | 'partially_verified'
  | 'ready_for_review'
  | 'blocked';

export type UrlPipelineResult = {
  rawUrl: string;
  normalizedUrl: string;
  canonicalUrl: string;
  affiliateUrl: string;
  store: string | null;
  urlUncertain: boolean;
  attributionPreserved: boolean;
};
