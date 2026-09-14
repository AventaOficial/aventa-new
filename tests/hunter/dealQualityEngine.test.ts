import { describe, expect, it } from 'vitest';
import { qualifyCandidate } from '@/lib/hunter/dealQualification/qualifyCandidate';
import {
  evaluateDealQuality,
  evaluateExistingOfferQuality,
  DEAL_QUALITY_POLICY_V1,
} from '@/lib/hunter/dealQuality';
import type { DealQualityDecision } from '@/lib/hunter/dealQuality';

function assertExplanation(d: DealQualityDecision) {
  expect(d.reasons.length).toBeGreaterThan(0);
  expect(d.policyVersion).toBe(DEAL_QUALITY_POLICY_V1);
  expect(['high', 'medium', 'low']).toContain(d.confidence);
  expect(['PUBLISH_CANDIDATE', 'HUMAN_REVIEW', 'DISCARD', 'DUPLICATE']).toContain(
    d.recommendedAction,
  );
  expect(Array.isArray(d.positiveSignals)).toBe(true);
  expect(Array.isArray(d.negativeSignals)).toBe(true);
  expect(Array.isArray(d.missingEvidence)).toBe(true);
}

describe('Deal Quality Engine V1', () => {
  it('1. duplicate → DUPLICATE early exit', () => {
    const d = evaluateDealQuality({
      title: 'TV 55"',
      currentPrice: 5000,
      duplicate: { isDuplicate: true, kind: 'timeout_cooldown' },
    });
    expect(d.decision).toBe('DUPLICATE');
    expect(d.recommendedAction).toBe('DUPLICATE');
    expect(d.confidence).toBe('high');
    expect(d.negativeSignals).toContain('duplicate');
    assertExplanation(d);
  });

  it('2. valid product + price + no deal evidence → NO_VERIFIED_DEAL', () => {
    const q = qualifyCandidate({
      currentPrice: 999,
      originalPrice: null,
      explicitDiscountPercent: null,
      explicitSavings: null,
      promotionKind: null,
      promotionBoundToProduct: false,
      currentPriceProvenance: 'source_explicit',
    });
    const d = evaluateDealQuality({
      title: 'Audífonos Bluetooth',
      url: 'https://www.mercadolibre.com.mx/x/p/MLM123',
      store: 'Mercado Libre',
      source: 'ml_worker',
      currentPrice: 999,
      qualification: q,
    });
    expect(d.decision).toBe('NO_VERIFIED_DEAL');
    expect(d.recommendedAction).toBe('DISCARD');
    expect(d.negativeSignals).toContain('catalog_only');
    expect(d.reasons.some((r) => /sin evidencia suficiente de deal/i.test(r))).toBe(true);
    assertExplanation(d);
  });

  it('3. strong historical price evidence → VERIFIED (Evidence Contract STRONG rescue)', () => {
    const q = qualifyCandidate({
      currentPrice: 800,
      originalPrice: null,
      explicitDiscountPercent: null,
      explicitSavings: null,
      promotionKind: null,
      promotionBoundToProduct: false,
      currentPriceProvenance: 'source_explicit',
    });
    const d = evaluateDealQuality({
      title: 'Licuadora Oster',
      currentPrice: 800,
      qualification: q,
      priceMemory: {
        historyReady: true,
        samples90d: 12,
        savingsVsHabitualPct: 22,
        priceVsLowest90dPct: 1,
        effectiveDiscountPercent: 22,
        suspectedArtificialListPrice: false,
        habitual30d: 1025,
        lowest90d: 790,
      },
    });
    expect(d.decision).toBe('VERIFIED_DEAL');
    expect(d.qualification).toBe('NO_VERIFIED_DEAL');
    expect(d.positiveSignals).toContain('price_below_habitual');
    expect(d.positiveSignals).toContain('verified_by_price_memory');
    expect(d.recommendedAction).toBe('PUBLISH_CANDIDATE');
    assertExplanation(d);
  });

  it('4. below habitual price signal', () => {
    const d = evaluateDealQuality({
      title: 'Sartén T-fal',
      currentPrice: 450,
      qualificationInput: {
        currentPrice: 450,
        originalPrice: null,
        explicitDiscountPercent: null,
        explicitSavings: null,
        promotionKind: null,
        promotionBoundToProduct: false,
        currentPriceProvenance: 'source_explicit',
      },
      priceMemory: {
        historyReady: true,
        savingsVsHabitualPct: 15,
        suspectedArtificialListPrice: false,
      },
    });
    expect(d.positiveSignals).toContain('price_below_habitual');
    expect(d.decision).toBe('POTENTIAL_DEAL');
    assertExplanation(d);
  });

  it('5. artificial list price → strong negative', () => {
    const q = qualifyCandidate({
      currentPrice: 500,
      originalPrice: 2000,
      explicitDiscountPercent: 75,
      explicitSavings: null,
      promotionKind: null,
      promotionBoundToProduct: false,
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'source_explicit',
      discountPercentProvenance: 'source_explicit',
    });
    const d = evaluateDealQuality({
      title: 'Producto con lista inflada',
      currentPrice: 500,
      originalPrice: 2000,
      qualification: q,
      priceMemory: {
        historyReady: true,
        suspectedArtificialListPrice: true,
        savingsVsHabitualPct: 0,
        effectiveDiscountPercent: 0,
      },
    });
    expect(d.negativeSignals).toContain('artificial_list_price');
    expect(d.decision).toBe('VERIFIED_DEAL'); // qualification intacta
    expect(d.confidence).toBe('medium');
    expect(d.recommendedAction).toBe('PUBLISH_CANDIDATE');
    assertExplanation(d);
  });

  it('6. insufficient history → missingEvidence, not auto-reject', () => {
    const d = evaluateDealQuality({
      title: 'Producto nuevo',
      currentPrice: 300,
      qualificationInput: {
        currentPrice: 300,
        originalPrice: null,
        explicitDiscountPercent: null,
        explicitSavings: null,
        promotionKind: null,
        promotionBoundToProduct: false,
        currentPriceProvenance: 'source_explicit',
      },
      priceMemory: {
        historyReady: false,
        samples90d: 1,
        suspectedArtificialListPrice: false,
      },
    });
    expect(d.decision).toBe('NO_VERIFIED_DEAL');
    expect(d.missingEvidence).toContain('price_history');
    expect(d.negativeSignals).toContain('insufficient_price_history');
    expect(d.decision).not.toBe('REJECT');
    assertExplanation(d);
  });

  it('7. invalid/missing price → NO_VERIFIED_DEAL', () => {
    const d = evaluateDealQuality({
      title: 'Sin precio',
      currentPrice: null,
    });
    expect(d.decision).toBe('NO_VERIFIED_DEAL');
    expect(d.missingEvidence).toContain('current_price');
    assertExplanation(d);
  });

  it('8. missing product identity → NO_VERIFIED_DEAL', () => {
    const d = evaluateDealQuality({
      title: '',
      currentPrice: 100,
    });
    expect(d.decision).toBe('NO_VERIFIED_DEAL');
    expect(d.missingEvidence).toContain('product_identity');
    assertExplanation(d);
  });

  it('9. potential deal from qualification price_intel_only', () => {
    const q = qualifyCandidate({
      currentPrice: 700,
      originalPrice: 1000,
      explicitDiscountPercent: null,
      explicitSavings: null,
      promotionKind: null,
      promotionBoundToProduct: false,
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'price_intel_derivation',
      derivedDiscountPercent: 30,
    });
    expect(q.qualification).toBe('POTENTIAL_DEAL');
    const d = evaluateDealQuality({
      title: 'Monitor 27',
      currentPrice: 700,
      originalPrice: 1000,
      qualification: q,
      priceMemory: { historyReady: false },
    });
    expect(d.decision).toBe('POTENTIAL_DEAL');
    expect(d.recommendedAction).toBe('HUMAN_REVIEW');
    assertExplanation(d);
  });

  it('10. verified deal from strong original provenance', () => {
    const q = qualifyCandidate({
      currentPrice: 1000,
      originalPrice: 1500,
      explicitDiscountPercent: 33,
      explicitSavings: null,
      promotionKind: null,
      promotionBoundToProduct: false,
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'source_explicit',
      discountPercentProvenance: 'source_explicit',
    });
    expect(q.qualification).toBe('VERIFIED_DEAL');
    const d = evaluateDealQuality({
      title: 'Silla gamer',
      url: 'https://www.mercadolibre.com.mx/p/MLM1',
      store: 'ML',
      currentPrice: 1000,
      originalPrice: 1500,
      imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_012345-MLA.jpg',
      qualification: q,
      priceMemory: { historyReady: true, savingsVsHabitualPct: 10 },
    });
    expect(d.decision).toBe('VERIFIED_DEAL');
    expect(d.recommendedAction).toBe('PUBLISH_CANDIDATE');
    expect(d.positiveSignals).toContain('qualification_verified');
    assertExplanation(d);
  });

  it('11. promotion bound to product', () => {
    const q = qualifyCandidate({
      currentPrice: 200,
      originalPrice: null,
      explicitDiscountPercent: null,
      explicitSavings: null,
      promotionKind: '2x1',
      promotionBoundToProduct: true,
      currentPriceProvenance: 'source_explicit',
    });
    expect(q.qualification).toBe('PROMOTION');
    const d = evaluateDealQuality({
      title: 'Shampoo 2x1',
      currentPrice: 200,
      qualification: q,
    });
    expect(d.decision).toBe('PROMOTION');
    expect(d.recommendedAction).toBe('PUBLISH_CANDIDATE');
    assertExplanation(d);
  });

  it('12. reject — corrupt price / hard reasons / invalid url', () => {
    const corrupt = evaluateDealQuality({
      title: 'X',
      currentPrice: Number.NaN,
    });
    expect(corrupt.decision).toBe('REJECT');
    expect(corrupt.recommendedAction).toBe('DISCARD');

    const hard = evaluateDealQuality({
      title: 'Spam',
      currentPrice: 10,
      hardRejectReasons: ['contenido claramente no comercial'],
    });
    expect(hard.decision).toBe('REJECT');
    expect(hard.reasons[0]).toMatch(/no comercial/i);

    const badUrl = evaluateDealQuality({
      title: 'X',
      url: 'ftp://evil.example/x',
      currentPrice: 10,
    });
    expect(badUrl.decision).toBe('REJECT');
    assertExplanation(corrupt);
  });

  it('13. explanation completeness on catalog case', () => {
    const d = evaluateDealQuality({
      title: 'Catálogo simple',
      currentPrice: 120,
      store: 'Bodega',
      source: 'ml_worker',
      qualificationInput: {
        currentPrice: 120,
        originalPrice: null,
        explicitDiscountPercent: null,
        explicitSavings: null,
        promotionKind: null,
        promotionBoundToProduct: false,
        currentPriceProvenance: 'source_explicit',
      },
    });
    assertExplanation(d);
    expect(d.positiveSignals).toContain('product_identifiable');
    expect(d.positiveSignals).toContain('current_price_valid');
    expect(d.reasons.join(' ')).not.toMatch(/Quality score low/i);
  });

  it('evaluateExistingOfferQuality read-only from offer row', () => {
    const d = evaluateExistingOfferQuality({
      id: '11111111-1111-1111-1111-111111111111',
      title: 'Oferta pending',
      price: 450,
      original_price: null,
      offer_url: 'https://www.mercadolibre.com.mx/p/MLM999',
      store: 'ML',
      status: 'pending',
      bot_meta: {
        source: 'ml_worker',
        signals: {
          savingsVsHabitualPct: 25,
          habitual30d: 600,
          priceLowest90d: 440,
          suspectedArtificialListPrice: false,
        },
      },
    });
    expect(d.decision).toBe('POTENTIAL_DEAL');
    expect(d.positiveSignals).toContain('price_below_habitual');
    assertExplanation(d);
  });
});
