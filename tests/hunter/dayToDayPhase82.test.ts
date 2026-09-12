import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHEDRAUI_DISCOVERY_SURFACES,
  CHEDRAUI_OBSERVED_SURFACES,
  DAY_TO_DAY_SOURCES,
  createRetailerSource,
  getSurfaceDiscoveryMetrics,
  isDayToDayFlagOn,
  isPathAllowedByRobots,
  isUrlAllowedByRobots,
  listingPageUrl,
  locMatchesPromoSlug,
  parseJsonLdProducts,
  parseRobotsTxt,
  resetSurfaceDiscoveryMetrics,
} from '@/lib/hunter/dayToDay';
import {
  publicProductToDraft,
  draftToIngestItem,
} from '@/lib/hunter/dayToDay/normalizeRetailCandidate';
import { scanProductBoundPromotionText } from '@/lib/hunter/dealQualification/signals';
import {
  qualifyCandidate,
  qualifyParsedOfferMetadata,
  resetDealQualificationMetrics,
} from '@/lib/hunter/dealQualification';
import { isValidOfferImage } from '@/lib/hunter/enrichment/isValidOfferImage';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { DEAL_VERIFIER_THRESHOLDS } from '@/lib/verifier/thresholds';
import { AUTONOMOUS_POLICY_V1 } from '@/lib/autonomous/policy';
import { HUNTER_METRIC_UNIVERSES } from '@/lib/hunter/metricUniverses';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetSurfaceDiscoveryMetrics();
  resetDealQualificationMetrics();
});

function ld(data: unknown): string {
  return `<html><head></head><body><script type="application/ld+json">${JSON.stringify(data)}</script></body></html>`;
}

function itemListHtml(products: Record<string, unknown>[]): string {
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
    name: 'Aceite vegetal Chedraui 1L',
    url: 'https://www.chedraui.com.mx/aceite-vegetal-1l-3100001/p',
    sku: '3100001',
    image: 'https://chedrauimx.vtexassets.com/arquivos/ids/aceite.jpg',
    offers: { '@type': 'Offer', price: 40, priceCurrency: 'MXN' },
    ...over,
  };
}

const ROBOTS = `User-agent: *
Disallow: /search?*
Disallow: /Despensa/
Sitemap: https://www.chedraui.com.mx/sitemap.xml
`;

function chedrauiSpec(surfaces: Parameters<typeof createRetailerSource>[0]['surfaces']) {
  return createRetailerSource({
    id: 'chedraui_mx',
    displayName: 'Chedraui',
    storeLabel: 'Chedraui',
    country: 'MX',
    priority: 82,
    enabledEnv: 'DAY_TO_DAY_CHEDRAUI_ENABLED',
    discoveryEnv: 'DAY_TO_DAY_CHEDRAUI_DISCOVERY',
    origin: 'https://www.chedraui.com.mx',
    robotsUrl: 'https://www.chedraui.com.mx/robots.txt',
    productSitemapUrls: ['https://www.chedraui.com.mx/sitemap/product-0.xml'],
    fixtureFile: 'chedraui-promotions.json',
    compliance: 'READY',
    surfaces,
  });
}

describe('FASE 8.2 surface matrix', () => {
  it('no declara READY solo porque la URL dice promociones', () => {
    expect(CHEDRAUI_DISCOVERY_SURFACES.every((s) => s.status !== 'READY')).toBe(true);
    expect(CHEDRAUI_OBSERVED_SURFACES.every((s) => s.status !== 'READY')).toBe(true);
    expect(CHEDRAUI_DISCOVERY_SURFACES.map((s) => s.status).sort()).toEqual(
      ['CATALOG_ONLY', 'CATALOG_ONLY', 'DEGRADED'].sort(),
    );
  });

  it('surfaceDiscovery universe is not autonomous nor source health', () => {
    expect(HUNTER_METRIC_UNIVERSES.surfaceDiscovery.note).toMatch(/No mezclar con source health ni autonomousPct/i);
    expect(HUNTER_METRIC_UNIVERSES.surfaceDiscovery.persistence).toBe('process_memory');
    expect(HUNTER_METRIC_UNIVERSES.autonomousShadow.persistence).toBe('process_memory');
    expect(HUNTER_METRIC_UNIVERSES.sourceHealth.persistence).toBe('supabase_hunter_source_health');
  });
});

describe('FASE 8.2 robots / compliance', () => {
  it('permite promociones y PDP; bloquea search y Despensa; sin crawl-delay', () => {
    const rules = parseRobotsTxt(ROBOTS);
    expect(rules.crawlDelaySeconds).toBeNull();
    expect(isPathAllowedByRobots('/promociones/nuestras-marcas', rules)).toBe(true);
    expect(isPathAllowedByRobots('/croissant-novia-3106012/p', rules)).toBe(true);
    expect(isPathAllowedByRobots('/Despensa/aceite', rules)).toBe(false);
    expect(isUrlAllowedByRobots('https://www.chedraui.com.mx/search?q=ofertas', rules)).toBe(false);
  });

  it('parsea Crawl-delay cuando existe', () => {
    const rules = parseRobotsTxt(`User-agent: *\nCrawl-delay: 2\nDisallow: /cart\n`);
    expect(rules.crawlDelaySeconds).toBe(2);
  });

  it('superficie BLOCKED_PENDING_POLICY_REVIEW no se fetchea', async () => {
    vi.stubEnv('DAY_TO_DAY_CHEDRAUI_DISCOVERY', '1');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('robots.txt')) return new Response(ROBOTS, { status: 200 });
      if (url.includes('blocked-internal')) {
        throw new Error('blocked surface must not be fetched');
      }
      return new Response(itemListHtml([]), { status: 200 });
    });
    const src = chedrauiSpec([
      {
        id: 'blocked_search',
        source: 'chedraui_mx',
        url: 'https://www.chedraui.com.mx/blocked-internal',
        kind: 'item_list',
        status: 'BLOCKED_PENDING_POLICY_REVIEW',
        notes: 'test',
      },
      {
        id: 'open_list',
        source: 'chedraui_mx',
        url: 'https://www.chedraui.com.mx/promociones/nuestras-marcas',
        kind: 'item_list',
        status: 'CATALOG_ONLY',
        notes: 'test',
        maxPages: 1,
      },
    ]);
    const out = await src.collect({ config: {} as never, rotationWave: 0 });
    expect(out.ok).toBe(true);
    const fetched = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(fetched.some((u) => u.includes('blocked-internal'))).toBe(false);
  });
});

describe('FASE 8.2 JSON-LD / structured data', () => {
  it('ItemList anidado produce productos', () => {
    const html = itemListHtml([productNode()]);
    const products = parseJsonLdProducts(html, 'https://www.chedraui.com.mx/promociones/nuestras-marcas');
    expect(products).toHaveLength(1);
    expect(products[0]?.title).toMatch(/Aceite/);
    expect(products[0]?.price).toBe(40);
    expect(products[0]?.originalPrice).toBeNull();
    expect(products[0]?.productId).toBe('3100001');
  });

  it('AggregateOffer high/low NO es originalPrice y el precio deja de ser fiable', () => {
    const html = itemListHtml([
      productNode({
        name: 'Queso panela 100 g',
        offers: {
          '@type': 'AggregateOffer',
          lowPrice: 32,
          highPrice: 320,
          priceCurrency: 'MXN',
          offers: { '@type': 'Offer', price: 32, priceCurrency: 'MXN' },
        },
      }),
    ]);
    const products = parseJsonLdProducts(html, 'https://www.chedraui.com.mx/promociones/perecederos');
    expect(products[0]?.priceReliable).toBe(false);
    expect(products[0]?.price).toBeNull();
    expect(products[0]?.originalPrice).toBeNull();
    const q = qualifyCandidate({
      currentPrice: products[0]?.price ?? null,
      originalPrice: products[0]?.originalPrice ?? null,
      currentPriceProvenance: 'source_explicit',
    });
    expect(q.qualification).toBe('NO_VERIFIED_DEAL');
  });

  it('precio original explícito vía priceSpecification.listPrice', () => {
    const html = ld(
      productNode({
        offers: {
          '@type': 'Offer',
          price: 479,
          priceCurrency: 'MXN',
          priceSpecification: { price: 479, listPrice: 559, priceCurrency: 'MXN' },
        },
      }),
    );
    const products = parseJsonLdProducts(html, 'https://www.chedraui.com.mx/aceite-vegetal-1l-3100001/p');
    expect(products[0]?.price).toBe(479);
    expect(products[0]?.originalPrice).toBe(559);
    const draft = publicProductToDraft(products[0]!, {
      store: 'Chedraui',
      source: 'chedraui_mx',
      sourceDetail: 'surface:test',
    })!;
    expect(qualifyParsedOfferMetadata(draftToIngestItem(draft)!.precomputedMeta!).qualification).toBe(
      'VERIFIED_DEAL',
    );
  });

  it('descuento explícito en offer.discountPercent', () => {
    const html = ld(
      productNode({
        offers: {
          '@type': 'Offer',
          price: 80,
          priceCurrency: 'MXN',
          discountPercent: 20,
        },
      }),
    );
    const products = parseJsonLdProducts(html, 'https://www.chedraui.com.mx/aceite-vegetal-1l-3100001/p');
    expect(products[0]?.explicitDiscountPercent).toBe(20);
    const q = qualifyCandidate({
      currentPrice: 80,
      originalPrice: null,
      explicitDiscountPercent: products[0]?.explicitDiscountPercent,
      discountPercentProvenance: 'source_explicit',
      currentPriceProvenance: 'source_explicit',
    });
    expect(q.qualification).toBe('VERIFIED_DEAL');
    expect(q.reasons).toContain('explicit_discount');
  });

  it('JSON-LD malformado se ignora', () => {
    const html = `<script type="application/ld+json">{not-json</script>${ld(productNode())}`;
    const products = parseJsonLdProducts(html, 'https://www.chedraui.com.mx/aceite-vegetal-1l-3100001/p');
    expect(products.some((p) => p.title?.includes('Aceite'))).toBe(true);
  });

  it('precios inválidos no se extraen', () => {
    const html = ld(productNode({ offers: { '@type': 'Offer', price: -5, priceCurrency: 'MXN' } }));
    const products = parseJsonLdProducts(html, 'https://www.chedraui.com.mx/aceite-vegetal-1l-3100001/p');
    expect(products[0]?.price).toBeNull();
  });
});

describe('FASE 8.2 promotion binding', () => {
  it('2x1 en el título del producto → PROMOTION ligada', () => {
    const html = ld(
      productNode({
        name: 'Té Doblett manzanilla 2x1 gratis 20 sobres',
        url: 'https://www.chedraui.com.mx/te-doblett-manzanilla-2x1-gratis-20-sobres-48g-3706076/p',
      }),
    );
    const products = parseJsonLdProducts(
      html,
      'https://www.chedraui.com.mx/te-doblett-manzanilla-2x1-gratis-20-sobres-48g-3706076/p',
    );
    expect(products[0]?.promotionType).toBe('2x1');
    expect(products[0]?.promotionBoundToProduct).toBe(true);
    const q = qualifyCandidate({
      currentPrice: 40,
      originalPrice: null,
      promotionKind: '2x1',
      promotionBoundToProduct: true,
      currentPriceProvenance: 'source_explicit',
    });
    expect(q.qualification).toBe('PROMOTION');
  });

  it('2x1l no es 2x1', () => {
    expect(scanProductBoundPromotionText('Aceite 2x1l oliva').kind).toBeNull();
    expect(locMatchesPromoSlug('https://www.chedraui.com.mx/aceite-2x1l-oliva-1/p')).toBe(false);
    expect(
      locMatchesPromoSlug(
        'https://www.chedraui.com.mx/te-doblett-manzanilla-2x1-gratis-20-sobres-48g-3706076/p',
      ),
    ).toBe(true);
  });

  it('combo de pack no es promoción; combo - 2x$ sí', () => {
    expect(scanProductBoundPromotionText('Batidora combo 3 velocidades').kind).toBeNull();
    expect(scanProductBoundPromotionText('Arroz integral combo - 2x$40').kind).toBe('combo');
  });

  it('no hereda el 15% / 3x2 del slug de la landing', () => {
    const html = itemListHtml([productNode({ name: 'Galletas María 800g' })]);
    const products = parseJsonLdProducts(
      html,
      'https://www.chedraui.com.mx/15-descuento-en-galletas',
    );
    expect(products[0]?.explicitDiscountPercent ?? null).toBeNull();
    expect(products[0]?.promotionType ?? null).toBeNull();
    const q = qualifyCandidate({
      currentPrice: products[0]?.price ?? null,
      originalPrice: null,
      promotionKind: null,
      promotionBoundToProduct: false,
      unboundPromotionMention: false,
      currentPriceProvenance: 'source_explicit',
    });
    expect(q.qualification).toBe('NO_VERIFIED_DEAL');
    expect(q.reasons).toContain('catalog_only');
  });

  it('mención de promo no ligada al producto → POTENTIAL_DEAL', () => {
    const q = qualifyCandidate({
      currentPrice: 26,
      originalPrice: null,
      promotionKind: null,
      promotionBoundToProduct: false,
      unboundPromotionMention: true,
      currentPriceProvenance: 'source_explicit',
    });
    expect(q.qualification).toBe('POTENTIAL_DEAL');
    expect(q.reasons).toContain('promotion_not_product_bound');
  });

  it('en PDP con varios Product, se queda el ligado a la URL', () => {
    const page = 'https://www.chedraui.com.mx/aceite-vegetal-1l-3100001/p';
    const html = `${ld(productNode({ name: 'Recomendado unrelated', url: 'https://www.chedraui.com.mx/otro-999/p', sku: '999' }))}${ld(productNode())}`;
    const products = parseJsonLdProducts(html, page);
    expect(products).toHaveLength(1);
    expect(products[0]?.productId).toBe('3100001');
  });
});

describe('FASE 8.2 images', () => {
  it('descarta banner / logo y conserva imagen de producto', () => {
    const banner = publicProductToDraft(
      {
        url: 'https://www.chedraui.com.mx/aceite-vegetal-1l-3100001/p',
        title: 'Aceite vegetal Chedraui 1L',
        price: 40,
        originalPrice: null,
        currency: 'MXN',
        image: 'https://cdn.example.com/banner/hero.jpg',
        productId: '3100001',
        brand: null,
        availability: null,
        category: null,
      },
      { store: 'Chedraui', source: 'chedraui_mx', sourceDetail: 'surface:test' },
    );
    expect(isValidOfferImage('https://cdn.example.com/banner/hero.jpg')).toBe(false);
    expect(banner?.image).toBeNull();

    const ok = publicProductToDraft(
      {
        url: 'https://www.chedraui.com.mx/aceite-vegetal-1l-3100001/p',
        title: 'Aceite vegetal Chedraui 1L',
        price: 40,
        originalPrice: null,
        currency: 'MXN',
        image: 'https://chedrauimx.vtexassets.com/arquivos/ids/aceite.jpg',
        productId: '3100001',
        brand: null,
        availability: null,
        category: null,
      },
      { store: 'Chedraui', source: 'chedraui_mx', sourceDetail: 'surface:test' },
    );
    expect(ok?.image).toContain('aceite.jpg');
  });
});

describe('FASE 8.2 pagination', () => {
  it('page 1 es canónica; page 2 añade query determinista', () => {
    const base = 'https://www.chedraui.com.mx/promociones/nuestras-marcas';
    expect(listingPageUrl(base, 1)).toBe(base);
    expect(listingPageUrl(base, 2)).toBe(`${base}?page=2`);
  });

  it('respeta maxPages y no pide page=2 si maxPages=1', async () => {
    vi.stubEnv('DAY_TO_DAY_CHEDRAUI_DISCOVERY', '1');
    const fetched: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      fetched.push(url);
      if (url.includes('robots.txt')) return new Response(ROBOTS, { status: 200 });
      return new Response(itemListHtml([productNode()]), { status: 200 });
    });
    const src = chedrauiSpec([
      {
        id: 'paged',
        source: 'chedraui_mx',
        url: 'https://www.chedraui.com.mx/promociones/nuestras-marcas',
        kind: 'item_list',
        status: 'CATALOG_ONLY',
        notes: 'test',
        maxPages: 1,
      },
    ]);
    await src.collect({ config: {} as never, rotationWave: 0 });
    expect(fetched.some((u) => u.includes('page=2'))).toBe(false);
  });
});

describe('FASE 8.2 collect surfaces', () => {
  it('catalog-only listing no entra al pipeline', async () => {
    vi.stubEnv('DAY_TO_DAY_CHEDRAUI_DISCOVERY', '1');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('robots.txt')) return new Response(ROBOTS, { status: 200 });
      if (url.includes('nuestras-marcas')) {
        return new Response(itemListHtml([productNode()]), { status: 200 });
      }
      return new Response('<?xml version="1.0"?><urlset></urlset>', { status: 200 });
    });
    const src = chedrauiSpec([
      {
        id: 'promociones_nuestras_marcas',
        source: 'chedraui_mx',
        url: 'https://www.chedraui.com.mx/promociones/nuestras-marcas',
        kind: 'item_list',
        status: 'CATALOG_ONLY',
        notes: 'test',
        maxPages: 1,
      },
    ]);
    const out = await src.collect({ config: {} as never, rotationWave: 0 });
    expect(out.ok).toBe(true);
    expect(out.candidates).toEqual([]);
    expect(out.skipReasonCounts?.catalog_only).toBeGreaterThan(0);
    const row = getSurfaceDiscoveryMetrics().find((r) => r.surfaceId === 'promociones_nuestras_marcas');
    expect(row?.catalogOnly).toBeGreaterThan(0);
    expect(row?.verifiedDeals).toBe(0);
    expect(row?.evidenceQuality).toBe('medium');
  });

  it('listing con original explícito produce VERIFIED_DEAL', async () => {
    vi.stubEnv('DAY_TO_DAY_CHEDRAUI_DISCOVERY', '1');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('robots.txt')) return new Response(ROBOTS, { status: 200 });
      return new Response(
        itemListHtml([
          productNode({
            offers: {
              '@type': 'Offer',
              price: 479,
              priceCurrency: 'MXN',
              priceSpecification: { listPrice: 559, price: 479 },
            },
          }),
        ]),
        { status: 200 },
      );
    });
    const src = chedrauiSpec([
      {
        id: 'ready_like',
        source: 'chedraui_mx',
        url: 'https://www.chedraui.com.mx/promociones/nuestras-marcas',
        kind: 'item_list',
        status: 'CATALOG_ONLY',
        notes: 'synthetic type A',
        maxPages: 1,
      },
    ]);
    const out = await src.collect({ config: {} as never, rotationWave: 0 });
    expect(out.candidates[0]?.rawMetadata.dealQualification).toBe('VERIFIED_DEAL');
    const row = getSurfaceDiscoveryMetrics().find((r) => r.surfaceId === 'ready_like');
    expect(row?.verifiedDeals).toBe(1);
    expect(row?.evidenceQuality).toBe('high');
  });

  it('sitemap slug filtra 2x1 y no 2x1l; PDP 2x1 → PROMOTION', async () => {
    vi.stubEnv('DAY_TO_DAY_CHEDRAUI_DISCOVERY', '1');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('robots.txt')) return new Response(ROBOTS, { status: 200 });
      if (url.includes('product-0.xml')) {
        return new Response(
          `<?xml version="1.0"?><urlset>
            <url><loc>https://www.chedraui.com.mx/aceite-2x1l-oliva-1/p</loc></url>
            <url><loc>https://www.chedraui.com.mx/te-doblett-manzanilla-2x1-gratis-20-sobres-48g-3706076/p</loc></url>
          </urlset>`,
          { status: 200 },
        );
      }
      if (url.includes('2x1-gratis')) {
        return new Response(
          ld(
            productNode({
              name: 'Té Doblett manzanilla 2x1 gratis 20 sobres',
              url: 'https://www.chedraui.com.mx/te-doblett-manzanilla-2x1-gratis-20-sobres-48g-3706076/p',
              sku: '3706076',
            }),
          ),
          { status: 200 },
        );
      }
      return new Response('no', { status: 404 });
    });
    const src = chedrauiSpec([
      {
        id: 'sitemap_promo_slug',
        source: 'chedraui_mx',
        url: 'https://www.chedraui.com.mx/sitemap/product-0.xml',
        kind: 'sitemap',
        status: 'DEGRADED',
        notes: 'test',
        locPattern: '-2x1-|2x1-gratis|-3x2-',
      },
    ]);
    const out = await src.collect({ config: {} as never, rotationWave: 0 });
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.rawMetadata.dealQualification).toBe('PROMOTION');
    const calls = vi.mocked(globalThis.fetch).mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('2x1l-oliva'))).toBe(false);
  });

  it('soft-zero: ItemList vacío no abre error de challenge', async () => {
    vi.stubEnv('DAY_TO_DAY_CHEDRAUI_DISCOVERY', '1');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('robots.txt')) return new Response(ROBOTS, { status: 200 });
      return new Response(itemListHtml([]), { status: 200 });
    });
    const src = chedrauiSpec([
      {
        id: 'empty_hub',
        source: 'chedraui_mx',
        url: 'https://www.chedraui.com.mx/promociones-exclusivas',
        kind: 'item_list',
        status: 'DEGRADED',
        notes: 'test',
        maxPages: 1,
      },
    ]);
    const out = await src.collect({ config: {} as never, rotationWave: 0 });
    expect(out.ok).toBe(true);
    expect(out.candidates).toEqual([]);
    expect(out.errorCode).toBeUndefined();
    expect(out.skipReasonCounts?.no_product_urls).toBe(1);
  });

  it('superficie disallow por robots se omite sin bypass', async () => {
    vi.stubEnv('DAY_TO_DAY_CHEDRAUI_DISCOVERY', '1');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('robots.txt')) return new Response(ROBOTS, { status: 200 });
      return new Response('should-not', { status: 200 });
    });
    const src = chedrauiSpec([
      {
        id: 'search_blocked',
        source: 'chedraui_mx',
        url: 'https://www.chedraui.com.mx/search?q=promociones',
        kind: 'item_list',
        status: 'CATALOG_ONLY',
        notes: 'disallow',
        maxPages: 1,
      },
    ]);
    const out = await src.collect({ config: {} as never, rotationWave: 0 });
    expect(out.ok).toBe(true);
    const fetched = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(fetched.filter((u) => u.includes('/search')).length).toBe(0);
    expect(getSurfaceDiscoveryMetrics().find((r) => r.surfaceId === 'search_blocked')?.errors).toBe(1);
  });
});

describe('FASE 8.2 safety', () => {
  it('flags Day-to-Day siguen OFF; auto-publish / legacy / autonomous intactos', () => {
    expect(isDayToDayFlagOn('DAY_TO_DAY_CHEDRAUI_ENABLED')).toBe(false);
    expect(isDayToDayFlagOn('DAY_TO_DAY_BODEGA_ENABLED')).toBe(false);
    expect(isDayToDayFlagOn('DAY_TO_DAY_WALMART_ENABLED')).toBe(false);
    const cfg = loadBotIngestConfig();
    expect(cfg.legacyAutoApproveWriteEnabled).toBe(false);
    expect(DEAL_VERIFIER_THRESHOLDS.absurdDiscountCap).toBe(85);
    expect(AUTONOMOUS_POLICY_V1.minAutoApproveConfidence).toBe(0.7);
    expect(DAY_TO_DAY_SOURCES.every((s) => s.isEnabled({ config: {} as never, rotationWave: 0 }) === false)).toBe(
      true,
    );
  });
});
