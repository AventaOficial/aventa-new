import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  crawlWaitMs,
  discoverRetailer,
  discoverRetailerSurface,
  evidenceYield,
  profileFor,
  RETAILER_DISCOVERY_PROFILES,
  resetRetailerDiscoveryMetrics,
  rankRetailerRuns,
  suggestSurfaceStatus,
  summarizeRetailerDiscoveryMatrix,
  type DiscoverFetchFn,
  type RetailerDiscoveryProfile,
  type RetailerSurfaceSpec,
} from '@/lib/hunter/retailerDiscovery';
import { parseRobotsTxt, isUrlAllowedByRobots } from '@/lib/hunter/dayToDay/robots';
import { isValidOfferImage } from '@/lib/hunter/enrichment/isValidOfferImage';
import { DAY_TO_DAY_SOURCES, isDayToDayFlagOn } from '@/lib/hunter/dayToDay';
import { applyBreakerTransition, cooldownMsForErrorCode, shouldAttemptCollect } from '@/lib/hunter/circuitBreaker';
import { defaultHealthRow, peekHunterHealthMemory, resetHunterHealthMemoryForTests } from '@/lib/hunter/healthStore';
import { HUNTER_METRIC_UNIVERSES } from '@/lib/hunter/metricUniverses';
import { DEAL_VERIFIER_THRESHOLDS } from '@/lib/verifier/thresholds';
import { AUTONOMOUS_POLICY_V1 } from '@/lib/autonomous/policy';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';

afterEach(() => {
  resetRetailerDiscoveryMetrics();
  resetHunterHealthMemoryForTests();
  vi.unstubAllEnvs();
});

function ld(data: unknown): string {
  return `<html><script type="application/ld+json">${JSON.stringify(data)}</script></html>`;
}

function itemList(products: Record<string, unknown>[]): string {
  return ld({
    '@type': 'ItemList',
    itemListElement: products.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item,
    })),
  });
}

function productNode(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    '@type': 'Product',
    name: 'Aceite vegetal 1L',
    url: 'https://www.bodegaaurrera.com.mx/ip/aceite/1',
    sku: '1001',
    image: 'https://i5.walmartimages.com.mx/asr/producto.jpg',
    offers: { '@type': 'Offer', price: 40, priceCurrency: 'MXN' },
    ...over,
  };
}

function surface(over: Partial<RetailerSurfaceSpec> = {}): RetailerSurfaceSpec {
  return {
    id: 'ofertas',
    url: 'https://www.bodegaaurrera.com.mx/ofertas',
    kind: 'item_list',
    status: 'NOT_CONFIGURED',
    notes: 'test',
    maxPages: 1,
    ...over,
  };
}

function profile(over: Partial<RetailerDiscoveryProfile> = {}): RetailerDiscoveryProfile {
  const s = surface();
  return {
    retailer: 'bodega_aurrera_mx',
    displayName: 'Bodega Aurrera',
    country: 'MX',
    origin: 'https://www.bodegaaurrera.com.mx',
    robotsUrl: 'https://www.bodegaaurrera.com.mx/robots.txt',
    publicSurfaces: [s],
    robotsStatus: 'allow_limited',
    termsStatus: 'ok',
    discoveryMethods: ['public_page'],
    promotionSurfaces: ['ofertas'],
    productSurfaces: [],
    evidenceTypes: ['none'],
    antiBotRisk: 'medium',
    expectedYield: 'unknown',
    complianceStatus: 'NOT_CONFIGURED',
    implementationStatus: 'NOT_CONFIGURED',
    recommendation: 'test',
    complexity: 'medium',
    expectedSupplyFrequency: 'unknown',
    ...over,
  };
}

function ok(body: string, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: body, timedOut: false, finalUrl: 'https://x' };
}

describe('FASE 9 matrix + universes', () => {
  it('perfiles cubren investigación y Soriana bloqueada', () => {
    expect(RETAILER_DISCOVERY_PROFILES.map((p) => p.retailer)).toEqual(
      expect.arrayContaining(['bodega_aurrera_mx', 'walmart_mx', 'home_depot_mx', 'chedraui_mx', 'soriana_mx']),
    );
    expect(profileFor('soriana_mx')?.complianceStatus).toBe('BLOCKED_PENDING_POLICY_REVIEW');
    expect(profileFor('chedraui_mx')?.complianceStatus).toBe('CATALOG_ONLY');
    expect(RETAILER_DISCOVERY_PROFILES.every((p) => p.complianceStatus !== 'READY')).toBe(true);
  });

  it('universo retailerDiscovery no se mezcla con health ni shadow', () => {
    expect(HUNTER_METRIC_UNIVERSES.retailerDiscovery.note).toMatch(/No inserta/i);
    expect(HUNTER_METRIC_UNIVERSES.retailerDiscovery.note).toMatch(/source health/i);
    expect(HUNTER_METRIC_UNIVERSES.sourceHealth.persistence).toBe('supabase_hunter_source_health');
  });
});

describe('FASE 9 robots / crawl-delay', () => {
  it('robots allowed vs blocked', () => {
    const rules = parseRobotsTxt(`User-agent: *\nDisallow: /search\nAllow: /ofertas\nCrawl-delay: 2\n`);
    expect(rules.crawlDelaySeconds).toBe(2);
    expect(isUrlAllowedByRobots('https://www.bodegaaurrera.com.mx/ofertas', rules)).toBe(true);
    expect(isUrlAllowedByRobots('https://www.bodegaaurrera.com.mx/search?q=x', rules)).toBe(false);
  });

  it('crawlWaitMs respeta delay y tope', () => {
    expect(crawlWaitMs(0, 2000, 10)).toBe(0);
    expect(crawlWaitMs(1000, 2000, 1500)).toBe(1500);
    expect(crawlWaitMs(1, 60_000, 1)).toBe(15_000);
  });

  it('superficie disallow no se fetchea', async () => {
    const fetchFn: DiscoverFetchFn = async () => {
      throw new Error('should not fetch surface');
    };
    const rules = parseRobotsTxt(`User-agent: *\nDisallow: /search\n`);
    const out = await discoverRetailerSurface(
      profile(),
      surface({ url: 'https://www.bodegaaurrera.com.mx/search?q=ofertas' }),
      { robots: rules, fetchFn },
    );
    expect(out.robotsAllowed).toBe(false);
    expect(out.suggestedStatus).toBe('BLOCKED_PENDING_POLICY_REVIEW');
    expect(out.requests).toBe(0);
  });
});

describe('FASE 9 HTTP fail-closed', () => {
  it('403 challenge → DEGRADED', async () => {
    const fetchFn: DiscoverFetchFn = async () => ok('<html>px-captcha identity challenge</html>', 200);
    const out = await discoverRetailerSurface(profile(), surface(), {
      robots: parseRobotsTxt('User-agent: *\nAllow: /\n'),
      fetchFn,
    });
    expect(out.challenged).toBe(true);
    expect(out.suggestedStatus).toBe('DEGRADED');
    expect(out.errorCode).toBe('403');
    expect(out.persisted).toBe(false);
  });

  it('429 → DEGRADED y no reintenta', async () => {
    let calls = 0;
    const fetchFn: DiscoverFetchFn = async () => {
      calls += 1;
      return ok('rate', 429);
    };
    const out = await discoverRetailerSurface(profile(), surface(), {
      robots: parseRobotsTxt('User-agent: *\nAllow: /\n'),
      fetchFn,
    });
    expect(out.errorCode).toBe('429');
    expect(calls).toBe(1);
  });

  it('404 no es challenge', async () => {
    const out = await discoverRetailerSurface(profile(), surface(), {
      robots: parseRobotsTxt('User-agent: *\nAllow: /\n'),
      fetchFn: async () => ok('<html>not found blocked copy</html>', 404),
    });
    expect(out.httpStatus).toBe(404);
    expect(out.challenged).toBe(false);
    expect(out.suggestedStatus).toBe('DEGRADED');
  });

  it('timeout → DEGRADED', async () => {
    const fetchFn: DiscoverFetchFn = async () => ({
      ok: false,
      status: 0,
      text: '',
      timedOut: true,
      finalUrl: 'https://x',
    });
    const out = await discoverRetailerSurface(profile(), surface(), {
      robots: parseRobotsTxt('User-agent: *\nAllow: /\n'),
      fetchFn,
    });
    expect(out.timedOut).toBe(true);
    expect(out.errorCode).toBe('timeout');
  });
});

describe('FASE 9 evidence', () => {
  it('soft-zero ItemList vacío', async () => {
    const out = await discoverRetailerSurface(profile(), surface(), {
      robots: parseRobotsTxt('User-agent: *\nAllow: /\n'),
      fetchFn: async () => ok(itemList([])),
    });
    expect(out.candidateCount).toBe(0);
    expect(out.suggestedStatus).toBe('DEGRADED');
    expect(out.errorCode).toBeNull();
  });

  it('catalog-only: solo currentPrice', async () => {
    const out = await discoverRetailerSurface(profile(), surface(), {
      robots: parseRobotsTxt('User-agent: *\nAllow: /\n'),
      fetchFn: async () => ok(itemList([productNode()])),
    });
    expect(out.candidateCount).toBe(1);
    expect(out.catalogOnlyCount).toBe(1);
    expect(out.offerEvidenceCount).toBe(0);
    expect(out.evidenceYield).toBe(0);
    expect(out.suggestedStatus).toBe('CATALOG_ONLY');
  });

  it('explicit original price → VERIFIED_DEAL', async () => {
    const out = await discoverRetailerSurface(profile(), surface(), {
      robots: parseRobotsTxt('User-agent: *\nAllow: /\n'),
      fetchFn: async () =>
        ok(
          itemList([
            productNode({
              offers: {
                '@type': 'Offer',
                price: 479,
                priceCurrency: 'MXN',
                priceSpecification: { listPrice: 559, price: 479 },
              },
            }),
          ]),
        ),
    });
    expect(out.verifiedDeals).toBe(1);
    expect(out.offerEvidenceCount).toBe(1);
    expect(out.evidenceYield).toBe(1);
    expect(out.suggestedStatus).toBe('DEGRADED');
  });

  it('explicit discount → VERIFIED_DEAL', async () => {
    const out = await discoverRetailerSurface(profile(), surface(), {
      robots: parseRobotsTxt('User-agent: *\nAllow: /\n'),
      fetchFn: async () =>
        ok(
          itemList([
            productNode({
              offers: { '@type': 'Offer', price: 80, priceCurrency: 'MXN', discountPercent: 20 },
            }),
          ]),
        ),
    });
    expect(out.verifiedDeals).toBe(1);
  });

  it('promotion binding 2x1; combo suelto no', async () => {
    const promo = await discoverRetailerSurface(profile(), surface(), {
      robots: parseRobotsTxt('User-agent: *\nAllow: /\n'),
      fetchFn: async () =>
        ok(itemList([productNode({ name: 'Leche Entera 1L 2x1 Ejemplo' })])),
    });
    expect(promo.promotionCount).toBe(1);
    expect(promo.offerEvidenceCount).toBe(1);

    const fake = await discoverRetailerSurface(profile(), surface(), {
      robots: parseRobotsTxt('User-agent: *\nAllow: /\n'),
      fetchFn: async () =>
        ok(itemList([productNode({ name: 'Batidora combo 3 velocidades' })])),
    });
    expect(fake.promotionCount).toBe(0);
    expect(fake.catalogOnlyCount).toBe(1);
  });

  it('no hereda 50% del slug de landing', async () => {
    const out = await discoverRetailerSurface(
      profile(),
      surface({ url: 'https://www.bodegaaurrera.com.mx/hasta-50-descuento' }),
      {
        robots: parseRobotsTxt('User-agent: *\nAllow: /\n'),
        fetchFn: async () => ok(itemList([productNode({ name: 'Galletas María' })])),
      },
    );
    expect(out.verifiedDeals).toBe(0);
    expect(out.catalogOnlyCount).toBe(1);
  });

  it('imagen banner se descarta', () => {
    expect(isValidOfferImage('https://cdn.example.com/banner/hero.jpg')).toBe(false);
    expect(isValidOfferImage('https://i5.walmartimages.com.mx/asr/producto.jpg')).toBe(true);
  });
});

describe('FASE 9 budget / gates', () => {
  it('budget exhaustion no fetchea la superficie', async () => {
    let calls = 0;
    const fetchFn: DiscoverFetchFn = async () => {
      calls += 1;
      return ok(itemList([]));
    };
    const out = await discoverRetailerSurface(profile(), surface(), {
      robots: parseRobotsTxt('User-agent: *\nAllow: /\n'),
      fetchFn,
      session: { requests: 8, lastFetchAt: 0, crawlDelayMs: 0 },
      budget: { maxRequests: 8 },
    });
    expect(out.errorCode).toBe('budget_exhausted');
    expect(calls).toBe(0);
  });

  it('retailer BLOCKED_PENDING_POLICY_REVIEW: cero requests', async () => {
    let calls = 0;
    const run = await discoverRetailer(
      profile({
        retailer: 'soriana_mx',
        complianceStatus: 'BLOCKED_PENDING_POLICY_REVIEW',
        implementationStatus: 'BLOCKED_PENDING_POLICY_REVIEW',
      }),
      {
        fetchFn: async () => {
          calls += 1;
          return ok('no');
        },
      },
    );
    expect(calls).toBe(0);
    expect(run.requests).toBe(0);
    expect(run.surfaces[0]?.suggestedStatus).toBe('BLOCKED_PENDING_POLICY_REVIEW');
  });

  it('implementation DISABLED: cero fetch de superficie', async () => {
    const out = await discoverRetailerSurface(profile({ implementationStatus: 'DISABLED' }), surface(), {
      fetchFn: async () => {
        throw new Error('disabled must not fetch');
      },
    });
    expect(out.errorCode).toBe('disabled');
    expect(out.suggestedStatus).toBe('DISABLED');
  });

  it('source Day-to-Day sigue not_configured / OFF', async () => {
    for (const src of DAY_TO_DAY_SOURCES) {
      expect(src.isEnabled({ config: {} as never, rotationWave: 0 })).toBe(false);
      const out = await src.collect({ config: {} as never, rotationWave: 0 });
      expect(out.errorCode).toBe('not_configured');
    }
    expect(isDayToDayFlagOn('DAY_TO_DAY_CHEDRAUI_ENABLED')).toBe(false);
  });
});

describe('FASE 9 circuit breaker + no source-health write', () => {
  it('403 abre cooldown del breaker existente', () => {
    expect(cooldownMsForErrorCode('403')).toBeGreaterThan(0);
    const prev = defaultHealthRow('walmart_mx', { enabled: true, status: 'healthy' });
    let health = prev;
    for (let i = 0; i < 3; i += 1) {
      const next = applyBreakerTransition({
        previous: health,
        now: new Date(),
        collectOk: false,
        errorCode: '403',
        itemsFound: 0,
        probedAsHalfOpen: false,
      });
      health = { ...health, ...next };
    }
    expect(health.breakerState).toBe('open');
    expect(shouldAttemptCollect(health, new Date()).attempt).toBe(false);
  });

  it('discover no incrementa hunter source health', async () => {
    await discoverRetailerSurface(profile(), surface(), {
      robots: parseRobotsTxt('User-agent: *\nAllow: /\n'),
      fetchFn: async () => ok('<html>px-captcha</html>'),
    });
    expect(peekHunterHealthMemory('bodega_aurrera_mx')).toBeUndefined();
  });
});

describe('FASE 9 score / ranking', () => {
  it('evidenceYield y ranking priorizan evidencia, no volumen', () => {
    expect(evidenceYield(2, 10)).toBe(0.2);
    expect(evidenceYield(0, 0)).toBe(0);
    expect(suggestSurfaceStatus({
      robotsAllowed: true,
      challenged: false,
      timedOut: false,
      httpStatus: 200,
      candidateCount: 5,
      offerEvidenceCount: 1,
      errorCode: null,
    })).not.toBe('READY');

    const ranked = rankRetailerRuns(
      [profile({ retailer: 'walmart_mx', complexity: 'high' }), profile({ retailer: 'home_depot_mx', complexity: 'low' })],
      [
        {
          retailer: 'walmart_mx',
          robotsFetched: true,
          crawlDelaySeconds: null,
          requests: 2,
          surfaces: [],
          candidateCount: 40,
          offerEvidenceCount: 0,
          verifiedDeals: 0,
          promotionCount: 0,
          potentialCount: 0,
          catalogOnlyCount: 40,
          invalidEvidenceCount: 0,
          evidenceYield: 0,
          errors: 1,
          latencyMs: 10,
          antiBot: true,
          persisted: false,
        },
        {
          retailer: 'home_depot_mx',
          robotsFetched: true,
          crawlDelaySeconds: null,
          requests: 2,
          surfaces: [],
          candidateCount: 4,
          offerEvidenceCount: 2,
          verifiedDeals: 1,
          promotionCount: 1,
          potentialCount: 0,
          catalogOnlyCount: 2,
          invalidEvidenceCount: 0,
          evidenceYield: 0.5,
          errors: 0,
          latencyMs: 10,
          antiBot: false,
          persisted: false,
        },
      ],
    );
    expect(ranked[0]?.retailer).toBe('home_depot_mx');
  });

  it('matriz admin no inventa inserts', () => {
    const rows = summarizeRetailerDiscoveryMatrix();
    expect(rows.find((r) => r.retailer === 'soriana_mx')?.status).toBe('BLOCKED_PENDING_POLICY_REVIEW');
    expect(rows.every((r) => r.verifiedDeals === 0 && r.candidates === 0)).toBe(true);
  });
});

describe('FASE 9 safety', () => {
  it('no cambia verifier / autonomous / publisher', () => {
    expect(DEAL_VERIFIER_THRESHOLDS.absurdDiscountCap).toBe(85);
    expect(AUTONOMOUS_POLICY_V1.minAutoApproveConfidence).toBe(0.7);
    const cfg = loadBotIngestConfig();
    expect(cfg.legacyAutoApproveWriteEnabled).toBe(false);
  });
});
