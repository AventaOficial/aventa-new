/**
 * Canonical discount truth — single calculation path for ingest/CI.
 *
 * Rules (P0):
 * - Never invent original_price.
 * - If sale + original are valid: discount = (original - sale) / original * 100.
 * - Never use discountPercentage=0 to mean UNKNOWN (use null + status unknown).
 * - Conflicts between supplied % and price-implied % are explicit, not silent.
 * - Does NOT change acceptance thresholds / topK / diversity / money path.
 */

import type { DiscountClass } from '@/lib/hunter/candidateIntelligence/discountClass';
import {
  SHADOW_REAL_GOOD_MIN_PCT,
  classifyDiscountEvidence,
} from '@/lib/hunter/candidateIntelligence/discountClass';

export const CANONICAL_DISCOUNT_VERSION = 'canonical_discount_v1' as const;

/** Absolute %-point tolerance when comparing supplied vs computed (30 vs 29.8 → ok). */
export const SUPPLIED_COMPUTED_TOLERANCE_PP = 1;

export type CanonicalDiscountSource =
  | 'computed_from_prices'
  | 'supplied_by_source'
  | 'historical'
  | 'unknown';

export type CanonicalDiscountConfidence = 'high' | 'medium' | 'low' | 'none';

export type CanonicalCalculationStatus =
  | 'ok'
  | 'valid_zero'
  | 'unknown'
  | 'conflict'
  | 'invalid';

export type CanonicalDiscountEvidence = {
  salePrice: number | null;
  originalPrice: number | null;
  suppliedDiscountPercentage: number | null;
  computedDiscountPercentage: number | null;
  delta: number | null;
  reasonForDiscrepancy: string | null;
};

export type CanonicalDiscountResult = {
  /** Truth for gates/CI. null = UNKNOWN (never encode unknown as 0). */
  discountPercentage: number | null;
  discountClass: DiscountClass;
  confidence: CanonicalDiscountConfidence;
  source: CanonicalDiscountSource;
  calculationStatus: CanonicalCalculationStatus;
  evidence: CanonicalDiscountEvidence;
  /** Legacy v1 dual-label (observation). */
  discountClassV1?: string;
};

export type CanonicalDiscountInput = {
  salePrice: number | null | undefined;
  originalPrice: number | null | undefined;
  /** Caller-supplied % (worker badge, card, etc.). May be wrong. */
  suppliedDiscountPercentage?: number | null | undefined;
  /** Optional historical reference price (not invented). */
  historicalPrice?: number | null | undefined;
  /** Shadow REAL_GOOD threshold (default 25). Does not change productive min. */
  realGoodMinPercent?: number;
  /** Productive min — dual-label only. */
  minDiscountPercent?: number;
  originalPriceProvenance?: string | null;
  cardDiscountSource?: string | null;
};

export type DiscountTruthShadowRecord = {
  existingDiscountPercentage: number | null;
  computedDiscountPercentage: number | null;
  delta: number | null;
  discountClassBefore: string | null;
  discountClassAfter: DiscountClass;
  discountSource: CanonicalDiscountSource;
  confidence: CanonicalDiscountConfidence;
  salePrice: number | null;
  originalPrice: number | null;
  reasonForDiscrepancy: string | null;
  calculationStatus: CanonicalCalculationStatus;
  falseZero: boolean;
};

export type DiscountTruthMetrics = {
  discount_false_zero_count: number;
  discount_unknown_count: number;
  discount_real_low_count: number;
  discount_real_good_count: number;
  discount_conflict_count: number;
  discount_invalid_count: number;
  discount_valid_zero_count: number;
  computed_from_price_rate: number | null;
  samples: number;
};

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Project monetary habit: 2 decimal places for price comparisons. */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Integer percent — same habit as ingest adapters (Math.round). */
export function roundDiscountPercent(n: number): number {
  return Math.round(n);
}

function computeFromPrices(sale: number, original: number): number {
  return roundDiscountPercent((1 - sale / original) * 100);
}

/**
 * Resolve canonical discount truth from prices (+ optional supplied %).
 */
export function resolveCanonicalDiscount(input: CanonicalDiscountInput): CanonicalDiscountResult {
  const sale = num(input.salePrice);
  const original = num(input.originalPrice);
  const supplied = num(input.suppliedDiscountPercentage);
  const historical = num(input.historicalPrice);
  const realGoodMin = Number.isFinite(input.realGoodMinPercent)
    ? Number(input.realGoodMinPercent)
    : SHADOW_REAL_GOOD_MIN_PCT;

  const baseEvidence = (
    computed: number | null,
    delta: number | null,
    reason: string | null,
  ): CanonicalDiscountEvidence => ({
    salePrice: sale,
    originalPrice: original,
    suppliedDiscountPercentage: supplied,
    computedDiscountPercentage: computed,
    delta,
    reasonForDiscrepancy: reason,
  });

  // Malformed / missing sale
  if (sale == null || sale <= 0 || Number.isNaN(sale)) {
    const classified = classifyDiscountEvidence({
      salePrice: sale,
      originalPrice: original,
      discountPct: supplied,
      realGoodMinPercent: realGoodMin,
      minDiscountPercent: input.minDiscountPercent,
      originalPriceProvenance: input.originalPriceProvenance,
      cardDiscountSource: input.cardDiscountSource,
      historicalPrice: historical,
    });
    return {
      discountPercentage: null,
      discountClass: 'DISCOUNT_MISSING_PRICE',
      confidence: 'none',
      source: 'unknown',
      calculationStatus: sale != null && sale < 0 ? 'invalid' : 'unknown',
      evidence: baseEvidence(null, null, 'missing_or_invalid_sale_price'),
      discountClassV1: classified.discountClassV1,
    };
  }

  // No original → UNKNOWN (not 0)
  if (original == null || original <= 0) {
    const classified = classifyDiscountEvidence({
      salePrice: sale,
      originalPrice: null,
      discountPct: supplied,
      realGoodMinPercent: realGoodMin,
      minDiscountPercent: input.minDiscountPercent,
      originalPriceProvenance: input.originalPriceProvenance,
      cardDiscountSource: input.cardDiscountSource,
      historicalPrice: historical,
    });
    return {
      discountPercentage: null,
      discountClass: 'DISCOUNT_UNKNOWN',
      confidence: 'none',
      source: 'unknown',
      calculationStatus: 'unknown',
      evidence: baseEvidence(null, null, 'missing_original_price'),
      discountClassV1: classified.discountClassV1,
    };
  }

  const saleM = roundMoney(sale);
  const originalM = roundMoney(original);

  // Inverted prices
  if (saleM > originalM) {
    const classified = classifyDiscountEvidence({
      salePrice: saleM,
      originalPrice: originalM,
      discountPct: supplied,
      realGoodMinPercent: realGoodMin,
      minDiscountPercent: input.minDiscountPercent,
    });
    return {
      discountPercentage: null,
      discountClass: 'DISCOUNT_INVALID',
      confidence: 'low',
      source: 'computed_from_prices',
      calculationStatus: 'invalid',
      evidence: baseEvidence(computeFromPrices(saleM, originalM), null, 'sale_above_original'),
      discountClassV1: classified.discountClassV1,
    };
  }

  const computed = computeFromPrices(saleM, originalM);
  const delta = supplied != null ? roundDiscountPercent(supplied) - computed : null;

  // Conflict: supplied disagrees beyond tolerance (e.g. supplied 0, prices → 65)
  if (
    supplied != null &&
    Math.abs(supplied - computed) > SUPPLIED_COMPUTED_TOLERANCE_PP
  ) {
    const classified = classifyDiscountEvidence({
      salePrice: saleM,
      originalPrice: originalM,
      discountPct: computed,
      realGoodMinPercent: realGoodMin,
      minDiscountPercent: input.minDiscountPercent,
      originalPriceProvenance: input.originalPriceProvenance,
      cardDiscountSource: input.cardDiscountSource,
      historicalPrice: historical,
    });
    return {
      // Prices win as truth; conflict is explicit
      discountPercentage: computed,
      discountClass: classified.discountClass,
      confidence: 'medium',
      source: 'computed_from_prices',
      calculationStatus: 'conflict',
      evidence: baseEvidence(
        computed,
        delta,
        `supplied_${roundDiscountPercent(supplied)}_vs_computed_${computed}`,
      ),
      discountClassV1: classified.discountClassV1,
    };
  }

  // Valid zero (sale ≈ original)
  if (computed <= 0) {
    const classified = classifyDiscountEvidence({
      salePrice: saleM,
      originalPrice: originalM,
      discountPct: 0,
      realGoodMinPercent: realGoodMin,
      minDiscountPercent: input.minDiscountPercent,
      originalPriceProvenance: input.originalPriceProvenance,
      cardDiscountSource: input.cardDiscountSource,
    });
    return {
      discountPercentage: 0,
      discountClass: classified.discountClass,
      confidence:
        input.originalPriceProvenance === 'listing_card' ||
        input.originalPriceProvenance === 'source_explicit'
          ? 'high'
          : 'medium',
      source: 'computed_from_prices',
      calculationStatus: 'valid_zero',
      evidence: baseEvidence(0, delta, null),
      discountClassV1: classified.discountClassV1,
    };
  }

  // Aligned supplied or no supplied → prices are source of truth
  // Within tolerance: prefer supplied when present (card label stability).
  const classified = classifyDiscountEvidence({
    salePrice: saleM,
    originalPrice: originalM,
    discountPct: computed,
    realGoodMinPercent: realGoodMin,
    minDiscountPercent: input.minDiscountPercent,
    originalPriceProvenance: input.originalPriceProvenance,
    cardDiscountSource: input.cardDiscountSource,
    historicalPrice: historical,
  });

  const withinTolerance =
    supplied != null && Math.abs(supplied - computed) <= SUPPLIED_COMPUTED_TOLERANCE_PP;

  if (withinTolerance) {
    const pct = roundDiscountPercent(supplied!);
    const classifiedSupplied = classifyDiscountEvidence({
      salePrice: saleM,
      originalPrice: originalM,
      discountPct: pct,
      realGoodMinPercent: realGoodMin,
      minDiscountPercent: input.minDiscountPercent,
      originalPriceProvenance: input.originalPriceProvenance,
      cardDiscountSource: input.cardDiscountSource,
      historicalPrice: historical,
    });
    return {
      discountPercentage: pct,
      discountClass: classifiedSupplied.discountClass,
      confidence: classifiedSupplied.discountConfidence,
      source: 'supplied_by_source',
      calculationStatus: pct <= 0 ? 'valid_zero' : 'ok',
      evidence: baseEvidence(computed, delta, null),
      discountClassV1: classifiedSupplied.discountClassV1,
    };
  }

  return {
    discountPercentage: computed,
    discountClass: classified.discountClass,
    confidence: classified.discountConfidence,
    source: 'computed_from_prices',
    calculationStatus: 'ok',
    evidence: baseEvidence(computed, delta, null),
    discountClassV1: classified.discountClassV1,
  };
}

/**
 * For ParsedOfferMetadata / CI: returns null when UNKNOWN or INVALID.
 * NEVER returns 0 for unknown — 0 only when calculationStatus is valid_zero / ok with 0%.
 */
export function discountPercentForLegacyMeta(
  result: CanonicalDiscountResult,
): number | null {
  if (result.calculationStatus === 'unknown' || result.calculationStatus === 'invalid') {
    return null;
  }
  return result.discountPercentage;
}

/**
 * @deprecated Prefer null-capable consumers. Only for external contracts that
 * refuse null AND already gate on missing original first.
 *
 * Maps UNKNOWN/INVALID → 0 ONLY as a named legacy bridge (not silent ?? 0).
 * Document every call site. Do not use for Candidate Intelligence.
 */
export function toLegacyMetaDiscountPercent(result: CanonicalDiscountResult): number {
  const truth = discountPercentForLegacyMeta(result);
  if (truth != null) return truth;
  // Named bridge — NOT semantic truth. Callers must have already rejected missing original.
  return 0;
}

/** True when meta encodes FALSE_ZERO (0% stored but prices imply ≥ shadow good). */
export function isFalseZeroDiscount(input: {
  salePrice: number | null | undefined;
  originalPrice: number | null | undefined;
  discountPercent: number | null | undefined;
}): boolean {
  const sale = num(input.salePrice);
  const original = num(input.originalPrice);
  const pct = num(input.discountPercent);
  if (sale == null || original == null || sale <= 0 || original <= sale) return false;
  if (pct == null || pct !== 0) return false;
  const computed = computeFromPrices(roundMoney(sale), roundMoney(original));
  return computed >= SHADOW_REAL_GOOD_MIN_PCT;
}

/** @deprecated use isFalseZeroDiscount */
export function assertNotFalseZero(input: {
  salePrice: number | null | undefined;
  originalPrice: number | null | undefined;
  discountPercent: number | null | undefined;
}): boolean {
  return isFalseZeroDiscount(input);
}

/**
 * Hard invariant after canonical apply. Throws in test / when AVENTA_ASSERT_DISCOUNT_TRUTH=1.
 */
export function assertDiscountTruthInvariant(input: {
  salePrice: number | null | undefined;
  originalPrice: number | null | undefined;
  discountPercent: number | null | undefined;
  context?: string;
}): void {
  if (!isFalseZeroDiscount(input)) return;
  const sale = num(input.salePrice)!;
  const original = num(input.originalPrice)!;
  const computed = computeFromPrices(roundMoney(sale), roundMoney(original));
  const msg = `[discount_truth] FALSE_ZERO${input.context ? ` @ ${input.context}` : ''}: discountPercent=0 but prices imply ${computed}% (sale=${sale}, original=${original})`;
  if (process.env.NODE_ENV === 'test' || process.env.AVENTA_ASSERT_DISCOUNT_TRUTH === '1') {
    throw new Error(msg);
  }
  console.warn(msg);
}

/**
 * Gate helper: resolve card discount for threshold checks without inventing %.
 * Returns null when UNKNOWN (caller applies existing missing-original / unknown policy).
 */
export function cardDiscountForGate(meta: {
  discountPrice: number;
  originalPrice: number | null;
  discountPercent: number | null | undefined;
}): number | null {
  const truth = resolveCanonicalDiscount({
    salePrice: meta.discountPrice,
    originalPrice: meta.originalPrice,
    suppliedDiscountPercentage: meta.discountPercent,
  });
  return truth.discountPercentage;
}

export function buildDiscountTruthShadow(input: {
  before: {
    discountPercentage?: number | null;
    discountClass?: string | null;
  };
  after: CanonicalDiscountResult;
}): DiscountTruthShadowRecord {
  const existing = num(input.before.discountPercentage);
  const computed = input.after.evidence.computedDiscountPercentage;
  const falseZero =
    existing === 0 &&
    computed != null &&
    computed >= SHADOW_REAL_GOOD_MIN_PCT;

  return {
    existingDiscountPercentage: existing,
    computedDiscountPercentage: computed,
    delta: input.after.evidence.delta,
    discountClassBefore: input.before.discountClass ?? null,
    discountClassAfter: input.after.discountClass,
    discountSource: input.after.source,
    confidence: input.after.confidence,
    salePrice: input.after.evidence.salePrice,
    originalPrice: input.after.evidence.originalPrice,
    reasonForDiscrepancy: input.after.evidence.reasonForDiscrepancy,
    calculationStatus: input.after.calculationStatus,
    falseZero,
  };
}

/** Process-local shadow counters (observation only). */
const metrics: DiscountTruthMetrics = {
  discount_false_zero_count: 0,
  discount_unknown_count: 0,
  discount_real_low_count: 0,
  discount_real_good_count: 0,
  discount_conflict_count: 0,
  discount_invalid_count: 0,
  discount_valid_zero_count: 0,
  computed_from_price_rate: null,
  samples: 0,
};

let computedFromPrices = 0;

export function recordDiscountTruthShadow(shadow: DiscountTruthShadowRecord): void {
  metrics.samples += 1;
  if (shadow.falseZero) metrics.discount_false_zero_count += 1;
  if (shadow.calculationStatus === 'conflict') metrics.discount_conflict_count += 1;
  if (shadow.calculationStatus === 'valid_zero') metrics.discount_valid_zero_count += 1;
  if (shadow.calculationStatus === 'invalid') metrics.discount_invalid_count += 1;
  if (shadow.discountSource === 'computed_from_prices') computedFromPrices += 1;

  switch (shadow.discountClassAfter) {
    case 'DISCOUNT_UNKNOWN':
    case 'DISCOUNT_MISSING_PRICE':
      metrics.discount_unknown_count += 1;
      break;
    case 'DISCOUNT_REAL_LOW':
      metrics.discount_real_low_count += 1;
      break;
    case 'DISCOUNT_REAL_GOOD':
      metrics.discount_real_good_count += 1;
      break;
    default:
      break;
  }
  metrics.computed_from_price_rate =
    metrics.samples > 0 ? Math.round((computedFromPrices / metrics.samples) * 1000) / 10 : null;
}

export function getDiscountTruthMetrics(): DiscountTruthMetrics {
  return { ...metrics };
}

export function resetDiscountTruthMetrics(): void {
  metrics.discount_false_zero_count = 0;
  metrics.discount_unknown_count = 0;
  metrics.discount_real_low_count = 0;
  metrics.discount_real_good_count = 0;
  metrics.discount_conflict_count = 0;
  metrics.discount_invalid_count = 0;
  metrics.discount_valid_zero_count = 0;
  metrics.computed_from_price_rate = null;
  metrics.samples = 0;
  computedFromPrices = 0;
}

/**
 * Apply canonical truth onto a ParsedOfferMetadata-shaped object.
 * When unknown/invalid: discountPercent stays unset via null return — caller must not force 0.
 */
export function applyCanonicalDiscountToMetaFields(input: {
  salePrice: number;
  originalPrice: number | null;
  existingDiscountPercent?: number | null;
  existingDiscountClass?: string | null;
  originalPriceProvenance?: string | null;
  cardDiscountSource?: string | null;
  /** Cap only for absurd supplied values after truth resolved (worker max). */
  maxPercentCap?: number;
  recordShadow?: boolean;
}): {
  discountPercent: number | null;
  originalPrice: number | null;
  canonical: CanonicalDiscountResult;
  shadow: DiscountTruthShadowRecord;
} {
  const canonical = resolveCanonicalDiscount({
    salePrice: input.salePrice,
    originalPrice: input.originalPrice,
    suppliedDiscountPercentage: input.existingDiscountPercent,
    originalPriceProvenance: input.originalPriceProvenance,
    cardDiscountSource: input.cardDiscountSource,
  });

  const shadow = buildDiscountTruthShadow({
    before: {
      discountPercentage: input.existingDiscountPercent ?? null,
      discountClass: input.existingDiscountClass ?? null,
    },
    after: canonical,
  });

  if (input.recordShadow !== false) {
    recordDiscountTruthShadow(shadow);
  }

  let pct = discountPercentForLegacyMeta(canonical);
  if (pct != null && input.maxPercentCap != null && Number.isFinite(input.maxPercentCap)) {
    pct = Math.max(0, Math.min(input.maxPercentCap, pct));
  }

  return {
    discountPercent: pct,
    originalPrice: input.originalPrice,
    canonical,
    shadow,
  };
}

/** Apply canonical result onto meta and assert no FALSE_ZERO. */
export function applyCanonicalToParsedMeta(
  meta: {
    discountPrice: number;
    originalPrice: number | null;
    discountPercent: number | null;
    signals?: Record<string, unknown>;
  },
  opts?: {
    maxPercentCap?: number;
    recordShadow?: boolean;
    context?: string;
  },
): { discountPercent: number | null; signals: Record<string, unknown>; canonical: CanonicalDiscountResult } {
  const applied = applyCanonicalDiscountToMetaFields({
    salePrice: meta.discountPrice,
    originalPrice: meta.originalPrice,
    existingDiscountPercent: meta.discountPercent,
    originalPriceProvenance:
      typeof meta.signals?.originalPriceProvenance === 'string'
        ? meta.signals.originalPriceProvenance
        : null,
    cardDiscountSource:
      typeof meta.signals?.cardDiscountSource === 'string'
        ? meta.signals.cardDiscountSource
        : null,
    maxPercentCap: opts?.maxPercentCap,
    recordShadow: opts?.recordShadow,
  });
  assertDiscountTruthInvariant({
    salePrice: meta.discountPrice,
    originalPrice: meta.originalPrice,
    discountPercent: applied.discountPercent,
    context: opts?.context,
  });
  const signals: Record<string, unknown> = {
    ...(meta.signals ?? {}),
    discountCalculationStatus: applied.canonical.calculationStatus,
    discountTruthSource: applied.canonical.source,
    discountTruthConfidence: applied.canonical.confidence,
    ...(applied.shadow.falseZero ? { discountFalseZeroCorrected: true } : {}),
    ...(applied.canonical.calculationStatus === 'conflict'
      ? {
          discountConflict: {
            supplied: applied.canonical.evidence.suppliedDiscountPercentage,
            computed: applied.canonical.evidence.computedDiscountPercentage,
            delta: applied.canonical.evidence.delta,
            reason: applied.canonical.evidence.reasonForDiscrepancy,
          },
        }
      : {}),
  };
  return {
    discountPercent: applied.discountPercent,
    signals,
    canonical: applied.canonical,
  };
}
