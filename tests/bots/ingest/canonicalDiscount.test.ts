/**
 * P0 Canonical Discount Truth — real FALSE_ZERO cases + contract tests.
 * Does not change acceptance threshold / topK / diversity / money path.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertNotFalseZero,
  buildDiscountTruthShadow,
  getDiscountTruthMetrics,
  recordDiscountTruthShadow,
  resetDiscountTruthMetrics,
  resolveCanonicalDiscount,
  SUPPLIED_COMPUTED_TOLERANCE_PP,
} from '@/lib/bots/ingest/canonicalDiscount';
import { toParsedMeta } from '@/lib/bots/ingest/externalWorker';
import { normalizeMlWorkerListing } from '@/lib/supplyIntelligence/adapters/mlWorkerListingAdapter';
import { buildHunterCandidateRecord } from '@/lib/hunter/candidateIntelligence/buildCandidateRecord';
import { applyMlPriceIntelToMeta } from '@/lib/bots/ingest/priceIntel';

describe('resolveCanonicalDiscount — real cases', () => {
  beforeEach(() => resetDiscountTruthMetrics());
  afterEach(() => resetDiscountTruthMetrics());

  it('1. 699 → 1999 ≈ 65%', () => {
    const r = resolveCanonicalDiscount({ salePrice: 699, originalPrice: 1999 });
    expect(r.discountPercentage).toBe(65);
    expect(r.discountClass).toBe('DISCOUNT_REAL_GOOD');
    expect(r.calculationStatus).toBe('ok');
    expect(r.source).toBe('computed_from_prices');
  });

  it('2. 100 → 110 ≈ 9% REAL_LOW', () => {
    const r = resolveCanonicalDiscount({ salePrice: 100, originalPrice: 110 });
    expect(r.discountPercentage).toBe(9);
    expect(r.discountClass).toBe('DISCOUNT_REAL_LOW');
  });

  it('3. 100 → 100 = valid zero', () => {
    const r = resolveCanonicalDiscount({ salePrice: 100, originalPrice: 100 });
    expect(r.discountPercentage).toBe(0);
    expect(r.calculationStatus).toBe('valid_zero');
    expect(r.discountClass).toBe('DISCOUNT_REAL_LOW');
  });

  it('4. sale without original = UNKNOWN (null, not 0)', () => {
    const r = resolveCanonicalDiscount({ salePrice: 150, originalPrice: null });
    expect(r.discountPercentage).toBeNull();
    expect(r.discountClass).toBe('DISCOUNT_UNKNOWN');
    expect(r.calculationStatus).toBe('unknown');
  });

  it('5. invalid original (<=0) = UNKNOWN', () => {
    const r = resolveCanonicalDiscount({ salePrice: 100, originalPrice: 0 });
    expect(r.discountPercentage).toBeNull();
    expect(r.discountClass).toBe('DISCOUNT_UNKNOWN');
  });

  it('6. supplied 0 + prices imply 65% = conflict, prices win', () => {
    const r = resolveCanonicalDiscount({
      salePrice: 699,
      originalPrice: 1999,
      suppliedDiscountPercentage: 0,
    });
    expect(r.calculationStatus).toBe('conflict');
    expect(r.discountPercentage).toBe(65);
    expect(r.discountClass).toBe('DISCOUNT_REAL_GOOD');
    expect(r.evidence.reasonForDiscrepancy).toMatch(/supplied_0_vs_computed_65/);
    expect(assertNotFalseZero({ salePrice: 699, originalPrice: 1999, discountPercent: 0 })).toBe(
      true,
    );
  });

  it('7. supplied 30 + prices ~29.8 → tolerancia (status ok, keep supplied)', () => {
    const r = resolveCanonicalDiscount({
      salePrice: 70.2,
      originalPrice: 100,
      suppliedDiscountPercentage: 30,
    });
    expect(r.evidence.computedDiscountPercentage).toBe(30); // round(29.8)=30
    expect(r.calculationStatus).toBe('ok');
    expect(r.discountPercentage).toBe(30);
    expect(r.source).toBe('supplied_by_source');
  });

  it('7b. supplied 54 + prices imply 53 → within 1pp tolerance keeps supplied', () => {
    // 460/1000 = 54%; craft 470/1000 = 53%
    const r = resolveCanonicalDiscount({
      salePrice: 470,
      originalPrice: 1000,
      suppliedDiscountPercentage: 54,
    });
    expect(r.evidence.computedDiscountPercentage).toBe(53);
    expect(r.calculationStatus).toBe('ok');
    expect(r.discountPercentage).toBe(54);
    expect(r.source).toBe('supplied_by_source');
  });

  it('8. supplied 0 + prices imply 0 = valid zero', () => {
    const r = resolveCanonicalDiscount({
      salePrice: 100,
      originalPrice: 100,
      suppliedDiscountPercentage: 0,
    });
    expect(r.calculationStatus).toBe('valid_zero');
    expect(r.discountPercentage).toBe(0);
  });

  it('9. inverted prices = INVALID', () => {
    const r = resolveCanonicalDiscount({ salePrice: 120, originalPrice: 100 });
    expect(r.calculationStatus).toBe('invalid');
    expect(r.discountClass).toBe('DISCOUNT_INVALID');
    expect(r.discountPercentage).toBeNull();
  });

  it('10. null/NaN/malformed = UNKNOWN or MISSING', () => {
    expect(resolveCanonicalDiscount({ salePrice: null, originalPrice: 100 }).discountClass).toBe(
      'DISCOUNT_MISSING_PRICE',
    );
    expect(resolveCanonicalDiscount({ salePrice: Number.NaN, originalPrice: 100 }).discountClass).toBe(
      'DISCOUNT_MISSING_PRICE',
    );
    expect(
      resolveCanonicalDiscount({ salePrice: 'nope' as unknown as number, originalPrice: 100 })
        .discountClass,
    ).toBe('DISCOUNT_MISSING_PRICE');
  });
});

describe('birth-point wiring — ml_worker / toParsedMeta', () => {
  it('toParsedMeta: FALSE_ZERO supplied 0 corrected from prices', () => {
    const meta = toParsedMeta({
      url: 'https://www.mercadolibre.com.mx/x/p/MLM1234567890',
      canonicalUrl: 'https://www.mercadolibre.com.mx/x/p/MLM1234567890',
      title: 'Freidora SIGNA 5L',
      store: 'Mercado Libre',
      imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X.jpg',
      discountPrice: 699,
      originalPrice: 1999,
      discountPercent: 0,
      cardDiscountSource: 'badge_reconstructed',
    });
    expect(meta).not.toBeNull();
    expect(meta!.discountPercent).toBe(65);
    expect(meta!.signals?.discountCalculationStatus).toBe('conflict');
    expect(meta!.signals?.discountFalseZeroCorrected).toBe(true);
  });

  it('mlWorkerListingAdapter: same FALSE_ZERO fix', () => {
    const adapted = normalizeMlWorkerListing({
      url: 'https://www.mercadolibre.com.mx/x/p/MLM1234567890',
      canonicalUrl: 'https://www.mercadolibre.com.mx/x/p/MLM1234567890',
      title: 'Freidora SIGNA 5L',
      store: 'Mercado Libre',
      imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X.jpg',
      discountPrice: 699,
      originalPrice: 1999,
      discountPercent: 0,
    });
    expect(adapted.ok).toBe(true);
    if (!adapted.ok) return;
    expect(adapted.value.meta.discountPercent).toBe(65);
  });
});

describe('candidate intelligence persistence — null not false 0', () => {
  it('UNKNOWN persists discountPercentage null', () => {
    const rec = buildHunterCandidateRecord({
      runId: 'run-truth',
      url: 'https://www.mercadolibre.com.mx/x/p/MLM999',
      source: 'ml_api',
      status: 'skipped',
      reason: 'sin precio original verificable',
      meta: {
        canonicalUrl: 'https://www.mercadolibre.com.mx/x/p/MLM999',
        title: 'Producto sin original',
        store: 'Mercado Libre',
        imageUrl: '',
        discountPrice: 150,
        originalPrice: null,
        discountPercent: 0,
      },
    });
    expect(rec.discountPercentage).toBeNull();
    expect(rec.salePrice).toBe(150);
  });

  it('FALSE_ZERO meta persists computed %, not 0', () => {
    const rec = buildHunterCandidateRecord({
      runId: 'run-truth',
      url: 'https://www.mercadolibre.com.mx/x/p/MLM888',
      source: 'ml_api',
      status: 'skipped',
      reason: 'descuento 0% < mínimo 25%',
      meta: {
        canonicalUrl: 'https://www.mercadolibre.com.mx/x/p/MLM888',
        title: 'Smart TV',
        store: 'Mercado Libre',
        imageUrl: '',
        discountPrice: 699,
        originalPrice: 1999,
        discountPercent: 0,
      },
    });
    expect(rec.discountPercentage).toBe(65);
  });
});

describe('shadow metrics', () => {
  beforeEach(() => resetDiscountTruthMetrics());

  it('records FALSE_ZERO and conflict', () => {
    const after = resolveCanonicalDiscount({
      salePrice: 699,
      originalPrice: 1999,
      suppliedDiscountPercentage: 0,
    });
    const shadow = buildDiscountTruthShadow({
      before: { discountPercentage: 0, discountClass: null },
      after,
    });
    expect(shadow.falseZero).toBe(true);
    recordDiscountTruthShadow(shadow);
    const m = getDiscountTruthMetrics();
    expect(m.discount_false_zero_count).toBe(1);
    expect(m.discount_conflict_count).toBe(1);
    expect(m.discount_real_good_count).toBe(1);
  });
});

describe('priceIntel FALSE_ZERO regression', () => {
  it('effective=0 does not create gate-facing 0 when list implies discount', () => {
    const out = applyMlPriceIntelToMeta(
      {
        canonicalUrl: 'https://www.mercadolibre.com.mx/x/p/MLM1',
        title: 'TV',
        store: 'Mercado Libre',
        imageUrl: 'https://http2.mlstatic.com/x.jpg',
        discountPrice: 699,
        originalPrice: 1999,
        discountPercent: 0,
      },
      {
        quote: { current: 699, listPrice: 1999, regularPrice: null },
        intel: {
          lowest30d: null,
          lowest90d: null,
          habitual30d: null,
          current: 699,
          listPrice: 1999,
          regularPrice: null,
          priceVsLowest90dPct: null,
          savingsVsHabitualPct: null,
          effectiveDiscountPercent: 0,
          suspectedArtificialListPrice: true,
          samples90d: 0,
          historyReady: false,
        },
      },
      { preserveLabelDiscount: false },
    );
    expect(out.discountPercent).toBe(65);
    expect(out.signals?.effectiveDiscountPercent).toBe(0);
  });
});
