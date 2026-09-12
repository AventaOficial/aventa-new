import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  qualifyCandidate,
  filterQualifiedHunterCandidates,
  qualifyParsedOfferMetadata,
  scanProductBoundPromotionText,
  resetDealQualificationMetrics,
  getDealQualificationMetrics,
  DEAL_QUALIFICATION_RULES,
} from '@/lib/hunter/dealQualification';
import { DAY_TO_DAY_SOURCES, isDayToDayFlagOn } from '@/lib/hunter/dayToDay';
import { ingestItemToCandidate } from '@/lib/hunter/normalize';
import {
  draftToIngestItem,
  publicProductToDraft,
} from '@/lib/hunter/dayToDay/normalizeRetailCandidate';
import { loadRetailerFixtureProducts } from '@/lib/hunter/dayToDay/createRetailerSource';
import { parseJsonLdProducts } from '@/lib/hunter/dayToDay/parsePublicProductHtml';
import { DEAL_VERIFIER_THRESHOLDS } from '@/lib/verifier/thresholds';
import { AUTONOMOUS_POLICY_V1 } from '@/lib/autonomous/policy';
import { offerRequiresAffiliateValidation } from '@/lib/moderation/approveReadiness';
import { resolveBotInsertPublication } from '@/lib/bots/ingest/resolveBotInsertPublication';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { applyMlPriceIntelToMeta } from '@/lib/bots/ingest/priceIntel';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import { HUNTER_METRIC_UNIVERSES } from '@/lib/hunter/metricUniverses';

afterEach(() => {
  vi.unstubAllEnvs();
  resetDealQualificationMetrics();
});

function baseMeta(over: Partial<ParsedOfferMetadata> = {}): ParsedOfferMetadata {
  return {
    canonicalUrl: 'https://www.chedraui.com.mx/x/p',
    title: 'Producto de prueba Chedraui',
    store: 'Chedraui',
    imageUrl: 'https://example.com/a.jpg',
    discountPrice: 100,
    originalPrice: null,
    discountPercent: 0,
    signals: {
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'unknown',
      discountPercentProvenance: 'unknown',
    },
    ...over,
  };
}

describe('FASE 8.1 deal qualification rules', () => {
  it('1. current price only → NO_VERIFIED_DEAL', () => {
    const q = qualifyCandidate({
      currentPrice: 479,
      originalPrice: null,
      explicitDiscountPercent: null,
      explicitSavings: null,
      promotionKind: null,
      promotionBoundToProduct: false,
      currentPriceProvenance: 'source_explicit',
    });
    expect(q.qualification).toBe('NO_VERIFIED_DEAL');
    expect(q.continueToPipeline).toBe(false);
    expect(q.reasons).toContain('catalog_only');
  });

  it('2. current + original price → VERIFIED_DEAL', () => {
    const q = qualifyCandidate({
      currentPrice: 479,
      originalPrice: 559,
      explicitDiscountPercent: null,
      explicitSavings: null,
      promotionKind: null,
      promotionBoundToProduct: false,
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'source_explicit',
    });
    expect(q.qualification).toBe('VERIFIED_DEAL');
    expect(q.reasons).toContain('explicit_original_price');
    expect(q.signals.priceEvidence).toBe('explicit');
    expect(q.derivedDiscountPercent).toBeGreaterThan(0);
    expect(q.discountPercentProvenance).toBe('derived');
  });

  it('3. original <= current → invalid / NO_VERIFIED_DEAL', () => {
    const q = qualifyCandidate({
      currentPrice: 100,
      originalPrice: 90,
      explicitDiscountPercent: null,
      explicitSavings: null,
      promotionKind: null,
      promotionBoundToProduct: false,
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'source_explicit',
    });
    expect(q.qualification).toBe('NO_VERIFIED_DEAL');
    expect(q.reasons).toContain('invalid_price_evidence');
    expect(q.originalPrice).toBeNull();
  });

  it('4. explicit discount → VERIFIED_DEAL', () => {
    const q = qualifyCandidate({
      currentPrice: 80,
      originalPrice: null,
      explicitDiscountPercent: 20,
      explicitSavings: null,
      promotionKind: null,
      promotionBoundToProduct: false,
      currentPriceProvenance: 'source_explicit',
      discountPercentProvenance: 'source_explicit',
    });
    expect(q.qualification).toBe('VERIFIED_DEAL');
    expect(q.reasons).toContain('explicit_discount');
  });

  it('5. explicit savings → VERIFIED_DEAL', () => {
    const q = qualifyCandidate({
      currentPrice: 80,
      originalPrice: null,
      explicitDiscountPercent: null,
      explicitSavings: 15,
      promotionKind: null,
      promotionBoundToProduct: false,
      currentPriceProvenance: 'source_explicit',
    });
    expect(q.qualification).toBe('VERIFIED_DEAL');
    expect(q.reasons).toContain('explicit_savings');
  });

  it('6. 2x1 → PROMOTION', () => {
    const q = qualifyCandidate({
      currentPrice: 22,
      originalPrice: null,
      explicitDiscountPercent: null,
      explicitSavings: null,
      promotionKind: '2x1',
      promotionBoundToProduct: true,
      currentPriceProvenance: 'source_explicit',
    });
    expect(q.qualification).toBe('PROMOTION');
    expect(q.reasons).toContain('bundle_detected');
  });

  it('7. 3x2 → PROMOTION', () => {
    expect(
      qualifyCandidate({
        currentPrice: 30,
        originalPrice: null,
        explicitDiscountPercent: null,
        explicitSavings: null,
        promotionKind: '3x2',
        promotionBoundToProduct: true,
      }).qualification,
    ).toBe('PROMOTION');
  });

  it('8. combo → PROMOTION', () => {
    expect(
      qualifyCandidate({
        currentPrice: 99,
        originalPrice: null,
        explicitDiscountPercent: null,
        explicitSavings: null,
        promotionKind: 'combo',
        promotionBoundToProduct: true,
      }).qualification,
    ).toBe('PROMOTION');
  });

  it('9. coupon → PROMOTION', () => {
    const q = qualifyCandidate({
      currentPrice: 50,
      originalPrice: null,
      explicitDiscountPercent: null,
      explicitSavings: null,
      promotionKind: 'coupon',
      promotionBoundToProduct: true,
    });
    expect(q.qualification).toBe('PROMOTION');
    expect(q.reasons).toContain('coupon_detected');
  });

  it('10. promotion text not associated with product → POTENTIAL_DEAL', () => {
    const q = qualifyCandidate({
      currentPrice: 26,
      originalPrice: null,
      explicitDiscountPercent: null,
      explicitSavings: null,
      promotionKind: '2x1',
      promotionBoundToProduct: false,
      unboundPromotionMention: true,
      currentPriceProvenance: 'source_explicit',
    });
    expect(q.qualification).toBe('POTENTIAL_DEAL');
    expect(q.reasons).toContain('promotion_not_product_bound');
  });

  it('11-14. malformed / NaN / Infinity / negative prices fail closed', () => {
    for (const currentPrice of [Number.NaN, Number.POSITIVE_INFINITY, -5, 0]) {
      const q = qualifyCandidate({
        currentPrice,
        originalPrice: 100,
        explicitDiscountPercent: null,
        explicitSavings: null,
        promotionKind: null,
        promotionBoundToProduct: false,
      });
      expect(q.qualification).toBe('NO_VERIFIED_DEAL');
      expect(q.reasons).toContain('invalid_price_evidence');
    }
  });

  it('15. derived discount provenance stays derived', () => {
    const q = qualifyCandidate({
      currentPrice: 479,
      originalPrice: 559,
      explicitDiscountPercent: null,
      explicitSavings: null,
      promotionKind: null,
      promotionBoundToProduct: false,
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'source_explicit',
      discountPercentProvenance: 'derived',
    });
    expect(q.qualification).toBe('VERIFIED_DEAL');
    expect(q.discountPercentProvenance).toBe('derived');
    expect(q.signals.priceEvidence).toBe('explicit');
  });

  it('16. explicit source original beats derived Price Intel', () => {
    const q = qualifyCandidate({
      currentPrice: 479,
      originalPrice: 559,
      explicitDiscountPercent: null,
      explicitSavings: null,
      promotionKind: null,
      promotionBoundToProduct: false,
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'source_explicit',
      derivedDiscountPercent: 3,
    });
    expect(q.qualification).toBe('VERIFIED_DEAL');
    expect(q.originalPriceProvenance).toBe('source_explicit');
    expect(q.originalPrice).toBe(559);
  });

  it('17. Price Intel cannot manufacture VERIFIED_DEAL', () => {
    const q = qualifyCandidate({
      currentPrice: 479,
      originalPrice: 700,
      explicitDiscountPercent: null,
      explicitSavings: null,
      promotionKind: null,
      promotionBoundToProduct: false,
      currentPriceProvenance: 'price_intel_derivation',
      originalPriceProvenance: 'price_intel_derivation',
      discountPercentProvenance: 'price_intel_derivation',
      derivedDiscountPercent: 31,
    });
    expect(q.qualification).not.toBe('VERIFIED_DEAL');
    expect(q.reasons).toContain('price_intel_only');
    expect(DEAL_QUALIFICATION_RULES.priceIntelCannotVerify).toBe(true);
  });

  it('18. empty metadata → NO_VERIFIED_DEAL', () => {
    const q = qualifyCandidate({
      currentPrice: null,
      originalPrice: null,
      explicitDiscountPercent: null,
      explicitSavings: null,
      promotionKind: null,
      promotionBoundToProduct: false,
    });
    expect(q.qualification).toBe('NO_VERIFIED_DEAL');
    expect(q.continueToPipeline).toBe(false);
  });
});

describe('FASE 8.1 Chedraui fixtures', () => {
  it('19. fixture with original price → VERIFIED_DEAL', () => {
    const products = loadRetailerFixtureProducts('chedraui-promotions.json');
    const withOriginal = products.find((p) => p.originalPrice != null)!;
    const draft = publicProductToDraft(withOriginal, {
      store: 'Chedraui',
      source: 'chedraui_mx',
      sourceDetail: 'fixture',
    })!;
    const item = draftToIngestItem(draft)!;
    const q = qualifyParsedOfferMetadata(item.precomputedMeta!);
    expect(q.qualification).toBe('VERIFIED_DEAL');
  });

  it('20. fixture without original price → NO_VERIFIED_DEAL unless promotion', () => {
    const products = loadRetailerFixtureProducts('chedraui-promotions.json');
    const catalog = products.find((p) => p.productId === '3100003')!;
    const draft = publicProductToDraft(catalog, {
      store: 'Chedraui',
      source: 'chedraui_mx',
      sourceDetail: 'fixture',
    })!;
    expect(qualifyParsedOfferMetadata(draftToIngestItem(draft)!.precomputedMeta!).qualification).toBe(
      'NO_VERIFIED_DEAL',
    );
  });

  it('collect filters catalog-only and keeps verified + 2x1', async () => {
    vi.stubEnv('DAY_TO_DAY_CHEDRAUI_DISCOVERY', '1');
    vi.stubEnv('DAY_TO_DAY_FIXTURES', '1');
    const src = DAY_TO_DAY_SOURCES.find((s) => s.id === 'chedraui_mx')!;
    const out = await src.collect({ config: {} as never, rotationWave: 0 });
    expect(out.ok).toBe(true);
    const classes = out.candidates.map((c) => c.rawMetadata.dealQualification);
    expect(classes).toContain('VERIFIED_DEAL');
    expect(classes).toContain('PROMOTION');
    expect(classes).not.toContain('NO_VERIFIED_DEAL');
    expect(out.skipReasonCounts?.catalog_only).toBeGreaterThan(0);
    const metrics = getDealQualificationMetrics();
    expect(metrics.candidatesEvaluated).toBeGreaterThanOrEqual(3);
    expect(metrics.noVerifiedDeals).toBeGreaterThan(0);
    expect(metrics.bySource.chedraui_mx.verifiedDeals).toBeGreaterThan(0);
  });
});

describe('FASE 8.1 Bodega/Walmart fail-closed', () => {
  it('21. Bodega soft-zero does not crash', async () => {
    vi.stubEnv('DAY_TO_DAY_BODEGA_DISCOVERY', '1');
    const src = DAY_TO_DAY_SOURCES.find((s) => s.id === 'bodega_aurrera_mx')!;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    const out = await src.collect({ config: {} as never, rotationWave: 0 });
    expect(out.ok).toBe(true);
    expect(out.candidates).toEqual([]);
    fetchSpy.mockRestore();
  });

  it('22. Walmart challenge fail-closed, no bypass', async () => {
    vi.stubEnv('DAY_TO_DAY_WALMART_DISCOVERY', '1');
    const src = DAY_TO_DAY_SOURCES.find((s) => s.id === 'walmart_mx')!;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('robots.txt')) {
        return new Response(
          'User-agent: *\nAllow: /\nSitemap: https://www.walmart.com.mx/productSitemap.xml',
          { status: 200 },
        );
      }
      if (url.includes('productSitemap')) {
        return new Response(
          '<?xml version="1.0"?><urlset><url><loc>https://www.walmart.com.mx/ip/x/123</loc></url></urlset>',
          { status: 200 },
        );
      }
      return new Response('<html>px-captcha identity challenge</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    });
    const out = await src.collect({ config: {} as never, rotationWave: 0 });
    expect(out.ok).toBe(false);
    expect(out.errorCode).toMatch(/403|401|404/);
    expect(out.candidates).toEqual([]);
    fetchSpy.mockRestore();
  });
});

describe('FASE 8.1 safety: no threshold / affiliate / publisher / shadow changes', () => {
  it('23. does not alter Autonomous / Verifier thresholds', () => {
    expect(DEAL_VERIFIER_THRESHOLDS.absurdDiscountCap).toBe(85);
    expect(DEAL_VERIFIER_THRESHOLDS.discountGapReview).toBe(25);
    expect(DEAL_VERIFIER_THRESHOLDS.minTitleLength).toBe(12);
    expect(AUTONOMOUS_POLICY_V1.minAutoApproveConfidence).toBe(0.7);
    expect(AUTONOMOUS_POLICY_V1.absurdDiscountCap).toBe(85);
  });

  it('24. does not alter affiliate gate', () => {
    expect(offerRequiresAffiliateValidation('https://www.chedraui.com.mx/x/p')).toBe(false);
    expect(offerRequiresAffiliateValidation('https://www.bodegaaurrera.com.mx/x')).toBe(false);
    const amazon = offerRequiresAffiliateValidation('https://www.amazon.com.mx/dp/B000000000');
    expect(typeof amazon).toBe('boolean');
  });

  it('25-26. publisher stays fail-closed pending; flags OFF', () => {
    const pub = resolveBotInsertPublication({
      requestedStatus: 'pending',
      offerUrl: 'https://www.chedraui.com.mx/x/p',
    });
    expect(pub.status).toBe('pending');
    const cfg = loadBotIngestConfig();
    expect(cfg.legacyAutoApproveWriteEnabled).toBe(false);
    expect(isDayToDayFlagOn('DAY_TO_DAY_CHEDRAUI_ENABLED')).toBe(false);
  });

  it('qualification universe is not autonomous', () => {
    expect(HUNTER_METRIC_UNIVERSES.dealQualification.note).toMatch(/NO_VERIFIED_DEAL no es AUTO_REJECT/i);
    expect(HUNTER_METRIC_UNIVERSES.autonomousShadow.evaluated).toMatch(/quality gates/i);
  });
});

describe('FASE 10.1 user_declared provenance', () => {
  it('par user_declared 100 vs 1000 no es VERIFIED_DEAL', () => {
    const q = qualifyCandidate({
      currentPrice: 100,
      originalPrice: 1000,
      explicitDiscountPercent: 90,
      explicitSavings: null,
      promotionKind: null,
      promotionBoundToProduct: false,
      currentPriceProvenance: 'user_declared',
      originalPriceProvenance: 'user_declared',
      discountPercentProvenance: 'user_declared',
    });
    expect(q.qualification).toBe('POTENTIAL_DEAL');
    expect(q.reasons).toContain('user_declared_price');
    expect(q.signals.priceEvidence).toBe('none');
    expect(q.currentPriceProvenance).toBe('user_declared');
  });

  it('source_explicit 100 vs 1000 sí es VERIFIED_DEAL', () => {
    const q = qualifyCandidate({
      currentPrice: 100,
      originalPrice: 1000,
      explicitDiscountPercent: null,
      explicitSavings: null,
      promotionKind: null,
      promotionBoundToProduct: false,
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'source_explicit',
    });
    expect(q.qualification).toBe('VERIFIED_DEAL');
    expect(q.reasons).toContain('explicit_original_price');
  });
});

describe('FASE 8.1 parse + filter helpers', () => {
  it('product-bound 2x1 in JSON-LD, not nav chrome', () => {
    const html = `<nav>Ofertas del día</nav><script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Leche 2x1',
      url: 'https://www.chedraui.com.mx/leche/p',
      offers: { '@type': 'Offer', price: 22, priceCurrency: 'MXN' },
    })}</script>`;
    const products = parseJsonLdProducts(html, 'https://www.chedraui.com.mx/leche/p');
    expect(products[0]?.promotionType).toBe('2x1');
    expect(products[0]?.promotionBoundToProduct).toBe(true);
    expect(scanProductBoundPromotionText('Ofertas del día').kind).toBeNull();
  });

  it('filterQualifiedHunterCandidates skips catalog', () => {
    const catalog = publicProductToDraft(
      {
        url: 'https://www.chedraui.com.mx/pan/p',
        title: 'Pan',
        price: 32,
        originalPrice: null,
        currency: 'MXN',
        image: 'https://example.com/p.jpg',
        productId: '1',
        brand: null,
        availability: null,
        category: null,
      },
      { store: 'Chedraui', source: 'chedraui_mx', sourceDetail: 't' },
    )!;
    const deal = publicProductToDraft(
      {
        url: 'https://www.chedraui.com.mx/aceite/p',
        title: 'Aceite',
        price: 39.9,
        originalPrice: 49.9,
        currency: 'MXN',
        image: 'https://example.com/a.jpg',
        productId: '2',
        brand: null,
        availability: null,
        category: null,
      },
      { store: 'Chedraui', source: 'chedraui_mx', sourceDetail: 't' },
    )!;
    const candidates = [catalog, deal].map((d) =>
      ingestItemToCandidate(draftToIngestItem(d)!, 'chedraui_mx'),
    );
    const filtered = filterQualifiedHunterCandidates(candidates);
    expect(filtered.evaluated).toBe(2);
    expect(filtered.forIngest).toHaveLength(1);
    expect(filtered.skipReasonCounts.catalog_only).toBe(1);
  });

  it('preserveLabelDiscount still wins over intel overwrite for card provenance', () => {
    const meta = baseMeta({
      originalPrice: 559,
      discountPercent: 14,
      signals: {
        currentPriceProvenance: 'source_explicit',
        originalPriceProvenance: 'source_explicit',
        discountPercentProvenance: 'derived',
      },
    });
    const out = applyMlPriceIntelToMeta(
      meta,
      {
        quote: { current: 479, listPrice: 900, regularPrice: 900 },
        intel: {
          lowest30d: 400,
          lowest90d: 380,
          habitual30d: 500,
          current: 479,
          listPrice: 900,
          regularPrice: 900,
          priceVsLowest90dPct: 20,
          savingsVsHabitualPct: 4,
          effectiveDiscountPercent: 4,
          suspectedArtificialListPrice: false,
          samples90d: 10,
          historyReady: true,
        },
      },
      { preserveLabelDiscount: true },
    );
    expect(out.originalPrice).toBe(559);
    expect(out.discountPercent).toBe(14);
    const q = qualifyParsedOfferMetadata(out);
    expect(q.qualification).toBe('VERIFIED_DEAL');
  });
});
