/**
 * Observational discount taxonomy v2 — does NOT replace productive minDiscount gate.
 * UNKNOWN ≠ rejected. UNKNOWN = insufficient evidence to determine discount.
 */

/** Shadow threshold for REAL_GOOD (independent of productive minDiscount, often 20%). */
export const SHADOW_REAL_GOOD_MIN_PCT = 25;

export const DISCOUNT_CLASSES = [
  'DISCOUNT_REAL_GOOD',
  'DISCOUNT_REAL_LOW',
  'DISCOUNT_UNKNOWN',
  'DISCOUNT_INVALID',
  'DISCOUNT_MISSING_PRICE',
] as const;

export type DiscountClass = (typeof DISCOUNT_CLASSES)[number];

/** Legacy v1 labels (kept for A/C dual-label comparison only). */
export const DISCOUNT_CLASSES_V1 = [
  'PARSE_ERROR',
  'UNKNOWN_DISCOUNT',
  'REAL_0_DISCOUNT',
  'LOW_DISCOUNT',
  'OK_ABOVE_MIN',
] as const;

export type DiscountClassV1 = (typeof DISCOUNT_CLASSES_V1)[number];

export type DiscountConfidence = 'high' | 'medium' | 'low' | 'none';

export type DiscountSource =
  | 'listing_card'
  | 'source_explicit'
  | 'badge_reconstructed'
  | 'computed'
  | 'declared'
  | 'none'
  | 'unknown';

export type DiscountEvidenceLevel =
  | 'sufficient'
  | 'insufficient'
  | 'contradictory'
  | 'none';

export type DiscountClassification = {
  discountClass: DiscountClass;
  /** v1 label for dual comparison (observation only). */
  discountClassV1: DiscountClassV1;
  discountConfidence: DiscountConfidence;
  discountSource: DiscountSource;
  historicalPriceConfidence: DiscountConfidence;
  priceEvidence: {
    currentPriceAvailable: boolean;
    originalPriceAvailable: boolean;
    historicalPriceAvailable: boolean;
    discountEvidence: DiscountEvidenceLevel;
    computedPct: number | null;
    declaredPct: number | null;
    path: string;
  };
};

export type ClassifyDiscountInput = {
  salePrice: number | null | undefined;
  originalPrice: number | null | undefined;
  discountPct?: number | null | undefined;
  /** Productive min discount (read-only; used only for v1 dual-label). */
  minDiscountPercent?: number;
  /** Shadow REAL_GOOD threshold; default 25. */
  realGoodMinPercent?: number;
  originalPriceProvenance?: string | null;
  cardDiscountSource?: string | null;
  historicalPrice?: number | null;
  historicalPriceConfidence?: DiscountConfidence | null;
  /** Price Intel: when true, reported % cannot be REAL_GOOD. */
  suspectedArtificialListPrice?: boolean | null;
  /** Verified/effective discount; 0 with reported>0 → UNKNOWN (not REAL_GOOD). */
  effectiveDiscountPercent?: number | null;
};

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function resolveSource(input: ClassifyDiscountInput): DiscountSource {
  const prov = (input.originalPriceProvenance ?? '').trim().toLowerCase();
  const card = (input.cardDiscountSource ?? '').trim().toLowerCase();
  if (prov === 'listing_card') return 'listing_card';
  if (prov === 'source_explicit') return 'source_explicit';
  if (card === 'badge_reconstructed') return 'badge_reconstructed';
  if (card === 'card_strikethrough' || card === 'pdp') return 'listing_card';
  if (input.originalPrice != null && num(input.originalPrice) != null) return 'computed';
  if (input.discountPct != null && num(input.discountPct) != null) return 'declared';
  if (!prov && !card) return 'none';
  return 'unknown';
}

function historicalConfidence(input: ClassifyDiscountInput): DiscountConfidence {
  if (input.historicalPriceConfidence) return input.historicalPriceConfidence;
  const hist = num(input.historicalPrice);
  if (hist == null || hist <= 0) return 'none';
  const src = resolveSource(input);
  if (src === 'listing_card' || src === 'source_explicit') return 'high';
  if (src === 'computed' || src === 'declared') return 'medium';
  if (src === 'badge_reconstructed') return 'low';
  return 'low';
}

function discountConfidenceFor(
  cls: DiscountClass,
  src: DiscountSource,
  histConf: DiscountConfidence,
): DiscountConfidence {
  if (cls === 'DISCOUNT_MISSING_PRICE') return 'none';
  if (cls === 'DISCOUNT_UNKNOWN') return 'none';
  if (cls === 'DISCOUNT_INVALID') return 'low';
  if (src === 'listing_card' || src === 'source_explicit') return 'high';
  if (src === 'computed' || src === 'declared') {
    return histConf === 'high' ? 'high' : 'medium';
  }
  if (src === 'badge_reconstructed') return 'low';
  return 'low';
}

/**
 * Legacy v1 classifier — observation dual-label only.
 */
export function classifyDiscountClassV1(input: {
  salePrice: number | null | undefined;
  originalPrice: number | null | undefined;
  discountPct?: number | null | undefined;
  minDiscountPercent: number;
}): DiscountClassV1 {
  const sale = num(input.salePrice);
  const list = num(input.originalPrice);
  if (sale == null || sale <= 0) return 'PARSE_ERROR';

  let pct = num(input.discountPct);
  if (pct == null && list != null && list > 0) {
    pct = ((list - sale) / list) * 100;
  }

  if (list == null || list <= 0) return 'UNKNOWN_DISCOUNT';
  if (sale >= list || (pct != null && pct <= 0.5)) return 'REAL_0_DISCOUNT';

  const min = Number.isFinite(input.minDiscountPercent) ? input.minDiscountPercent : 20;
  if (pct != null && pct > 0 && pct <= min) return 'LOW_DISCOUNT';
  if (pct != null && pct > min) return 'OK_ABOVE_MIN';
  return 'UNKNOWN_DISCOUNT';
}

/**
 * Full v2 classification with evidence fields. Observation only.
 */
export function classifyDiscountEvidence(input: ClassifyDiscountInput): DiscountClassification {
  const sale = num(input.salePrice);
  const list = num(input.originalPrice);
  const declaredPct = num(input.discountPct);
  const hist = num(input.historicalPrice);
  const realGoodMin = Number.isFinite(input.realGoodMinPercent)
    ? Number(input.realGoodMinPercent)
    : SHADOW_REAL_GOOD_MIN_PCT;
  const minProd = Number.isFinite(input.minDiscountPercent)
    ? Number(input.minDiscountPercent)
    : 20;
  const src = resolveSource(input);
  const histConf = historicalConfidence(input);

  const v1 = classifyDiscountClassV1({
    salePrice: sale,
    originalPrice: list,
    discountPct: declaredPct,
    minDiscountPercent: minProd,
  });

  const baseEvidence = {
    currentPriceAvailable: sale != null && sale > 0,
    originalPriceAvailable: list != null && list > 0,
    historicalPriceAvailable: hist != null && hist > 0,
    declaredPct,
  };

  if (sale == null || sale <= 0) {
    return {
      discountClass: 'DISCOUNT_MISSING_PRICE',
      discountClassV1: v1,
      discountConfidence: 'none',
      discountSource: 'none',
      historicalPriceConfidence: histConf,
      priceEvidence: {
        ...baseEvidence,
        discountEvidence: 'none',
        computedPct: null,
        path: 'missing_current_price',
      },
    };
  }

  // Math / contradiction
  if (list != null && list > 0 && sale > list * 1.005) {
    return {
      discountClass: 'DISCOUNT_INVALID',
      discountClassV1: v1,
      discountConfidence: 'low',
      discountSource: src,
      historicalPriceConfidence: histConf,
      priceEvidence: {
        ...baseEvidence,
        discountEvidence: 'contradictory',
        computedPct: ((list - sale) / list) * 100,
        path: 'sale_above_original',
      },
    };
  }

  let computedPct: number | null = null;
  if (list != null && list > 0) {
    computedPct = ((list - sale) / list) * 100;
  }

  if (
    declaredPct != null &&
    computedPct != null &&
    Math.abs(declaredPct - computedPct) > 15
  ) {
    return {
      discountClass: 'DISCOUNT_INVALID',
      discountClassV1: v1,
      discountConfidence: 'low',
      discountSource: src,
      historicalPriceConfidence: histConf,
      priceEvidence: {
        ...baseEvidence,
        discountEvidence: 'contradictory',
        computedPct,
        path: 'declared_vs_computed_mismatch',
      },
    };
  }

  // No original / list → cannot determine discount (UNKNOWN, not reject)
  if (list == null || list <= 0) {
    // Declared pct alone without original is insufficient evidence
    return {
      discountClass: 'DISCOUNT_UNKNOWN',
      discountClassV1: v1,
      discountConfidence: 'none',
      discountSource: declaredPct != null ? 'declared' : src === 'none' ? 'none' : src,
      historicalPriceConfidence: histConf,
      priceEvidence: {
        ...baseEvidence,
        discountEvidence: 'insufficient',
        computedPct: null,
        path: 'missing_original_price',
      },
    };
  }

  // Untrusted badge reconstruction without other evidence → UNKNOWN
  if (src === 'badge_reconstructed' && (histConf === 'none' || histConf === 'low')) {
    const pct = computedPct ?? declaredPct;
    return {
      discountClass: 'DISCOUNT_UNKNOWN',
      discountClassV1: v1,
      discountConfidence: 'none',
      discountSource: src,
      historicalPriceConfidence: histConf,
      priceEvidence: {
        ...baseEvidence,
        discountEvidence: 'insufficient',
        computedPct: pct,
        path: 'untrusted_badge_reconstruction',
      },
    };
  }

  // Artificial list or effectiveDiscount≤0 with a reported claim → never REAL_GOOD.
  if (input.suspectedArtificialListPrice === true) {
    const pct = computedPct ?? declaredPct;
    return {
      discountClass: 'DISCOUNT_UNKNOWN',
      discountClassV1: v1,
      discountConfidence: 'none',
      discountSource: src,
      historicalPriceConfidence: histConf,
      priceEvidence: {
        ...baseEvidence,
        discountEvidence: 'contradictory',
        computedPct: pct,
        path: 'artificial_list_price_untrusted',
      },
    };
  }
  const effDisc = num(input.effectiveDiscountPercent);
  if (
    effDisc != null &&
    effDisc <= 0 &&
    (declaredPct != null && declaredPct > 0 || (computedPct != null && computedPct > 0))
  ) {
    return {
      discountClass: 'DISCOUNT_UNKNOWN',
      discountClassV1: v1,
      discountConfidence: 'none',
      discountSource: src,
      historicalPriceConfidence: histConf,
      priceEvidence: {
        ...baseEvidence,
        discountEvidence: 'contradictory',
        computedPct: computedPct ?? declaredPct,
        path: 'effective_discount_zero_vs_reported',
      },
    };
  }

  const pct = computedPct ?? declaredPct;
  if (pct == null || !Number.isFinite(pct)) {
    return {
      discountClass: 'DISCOUNT_UNKNOWN',
      discountClassV1: v1,
      discountConfidence: 'none',
      discountSource: src,
      historicalPriceConfidence: histConf,
      priceEvidence: {
        ...baseEvidence,
        discountEvidence: 'insufficient',
        computedPct: null,
        path: 'discount_not_computable',
      },
    };
  }

  // Sufficient evidence of a real discount figure
  if (pct >= realGoodMin) {
    const cls: DiscountClass = 'DISCOUNT_REAL_GOOD';
    return {
      discountClass: cls,
      discountClassV1: v1,
      discountConfidence: discountConfidenceFor(cls, src, histConf),
      discountSource: src,
      historicalPriceConfidence: histConf,
      priceEvidence: {
        ...baseEvidence,
        discountEvidence: 'sufficient',
        computedPct: pct,
        path: 'real_discount_above_shadow_min',
      },
    };
  }

  const cls: DiscountClass = 'DISCOUNT_REAL_LOW';
  return {
    discountClass: cls,
    discountClassV1: v1,
    discountConfidence: discountConfidenceFor(cls, src, histConf),
    discountSource: src,
    historicalPriceConfidence: histConf,
    priceEvidence: {
      ...baseEvidence,
      discountEvidence: 'sufficient',
      computedPct: pct,
      path: pct <= 0.5 ? 'real_discount_near_zero' : 'real_discount_below_shadow_min',
    },
  };
}

/** Convenience: class only. */
export function classifyDiscountClass(input: ClassifyDiscountInput): DiscountClass {
  return classifyDiscountEvidence(input).discountClass;
}
