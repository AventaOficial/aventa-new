/**
 * Canal sitemap → PDP. No inserta. No crea adapter.
 * Presupuesto: pocos sitemaps, pocos PDPs, concurrency 1.
 */
import { detectBotChallenge, parseJsonLdProducts } from '@/lib/hunter/dayToDay/parsePublicProductHtml';
import {
  extractSitemapLocs,
  fetchPublicText,
  looksLikeProductUrl,
  type PublicFetchResult,
} from '@/lib/hunter/dayToDay/fetchPublic';
import { isUrlAllowedByRobots } from '@/lib/hunter/dayToDay/robots';
import { sleep } from '@/lib/bots/ingest/ingestHttp';
import type { DiscoveryBudget, RetailerDiscoveryProfile, SitemapChannelReport, SurfaceCandidateSample } from './types';
import { mergeDiscoveryBudget, crawlWaitMs } from './budgets';
import { classifyDiscoveryChannel, evidenceYield } from './classify';
import {
  draftToIngestItem,
  publicProductToDraft,
} from '@/lib/hunter/dayToDay/normalizeRetailCandidate';
import { isValidOfferImage } from '@/lib/hunter/enrichment/isValidOfferImage';
import { qualifyCandidate } from '@/lib/hunter/dealQualification/qualifyCandidate';
import { qualificationInputFromParsedMeta } from '@/lib/hunter/dealQualification/applyToCandidates';
import type { IngestSourceId } from '@/lib/bots/ingest/types';
import type { DiscoverFetchFn, DiscoverSession } from './discoverSurface';
import { loadRobotsForProfile } from './discoverSurface';
import {
  isSitemapIndexXml,
  isStrictPromoProductUrl,
  selectChildSitemaps,
  selectProductUrls,
  sitemapFetchBudget,
} from './sitemapSelect';

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

function emptyReport(profile: RetailerDiscoveryProfile, patch: Partial<SitemapChannelReport>): SitemapChannelReport {
  return {
    retailer: profile.retailer,
    robotsAllowed: true,
    crawlDelaySeconds: null,
    sitemapIndexUrl: null,
    sitemapsFound: [],
    sitemapsInspected: [],
    productLocsSeen: 0,
    promoSlugHits: 0,
    promoSlugSamples: [],
    pdpInspected: 0,
    requests: 0,
    verifiedDeals: 0,
    promotions: 0,
    potentialDeals: 0,
    catalogOnly: 0,
    errors: 0,
    evidenceYield: 0,
    productBindingSuccess: 0,
    latencyMs: 0,
    discoveryMethod: 'none',
    verdict: 'DEGRADED',
    persisted: false,
    samples: [],
    ...patch,
  };
}

function qualifyPdpHtml(
  profile: RetailerDiscoveryProfile,
  html: string,
  pageUrl: string,
  selectionReason: SurfaceCandidateSample['selectionReason'] = null,
): SurfaceCandidateSample | null {
  const products = parseJsonLdProducts(html, pageUrl);
  const product = products[0];
  if (!product) return null;
  const draft = publicProductToDraft(product, {
    store: profile.displayName,
    source: ingestSourceFor(profile),
    sourceDetail: `sitemap_channel:${profile.retailer}`,
  });
  if (!draft) return null;
  const item = draftToIngestItem(draft);
  if (!item?.precomputedMeta) return null;
  const q = qualifyCandidate(qualificationInputFromParsedMeta(item.precomputedMeta));
  return {
    title: product.title,
    url: product.url || pageUrl,
    price: q.currentPrice,
    originalPrice: q.originalPrice,
    qualification: q.qualification,
    reasons: q.reasons,
    imageOk: isValidOfferImage(draft.image),
    promotionType: product.promotionType ?? null,
    discount: q.derivedDiscountPercent,
    currentPriceProvenance: q.currentPriceProvenance,
    originalPriceProvenance: q.originalPriceProvenance,
    productId: product.productId,
    brand: product.brand,
    availability: product.availability,
    selectionReason,
    requestedUrl: pageUrl,
  };
}

export async function discoverSitemapChannel(
  profile: RetailerDiscoveryProfile,
  opts: {
    budget?: Partial<DiscoveryBudget>;
    fetchFn?: DiscoverFetchFn;
    sitemapIndexUrl?: string;
  } = {},
): Promise<SitemapChannelReport> {
  const t0 = Date.now();
  const budget = mergeDiscoveryBudget(opts.budget);
  const fetchFn = opts.fetchFn ?? fetchPublicText;
  const session: DiscoverSession = { requests: 0, lastFetchAt: 0, crawlDelayMs: budget.crawlDelayMs };

  if (profile.complianceStatus === 'BLOCKED_PENDING_POLICY_REVIEW') {
    return emptyReport(profile, {
      robotsAllowed: false,
      verdict: 'BLOCKED_PENDING_POLICY_REVIEW',
      latencyMs: Date.now() - t0,
    });
  }

  const robots = await loadRobotsForProfile(profile, { budget, fetchFn, session });
  if (!robots.ok) {
    return emptyReport(profile, {
      robotsAllowed: false,
      requests: session.requests,
      errors: 1,
      crawlDelaySeconds: null,
      verdict: 'DEGRADED',
      latencyMs: Date.now() - t0,
    });
  }

  const gatedFetch = async (url: string): Promise<PublicFetchResult> => {
    const wait = crawlWaitMs(session.lastFetchAt, session.crawlDelayMs, Date.now());
    if (wait > 0) await sleep(wait);
    session.requests += 1;
    const res = await fetchFn(url, budget.timeoutMs);
    session.lastFetchAt = Date.now();
    return res;
  };

  const indexUrl = opts.sitemapIndexUrl ?? robots.rules.sitemaps[0] ?? `${profile.origin}/sitemap.xml`;
  if (!isUrlAllowedByRobots(indexUrl, robots.rules)) {
    return emptyReport(profile, {
      robotsAllowed: false,
      crawlDelaySeconds: robots.rules.crawlDelaySeconds,
      sitemapIndexUrl: indexUrl,
      requests: session.requests,
      verdict: 'BLOCKED_PENDING_POLICY_REVIEW',
      latencyMs: Date.now() - t0,
    });
  }

  if (session.requests >= budget.maxRequests) {
    return emptyReport(profile, {
      crawlDelaySeconds: robots.rules.crawlDelaySeconds,
      sitemapIndexUrl: indexUrl,
      requests: session.requests,
      errors: 1,
      verdict: 'DEGRADED',
      latencyMs: Date.now() - t0,
    });
  }

  const indexRes = await gatedFetch(indexUrl);
  if (indexRes.timedOut || indexRes.status === 429 || indexRes.status === 401 || indexRes.status === 403) {
    return emptyReport(profile, {
      crawlDelaySeconds: robots.rules.crawlDelaySeconds,
      sitemapIndexUrl: indexUrl,
      requests: session.requests,
      errors: 1,
      verdict: indexRes.status === 401 || indexRes.status === 403 ? 'DEGRADED' : 'DEGRADED',
      latencyMs: Date.now() - t0,
    });
  }
  if (indexRes.status === 200 && detectBotChallenge(indexRes.text, indexRes.status)) {
    return emptyReport(profile, {
      crawlDelaySeconds: robots.rules.crawlDelaySeconds,
      sitemapIndexUrl: indexUrl,
      requests: session.requests,
      errors: 1,
      verdict: 'DEGRADED',
      latencyMs: Date.now() - t0,
    });
  }
  if (!indexRes.ok) {
    return emptyReport(profile, {
      crawlDelaySeconds: robots.rules.crawlDelaySeconds,
      sitemapIndexUrl: indexUrl,
      requests: session.requests,
      errors: 1,
      verdict: 'DEGRADED',
      latencyMs: Date.now() - t0,
    });
  }

  const indexLocs = extractSitemapLocs(indexRes.text);
  const isIndex = isSitemapIndexXml(indexRes.text);
  const sitemapsFound = isIndex ? indexLocs : [indexUrl];
  const childBudget = sitemapFetchBudget(
    budget.maxRequests - session.requests,
    budget.maxSitemaps,
    Math.min(budget.maxPilotCandidates, Math.max(4, budget.maxRequests - 3)),
  );
  const toFetch = isIndex ? selectChildSitemaps(indexLocs, childBudget) : [];
  const productLocs: string[] = isIndex ? [] : indexLocs;
  const sitemapsInspected: string[] = isIndex ? [] : [indexUrl];

  for (const child of toFetch) {
    if (session.requests >= budget.maxRequests) break;
    if (!isUrlAllowedByRobots(child, robots.rules)) continue;
    const childRes = await gatedFetch(child);
    if (childRes.timedOut || childRes.status === 429) {
      return emptyReport(profile, {
        robotsAllowed: true,
        crawlDelaySeconds: robots.rules.crawlDelaySeconds,
        sitemapIndexUrl: indexUrl,
        sitemapsFound,
        sitemapsInspected,
        requests: session.requests,
        errors: 1,
        verdict: 'DEGRADED',
        latencyMs: Date.now() - t0,
      });
    }
    if (childRes.status === 401 || childRes.status === 403 || (childRes.status === 200 && detectBotChallenge(childRes.text, childRes.status))) {
      return emptyReport(profile, {
        robotsAllowed: true,
        crawlDelaySeconds: robots.rules.crawlDelaySeconds,
        sitemapIndexUrl: indexUrl,
        sitemapsFound,
        sitemapsInspected,
        requests: session.requests,
        errors: 1,
        verdict: 'DEGRADED',
        latencyMs: Date.now() - t0,
      });
    }
    if (!childRes.ok) continue;
    sitemapsInspected.push(child);
    productLocs.push(...extractSitemapLocs(childRes.text));
  }

  const pdps = selectProductUrls(productLocs, {
    origin: profile.origin,
    max: budget.maxPilotCandidates,
  });
  const samples: SurfaceCandidateSample[] = [];
  let verifiedDeals = 0;
  let promotions = 0;
  let potentialDeals = 0;
  let catalogOnly = 0;
  let errors = 0;
  let pdpInspected = 0;
  let bound = 0;

  for (const pdpUrl of pdps) {
    if (session.requests >= budget.maxRequests) break;
    if (!isUrlAllowedByRobots(pdpUrl, robots.rules)) continue;
    const pdp = await gatedFetch(pdpUrl);
    if (pdp.timedOut || pdp.status === 429) {
      errors += 1;
      break;
    }
    if (pdp.status === 401 || pdp.status === 403 || (pdp.status === 200 && detectBotChallenge(pdp.text, pdp.status))) {
      errors += 1;
      break;
    }
    if (!pdp.ok) {
      errors += 1;
      continue;
    }
    pdpInspected += 1;
    const sample = qualifyPdpHtml(
      profile,
      pdp.text,
      pdp.finalUrl,
      isStrictPromoProductUrl(pdpUrl) ? 'promo_slug' : 'document_order',
    );
    if (sample) sample.requestedUrl = pdpUrl;
    if (!sample) {
      catalogOnly += 1;
      continue;
    }
    if (sample.url && sample.title) bound += 1;
    if (sample.qualification === 'VERIFIED_DEAL') verifiedDeals += 1;
    else if (sample.qualification === 'PROMOTION') promotions += 1;
    else if (sample.qualification === 'POTENTIAL_DEAL') potentialDeals += 1;
    else catalogOnly += 1;
    samples.push(sample);
  }

  const offerEvidence = verifiedDeals + promotions;
  const verdict = classifyDiscoveryChannel({
    robotsAllowed: true,
    challenged: false,
    pdpInspected,
    offerEvidenceCount: offerEvidence,
    catalogOnly,
    sustainable: false,
  });

  return {
    retailer: profile.retailer,
    robotsAllowed: true,
    crawlDelaySeconds: robots.rules.crawlDelaySeconds,
    sitemapIndexUrl: indexUrl,
    sitemapsFound,
    sitemapsInspected,
    productLocsSeen: productLocs.filter(
      (url) => looksLikeProductUrl(url) && isUrlAllowedByRobots(url, robots.rules),
    ).length,
    promoSlugHits: productLocs.filter((url) => isStrictPromoProductUrl(url)).length,
    promoSlugSamples: productLocs.filter((url) => isStrictPromoProductUrl(url)).slice(0, 5),
    pdpInspected,
    requests: session.requests,
    verifiedDeals,
    promotions,
    potentialDeals,
    catalogOnly,
    errors,
    evidenceYield: evidenceYield(offerEvidence, pdpInspected),
    productBindingSuccess: pdpInspected > 0 ? Math.round((bound / pdpInspected) * 1000) / 10 : 0,
    latencyMs: Date.now() - t0,
    discoveryMethod: pdpInspected > 0 ? 'sitemap_index_pdp' : 'none',
    verdict,
    persisted: false,
    samples,
  };
}
