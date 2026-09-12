/**
 * Evidencia de oferta. No es un score y no sustituye al Deal Verifier.
 */

export type DealQualification =
  | 'VERIFIED_DEAL'
  | 'PROMOTION'
  | 'POTENTIAL_DEAL'
  | 'NO_VERIFIED_DEAL';

/** Origen de un dato de precio. Nunca presentar derived como explicit. */
export type PriceEvidence = 'explicit' | 'derived' | 'none';

export type PriceProvenance =
  | 'source_explicit'
  | 'trusted_enrichment'
  | 'price_intel_derivation'
  | 'user_declared'
  | 'unknown';

export type DiscountProvenance =
  | 'source_explicit'
  | 'derived'
  | 'price_intel_derivation'
  | 'user_declared'
  | 'unknown';

export type PromotionKind =
  | '2x1'
  | '3x2'
  | 'combo'
  | 'coupon'
  | 'liquidation'
  | 'special_price'
  | 'quantity_discount';

export const DEAL_QUALIFICATION_REASON_CODES = [
  'catalog_only',
  'missing_original_price',
  'missing_discount_evidence',
  'promotion_not_product_bound',
  'invalid_price_evidence',
  'explicit_discount',
  'explicit_original_price',
  'explicit_savings',
  'explicit_promotion',
  'coupon_detected',
  'bundle_detected',
  'liquidation_detected',
  'inconsistent_discount',
  'price_intel_only',
  'user_declared_price',
] as const;

export type DealQualificationReasonCode = (typeof DEAL_QUALIFICATION_REASON_CODES)[number];

export type DealSignals = {
  hasExplicitDiscount: boolean;
  hasOriginalPrice: boolean;
  hasPromotion: boolean;
  hasCoupon: boolean;
  hasBundlePromotion: boolean;
  hasLiquidationSignal: boolean;
  hasSpecialPriceSignal: boolean;
  hasSavingsAmount: boolean;
  priceEvidence: PriceEvidence;
  promotionEvidence: 'explicit' | 'none';
  sourceEvidenceQuality: 'high' | 'medium' | 'low';
};

export type DealQualificationInput = {
  currentPrice: number | null | undefined;
  originalPrice: number | null | undefined;
  /** % declarado por la fuente. No usar el % calculado aquí. */
  explicitDiscountPercent: number | null | undefined;
  explicitSavings: number | null | undefined;
  promotionKind: PromotionKind | null | undefined;
  promotionBoundToProduct: boolean;
  /** Promo vista en la página pero no ligada al producto. */
  unboundPromotionMention?: boolean;
  currentPriceProvenance?: PriceProvenance;
  originalPriceProvenance?: PriceProvenance;
  discountPercentProvenance?: DiscountProvenance;
  /** % derivado (p. ej. Price Intel). Nunca fabrica VERIFIED_DEAL. */
  derivedDiscountPercent?: number | null;
};

export type DealQualificationResult = {
  qualification: DealQualification;
  signals: DealSignals;
  reasons: DealQualificationReasonCode[];
  primaryReason: DealQualificationReasonCode;
  /** Entra al pipeline (verifier/shadow/pending). Catalog-only = false. */
  continueToPipeline: boolean;
  currentPrice: number | null;
  originalPrice: number | null;
  derivedDiscountPercent: number | null;
  currentPriceProvenance: PriceProvenance;
  originalPriceProvenance: PriceProvenance;
  discountPercentProvenance: DiscountProvenance;
};
