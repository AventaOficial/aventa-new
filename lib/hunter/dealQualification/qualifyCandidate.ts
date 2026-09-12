import type {
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

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.replace(/,/g, '').trim());
    if (!Number.isFinite(n)) return null;
    return n;
  }
  return null;
}

function isUsablePrice(n: number | null): n is number {
  return n != null && Number.isFinite(n) && n > 0;
}

function provenanceOrUnknown(v: PriceProvenance | undefined): PriceProvenance {
  return v ?? 'unknown';
}

function discountProvenanceOrUnknown(v: DiscountProvenance | undefined): DiscountProvenance {
  return v ?? 'unknown';
}

function isStrongPriceProvenance(p: PriceProvenance): boolean {
  return p === 'source_explicit' || p === 'trusted_enrichment';
}

function derivedPercent(current: number, original: number): number | null {
  if (!(original > current)) return null;
  return Math.round((1 - current / original) * 10000) / 100;
}

function promotionReasons(kind: PromotionKind | null | undefined): DealQualificationReasonCode[] {
  if (!kind) return ['explicit_promotion'];
  if (kind === 'coupon') return ['explicit_promotion', 'coupon_detected'];
  if (kind === '2x1' || kind === '3x2' || kind === 'combo' || kind === 'quantity_discount') {
    return ['explicit_promotion', 'bundle_detected'];
  }
  if (kind === 'liquidation') return ['explicit_promotion', 'liquidation_detected'];
  return ['explicit_promotion'];
}

function buildSignals(opts: {
  hasExplicitDiscount: boolean;
  hasOriginalPrice: boolean;
  promotionKind: PromotionKind | null;
  promotionBound: boolean;
  hasSavings: boolean;
  priceEvidence: PriceEvidence;
  promotionEvidence: 'explicit' | 'none';
  quality: DealSignals['sourceEvidenceQuality'];
}): DealSignals {
  const kind = opts.promotionKind;
  return {
    hasExplicitDiscount: opts.hasExplicitDiscount,
    hasOriginalPrice: opts.hasOriginalPrice,
    hasPromotion: opts.promotionBound && kind != null,
    hasCoupon: opts.promotionBound && kind === 'coupon',
    hasBundlePromotion:
      opts.promotionBound &&
      (kind === '2x1' || kind === '3x2' || kind === 'combo' || kind === 'quantity_discount'),
    hasLiquidationSignal: opts.promotionBound && kind === 'liquidation',
    hasSpecialPriceSignal: opts.promotionBound && kind === 'special_price',
    hasSavingsAmount: opts.hasSavings,
    priceEvidence: opts.priceEvidence,
    promotionEvidence: opts.promotionEvidence,
    sourceEvidenceQuality: opts.quality,
  };
}

function result(partial: {
  qualification: DealQualification;
  reasons: DealQualificationReasonCode[];
  signals: DealSignals;
  currentPrice: number | null;
  originalPrice: number | null;
  derivedDiscountPercent: number | null;
  currentPriceProvenance: PriceProvenance;
  originalPriceProvenance: PriceProvenance;
  discountPercentProvenance: DiscountProvenance;
}): DealQualificationResult {
  const continueToPipeline = partial.qualification !== 'NO_VERIFIED_DEAL';
  return {
    ...partial,
    primaryReason: partial.reasons[0] ?? 'catalog_only',
    continueToPipeline,
  };
}

/**
 * Clasifica evidencia de oferta. Determinista. Fail-closed en precios inválidos.
 * No inventa originalPrice ni discount.
 */
export function qualifyCandidate(input: DealQualificationInput): DealQualificationResult {
  const currentRaw = asFiniteNumber(input.currentPrice);
  const originalRaw = asFiniteNumber(input.originalPrice);
  const explicitDiscount = asFiniteNumber(input.explicitDiscountPercent);
  const explicitSavings = asFiniteNumber(input.explicitSavings);
  const derivedFromIntel = asFiniteNumber(input.derivedDiscountPercent);

  const currentPriceProvenance = provenanceOrUnknown(input.currentPriceProvenance);
  let originalPriceProvenance = provenanceOrUnknown(input.originalPriceProvenance);
  let discountPercentProvenance = discountProvenanceOrUnknown(input.discountPercentProvenance);

  const currentInvalidProvided =
    input.currentPrice != null &&
    input.currentPrice !== undefined &&
    (typeof input.currentPrice === 'number'
      ? !Number.isFinite(input.currentPrice) || input.currentPrice <= 0
      : currentRaw == null || currentRaw <= 0);

  const originalInvalidProvided =
    input.originalPrice != null &&
    input.originalPrice !== undefined &&
    (typeof input.originalPrice === 'number'
      ? !Number.isFinite(input.originalPrice) || input.originalPrice < 0
      : originalRaw == null || originalRaw < 0);

  const emptySignals = buildSignals({
    hasExplicitDiscount: false,
    hasOriginalPrice: false,
    promotionKind: null,
    promotionBound: false,
    hasSavings: false,
    priceEvidence: 'none',
    promotionEvidence: 'none',
    quality: 'low',
  });

  if (currentInvalidProvided || originalInvalidProvided) {
    return result({
      qualification: 'NO_VERIFIED_DEAL',
      reasons: ['invalid_price_evidence'],
      signals: emptySignals,
      currentPrice: isUsablePrice(currentRaw) ? currentRaw : null,
      originalPrice: null,
      derivedDiscountPercent: null,
      currentPriceProvenance,
      originalPriceProvenance: 'unknown',
      discountPercentProvenance: 'unknown',
    });
  }

  const current = isUsablePrice(currentRaw) ? currentRaw : null;
  let original = isUsablePrice(originalRaw) ? originalRaw : null;

  let invalidOriginalEvidence = false;
  if (original != null && current != null && original <= current) {
    original = null;
    originalPriceProvenance = 'unknown';
    invalidOriginalEvidence = true;
  }

  const strongOriginal =
    original != null &&
    current != null &&
    original > current &&
    isStrongPriceProvenance(originalPriceProvenance);

  const intelOnlyOriginal =
    original != null &&
    current != null &&
    original > current &&
    originalPriceProvenance === 'price_intel_derivation';

  const explicitDiscountOk =
    explicitDiscount != null &&
    explicitDiscount > 0 &&
    discountPercentProvenance !== 'price_intel_derivation' &&
    discountPercentProvenance !== 'derived' &&
    discountPercentProvenance !== 'user_declared';

  const explicitSavingsOk = explicitSavings != null && explicitSavings > 0;

  const computedFromExplicitPair = strongOriginal && current != null && original != null
    ? derivedPercent(current, original)
    : null;

  if (computedFromExplicitPair != null && discountPercentProvenance === 'unknown') {
    discountPercentProvenance = 'derived';
  }

  const inconsistentExplicitDiscount =
    explicitDiscountOk &&
    current != null &&
    original != null &&
    original > current &&
    computedFromExplicitPair != null &&
    Math.abs(explicitDiscount! - computedFromExplicitPair) > 25;

  const boundPromo = Boolean(input.promotionBoundToProduct && input.promotionKind);
  const promoKind = boundPromo ? input.promotionKind ?? null : null;

  let priceEvidence: PriceEvidence = 'none';
  if (strongOriginal) priceEvidence = 'explicit';
  else if (intelOnlyOriginal || (computedFromExplicitPair == null && derivedFromIntel != null && derivedFromIntel > 0)) {
    priceEvidence = 'derived';
  } else if (current != null && isStrongPriceProvenance(currentPriceProvenance)) {
    priceEvidence = 'explicit';
  }

  if (inconsistentExplicitDiscount) {
    return result({
      qualification: 'POTENTIAL_DEAL',
      reasons: ['inconsistent_discount'],
      signals: buildSignals({
        hasExplicitDiscount: true,
        hasOriginalPrice: original != null,
        promotionKind: promoKind,
        promotionBound: boundPromo,
        hasSavings: explicitSavingsOk,
        priceEvidence: 'derived',
        promotionEvidence: boundPromo ? 'explicit' : 'none',
        quality: 'medium',
      }),
      currentPrice: current,
      originalPrice: original,
      derivedDiscountPercent: computedFromExplicitPair,
      currentPriceProvenance,
      originalPriceProvenance,
      discountPercentProvenance: 'derived',
    });
  }

  if (strongOriginal) {
    const reasons: DealQualificationReasonCode[] = ['explicit_original_price'];
    if (explicitDiscountOk) reasons.push('explicit_discount');
    if (explicitSavingsOk) reasons.push('explicit_savings');
    if (boundPromo) reasons.push(...promotionReasons(promoKind));
    return result({
      qualification: 'VERIFIED_DEAL',
      reasons,
      signals: buildSignals({
        hasExplicitDiscount: explicitDiscountOk || computedFromExplicitPair != null,
        hasOriginalPrice: true,
        promotionKind: promoKind,
        promotionBound: boundPromo,
        hasSavings: explicitSavingsOk,
        priceEvidence: 'explicit',
        promotionEvidence: boundPromo ? 'explicit' : 'none',
        quality: 'high',
      }),
      currentPrice: current,
      originalPrice: original,
      derivedDiscountPercent: computedFromExplicitPair,
      currentPriceProvenance,
      originalPriceProvenance,
      discountPercentProvenance: explicitDiscountOk ? 'source_explicit' : 'derived',
    });
  }

  if (explicitDiscountOk) {
    const reasons: DealQualificationReasonCode[] = ['explicit_discount'];
    if (explicitSavingsOk) reasons.push('explicit_savings');
    if (boundPromo) reasons.push(...promotionReasons(promoKind));
    return result({
      qualification: 'VERIFIED_DEAL',
      reasons,
      signals: buildSignals({
        hasExplicitDiscount: true,
        hasOriginalPrice: original != null,
        promotionKind: promoKind,
        promotionBound: boundPromo,
        hasSavings: explicitSavingsOk,
        priceEvidence: 'explicit',
        promotionEvidence: boundPromo ? 'explicit' : 'none',
        quality: 'high',
      }),
      currentPrice: current,
      originalPrice: original,
      derivedDiscountPercent: computedFromExplicitPair,
      currentPriceProvenance,
      originalPriceProvenance,
      discountPercentProvenance: 'source_explicit',
    });
  }

  if (explicitSavingsOk) {
    const reasons: DealQualificationReasonCode[] = ['explicit_savings'];
    if (boundPromo) reasons.push(...promotionReasons(promoKind));
    return result({
      qualification: 'VERIFIED_DEAL',
      reasons,
      signals: buildSignals({
        hasExplicitDiscount: false,
        hasOriginalPrice: original != null,
        promotionKind: promoKind,
        promotionBound: boundPromo,
        hasSavings: true,
        priceEvidence: 'explicit',
        promotionEvidence: boundPromo ? 'explicit' : 'none',
        quality: 'high',
      }),
      currentPrice: current,
      originalPrice: original,
      derivedDiscountPercent: computedFromExplicitPair,
      currentPriceProvenance,
      originalPriceProvenance,
      discountPercentProvenance,
    });
  }

  if (boundPromo && promoKind) {
    return result({
      qualification: 'PROMOTION',
      reasons: promotionReasons(promoKind),
      signals: buildSignals({
        hasExplicitDiscount: false,
        hasOriginalPrice: original != null,
        promotionKind: promoKind,
        promotionBound: true,
        hasSavings: false,
        priceEvidence,
        promotionEvidence: 'explicit',
        quality: 'medium',
      }),
      currentPrice: current,
      originalPrice: original,
      derivedDiscountPercent: computedFromExplicitPair,
      currentPriceProvenance,
      originalPriceProvenance,
      discountPercentProvenance,
    });
  }

  const userDeclaredPair =
    current != null &&
    original != null &&
    original > current &&
    (originalPriceProvenance === 'user_declared' ||
      currentPriceProvenance === 'user_declared' ||
      discountPercentProvenance === 'user_declared');

  if (userDeclaredPair && !strongOriginal && !explicitDiscountOk && !explicitSavingsOk) {
    return result({
      qualification: 'POTENTIAL_DEAL',
      reasons: ['user_declared_price'],
      signals: buildSignals({
        hasExplicitDiscount: false,
        hasOriginalPrice: true,
        promotionKind: promoKind,
        promotionBound: boundPromo,
        hasSavings: false,
        priceEvidence: 'none',
        promotionEvidence: boundPromo ? 'explicit' : 'none',
        quality: 'low',
      }),
      currentPrice: current,
      originalPrice: original,
      derivedDiscountPercent:
        current != null && original != null ? derivedPercent(current, original) : null,
      currentPriceProvenance,
      originalPriceProvenance,
      discountPercentProvenance:
        discountPercentProvenance === 'unknown' ? 'user_declared' : discountPercentProvenance,
    });
  }

  if (input.unboundPromotionMention) {
    return result({
      qualification: 'POTENTIAL_DEAL',
      reasons: ['promotion_not_product_bound'],
      signals: buildSignals({
        hasExplicitDiscount: false,
        hasOriginalPrice: original != null,
        promotionKind: null,
        promotionBound: false,
        hasSavings: false,
        priceEvidence,
        promotionEvidence: 'none',
        quality: 'low',
      }),
      currentPrice: current,
      originalPrice: original,
      derivedDiscountPercent: computedFromExplicitPair,
      currentPriceProvenance,
      originalPriceProvenance,
      discountPercentProvenance,
    });
  }

  if (intelOnlyOriginal || (derivedFromIntel != null && derivedFromIntel > 0 && !strongOriginal)) {
    return result({
      qualification: 'POTENTIAL_DEAL',
      reasons: ['price_intel_only'],
      signals: buildSignals({
        hasExplicitDiscount: false,
        hasOriginalPrice: original != null,
        promotionKind: null,
        promotionBound: false,
        hasSavings: false,
        priceEvidence: 'derived',
        promotionEvidence: 'none',
        quality: 'low',
      }),
      currentPrice: current,
      originalPrice: original,
      derivedDiscountPercent: derivedFromIntel,
      currentPriceProvenance,
      originalPriceProvenance: intelOnlyOriginal ? 'price_intel_derivation' : originalPriceProvenance,
      discountPercentProvenance: 'price_intel_derivation',
    });
  }

  const reasons: DealQualificationReasonCode[] = invalidOriginalEvidence
    ? ['invalid_price_evidence', 'catalog_only', 'missing_discount_evidence']
    : current != null && original == null
      ? ['catalog_only', 'missing_original_price', 'missing_discount_evidence']
      : ['catalog_only', 'missing_discount_evidence'];

  return result({
    qualification: 'NO_VERIFIED_DEAL',
    reasons,
    signals: buildSignals({
      hasExplicitDiscount: false,
      hasOriginalPrice: false,
      promotionKind: null,
      promotionBound: false,
      hasSavings: false,
      priceEvidence: current != null ? 'explicit' : 'none',
      promotionEvidence: 'none',
      quality: 'low',
    }),
    currentPrice: current,
    originalPrice: null,
    derivedDiscountPercent: null,
    currentPriceProvenance,
    originalPriceProvenance: 'unknown',
    discountPercentProvenance: 'unknown',
  });
}
