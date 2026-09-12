import { readFileSync } from 'fs';
import { join } from 'path';
import { sleep } from '@/lib/bots/ingest/ingestHttp';
import { HUNTER_HTTP_TIMEOUT_MS } from '@/lib/server/fetchWithTimeout';
import { extractSitemapLocs, fetchPublicText, looksLikeProductUrl } from './fetchPublic';
import { ingestItemToCandidate } from '../normalize';
import { filterQualifiedHunterCandidates } from '../dealQualification';
import type {
  HunterCandidate,
  HunterCollectContext,
  HunterCollectResult,
  HunterSource,
  HunterSourceId,
} from '../types';
import type { IngestSourceId } from '@/lib/bots/ingest/types';
import {
  DAY_TO_DAY_ENV,
  dayToDayRatePolicyForRun,
  isDayToDayFlagOn,
  isDayToDayFixturesMode,
} from './config';
import { type DayToDayComplianceStatus } from './capabilityMatrix';
import {
  detectBotChallenge,
  parseJsonLdProducts,
  type PublicProductCandidate,
} from './parsePublicProductHtml';
import { draftToIngestItem, publicProductToDraft } from './normalizeRetailCandidate';
import { isUrlAllowedByRobots, parseRobotsTxt, type RobotsRules } from './robots';
import {
  listingPageUrl,
  locMatchesPromoSlug,
  surfaceIdFromSourceDetail,
  type DiscoverySurface,
} from './surfaces';
import { recordSurfaceDiscovery } from './surfaceMetrics';

export type RetailerAdapterSpec = {
  id: HunterSourceId & IngestSourceId;
  displayName: string;
  storeLabel: string;
  country: string;
  priority: number;
  enabledEnv: string;
  discoveryEnv: string;
  origin: string;
  robotsUrl: string;
  /** Sitemap index o product sitemap. */
  productSitemapUrls: string[];
  /** Paths disallow extra (además de robots). */
  fixtureFile: string;
  compliance: DayToDayComplianceStatus;
  surfaces?: DiscoverySurface[];
};

function fixturePath(file: string): string {
  return join(process.cwd(), 'tests', 'fixtures', 'dayToDay', file);
}

export function loadRetailerFixtureProducts(file: string): PublicProductCandidate[] {
  const raw = readFileSync(fixturePath(file), 'utf8');
  const parsed = JSON.parse(raw) as { products?: PublicProductCandidate[] };
  return Array.isArray(parsed.products) ? parsed.products : [];
}

const fetchText = fetchPublicText;

function sameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

function recordQualificationBySurface(rows: HunterCandidate[]) {
  const acc = new Map<
    string,
    {
      verifiedDeals: number;
      promotions: number;
      potentialDeals: number;
      catalogOnly: number;
      candidates: number;
    }
  >();
  for (const candidate of rows) {
    const id = surfaceIdFromSourceDetail(
      candidate.rawMetadata.sourceDetail ?? candidate.ingestItem.sourceDetail,
    );
    if (!id) continue;
    const row = acc.get(id) ?? {
      verifiedDeals: 0,
      promotions: 0,
      potentialDeals: 0,
      catalogOnly: 0,
      candidates: 0,
    };
    row.candidates += 1;
    const q = candidate.rawMetadata.dealQualification;
    if (q === 'VERIFIED_DEAL') row.verifiedDeals += 1;
    else if (q === 'PROMOTION') row.promotions += 1;
    else if (q === 'POTENTIAL_DEAL') row.potentialDeals += 1;
    else row.catalogOnly += 1;
    acc.set(id, row);
  }
  for (const [surfaceId, patch] of acc) {
    recordSurfaceDiscovery({ surfaceId, ...patch });
  }
}

function qualifyRetailCollect(candidates: ReturnType<typeof ingestItemToCandidate>[]): {
  candidates: typeof candidates;
  itemsFound: number;
  collectedCount: number;
  skipReasonCounts?: Record<string, number>;
  qualificationSamples?: Array<{
    title: string | null;
    url: string;
    price: number | null;
    originalPrice: number | null;
    qualification: string;
    reasons: string[];
  }>;
} {
  const { forIngest, skipped, skipReasonCounts, evaluated, samples } =
    filterQualifiedHunterCandidates(candidates);
  recordQualificationBySurface([...forIngest, ...skipped]);
  const skips = { ...skipReasonCounts };
  if (forIngest.length === 0 && evaluated === 0) {
    skips.zero_results = (skips.zero_results ?? 0) + 1;
  }
  return {
    candidates: forIngest,
    itemsFound: forIngest.length,
    collectedCount: forIngest.length,
    skipReasonCounts: Object.keys(skips).length > 0 ? skips : undefined,
    qualificationSamples: samples,
  };
}

/**
 * Factory de retailer Day-to-Day.
 * Default: NOT_CONFIGURED (discovery flag off) → cero requests.
 */
export function createRetailerSource(spec: RetailerAdapterSpec): HunterSource {
  const rateBase = dayToDayRatePolicyForRun();

  const isDiscoveryReady = () => isDayToDayFlagOn(spec.discoveryEnv);
  const isEnabled = () => isDayToDayFlagOn(spec.enabledEnv);

  return {
    id: spec.id,
    ingestSourceId: spec.id,
    displayName: spec.displayName,
    priority: spec.priority,
    expectedIntervalMs: 60 * 60 * 1000,
    family: 'day_to_day',
    country: spec.country,
    capabilities: {
      discovery: true,
      productLookup: true,
      images: true,
      price: true,
    },
    discoveryMethod: 'public_page',
    affiliateStatus: 'unavailable',
    ratePolicy: { ...rateBase },
    isEnabled: () => isEnabled(),
    isAvailable: () => isDiscoveryReady() && spec.compliance !== 'BLOCKED' && spec.compliance !== 'BLOCKED_PENDING_POLICY_REVIEW',
    isConfigured: () => isDiscoveryReady() && (spec.compliance === 'READY' || spec.compliance === 'DEGRADED'),
    async collect(ctx: HunterCollectContext): Promise<HunterCollectResult> {
      if (!isDiscoveryReady()) {
        return {
          ok: true,
          candidates: [],
          itemsFound: 0,
          collectedCount: 0,
          errorCode: 'not_configured',
          errorMessageSafe: `${spec.id} discovery flag off`,
        };
      }

      const policy = dayToDayRatePolicyForRun();
      const timeoutMs = Math.min(policy.timeoutMs, HUNTER_HTTP_TIMEOUT_MS);
      const maxItems = policy.maxItems;
      const maxRequests = policy.requestsPerCycle;
      let requests = 0;

      // Fixtures: piloto seguro sin red (tests / DRY).
      if (isDayToDayFixturesMode()) {
        const products = loadRetailerFixtureProducts(spec.fixtureFile).slice(0, maxItems);
        const candidates = [];
        const detectedAt = (ctx.now ?? new Date()).toISOString();
        for (const p of products) {
          const draft = publicProductToDraft(p, {
            store: spec.storeLabel,
            source: spec.id,
            sourceDetail: `fixture:${spec.fixtureFile}`,
          });
          if (!draft) continue;
          const item = draftToIngestItem(draft);
          if (!item) continue;
          candidates.push(ingestItemToCandidate(item, spec.id, detectedAt));
        }
        return {
          ok: true,
          ...qualifyRetailCollect(candidates),
        };
      }

      // Live: robots + superficies configuradas o sitemap → PDP JSON-LD.
      requests += 1;
      const robotsRes = await fetchText(spec.robotsUrl, timeoutMs);
      if (robotsRes.timedOut) {
        return {
          ok: false,
          candidates: [],
          itemsFound: 0,
          collectedCount: 0,
          errorCode: 'timeout',
          errorMessageSafe: 'robots.txt timeout',
        };
      }
      let rules: RobotsRules = { disallows: [], allows: [], sitemaps: [], crawlDelaySeconds: null };
      if (robotsRes.ok) rules = parseRobotsTxt(robotsRes.text);
      let lastFetchAt = Date.now();
      const crawlDelayMs = Math.min((rules.crawlDelaySeconds ?? 0) * 1000, 15_000);
      const fetchGated = async (url: string) => {
        if (crawlDelayMs > 0 && lastFetchAt > 0) {
          const wait = crawlDelayMs - (Date.now() - lastFetchAt);
          if (wait > 0) await sleep(wait);
        }
        const res = await fetchText(url, timeoutMs);
        lastFetchAt = Date.now();
        return res;
      };

      const detectedAt = (ctx.now ?? new Date()).toISOString();
      const listingCandidates: ReturnType<typeof ingestItemToCandidate>[] = [];
      const productUrls: Array<{ url: string; surfaceId: string }> = [];
      const surfaces = (spec.surfaces ?? []).filter((s) => {
        if (s.status === 'BLOCKED_PENDING_POLICY_REVIEW') return false;
        return true;
      });
      const sitemapTargets: Array<{ url: string; surfaceId: string; locPattern?: string }> =
        surfaces.length > 0
          ? surfaces
              .filter((s) => s.kind === 'sitemap')
              .map((s) => ({ url: s.url, surfaceId: s.id, locPattern: s.locPattern }))
          : spec.productSitemapUrls.map((url) => ({ url, surfaceId: 'sitemap_default' }));

      const failBlocked = (status: number, message: string) => ({
        ok: false as const,
        candidates: [],
        itemsFound: 0,
        collectedCount: 0,
        errorCode: String(status),
        errorMessageSafe: message,
      });

      for (const surface of surfaces.filter((s) => s.kind === 'item_list' || s.kind === 'seed_pdp')) {
        if (requests >= maxRequests) break;
        if (!isUrlAllowedByRobots(surface.url, rules)) {
          recordSurfaceDiscovery({ surfaceId: surface.id, errors: 1 });
          continue;
        }
        if (surface.kind === 'seed_pdp') {
          if (looksLikeProductUrl(surface.url) && sameOrigin(surface.url, spec.origin)) {
            productUrls.push({ url: surface.url, surfaceId: surface.id });
          }
          continue;
        }
        const pages = Math.min(surface.maxPages ?? policy.maxPages, policy.maxPages);
        const tSurface = Date.now();
        let surfaceProducts = 0;
        let surfaceRequests = 0;
        let surfaceErrors = 0;
        for (let page = 1; page <= pages; page += 1) {
          if (requests >= maxRequests) break;
          requests += 1;
          surfaceRequests += 1;
          const listingUrl = listingPageUrl(surface.url, page);
          const listing = await fetchGated(listingUrl);
          if (listing.timedOut) {
            surfaceErrors += 1;
            break;
          }
          if (listing.status === 429) {
            recordSurfaceDiscovery({
              surfaceId: surface.id,
              requests: surfaceRequests,
              errors: 1,
              latencyMs: Date.now() - tSurface,
            });
            return failBlocked(429, 'rate limited');
          }
          if (detectBotChallenge(listing.text, listing.status) || listing.status === 401 || listing.status === 403) {
            recordSurfaceDiscovery({
              surfaceId: surface.id,
              requests: surfaceRequests,
              errors: 1,
              latencyMs: Date.now() - tSurface,
            });
            return failBlocked(listing.status === 200 ? 403 : listing.status || 403, `${spec.id} blocked by anti-bot challenge`);
          }
          if (!listing.ok) {
            surfaceErrors += 1;
            continue;
          }
          const products = parseJsonLdProducts(listing.text, listing.finalUrl);
          surfaceProducts += products.length;
          for (const product of products) {
            if (!sameOrigin(product.url, spec.origin)) continue;
            if (product.priceReliable === false && product.promotionType && looksLikeProductUrl(product.url)) {
              productUrls.push({ url: product.url, surfaceId: surface.id });
              continue;
            }
            const draft = publicProductToDraft(product, {
              store: spec.storeLabel,
              source: spec.id,
              sourceDetail: `surface:${surface.id}`,
            });
            if (!draft) continue;
            const item = draftToIngestItem(draft);
            if (!item) continue;
            listingCandidates.push(ingestItemToCandidate(item, spec.id, detectedAt));
            if (listingCandidates.length + productUrls.length >= maxItems) break;
          }
          if (listingCandidates.length + productUrls.length >= maxItems) break;
        }
        recordSurfaceDiscovery({
          surfaceId: surface.id,
          requests: surfaceRequests,
          products: surfaceProducts,
          errors: surfaceErrors,
          candidates: listingCandidates.filter((c) => String(c.rawMetadata.sourceDetail ?? '').includes(surface.id)).length,
          latencyMs: Date.now() - tSurface,
        });
      }

      for (const sitemap of sitemapTargets) {
        if (requests >= maxRequests) break;
        if (productUrls.length >= maxItems) break;
        if (!isUrlAllowedByRobots(sitemap.url, rules)) {
          recordSurfaceDiscovery({ surfaceId: sitemap.surfaceId, errors: 1 });
          continue;
        }
        requests += 1;
        const t0 = Date.now();
        const sm = await fetchGated(sitemap.url);
        if (sm.timedOut) {
          return {
            ok: false,
            candidates: [],
            itemsFound: 0,
            collectedCount: 0,
            errorCode: 'timeout',
            errorMessageSafe: 'sitemap timeout',
          };
        }
        if (!sm.ok) {
          if (sm.status === 403 || sm.status === 401 || detectBotChallenge(sm.text, sm.status)) {
            recordSurfaceDiscovery({ surfaceId: sitemap.surfaceId, requests: 1, errors: 1, latencyMs: Date.now() - t0 });
            return failBlocked(sm.status || 403, 'sitemap blocked');
          }
          recordSurfaceDiscovery({ surfaceId: sitemap.surfaceId, requests: 1, errors: 1, latencyMs: Date.now() - t0 });
          continue;
        }
        let added = 0;
        for (const loc of extractSitemapLocs(sm.text)) {
          if (!looksLikeProductUrl(loc)) continue;
          if (sitemap.locPattern && !locMatchesPromoSlug(loc, sitemap.locPattern)) continue;
          if (!isUrlAllowedByRobots(loc, rules)) continue;
          if (!sameOrigin(loc, spec.origin)) continue;
          productUrls.push({ url: loc, surfaceId: sitemap.surfaceId });
          added += 1;
          if (productUrls.length >= maxItems) break;
        }
        recordSurfaceDiscovery({
          surfaceId: sitemap.surfaceId,
          requests: 1,
          products: added,
          latencyMs: Date.now() - t0,
        });
      }

      if (listingCandidates.length === 0 && productUrls.length === 0) {
        return {
          ok: true,
          candidates: [],
          itemsFound: 0,
          collectedCount: 0,
          skipReasonCounts: { no_product_urls: 1 },
        };
      }

      const candidates = [...listingCandidates];
      let challengeHits = 0;

      for (const queued of productUrls.slice(0, maxItems)) {
        if (candidates.length >= maxItems) break;
        if (requests >= maxRequests) break;
        requests += 1;
        const pdp = await fetchGated(queued.url);
        if (pdp.timedOut) {
          return {
            ok: false,
            candidates,
            itemsFound: candidates.length,
            collectedCount: candidates.length,
            errorCode: 'timeout',
            errorMessageSafe: 'pdp timeout',
          };
        }
        if (pdp.status === 429) {
          return failBlocked(429, 'rate limited');
        }
        if (detectBotChallenge(pdp.text, pdp.status) || pdp.status === 401 || pdp.status === 403) {
          challengeHits += 1;
          recordSurfaceDiscovery({ surfaceId: queued.surfaceId, requests: 1, errors: 1 });
          return failBlocked(
            pdp.status === 200 ? 403 : pdp.status || 403,
            `${spec.id} blocked by anti-bot challenge`,
          );
        }
        if (!pdp.ok) continue;

        const products = parseJsonLdProducts(pdp.text, pdp.finalUrl);
        for (const product of products) {
          const draft = publicProductToDraft(product, {
            store: spec.storeLabel,
            source: spec.id,
            sourceDetail: `surface:${queued.surfaceId}:pdp`,
          });
          if (!draft) continue;
          const item = draftToIngestItem(draft);
          if (!item) continue;
          candidates.push(ingestItemToCandidate(item, spec.id, detectedAt));
          if (candidates.length >= maxItems) break;
        }
      }

      if (challengeHits > 0 && candidates.length === 0) {
        return failBlocked(403, `${spec.id} blocked by anti-bot challenge`);
      }

      const qualified = qualifyRetailCollect(candidates);
      return {
        ok: true,
        ...qualified,
      };
    },
  };
}

export function retailerEnvPair(id: 'walmart_mx' | 'bodega_aurrera_mx' | 'chedraui_mx') {
  if (id === 'walmart_mx') {
    return { enabled: DAY_TO_DAY_ENV.walmart_mx, discovery: DAY_TO_DAY_ENV.walmart_mx_discovery };
  }
  if (id === 'bodega_aurrera_mx') {
    return {
      enabled: DAY_TO_DAY_ENV.bodega_aurrera_mx,
      discovery: DAY_TO_DAY_ENV.bodega_aurrera_mx_discovery,
    };
  }
  return { enabled: DAY_TO_DAY_ENV.chedraui_mx, discovery: DAY_TO_DAY_ENV.chedraui_mx_discovery };
}
