import { sleep } from '@/lib/bots/ingest/ingestHttp';
import { detectBotChallenge, parseJsonLdProducts } from '@/lib/hunter/dayToDay/parsePublicProductHtml';
import { listingPageUrl, locMatchesPromoSlug } from '@/lib/hunter/dayToDay/surfaces';
import {
  extractSitemapLocs,
  fetchPublicText,
  looksLikeProductUrl,
  type PublicFetchResult,
} from '@/lib/hunter/dayToDay/fetchPublic';
import { isUrlAllowedByRobots, parseRobotsTxt, type RobotsRules } from '@/lib/hunter/dayToDay/robots';
import {
  draftToIngestItem,
  publicProductToDraft,
} from '@/lib/hunter/dayToDay/normalizeRetailCandidate';
import { isValidOfferImage } from '@/lib/hunter/enrichment/isValidOfferImage';
import { qualifyCandidate } from '@/lib/hunter/dealQualification/qualifyCandidate';
import { qualificationInputFromParsedMeta } from '@/lib/hunter/dealQualification/applyToCandidates';
import type { IngestSourceId } from '@/lib/bots/ingest/types';
import type { DiscoveryBudget, RetailerDiscoveryProfile, RetailerSurfaceSpec, SurfaceDiscoveryResult } from './types';
import { mergeDiscoveryBudget, crawlWaitMs } from './budgets';
import { evidenceYield, isInvalidPriceReason, isOfferEvidence, suggestSurfaceStatus } from './classify';
import { recordRetailerSurfaceDiscovery } from './metrics';

export type DiscoverFetchFn = (url: string, timeoutMs: number) => Promise<PublicFetchResult>;

export type DiscoverSession = {
  requests: number;
  lastFetchAt: number;
  crawlDelayMs: number;
};

export type DiscoverSurfaceOptions = {
  budget?: Partial<DiscoveryBudget>;
  robots?: RobotsRules;
  session?: DiscoverSession;
  fetchFn?: DiscoverFetchFn;
};

function ingestSourceFor(profile: RetailerDiscoveryProfile): IngestSourceId {
  if (
    profile.retailer === 'chedraui_mx' ||
    profile.retailer === 'bodega_aurrera_mx' ||
    profile.retailer === 'walmart_mx'
  ) {
    return profile.retailer;
  }
  return 'env_urls';
}

function emptyResult(
  profile: RetailerDiscoveryProfile,
  surface: RetailerSurfaceSpec,
  patch: Partial<SurfaceDiscoveryResult>,
): SurfaceDiscoveryResult {
  return {
    retailer: profile.retailer,
    surfaceId: surface.id,
    url: surface.url,
    robotsAllowed: true,
    httpStatus: null,
    timedOut: false,
    challenged: false,
    requests: 0,
    errors: 0,
    latencyMs: 0,
    candidateCount: 0,
    offerEvidenceCount: 0,
    verifiedDeals: 0,
    promotionCount: 0,
    potentialCount: 0,
    catalogOnlyCount: 0,
    invalidEvidenceCount: 0,
    evidenceYield: 0,
    suggestedStatus: 'DEGRADED',
    declaredStatus: surface.status,
    persisted: false,
    errorCode: null,
    samples: [],
    ...patch,
  };
}

/**
 * Evalúa UNA superficie. No inserta. No publica. No escribe source health.
 */
export async function discoverRetailerSurface(
  profile: RetailerDiscoveryProfile,
  surface: RetailerSurfaceSpec,
  opts: DiscoverSurfaceOptions = {},
): Promise<SurfaceDiscoveryResult> {
  const budget = mergeDiscoveryBudget(opts.budget);
  const fetchFn = opts.fetchFn ?? fetchPublicText;
  const session = opts.session ?? { requests: 0, lastFetchAt: 0, crawlDelayMs: budget.crawlDelayMs };
  const t0 = Date.now();

  if (profile.complianceStatus === 'BLOCKED_PENDING_POLICY_REVIEW') {
    const row = emptyResult(profile, surface, {
      robotsAllowed: false,
      suggestedStatus: 'BLOCKED_PENDING_POLICY_REVIEW',
      errorCode: 'blocked_policy',
    });
    recordRetailerSurfaceDiscovery(row);
    return row;
  }
  if (profile.implementationStatus === 'DISABLED') {
    const row = emptyResult(profile, surface, {
      suggestedStatus: 'DISABLED',
      errorCode: 'disabled',
    });
    recordRetailerSurfaceDiscovery(row);
    return row;
  }
  if (surface.status === 'BLOCKED_PENDING_POLICY_REVIEW') {
    const row = emptyResult(profile, surface, {
      robotsAllowed: false,
      suggestedStatus: 'BLOCKED_PENDING_POLICY_REVIEW',
      errorCode: 'blocked_policy',
    });
    recordRetailerSurfaceDiscovery(row);
    return row;
  }
  if (session.requests >= budget.maxRequests) {
    const row = emptyResult(profile, surface, {
      suggestedStatus: 'DEGRADED',
      errorCode: 'budget_exhausted',
      errors: 1,
    });
    recordRetailerSurfaceDiscovery(row);
    return row;
  }

  let rules = opts.robots;
  if (!rules) {
    const loaded = await loadRobotsForProfile(profile, { budget, fetchFn, session });
    if (!loaded.ok) {
      const row = emptyResult(profile, surface, {
        robotsAllowed: false,
        timedOut: loaded.timedOut,
        httpStatus: loaded.status,
        requests: 1,
        errors: 1,
        errorCode: loaded.timedOut ? 'timeout' : 'robots_unavailable',
        suggestedStatus: 'DEGRADED',
        latencyMs: Date.now() - t0,
      });
      recordRetailerSurfaceDiscovery(row);
      return row;
    }
    rules = loaded.rules;
  }
  if (!isUrlAllowedByRobots(surface.url, rules)) {
    const row = emptyResult(profile, surface, {
      robotsAllowed: false,
      suggestedStatus: 'BLOCKED_PENDING_POLICY_REVIEW',
      errorCode: 'robots_disallow',
      latencyMs: Date.now() - t0,
    });
    recordRetailerSurfaceDiscovery(row);
    return row;
  }

  const gatedFetch = async (url: string): Promise<PublicFetchResult> => {
    const wait = crawlWaitMs(session.lastFetchAt, session.crawlDelayMs, Date.now());
    if (wait > 0) await sleep(wait);
    session.requests += 1;
    const res = await fetchFn(url, budget.timeoutMs);
    session.lastFetchAt = Date.now();
    return res;
  };

  if (surface.kind === 'sitemap') {
    return finish(await discoverSitemap(profile, surface, budget, gatedFetch, session, t0), profile, surface);
  }

  const pages = Math.min(surface.maxPages ?? budget.maxPages, budget.maxPages);
  const page = await gatedFetch(listingPageUrl(surface.url, Math.min(pages, 1)));
  return finish(evaluateFetchedPage(profile, surface, page, session, t0, 1), profile, surface);
}

async function discoverSitemap(
  profile: RetailerDiscoveryProfile,
  surface: RetailerSurfaceSpec,
  budget: DiscoveryBudget,
  gatedFetch: (url: string) => Promise<PublicFetchResult>,
  session: DiscoverSession,
  t0: number,
): Promise<SurfaceDiscoveryResult> {
  const sm = await gatedFetch(surface.url);
  if (sm.timedOut) {
    return emptyResult(profile, surface, {
      timedOut: true,
      requests: 1,
      errors: 1,
      errorCode: 'timeout',
      suggestedStatus: 'DEGRADED',
      latencyMs: Date.now() - t0,
    });
  }
  if (sm.status === 401 || sm.status === 403 || (sm.status === 200 && detectBotChallenge(sm.text, sm.status))) {
    return emptyResult(profile, surface, {
      httpStatus: sm.status || 403,
      challenged: true,
      requests: 1,
      errors: 1,
      errorCode: String(sm.status === 200 ? 403 : sm.status || 403),
      suggestedStatus: 'DEGRADED',
      latencyMs: Date.now() - t0,
    });
  }
  if (sm.status === 429) {
    return emptyResult(profile, surface, {
      httpStatus: 429,
      requests: 1,
      errors: 1,
      errorCode: '429',
      suggestedStatus: 'DEGRADED',
      latencyMs: Date.now() - t0,
    });
  }
  if (!sm.ok) {
    return emptyResult(profile, surface, {
      httpStatus: sm.status,
      requests: 1,
      errors: 1,
      errorCode: String(sm.status || 'http_error'),
      suggestedStatus: 'DEGRADED',
      latencyMs: Date.now() - t0,
    });
  }

  const locs = extractSitemapLocs(sm.text)
    .filter((loc) => looksLikeProductUrl(loc))
    .filter((loc) => (surface.locPattern ? locMatchesPromoSlug(loc, surface.locPattern) : true))
    .slice(0, budget.maxPilotCandidates);

  const acc = emptyResult(profile, surface, { httpStatus: sm.status, requests: 1 });
  const maxPdps = Math.min(
    budget.maxPilotCandidates,
    Math.max(0, budget.maxRequests - session.requests),
  );
  for (const loc of locs.slice(0, maxPdps)) {
    if (session.requests >= budget.maxRequests) break;
    const pdp = await gatedFetch(loc);
    acc.requests += 1;
    if (pdp.timedOut) {
      acc.timedOut = true;
      acc.errors += 1;
      acc.errorCode = 'timeout';
      break;
    }
    if (pdp.status === 429) {
      acc.httpStatus = 429;
      acc.errors += 1;
      acc.errorCode = '429';
      break;
    }
    if (pdp.status === 401 || pdp.status === 403 || (pdp.status === 200 && detectBotChallenge(pdp.text, pdp.status))) {
      acc.challenged = true;
      acc.httpStatus = pdp.status === 200 ? 403 : pdp.status;
      acc.errors += 1;
      acc.errorCode = String(acc.httpStatus);
      break;
    }
    if (!pdp.ok) {
      acc.errors += 1;
      continue;
    }
    mergePageProducts(acc, profile, parseJsonLdProducts(pdp.text, pdp.finalUrl), budget);
    if (acc.candidateCount >= budget.maxPilotCandidates) break;
  }
  acc.latencyMs = Date.now() - t0;
  return acc;
}

function evaluateFetchedPage(
  profile: RetailerDiscoveryProfile,
  surface: RetailerSurfaceSpec,
  page: PublicFetchResult,
  session: DiscoverSession,
  t0: number,
  surfaceRequests: number,
): SurfaceDiscoveryResult {
  if (page.timedOut) {
    return emptyResult(profile, surface, {
      timedOut: true,
      requests: surfaceRequests,
      errors: 1,
      errorCode: 'timeout',
      suggestedStatus: 'DEGRADED',
      latencyMs: Date.now() - t0,
    });
  }
  if (page.status === 429) {
    return emptyResult(profile, surface, {
      httpStatus: 429,
      requests: surfaceRequests,
      errors: 1,
      errorCode: '429',
      suggestedStatus: 'DEGRADED',
      latencyMs: Date.now() - t0,
    });
  }
  if (page.status === 401 || page.status === 403 || (page.status === 200 && detectBotChallenge(page.text, page.status))) {
    return emptyResult(profile, surface, {
      httpStatus: page.status === 200 ? 403 : page.status,
      challenged: true,
      requests: surfaceRequests,
      errors: 1,
      errorCode: String(page.status === 200 ? 403 : page.status || 403),
      suggestedStatus: 'DEGRADED',
      latencyMs: Date.now() - t0,
    });
  }
  if (!page.ok) {
    return emptyResult(profile, surface, {
      httpStatus: page.status,
      requests: surfaceRequests,
      errors: 1,
      errorCode: String(page.status || 'http_error'),
      suggestedStatus: 'DEGRADED',
      latencyMs: Date.now() - t0,
    });
  }
  const acc = emptyResult(profile, surface, {
    httpStatus: page.status,
    requests: surfaceRequests,
    latencyMs: Date.now() - t0,
  });
  mergePageProducts(
    acc,
    profile,
    parseJsonLdProducts(page.text, page.finalUrl),
    mergeDiscoveryBudget(),
  );
  void session;
  return acc;
}

function mergePageProducts(
  acc: SurfaceDiscoveryResult,
  profile: RetailerDiscoveryProfile,
  products: ReturnType<typeof parseJsonLdProducts>,
  budget: DiscoveryBudget,
) {
  const source = ingestSourceFor(profile);
  for (const product of products) {
    if (acc.candidateCount >= budget.maxPilotCandidates) break;
    const draft = publicProductToDraft(product, {
      store: profile.displayName,
      source,
      sourceDetail: `discover:${profile.retailer}:${acc.surfaceId}`,
    });
    if (!draft) continue;
    const item = draftToIngestItem(draft);
    if (!item?.precomputedMeta) continue;
    const q = qualifyCandidate(qualificationInputFromParsedMeta(item.precomputedMeta));
    acc.candidateCount += 1;
    if (q.qualification === 'VERIFIED_DEAL') acc.verifiedDeals += 1;
    else if (q.qualification === 'PROMOTION') acc.promotionCount += 1;
    else if (q.qualification === 'POTENTIAL_DEAL') acc.potentialCount += 1;
    else acc.catalogOnlyCount += 1;
    if (isOfferEvidence(q.qualification)) acc.offerEvidenceCount += 1;
    if (isInvalidPriceReason(q.reasons)) acc.invalidEvidenceCount += 1;
    if (acc.samples.length < 5) {
      acc.samples.push({
        title: product.title,
        url: product.url,
        price: q.currentPrice,
        originalPrice: q.originalPrice,
        qualification: q.qualification,
        reasons: q.reasons,
        imageOk: isValidOfferImage(draft.image),
        promotionType: product.promotionType ?? null,
        discount: q.derivedDiscountPercent,
        currentPriceProvenance: q.currentPriceProvenance,
        originalPriceProvenance: q.originalPriceProvenance,
      });
    }
  }
}

function finish(
  row: SurfaceDiscoveryResult,
  profile: RetailerDiscoveryProfile,
  surface: RetailerSurfaceSpec,
): SurfaceDiscoveryResult {
  row.evidenceYield = evidenceYield(row.offerEvidenceCount, row.candidateCount);
  row.suggestedStatus = suggestSurfaceStatus(row);
  row.declaredStatus = surface.status;
  row.retailer = profile.retailer;
  recordRetailerSurfaceDiscovery(row);
  return row;
}

export async function loadRobotsForProfile(
  profile: RetailerDiscoveryProfile,
  opts: { budget?: Partial<DiscoveryBudget>; fetchFn?: DiscoverFetchFn; session?: DiscoverSession } = {},
): Promise<{ rules: RobotsRules; ok: boolean; timedOut: boolean; status: number }> {
  const budget = mergeDiscoveryBudget(opts.budget);
  const fetchFn = opts.fetchFn ?? fetchPublicText;
  const session = opts.session ?? { requests: 0, lastFetchAt: 0, crawlDelayMs: budget.crawlDelayMs };
  const wait = crawlWaitMs(session.lastFetchAt, session.crawlDelayMs, Date.now());
  if (wait > 0) await sleep(wait);
  session.requests += 1;
  const res = await fetchFn(profile.robotsUrl, budget.timeoutMs);
  session.lastFetchAt = Date.now();
  if (!res.ok) {
    return { rules: { disallows: [], allows: [], sitemaps: [], crawlDelaySeconds: null }, ok: false, timedOut: res.timedOut, status: res.status };
  }
  const rules = parseRobotsTxt(res.text);
  if (rules.crawlDelaySeconds && rules.crawlDelaySeconds > 0) {
    session.crawlDelayMs = Math.max(session.crawlDelayMs, rules.crawlDelaySeconds * 1000);
  }
  return { rules, ok: true, timedOut: false, status: res.status };
}

/**
 * Evalúa las superficies de un retailer. Robots una vez. Sin persistir.
 */
export async function discoverRetailer(
  profile: RetailerDiscoveryProfile,
  opts: DiscoverSurfaceOptions & { surfaces?: RetailerSurfaceSpec[] } = {},
): Promise<import('./types').RetailerDiscoveryRun> {
  const t0 = Date.now();
  const budget = mergeDiscoveryBudget(opts.budget);
  const surfaces = opts.surfaces ?? profile.publicSurfaces;
  const session = opts.session ?? { requests: 0, lastFetchAt: 0, crawlDelayMs: budget.crawlDelayMs };

  if (profile.complianceStatus === 'BLOCKED_PENDING_POLICY_REVIEW') {
    return {
      retailer: profile.retailer,
      robotsFetched: false,
      crawlDelaySeconds: null,
      requests: 0,
      surfaces: surfaces.map((s) =>
        emptyResult(profile, s, {
          robotsAllowed: false,
          suggestedStatus: 'BLOCKED_PENDING_POLICY_REVIEW',
          errorCode: 'blocked_policy',
        }),
      ),
      candidateCount: 0,
      offerEvidenceCount: 0,
      verifiedDeals: 0,
      promotionCount: 0,
      potentialCount: 0,
      catalogOnlyCount: 0,
      invalidEvidenceCount: 0,
      evidenceYield: 0,
      errors: 0,
      latencyMs: Date.now() - t0,
      antiBot: false,
      persisted: false,
    };
  }

  const robots = await loadRobotsForProfile(profile, { budget, fetchFn: opts.fetchFn, session });
  if (!robots.ok) {
    return {
      retailer: profile.retailer,
      robotsFetched: false,
      crawlDelaySeconds: null,
      requests: session.requests,
      surfaces: surfaces.map((s) =>
        emptyResult(profile, s, {
          timedOut: robots.timedOut,
          httpStatus: robots.status,
          errors: 1,
          errorCode: robots.timedOut ? 'timeout' : 'robots_unavailable',
          suggestedStatus: 'DEGRADED',
        }),
      ),
      candidateCount: 0,
      offerEvidenceCount: 0,
      verifiedDeals: 0,
      promotionCount: 0,
      potentialCount: 0,
      catalogOnlyCount: 0,
      invalidEvidenceCount: 0,
      evidenceYield: 0,
      errors: surfaces.length,
      latencyMs: Date.now() - t0,
      antiBot: robots.status === 401 || robots.status === 403,
      persisted: false,
    };
  }
  const rows: SurfaceDiscoveryResult[] = [];
  for (const surface of surfaces) {
    if (session.requests >= budget.maxRequests) {
      rows.push(
        emptyResult(profile, surface, {
          errorCode: 'budget_exhausted',
          suggestedStatus: 'DEGRADED',
          errors: 1,
        }),
      );
      continue;
    }
    rows.push(
      await discoverRetailerSurface(profile, surface, {
        budget,
        robots: robots.rules,
        session,
        fetchFn: opts.fetchFn,
      }),
    );
    if (rows[rows.length - 1]?.errorCode === '429') break;
  }

  const candidateCount = rows.reduce((n, r) => n + r.candidateCount, 0);
  const offerEvidenceCount = rows.reduce((n, r) => n + r.offerEvidenceCount, 0);
  return {
    retailer: profile.retailer,
    robotsFetched: robots.ok,
    crawlDelaySeconds: robots.rules.crawlDelaySeconds,
    requests: session.requests,
    surfaces: rows,
    candidateCount,
    offerEvidenceCount,
    verifiedDeals: rows.reduce((n, r) => n + r.verifiedDeals, 0),
    promotionCount: rows.reduce((n, r) => n + r.promotionCount, 0),
    potentialCount: rows.reduce((n, r) => n + r.potentialCount, 0),
    catalogOnlyCount: rows.reduce((n, r) => n + r.catalogOnlyCount, 0),
    invalidEvidenceCount: rows.reduce((n, r) => n + r.invalidEvidenceCount, 0),
    evidenceYield: evidenceYield(offerEvidenceCount, candidateCount),
    errors: rows.reduce((n, r) => n + r.errors, 0),
    latencyMs: Date.now() - t0,
    antiBot: rows.some((r) => r.challenged),
    persisted: false,
  };
}
