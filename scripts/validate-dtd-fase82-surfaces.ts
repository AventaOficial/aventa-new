/**
 * FASE 8.2 — pilot no persistente de superficies Chedraui.
 * Discovery en proceso. No toca production env. No inserta.
 *
 * Cada superficie se evalúa por separado (máx. 10 candidatos) para no mezclar
 * el presupuesto de collect() en modo PILOT.
 */
import { BOT_INGEST_USER_AGENT } from '../lib/bots/ingest/ingestHttp';
import { loadBotIngestConfig } from '../lib/bots/ingest/config';
import { parseJsonLdProducts } from '../lib/hunter/dayToDay/parsePublicProductHtml';
import { parseRobotsTxt, isUrlAllowedByRobots } from '../lib/hunter/dayToDay/robots';
import {
  CHEDRAUI_DISCOVERY_SURFACES,
  locMatchesPromoSlug,
  type DiscoverySurface,
} from '../lib/hunter/dayToDay/surfaces';
import {
  draftToIngestItem,
  publicProductToDraft,
} from '../lib/hunter/dayToDay/normalizeRetailCandidate';
import { isValidOfferImage } from '../lib/hunter/enrichment/isValidOfferImage';
import { qualifyCandidate } from '../lib/hunter/dealQualification/qualifyCandidate';
import { qualificationInputFromParsedMeta } from '../lib/hunter/dealQualification/applyToCandidates';
import { isDayToDayFlagOn } from '../lib/hunter/dayToDay/config';

const ORIGIN = 'https://www.chedraui.com.mx';
const MAX_PER_SURFACE = 10;
const TYPE_B_PROOF: DiscoverySurface = {
  id: 'seed_pdp_type_b_proof',
  source: 'chedraui_mx',
  url: 'https://www.chedraui.com.mx/te-doblett-manzanilla-2x1-gratis-20-sobres-48g-3706076/p',
  kind: 'seed_pdp',
  status: 'DEGRADED',
  notes: 'Prueba Type B (título 2x1). NO está cableada al adapter de producción.',
};

async function fetchText(url: string) {
  const t0 = Date.now();
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xml;q=0.9,*/*;q=0.8',
      'User-Agent': BOT_INGEST_USER_AGENT,
      'Accept-Language': 'es-MX,es;q=0.9',
    },
    redirect: 'follow',
    cache: 'no-store',
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text, ms: Date.now() - t0, finalUrl: res.url || url };
}

function qualifyProduct(
  product: ReturnType<typeof parseJsonLdProducts>[number],
): {
  qualification: string;
  reasons: string[];
} {
  const draft = publicProductToDraft(product, {
    store: 'Chedraui',
    source: 'chedraui_mx',
    sourceDetail: 'pilot',
  });
  if (!draft) {
    return { qualification: 'NO_VERIFIED_DEAL', reasons: ['catalog_only'] };
  }
  const item = draftToIngestItem(draft);
  if (!item?.precomputedMeta) {
    return { qualification: 'NO_VERIFIED_DEAL', reasons: ['catalog_only'] };
  }
  const q = qualifyCandidate(qualificationInputFromParsedMeta(item.precomputedMeta));
  return { qualification: q.qualification, reasons: q.reasons };
}

function tally(rows: Array<{ qualification: string }>) {
  return {
    candidates: rows.length,
    verifiedDeals: rows.filter((r) => r.qualification === 'VERIFIED_DEAL').length,
    promotions: rows.filter((r) => r.qualification === 'PROMOTION').length,
    potentialDeals: rows.filter((r) => r.qualification === 'POTENTIAL_DEAL').length,
    catalogOnly: rows.filter((r) => r.qualification === 'NO_VERIFIED_DEAL').length,
  };
}

async function evaluateSurface(
  surface: DiscoverySurface,
  rules: ReturnType<typeof parseRobotsTxt>,
): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  if (!isUrlAllowedByRobots(surface.url, rules)) {
    return {
      surface: surface.id,
      url: surface.url,
      configuredStatus: surface.status,
      robotsAllowed: false,
      status: 'BLOCKED_PENDING_POLICY_REVIEW',
      errors: 1,
      latencyMs: Date.now() - t0,
      ...tally([]),
    };
  }

  if (surface.kind === 'sitemap') {
    const sm = await fetchText(surface.url);
    if (!sm.ok) {
      return {
        surface: surface.id,
        url: surface.url,
        configuredStatus: surface.status,
        robotsAllowed: true,
        httpStatus: sm.status,
        errors: 1,
        latencyMs: Date.now() - t0,
        ...tally([]),
      };
    }
    const locs = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/gi)]
      .map((m) => m[1]!.trim())
      .filter((loc) => locMatchesPromoSlug(loc, surface.locPattern) && /\/p(?:\/|$|\?)/i.test(loc))
      .slice(0, MAX_PER_SURFACE);
    const samples = [];
    let errors = 0;
    for (const loc of locs.slice(0, 5)) {
      const pdp = await fetchText(loc);
      if (!pdp.ok) {
        errors += 1;
        continue;
      }
      const products = parseJsonLdProducts(pdp.text, pdp.finalUrl).slice(0, 1);
      for (const product of products) {
        const q = qualifyProduct(product);
        samples.push({
          title: product.title,
          url: product.url,
          price: product.price,
          originalPrice: product.originalPrice,
          promotionType: product.promotionType ?? null,
          imageOk: isValidOfferImage(product.image),
          ...q,
        });
      }
    }
    return {
      surface: surface.id,
      url: surface.url,
      configuredStatus: surface.status,
      robotsAllowed: true,
      httpStatus: sm.status,
      sitemapHits: locs.length,
      requests: 1 + Math.min(locs.length, 5),
      errors,
      latencyMs: Date.now() - t0,
      ...tally(samples),
      samples: samples.slice(0, 5),
    };
  }

  const page = await fetchText(surface.url);
  const products = parseJsonLdProducts(page.text, page.finalUrl).slice(0, MAX_PER_SURFACE);
  const samples = products.map((product) => {
    const q = qualifyProduct(product);
    return {
      title: product.title,
      url: product.url,
      price: product.price,
      originalPrice: product.originalPrice,
      priceReliable: product.priceReliable ?? true,
      promotionType: product.promotionType ?? null,
      sku: product.productId,
      imageOk: isValidOfferImage(product.image),
      ...q,
    };
  });
  return {
    surface: surface.id,
    url: surface.url,
    kind: surface.kind,
    configuredStatus: surface.status,
    robotsAllowed: true,
    httpStatus: page.status,
    requests: 1,
    errors: page.ok ? 0 : 1,
    structuredProducts: products.length,
    latencyMs: Date.now() - t0,
    ...tally(samples),
    samples: samples.slice(0, 5),
  };
}

async function main() {
  const cfg = loadBotIngestConfig();
  const robots = await fetchText(`${ORIGIN}/robots.txt`);
  const rules = parseRobotsTxt(robots.text);
  const surfaces: DiscoverySurface[] = [...CHEDRAUI_DISCOVERY_SURFACES, TYPE_B_PROOF];
  const rows = [];
  for (const surface of surfaces) {
    rows.push(await evaluateSurface(surface, rules));
  }

  console.log(
    JSON.stringify(
      {
        persisted: false,
        crawlDelay: rules.crawlDelaySeconds,
        robotsOk: robots.ok,
        surfaces: rows,
        flags: {
          chedrauiEnabled: process.env.DAY_TO_DAY_CHEDRAUI_ENABLED ?? null,
          chedrauiDiscoveryProcessOnly: process.env.DAY_TO_DAY_CHEDRAUI_DISCOVERY ?? null,
          bodegaEnabled: process.env.DAY_TO_DAY_BODEGA_ENABLED ?? null,
          walmartEnabled: process.env.DAY_TO_DAY_WALMART_ENABLED ?? null,
          autoPublish: process.env.BOT_INGEST_AUTO_PUBLISH ?? null,
          legacyAutoApprove: cfg.legacyAutoApproveWriteEnabled,
          chedrauiFlagOn: isDayToDayFlagOn('DAY_TO_DAY_CHEDRAUI_ENABLED'),
        },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(String(e));
  process.exit(2);
});
