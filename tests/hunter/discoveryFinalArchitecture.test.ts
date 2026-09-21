/**
 * Adversarial + architecture tests for Hunter Discovery final system decision.
 */
import { describe, expect, it } from 'vitest';
import {
  assertZeroInsertAttempts,
  buildAdaptiveDiscoveryPlan,
  buildCausalBottleneckReport,
  buildLossFunnelReport,
  buildMissionControlReport,
  buildUnknownDiscountBreakdown,
  computeDiscoveryEfficiency,
  DIMENSION_LEVERAGE_RANKING,
  formatMlSourceDetail,
  getSourceExpansionArchitecture,
  parseDiscoverySourceDetail,
  resolveIdentityHierarchy,
  scanSourceForForbiddenMint,
} from '@/lib/hunter/candidateIntelligence';
import { buildRotationPlan } from '@/lib/hunter/candidateIntelligence/discoveryRotation';
import { resolveCanonicalDiscount } from '@/lib/bots/ingest/canonicalDiscount';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('adaptive discovery strategy (evidence-based)', () => {
  it('page leverage is FACT-disabled; query/category enabled', () => {
    const page = DIMENSION_LEVERAGE_RANKING.find((d) => d.dimension === 'page');
    expect(page?.enabled).toBe(false);
    expect(page?.classification).toBe('FACT');
    expect(page?.marginal_unique_products_per_request).toBe(0);

    const plan = buildAdaptiveDiscoveryPlan({ runSlot: 42, pageStrategy: 'page_1_only' });
    expect(plan.pages).toEqual([1]);
    expect(plan.calls.every((c) => c.page === 1)).toBe(true);
    expect(plan.calls.some((c) => c.axis === 'explore')).toBe(true);
    expect(plan.calls.some((c) => c.dimension === 'query')).toBe(true);
  });

  it('rotation plan defaults page axis OFF', () => {
    const plan = buildRotationPlan({ variant: 'multi_axis_rotation', runIndex: 3 });
    expect(plan.axisBitmap.page).toBe(false);
    expect(plan.pages).toEqual([1]);
  });
});

describe('sourceDetail telemetry parse', () => {
  it('round-trips ml sourceDetail with page+axis', () => {
    const detail = formatMlSourceDetail({
      kind: 'q',
      value: 'laptop',
      sort: 'relevance',
      page: 1,
      axis: 'explore',
    });
    const p = parseDiscoverySourceDetail(detail);
    expect(p.rotQuery).toBe('laptop');
    expect(p.page).toBe(1);
    expect(p.axis).toBe('explore');
  });
});

describe('identity hierarchy', () => {
  it('ML listing vs url-only; never invents product catalog id', () => {
    const ml = resolveIdentityHierarchy({
      canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-x',
    });
    expect(ml.strength).toBe('listing');
    expect(ml.listingId).toMatch(/MLM/i);
    expect(ml.urlOnly).toBe(false);

    const url = resolveIdentityHierarchy({
      canonicalUrl: 'https://www.walmart.com.mx/ip/x/1',
    });
    expect(url.strength).toBe('url');
    expect(url.urlOnly).toBe(true);
  });
});

describe('UNKNOWN breakdown', () => {
  it('classifies missing original vs both missing', () => {
    const report = buildUnknownDiscountBreakdown([
      {
        discountClass: 'DISCOUNT_UNKNOWN',
        discountPercentage: null,
        salePrice: 100,
        originalPrice: null,
        source: 'ml_api',
        decision: 'REJECTED_DISCOUNT',
      },
      {
        discountClass: 'DISCOUNT_UNKNOWN',
        discountPercentage: null,
        salePrice: null,
        originalPrice: null,
        source: 'ml_worker',
        decision: 'REJECTED_PRICE',
        reasonDetail: 'sin precio',
      },
    ]);
    expect(report.unknown_count).toBe(2);
    expect(report.by_path.missing_original_price).toBe(1);
    expect(report.by_path.both_prices_missing).toBe(1);
    expect(report.recoverable_estimate.classification).toBe('INFERENCE');
  });
});

describe('causal bottleneck + efficiency', () => {
  it('builds causal stages and efficiency without inventing request cost money', () => {
    const rows = [
      {
        canonicalUrl: 'https://a',
        source: 'ml_api',
        decision: 'REJECTED_DISCOUNT',
        discountClass: 'DISCOUNT_REAL_LOW',
        discountPercentage: 10,
        rotQuery: 'tv',
      },
      {
        canonicalUrl: 'https://b',
        source: 'ml_api',
        decision: 'WOULD_INSERT',
        discountClass: 'DISCOUNT_REAL_GOOD',
        discountPercentage: 40,
        rotQuery: 'laptop',
      },
      {
        canonicalUrl: 'https://c',
        source: 'ml_api',
        decision: 'REJECTED_BUDGET',
        wouldTopkCut: true,
        rotQuery: 'laptop',
      },
    ];
    const causal = buildCausalBottleneckReport(rows);
    expect(causal.stages.length).toBeGreaterThan(5);
    expect(causal.primary_bottleneck.classification).toMatch(/FACT|INFERENCE/);

    const eff = computeDiscoveryEfficiency({
      successfulRequests: 2,
      candidatesObserved: 3,
      uniqueUrls: 3,
      uniqueIdentities: 3,
      uniqueProducts: 3,
      goodCandidates: 1,
      verifiedGoodCandidates: 1,
      unknownDiscountCount: 0,
    });
    expect(eff.request_cost_proxy).toBe('successful_discovery_request');
    expect(eff.DISCOVERY_EFFICIENCY).toBe(0.5);
  });
});

describe('adversarial discount + funnel', () => {
  it('supplied 0 + valid prices → canonical not FALSE_ZERO birth', () => {
    const t = resolveCanonicalDiscount({
      salePrice: 699,
      originalPrice: 1999,
      suppliedDiscountPercentage: 0,
    });
    expect(t.discountPercentage).toBeGreaterThanOrEqual(25);
    expect(t.discountPercentage).not.toBe(0);
  });

  it('null discount stays null', () => {
    const t = resolveCanonicalDiscount({
      salePrice: 100,
      originalPrice: null,
      suppliedDiscountPercentage: null,
    });
    expect(t.discountPercentage).toBeNull();
  });

  it('topk and diversity cuts are classified without raising limits', () => {
    const report = buildLossFunnelReport([
      { decision: 'REJECTED_BUDGET', wouldTopkCut: true, reasonCode: 'score_shortlist_cut' },
      { decision: 'REJECTED_DIVERSITY', wouldDiversityCut: true },
      { decision: 'WOULD_INSERT' },
    ]);
    expect(report.separated.TOPK_CUT + report.separated.BUDGET_CUT).toBeGreaterThanOrEqual(1);
    expect(report.separated.DIVERSITY_CUT).toBe(1);
  });
});

describe('mission control wiring', () => {
  it('exposes causal, unknown, efficiency, strategy, source expansion', () => {
    const report = buildMissionControlReport({
      candidates: [
        {
          canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890',
          source: 'ml_api',
          decision: 'WOULD_INSERT',
          discountClass: 'DISCOUNT_REAL_GOOD',
          discountPercentage: 50,
          rotQuery: 'laptop',
          discoveredAt: '2026-09-20T12:00:00.000Z',
        },
        {
          canonicalUrl: 'https://www.walmart.com.mx/ip/x/1',
          source: 'walmart',
          decision: 'REJECTED_DISCOUNT',
          discountClass: 'DISCOUNT_UNKNOWN',
          discountPercentage: null,
          salePrice: 200,
          originalPrice: null,
          discoveredAt: '2026-09-20T12:00:00.000Z',
        },
      ],
      since: '2026-09-20T00:00:00.000Z',
      until: '2026-09-21T00:00:00.000Z',
    });
    expect(report.causalBottleneck.stages.length).toBeGreaterThan(0);
    expect(report.unknownBreakdown.unknown_count).toBeGreaterThanOrEqual(1);
    expect(report.discoveryStrategy.page_policy).toBe('page_1_only');
    expect(report.sourceExpansion.recommended_order[0]).toBe('mercadolibre_mx');
    expect(report.discoveryEfficiency.request_cost_proxy).toBe('successful_discovery_request');
    expect(report.labelAvailability.status).toBe('BLOCKED');
  });
});

describe('experiment hard wall + source expansion', () => {
  it('mint path fail-closed', () => {
    expect(assertZeroInsertAttempts({ insertedAttempted: 0 }).ok).toBe(true);
    const script = readFileSync(join(process.cwd(), 'scripts/hunter-discovery-experiment-v2.ts'), 'utf8');
    expect(scanSourceForForbiddenMint(script).ok).toBe(true);
  });

  it('source expansion does not invent adapters', () => {
    const arch = getSourceExpansionArchitecture();
    expect(arch.rows.find((r) => r.source === 'liverpool_mx')?.status).toBe('NO_ADAPTER');
    expect(arch.rows.find((r) => r.source === 'amazon_mx')?.status).toBe('ADAPTER_READY_DISABLED');
  });
});
