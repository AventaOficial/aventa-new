import { extractAmazonAsin } from '@/lib/offers/offerUrlFingerprint';
import { isOfferAmazonHost } from '@/lib/offers/commerceHostAllowlist';
import { normalizeOfferUrl } from './normalizeOfferUrl';
import type { OfferUrlResolveResult } from './types';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const RESOLVE_TIMEOUT_MS = 14_000;
const MAX_AMAZON_SHORT_REDIRECTS = 8;

function isAmazonShortHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'a.co' || h === 'amzn.to' || h.endsWith('.a.co') || h.endsWith('.amzn.to');
}

function siteFromHost(hostname: string): string {
  const h = hostname.toLowerCase().replace(/^www\./, '');
  if (h.endsWith('amazon.com.mx')) return 'amazon_mx';
  if (h.endsWith('amazon.com')) return 'amazon_us';
  if (h.includes('amazon.')) return `amazon_${h.split('.').pop() ?? 'com'}`;
  return 'amazon';
}

function productIdentityForAsin(hostname: string, asin: string): string {
  return `${siteFromHost(hostname)}:asin:${asin}`;
}

/**
 * Expand Amazon shortlinks with browser UA + allowlisted hops.
 * Fail-closed: returns original short URL if ASIN cannot be proven.
 */
export async function resolveAmazonOfferUrl(rawUrl: string): Promise<OfferUrlResolveResult> {
  const inputUrl = normalizeOfferUrl(rawUrl) || rawUrl.trim();
  const provenance: string[] = ['amazon_resolver'];

  let working = inputUrl;
  try {
    const host = new URL(working).hostname;
    if (!isOfferAmazonHost(host) && !isAmazonShortHost(host)) {
      return {
        provider: 'unknown',
        canonicalUrl: working,
        productFingerprint: null,
        productIdentity: null,
        variantIdentity: null,
        resolvedUrl: null,
        confidence: 'low',
        provenance: [...provenance, 'not_amazon_host'],
        inputUrl,
      };
    }

    if (isAmazonShortHost(host)) {
      provenance.push('shortlink_expand');
      const { fetchFollowingRedirectsSafely } = await import('@/lib/server/fetchUrlSafety');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
      try {
        const result = await fetchFollowingRedirectsSafely(working, {
          timeoutMs: RESOLVE_TIMEOUT_MS,
          method: 'GET',
          requireHttps: true,
          requireAllowlist: true,
          maxRedirects: MAX_AMAZON_SHORT_REDIRECTS,
          signal: controller.signal,
          headers: {
            'User-Agent': BROWSER_UA,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
          },
        });
        if (result.ok && result.finalUrl) {
          working = result.finalUrl;
          provenance.push('shortlink_resolved');
        } else {
          provenance.push(`shortlink_failed:${result.ok === false ? 'blocked_or_error' : 'empty'}`);
        }
      } catch {
        provenance.push('shortlink_exception');
      } finally {
        clearTimeout(timeoutId);
      }
    }

    const asin = extractAmazonAsin(working);
    if (!asin) {
      // Fail-closed: do not invent identity from short URL shape
      return {
        provider: 'amazon',
        canonicalUrl: normalizeOfferUrl(working) || working,
        productFingerprint: null,
        productIdentity: null,
        variantIdentity: null,
        resolvedUrl: working !== inputUrl ? working : null,
        confidence: 'low',
        provenance: [...provenance, 'asin_missing'],
        inputUrl,
      };
    }

    let resolvedHost = 'www.amazon.com';
    try {
      resolvedHost = new URL(working).hostname;
    } catch {
      /* keep default */
    }

    // Prefer /dp/{ASIN} path when we have a full amazon host
    let canonicalUrl = normalizeOfferUrl(working) || working;
    try {
      const u = new URL(working);
      if (isOfferAmazonHost(u.hostname) && !isAmazonShortHost(u.hostname)) {
        u.pathname = `/dp/${asin}`;
        u.search = '';
        u.hash = '';
        canonicalUrl = u.toString();
        provenance.push('canonical_dp');
      }
    } catch {
      /* keep */
    }

    return {
      provider: 'amazon',
      canonicalUrl,
      productFingerprint: `amz:${asin}`,
      productIdentity: productIdentityForAsin(resolvedHost, asin),
      variantIdentity: null,
      resolvedUrl: working !== inputUrl ? working : null,
      confidence: 'high',
      provenance,
      inputUrl,
    };
  } catch {
    return {
      provider: 'amazon',
      canonicalUrl: inputUrl,
      productFingerprint: null,
      productIdentity: null,
      variantIdentity: null,
      resolvedUrl: null,
      confidence: 'low',
      provenance: [...provenance, 'parse_error'],
      inputUrl,
    };
  }
}
