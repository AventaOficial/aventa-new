/**
 * Server-side offer URL forensics (Amazon MX / Mercado Libre MX).
 * Never stores tokens/secrets. HTTP only against allowlisted hosts.
 */

import {
  assertSafeOfferFetchUrl,
  fetchFollowingRedirectsSafely,
} from '@/lib/server/fetchUrlSafety';
import { resolveOfferUrl } from '@/lib/offers/urlResolution';
import {
  isOfferAmazonHost,
  isOfferMercadoLibreHost,
  isOfferMeliLaHost,
} from '@/lib/offers/detectOfferStore';
import { applyPlatformAffiliateTags } from '@/lib/affiliate/applyPlatformAffiliateTags';
import {
  isPlatformAffiliateTagged,
  storeHasAffiliateProgram,
} from '@/lib/affiliate/assessOfferAffiliateLink';
import { normalizePastedOfferUrl } from '@/lib/offerUrl';
import {
  extractMercadoLibreItemId,
  resolveMercadoLibreItem,
} from '@/lib/offers/resolveMercadoLibreItem';

export type OfferUrlDiagnosis = {
  retailer: 'amazon' | 'mercado_libre' | 'unknown';
  inputUrl: string;
  normalizedUrl: string | null;
  canonicalUrl: string | null;
  affiliateUrl: string | null;
  productIdentity: string | null;
  parserStatus: 'ok' | 'invalid' | 'unsupported' | 'blocked';
  mappingStatus: 'ok' | 'partial' | 'missing' | 'n/a';
  trackingStatus: 'tagged' | 'untagged' | 'n/a';
  destinationStatus: 'ok' | 'redirect_failed' | 'http_error' | 'blocked' | 'skipped' | 'unknown';
  httpStatus: number | null;
  failureStage: string | null;
  failureReason: string | null;
  provenance: string[];
  /** Safe for logs/DB — no tokens. */
  evidence: Record<string, unknown>;
};

function detectRetailer(hostname: string): OfferUrlDiagnosis['retailer'] {
  if (isOfferMercadoLibreHost(hostname) || isOfferMeliLaHost(hostname)) return 'mercado_libre';
  if (isOfferAmazonHost(hostname)) return 'amazon';
  return 'unknown';
}

/**
 * Diagnose an offer URL through normalize → identity → affiliate → optional HEAD/GET hop.
 * `probeDestination` defaults true; set false for pure offline classification.
 */
export async function diagnoseOfferUrl(
  rawUrl: string,
  opts?: { probeDestination?: boolean },
): Promise<OfferUrlDiagnosis> {
  const probe = opts?.probeDestination !== false;
  const normalized = normalizePastedOfferUrl(rawUrl) || rawUrl.trim();
  const empty = (partial: Partial<OfferUrlDiagnosis>): OfferUrlDiagnosis => ({
    retailer: 'unknown',
    inputUrl: rawUrl?.trim() || '',
    normalizedUrl: null,
    canonicalUrl: null,
    affiliateUrl: null,
    productIdentity: null,
    parserStatus: 'invalid',
    mappingStatus: 'n/a',
    trackingStatus: 'n/a',
    destinationStatus: 'unknown',
    httpStatus: null,
    failureStage: 'normalize',
    failureReason: 'invalid_url',
    provenance: [],
    evidence: {},
    ...partial,
  });

  if (!normalized) {
    return empty({ failureReason: 'empty_url' });
  }

  let inputHost = '';
  try {
    inputHost = new URL(normalized).hostname;
  } catch {
    return empty({ failureReason: 'url_parse_error' });
  }

  const retailer = detectRetailer(inputHost);
  if (retailer === 'unknown') {
    return empty({
      retailer: 'unknown',
      normalizedUrl: normalized,
      parserStatus: 'unsupported',
      failureStage: 'retailer_detect',
      failureReason: 'unsupported_host',
      evidence: { hostname: inputHost },
    });
  }

  const gate = assertSafeOfferFetchUrl(new URL(normalized), {
    requireHttps: true,
    requireAllowlist: true,
  });
  if (gate.blocked) {
    return empty({
      retailer,
      normalizedUrl: normalized,
      parserStatus: 'blocked',
      failureStage: 'allowlist',
      failureReason: gate.reason ?? 'blocked',
      evidence: { hostname: inputHost },
    });
  }

  const resolved = await resolveOfferUrl(normalized);
  const canonical = resolved.canonicalUrl || resolved.resolvedUrl || normalized;
  const identity =
    resolved.productIdentity ||
    resolved.productFingerprint ||
    (retailer === 'mercado_libre'
      ? resolveMercadoLibreItem(normalized)?.itemId ??
        extractMercadoLibreItemId(normalized) ??
        null
      : null);

  let mappingStatus: OfferUrlDiagnosis['mappingStatus'] = 'missing';
  if (identity && resolved.confidence === 'high') mappingStatus = 'ok';
  else if (identity || resolved.confidence === 'medium') mappingStatus = 'partial';

  const affiliateCandidate = applyPlatformAffiliateTags(canonical);
  const affiliateReady =
    storeHasAffiliateProgram(affiliateCandidate) &&
    isPlatformAffiliateTagged(affiliateCandidate);
  const trackingStatus: OfferUrlDiagnosis['trackingStatus'] = storeHasAffiliateProgram(
    affiliateCandidate,
  )
    ? affiliateReady
      ? 'tagged'
      : 'untagged'
    : 'n/a';

  let destinationStatus: OfferUrlDiagnosis['destinationStatus'] = 'skipped';
  let httpStatus: number | null = null;
  let failureStage: string | null = null;
  let failureReason: string | null = null;

  if (mappingStatus === 'missing') {
    failureStage = 'identity';
    failureReason = 'product_identity_missing';
  }

  if (probe) {
    try {
      const hop = await fetchFollowingRedirectsSafely(canonical, {
        timeoutMs: 8_000,
        method: 'GET',
        requireHttps: true,
        requireAllowlist: true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'es-MX,es;q=0.9',
        },
      });
      if (!hop.ok) {
        destinationStatus = hop.reason.includes('permit') ? 'blocked' : 'redirect_failed';
        failureStage = failureStage ?? 'destination';
        failureReason = failureReason ?? hop.reason;
      } else {
        httpStatus = hop.response.status;
        if (!hop.response.ok) {
          destinationStatus = 'http_error';
          failureStage = failureStage ?? 'destination';
          failureReason = failureReason ?? `http_${hop.response.status}`;
        } else {
          destinationStatus = 'ok';
        }
        // Drain body to free socket; discard content (no secret retention).
        try {
          await hop.response.body?.cancel();
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      destinationStatus = 'redirect_failed';
      failureStage = failureStage ?? 'destination';
      failureReason = failureReason ?? (err instanceof Error ? err.message : 'fetch_threw');
    }
  }

  const parserStatus: OfferUrlDiagnosis['parserStatus'] =
    mappingStatus === 'missing' && retailer === 'mercado_libre' && isOfferMeliLaHost(inputHost)
      ? 'invalid'
      : 'ok';

  if (parserStatus === 'ok' && destinationStatus === 'ok' && mappingStatus !== 'missing') {
    failureStage = null;
    failureReason = null;
  }

  return {
    retailer,
    inputUrl: rawUrl.trim(),
    normalizedUrl: normalized,
    canonicalUrl: canonical,
    affiliateUrl: affiliateReady ? affiliateCandidate : null,
    productIdentity: identity,
    parserStatus,
    mappingStatus,
    trackingStatus,
    destinationStatus,
    httpStatus,
    failureStage,
    failureReason,
    provenance: resolved.provenance ?? [],
    evidence: {
      confidence: resolved.confidence,
      resolvedUrl: resolved.resolvedUrl,
      provider: resolved.provider,
    },
  };
}
