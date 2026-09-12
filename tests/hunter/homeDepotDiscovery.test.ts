import { afterEach, describe, expect, it } from 'vitest';
import { gzipSync } from 'zlib';
import {
  classifyDiscoveryChannel,
  classifySitemapUrl,
  discoverSitemapChannel,
  isSitemapIndexXml,
  isStrictPromoProductUrl,
  profileFor,
  resetRetailerDiscoveryMetrics,
  selectChildSitemaps,
  selectProductUrls,
  sitemapFetchBudget,
  type DiscoverFetchFn,
  type RetailerDiscoveryProfile,
} from '@/lib/hunter/retailerDiscovery';
import { fetchPublicText } from '@/lib/hunter/dayToDay/fetchPublic';
import { parseJsonLdProducts } from '@/lib/hunter/dayToDay/parsePublicProductHtml';
import { parseRobotsTxt, isUrlAllowedByRobots } from '@/lib/hunter/dayToDay/robots';
import { isValidOfferImage } from '@/lib/hunter/enrichment/isValidOfferImage';
import { crawlWaitMs } from '@/lib/hunter/retailerDiscovery/budgets';
import { HUNTER_HTTP_TIMEOUT_MS } from '@/lib/server/fetchWithTimeout';
import { DAY_TO_DAY_SOURCES, isDayToDayFlagOn } from '@/lib/hunter/dayToDay';
import { HUNTER_METRIC_UNIVERSES } from '@/lib/hunter/metricUniverses';
import { DEAL_VERIFIER_THRESHOLDS } from '@/lib/verifier/thresholds';
import { AUTONOMOUS_POLICY_V1 } from '@/lib/autonomous/policy';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';

afterEach(() => {
  resetRetailerDiscoveryMetrics();
});

const ORIGIN = 'https://www.homedepot.com.mx';

function hdProfile(over: Partial<RetailerDiscoveryProfile> = {}): RetailerDiscoveryProfile {
  return {
    ...profileFor('home_depot_mx')!,
    publicSurfaces: [],
    ...over,
  };
}

function ok(body: string, url = ORIGIN, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: body, timedOut: false, finalUrl: url };
}

function productLd(over: Record<string, unknown> = {}) {
  return `<html><script type="application/ld+json">${JSON.stringify({
    '@type': 'Product',
    name: 'Taladro Bosch 20V',
    url: `${ORIGIN}/p/taladro-bosch-20v-297545`,
    sku: '297545',
    image: 'https://www.homedepot.com.mx/medias/taladro.jpg',
    offers: { '@type': 'Offer', price: 799, priceCurrency: 'MXN' },
    ...over,
  })}</script></html>`;
}

function indexXml(children: string[]) {
  return `<?xml version="1.0"?><sitemapindex>${children
    .map((u) => `<sitemap><loc>${u}</loc></sitemap>`)
    .join('')}</sitemapindex>`;
}

function urlset(locs: string[]) {
  return `<?xml version="1.0"?><urlset>${locs.map((u) => `<url><loc>${u}</loc></url>`).join('')}</urlset>`;
}

describe('FASE 9.1 sitemap selection', () => {
  it('clasifica index / product / promotion / landing / image', () => {
    expect(classifySitemapUrl('https://www.homedepot.com.mx/sitemap_10351.xml')).toBe('index');
    expect(classifySitemapUrl('https://www.homedepot.com.mx/sitemap_10351_1.xml.gz')).toBe('product');
    expect(classifySitemapUrl('https://www.homedepot.com.mx/product-sitemap.xml')).toBe('product');
    expect(classifySitemapUrl('https://www.homedepot.com.mx/sitemap-promotions.xml')).toBe('promotion');
    expect(classifySitemapUrl('https://www.homedepot.com.mx/sitemap-landings.xml')).toBe('landing');
    expect(classifySitemapUrl('https://www.homedepot.com.mx/sitemap-image.xml')).toBe('image');
    expect(isSitemapIndexXml('<sitemapindex></sitemapindex>')).toBe(true);
    expect(isSitemapIndexXml('<urlset></urlset>')).toBe(false);
  });

  it('elige child sitemaps determinista y descarta image', () => {
    const selected = selectChildSitemaps(
      [
        `${ORIGIN}/sitemap-image.xml`,
        `${ORIGIN}/sitemap-landings.xml`,
        `${ORIGIN}/sitemap_10351_2.xml.gz`,
        `${ORIGIN}/sitemap_10351_1.xml.gz`,
        `${ORIGIN}/sitemap-promotions.xml`,
      ],
      3,
    );
    expect(selected[0]).toContain('sitemap-promotions');
    expect(selected[1]).toContain('sitemap_10351_1');
    expect(selected[2]).toContain('sitemap_10351_2');
    expect(selected.some((u) => u.includes('image'))).toBe(false);
    expect(selected.some((u) => u.includes('landing'))).toBe(false);
    expect(selectChildSitemaps([`${ORIGIN}/sitemap-landings.xml`, `${ORIGIN}/sitemap_10351_1.xml.gz`], 1)[0]).toContain(
      'sitemap_10351_1',
    );
  });

  it('PDPs: slug 2x1 real primero; 2x1l / medidas no', () => {
    const urls = selectProductUrls(
      [
        `${ORIGIN}/`,
        `${ORIGIN}/p/codo-1-2x1-2x3-4-701220`,
        `${ORIGIN}/p/aceite-2x1l-oliva-1`,
        `${ORIGIN}/p/maceta-2x1-viena-20-color-chocolate-102050`,
        `${ORIGIN}/p/taladro-bosch-297545`,
      ],
      { origin: ORIGIN, max: 3 },
    );
    expect(urls[0]).toContain('maceta-2x1-viena');
    expect(isStrictPromoProductUrl(`${ORIGIN}/p/maceta-2x1-viena-20-color-chocolate-102050`)).toBe(true);
    expect(isStrictPromoProductUrl(`${ORIGIN}/p/codo-1-2x1-2x3-4-701220`)).toBe(false);
    expect(isStrictPromoProductUrl(`${ORIGIN}/p/aceite-2x1l-oliva-1`)).toBe(false);
    expect(urls).not.toContain(`${ORIGIN}/`);
  });

  it('sitemapFetchBudget deja hueco para PDPs', () => {
    expect(sitemapFetchBudget(6, 3, 4)).toBe(2);
    expect(sitemapFetchBudget(0, 3, 4)).toBe(0);
  });
});

describe('FASE 9.1 robots / crawl-delay / HTTP', () => {
  it('robots allow vs search/cart blocked', () => {
    const rules = parseRobotsTxt(`User-agent: *\nDisallow: /search\nDisallow: /cart\nCrawl-delay: 2\nSitemap: ${ORIGIN}/sitemap_10351.xml\n`);
    expect(rules.crawlDelaySeconds).toBe(2);
    expect(isUrlAllowedByRobots(`${ORIGIN}/p/x-1`, rules)).toBe(true);
    expect(isUrlAllowedByRobots(`${ORIGIN}/search?q=ofertas`, rules)).toBe(false);
    expect(isUrlAllowedByRobots(`${ORIGIN}/cart`, rules)).toBe(false);
    expect(crawlWaitMs(1000, 2000, 1200)).toBe(1800);
  });

  it('robots disallow del sitemap → BLOCKED, cero PDP', async () => {
    const fetchFn: DiscoverFetchFn = async (url) => {
      if (url.includes('robots')) {
        return ok(`User-agent: *\nDisallow: /sitemap\n`, `${ORIGIN}/robots.txt`);
      }
      throw new Error(`unexpected ${url}`);
    };
    const out = await discoverSitemapChannel(hdProfile(), {
      fetchFn,
      sitemapIndexUrl: `${ORIGIN}/sitemap_10351.xml`,
    });
    expect(out.verdict).toBe('BLOCKED_PENDING_POLICY_REVIEW');
    expect(out.pdpInspected).toBe(0);
  });

  it('403 / 429 / timeout en index → DEGRADED', async () => {
    for (const res of [
      ok('no', ORIGIN, 403),
      ok('no', ORIGIN, 429),
      { ok: false, status: 0, text: '', timedOut: true, finalUrl: ORIGIN },
    ]) {
      const fetchFn: DiscoverFetchFn = async (url) => {
        if (url.includes('robots')) return ok('User-agent: *\nAllow: /\nSitemap: https://www.homedepot.com.mx/sitemap_10351.xml');
        return res;
      };
      const out = await discoverSitemapChannel(hdProfile(), { fetchFn, sitemapIndexUrl: `${ORIGIN}/sitemap_10351.xml` });
      expect(out.verdict).toBe('DEGRADED');
      expect(out.persisted).toBe(false);
    }
  });
});

describe('FASE 9.1 PDP evidence', () => {
  function channelFetch(pdpHtml: string): DiscoverFetchFn {
    return async (url) => {
      if (url.includes('robots')) {
        return ok(`User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap_10351.xml`);
      }
      if (/sitemap_10351\.xml(?:$|\?)/.test(url)) {
        return ok(indexXml([`${ORIGIN}/sitemap_10351_1.xml.gz`]), url);
      }
      if (/sitemap_10351_\d+/.test(url)) {
        return ok(urlset([`${ORIGIN}/p/taladro-bosch-20v-297545`]), url);
      }
      return ok(pdpHtml, url);
    };
  }

  it('Product + Offer JSON-LD catalog-only', async () => {
    const out = await discoverSitemapChannel(hdProfile(), { fetchFn: channelFetch(productLd()) });
    expect(out.pdpInspected).toBe(1);
    expect(out.catalogOnly).toBe(1);
    expect(out.verifiedDeals).toBe(0);
    expect(out.verdict).toBe('CATALOG_ONLY');
    expect(out.samples[0]?.currentPriceProvenance).toBe('source_explicit');
    expect(out.samples[0]?.originalPriceProvenance).toBe('unknown');
  });

  it('original explícito → VERIFIED_DEAL / PROMISING', async () => {
    const html = productLd({
      offers: {
        '@type': 'Offer',
        price: 799,
        priceCurrency: 'MXN',
        priceSpecification: { listPrice: 999, price: 799 },
      },
    });
    const out = await discoverSitemapChannel(hdProfile(), { fetchFn: channelFetch(html) });
    expect(out.verifiedDeals).toBe(1);
    expect(out.verdict).toBe('PROMISING');
    expect(out.samples[0]?.originalPrice).toBe(999);
  });

  it('descuento explícito', async () => {
    const html = productLd({
      offers: { '@type': 'Offer', price: 80, priceCurrency: 'MXN', discountPercent: 20 },
    });
    const out = await discoverSitemapChannel(hdProfile(), { fetchFn: channelFetch(html) });
    expect(out.verifiedDeals).toBe(1);
  });

  it('AggregateOffer highPrice no es originalPrice', () => {
    const html = productLd({
      offers: {
        '@type': 'AggregateOffer',
        lowPrice: 32,
        highPrice: 320,
        priceCurrency: 'MXN',
        offers: { '@type': 'Offer', price: 32 },
      },
    });
    const products = parseJsonLdProducts(html, `${ORIGIN}/p/x-1`);
    expect(products[0]?.originalPrice).toBeNull();
    expect(products[0]?.priceReliable).toBe(false);
  });

  it('slug 2x1 stale en sitemap no es PROMOTION si el PDP es catálogo', async () => {
    const fetchFn: DiscoverFetchFn = async (url) => {
      if (url.includes('robots')) {
        return ok(`User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap_10351.xml`);
      }
      if (/sitemap_10351\.xml(?:$|\?)/.test(url)) {
        return ok(indexXml([`${ORIGIN}/sitemap_10351_1.xml.gz`]), url);
      }
      if (/sitemap_10351_\d+/.test(url)) {
        return ok(urlset([`${ORIGIN}/p/maceta-2x1-viena-20-color-chocolate-102050`]), url);
      }
      return ok(productLd({ name: 'MACETA DE PLÁSTICO REDONDA EXTRA GRANDE CHOCOLATE 20"' }), url);
    };
    const out = await discoverSitemapChannel(hdProfile(), { fetchFn });
    expect(out.promoSlugHits).toBe(1);
    expect(out.promoSlugSamples[0]).toContain('maceta-2x1-viena');
    expect(out.samples[0]?.selectionReason).toBe('promo_slug');
    expect(out.promotions).toBe(0);
    expect(out.verifiedDeals).toBe(0);
    expect(out.catalogOnly).toBe(1);
    expect(out.verdict).toBe('CATALOG_ONLY');
  });

  it('2x1 en título → PROMOTION; banner global no', async () => {
    const promo = await discoverSitemapChannel(hdProfile(), {
      fetchFn: channelFetch(productLd({ name: 'Maceta Viena 2x1 Gratis 20 cm' })),
    });
    expect(promo.promotions).toBe(1);
    expect(promo.verdict).toBe('PROMISING');

    const bannerHtml = `<nav>Ofertas</nav><div class="hero-banner">Hasta 50% de descuento en toda la tienda</div>${productLd({ name: 'Maceta Viena 20 cm' })}`;
    const banner = await discoverSitemapChannel(hdProfile(), {
      fetchFn: channelFetch(bannerHtml),
    });
    expect(banner.promotions).toBe(0);
    expect(banner.catalogOnly).toBe(1);
  });

  it('precio malformado no fabrica deal', () => {
    const html = productLd({ offers: { '@type': 'Offer', price: -9, priceCurrency: 'MXN' } });
    const products = parseJsonLdProducts(html, `${ORIGIN}/p/x-1`);
    expect(products[0]?.price).toBeNull();
  });

  it('imagen banner inválida', () => {
    expect(isValidOfferImage('https://www.homedepot.com.mx/banner/hero.jpg')).toBe(false);
    expect(isValidOfferImage('https://www.homedepot.com.mx/medias/taladro.jpg')).toBe(true);
  });
});

describe('FASE 9.1 gunzip + verdict + flags', () => {
  it('decodea sitemap gzip', async () => {
    const xml = urlset([`${ORIGIN}/p/x-1`]);
    const gz = gzipSync(Buffer.from(xml));
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('.gz')) {
        return new Response(Uint8Array.from(gz), { status: 200 });
      }
      return new Response(xml, { status: 200 });
    };
    const prev = globalThis.fetch;
    globalThis.fetch = fetchImpl as typeof fetch;
    try {
      const out = await fetchPublicText(`${ORIGIN}/sitemap_10351_1.xml.gz`, HUNTER_HTTP_TIMEOUT_MS);
      expect(out.text).toContain('/p/x-1');
    } finally {
      globalThis.fetch = prev;
    }
  });

  it('verdict: PROMISING ≠ READY; catálogo no es canal de deals', () => {
    expect(
      classifyDiscoveryChannel({
        robotsAllowed: true,
        challenged: false,
        pdpInspected: 4,
        offerEvidenceCount: 1,
        catalogOnly: 3,
        sustainable: false,
      }),
    ).toBe('PROMISING');
    expect(
      classifyDiscoveryChannel({
        robotsAllowed: true,
        challenged: false,
        pdpInspected: 4,
        offerEvidenceCount: 0,
        catalogOnly: 4,
        sustainable: false,
      }),
    ).toBe('CATALOG_ONLY');
    expect(
      classifyDiscoveryChannel({
        robotsAllowed: false,
        challenged: false,
        pdpInspected: 0,
        offerEvidenceCount: 0,
        catalogOnly: 0,
        sustainable: false,
      }),
    ).toBe('BLOCKED_PENDING_POLICY_REVIEW');
  });

  it('Home Depot sigue sin flag / sin adapter productivo', () => {
    expect(isDayToDayFlagOn('DAY_TO_DAY_CHEDRAUI_ENABLED')).toBe(false);
    expect(isDayToDayFlagOn('DAY_TO_DAY_BODEGA_ENABLED')).toBe(false);
    expect(isDayToDayFlagOn('DAY_TO_DAY_WALMART_ENABLED')).toBe(false);
    expect(profileFor('home_depot_mx')?.implementationStatus).toBe('NOT_CONFIGURED');
    expect(profileFor('home_depot_mx')?.complianceStatus).toBe('CATALOG_ONLY');
    expect(DAY_TO_DAY_SOURCES.some((s) => s.id === 'home_depot_mx')).toBe(false);
    expect(HUNTER_METRIC_UNIVERSES.sitemapChannelDiscovery.note).toMatch(/no source health/i);
    expect(DEAL_VERIFIER_THRESHOLDS.absurdDiscountCap).toBe(85);
    expect(AUTONOMOUS_POLICY_V1.minAutoApproveConfidence).toBe(0.7);
    expect(loadBotIngestConfig().legacyAutoApproveWriteEnabled).toBe(false);
  });
});
