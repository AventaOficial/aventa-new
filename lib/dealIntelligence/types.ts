/**
 * Deal Intelligence canonical contracts (P0.1).
 * Logical model only — persistence deferred (see ADR_price_memory_vs_observations).
 */

export type CapabilityStatus = 'SUPPORTED' | 'UNSUPPORTED' | 'UNKNOWN';

export type CaptureMethod =
  | 'official_api'
  | 'authorized_feed'
  | 'public_structured'
  | 'browser_justified'
  | 'user_submission'
  | 'derived'
  | 'unknown';

export type EvidenceReference = {
  kind: string;
  ref: string;
  note?: string | null;
};

export type DealIdentityStatus = 'exact' | 'probable' | 'unknown';

export type DealIdentityMatch = {
  status: Exclude<DealIdentityStatus, 'unknown'>;
  confidence: number;
  matchMethod: string;
  evidence: EvidenceReference[];
};

export type DealIdentity = {
  identityStatus: DealIdentityStatus;
  merchant: string | null;
  merchantProductId: string | null;
  asin: string | null;
  mlItemId: string | null;
  sku: string | null;
  gtin: string | null;
  canonicalUrl: string | null;
  variantKey: string | null;
  seller: string | null;
  productFingerprint: string | null;
  /** Present only for probable links — never auto-merge without this. */
  probableMatch: DealIdentityMatch | null;
};

export type PriceObservation = {
  observationId: string;
  schemaVersion: string;
  identity: DealIdentity;
  merchant: string | null;
  seller: string | null;
  variantKey: string | null;
  currency: string;
  listPrice: number | null;
  salePrice: number | null;
  /** Only set when stacking rules are evidenced — otherwise null. */
  effectivePrice: number | null;
  observedAt: string;
  sourceId: string;
  url: string | null;
  captureMethod: CaptureMethod;
  extractionConfidence: number;
  freshnessSeconds: number | null;
  evidence: EvidenceReference[];
  /** Stable key for idempotent replay. */
  idempotencyKey: string;
  backendHint: 'offer_price_snapshots' | 'product_price_snapshots' | 'logical_only';
};

export type PromotionKind =
  | 'percent'
  | 'fixed_amount'
  | 'coupon_code'
  | 'bank_discount'
  | 'msi'
  | 'temporary'
  | 'cashback'
  | 'free_shipping'
  | 'bundle'
  | 'other';

export type PromotionObservation = {
  promotionId: string;
  kind: PromotionKind;
  sourceId: string;
  observedAt: string;
  validFrom: string | null;
  validUntil: string | null;
  eligibility: string | null;
  percentOff: number | null;
  amountOff: number | null;
  currency: string | null;
  evidence: EvidenceReference[];
  confidence: number;
  /** Explicit — default empty. */
  stackableWith: string[];
  stackingEvidence: EvidenceReference[];
};

export type CouponObservation = {
  couponId: string;
  code: string | null;
  sourceId: string;
  observedAt: string;
  validFrom: string | null;
  validUntil: string | null;
  eligibility: string | null;
  percentOff: number | null;
  amountOff: number | null;
  currency: string | null;
  evidence: EvidenceReference[];
  confidence: number;
  expired: boolean;
  stackableWith: string[];
  stackingEvidence: EvidenceReference[];
};

export type EffectivePriceComputation = {
  ok: boolean;
  effectivePrice: number | null;
  currency: string | null;
  components: Array<{ role: string; amount: number | null; note: string }>;
  refusalReason: string | null;
};

export type DealScoreReasonCode =
  | 'price_drop'
  | 'historical_discount'
  | 'coupon'
  | 'promotion'
  | 'rarity'
  | 'freshness'
  | 'merchant_quality'
  | 'source_confidence'
  | 'stock_signal'
  | 'suspicious_signal'
  | 'identity_confidence'
  | 'insufficient_evidence'
  | 'other';

export type DealScore = {
  score: number;
  confidence: number;
  reasons: string[];
  reasonCodes: DealScoreReasonCode[];
  warnings: string[];
  evidence: EvidenceReference[];
  version: string;
  /** Never invent historical_low without historyReady. */
  historicalLowClaimed: boolean;
};

export type DealDetectedEvent = {
  eventType: 'deal.detected';
  eventId: string;
  schemaVersion: string;
  dealId: string;
  productIdentity: DealIdentity;
  sourceId: string;
  observedAt: string;
  priceObservation: PriceObservation | null;
  promotionObservations: PromotionObservation[];
  couponObservations: CouponObservation[];
  dealScore: DealScore | null;
  evidence: EvidenceReference[];
  confidence: number;
  idempotencyKey: string;
  /** Explicit: this event does not publish. */
  publicationAllowed: false;
};

export type DealSourceCapabilityKey =
  | 'productLookup'
  | 'priceObservation'
  | 'historicalPrice'
  | 'coupon'
  | 'promotion'
  | 'stock'
  | 'seller'
  | 'merchant'
  | 'affiliateLink'
  | 'attribution'
  | 'economicReporting'
  | 'api'
  | 'feed'
  | 'browser'
  | 'rateLimits'
  | 'authentication';

export type DealSourceCapabilities = Record<DealSourceCapabilityKey, CapabilityStatus>;

export type DealIntelligenceConnectionState =
  | 'NOT_CONNECTED'
  | 'CONNECTED_ZERO'
  | 'CONNECTED_WITH_DATA';
