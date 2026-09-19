/**
 * Supply Intelligence Engine — S8 foundational types.
 *
 * Evaluates whether a candidate is a genuine opportunity using evidence only.
 * Does NOT insert offers, publish, or touch Distribution / Rewards / Settlement.
 */

import type { OfferQualitySignals } from '@/lib/bots/ingest/offerQualitySignals';

/** How a price value was obtained — never invent reference prices. */
export type PriceProvenanceKind =
  | 'listing_card'
  | 'source_explicit'
  | 'api_quote'
  | 'price_intel_derivation'
  | 'history_low'
  | 'candidate_declared'
  | 'unknown'
  | 'unavailable';

/** A single price observation with source and trust boundary. */
export type PriceProvenance = {
  amount: number | null;
  kind: PriceProvenanceKind;
  /** Adapter id (e.g. mercadolibre) or `candidate` for ingest payload. */
  source: string;
  observedAt: string;
  /** True only when provenance is admissible as reference for discount math. */
  trusted: boolean;
};

export type OpportunityEvidenceLevel =
  | 'none'
  | 'weak_card'
  | 'strong_card'
  | 'api_verified'
  | 'history_backed';

/** Evidence bundle used for scoring — all fields derivable from inputs. */
export type OpportunityEvidence = {
  salePrice: PriceProvenance;
  /** Reference (original/list) price — null when unavailable, never fabricated. */
  referencePrice: PriceProvenance | null;
  /** Discount % computed only from trusted reference; null when reference missing. */
  discountPercent: number | null;
  evidenceLevel: OpportunityEvidenceLevel;
  historyReady: boolean;
  suspectedArtificialListPrice: boolean;
  hasImage: boolean;
  productFingerprint: string | null;
  signals: OfferQualitySignals;
};

export type OpportunityReasonCode =
  | 'INVALID_SALE_PRICE'
  | 'MISSING_IDENTITY'
  | 'REFERENCE_UNAVAILABLE'
  | 'REFERENCE_UNTRUSTED'
  | 'BADGE_RECONSTRUCTED'
  | 'FABRICATED_DISCOUNT'
  | 'DISCOUNT_BELOW_THRESHOLD'
  | 'ARTIFICIAL_LIST_PRICE'
  | 'LOW_QUALITY_TITLE'
  | 'PARTIAL_EVIDENCE'
  | 'API_VERIFIED'
  | 'HISTORY_BACKED'
  | 'STRONG_CARD_EVIDENCE'
  | 'WEAK_CARD_EVIDENCE'
  | 'ADAPTER_UNAVAILABLE'
  | 'ADAPTER_DRY_RUN'
  | 'VERIFIED_OPPORTUNITY';

export type OpportunityDecision = 'REJECT' | 'PARTIAL' | 'OPPORTUNITY';

/** Explainable 0–100 score from evidence weights only (deterministic). */
export type OpportunityScore = {
  value: number;
  confidence: number;
  reasonCodes: OpportunityReasonCode[];
  breakdown: {
    priceEvidence: number;
    discountMagnitude: number;
    historySupport: number;
    qualitySignals: number;
  };
};

/** Input candidate — compatible with S6/S7 normalized listings; no DB writes. */
export type OpportunityCandidate = {
  url: string;
  canonicalUrl?: string | null;
  store?: string | null;
  title?: string | null;
  imageUrl?: string | null;
  salePrice: number;
  /** Seller/card-declared original — never trusted without provenance. */
  declaredOriginalPrice?: number | null;
  declaredDiscountPercent?: number | null;
  currency?: string | null;
  signals?: Partial<OfferQualitySignals> | null;
  cardDiscountSource?: string | null;
  cardBadgePercent?: number | null;
  pdpBlocked?: boolean | null;
  sourceId?: string | null;
};

export type OpportunityEvaluation = {
  candidateUrl: string;
  productFingerprint: string | null;
  decision: OpportunityDecision;
  score: OpportunityScore;
  evidence: OpportunityEvidence;
  evaluatedAt: string;
  /** True when adapters ran without live fetch (no creds / capability gate). */
  dryRun: boolean;
  adapterNotes: string[];
};
