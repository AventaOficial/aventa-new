import { extractAmazonAsin } from '@/lib/offers/offerUrlFingerprint';
import { isAmazonExpandableHost, isOfferAmazonHost } from '@/lib/offers/commerceHostAllowlist';
import { normalizeOfferUrl } from './normalizeOfferUrl';
import type { OfferUrlResolveResult } from './types';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const RESOLVE_TIMEOUT_MS = 14_000;
const MAX_AMAZON_SHORT_REDIRECTS = 8;

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

function preferMarketplaceHost(workingUrl: string, inputUrl: string): string {
  try {
    const w = new URL(workingUrl);
    if (isOfferAmazonHost(w.hostname) && !isAmazonExpandableHost(w.hostname)) {
      return w.hostname;
    }
  } catch {
    /* fallthrough */
  }
  try {
    return new URL(inputUrl).hostname;
  } catch {
    return 'www.amazon.com';
  }
}

/**
 * Expand Amazon short/share hops with browser UA + allowlisted redirects.
 * Fail-closed: returns without product identity if ASIN cannot be proven.
 *
 * Covers a.co, amzn.to, amazon.app.link, link.amazon — same strategy, no per-URL hacks.
 */
export async function resolveAmazonOfferUrl(rawUrl: string): Promise<OfferUrlResolveResult> {
  const inputUrl = normalizeOfferUrl(rawUrl) || rawUrl.trim();
  const provenance: string[] = ['amazon_resolver'];

  let working = inputUrl;
  try {
    const host = new URL(working).hostname;
    if (!isOfferAmazonHost(host) && !isAmazonExpandableHost(host)) {
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

    // Path may already carry ASIN (e.g. link.amazon/B0XXXXXXXX) — capture before expand.
    const asinBeforeExpand = extractAmazonAsin(working);
    if (asinBeforeExpand) {
      provenance.push('asin_from_input_path');
    }

    if (isAmazonExpandableHost(host)) {
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
          // amzlinks.in / Button often serve HTML with JS or intent:// → amazon.*/dp/{ASIN}
          // instead of an HTTP Location. Recover ASIN from the body when the hop stayed expandable.
          try {
            const hopHost = new URL(working).hostname;
            if (isAmazonExpandableHost(hopHost) && !extractAmazonAsin(working)) {
              const body = await result.response.text();
              const fromBody =
                body.match(/https?:\/\/(?:www\.)?amazon\.[^"'\\\s]+\/(?:dp|gp\/(?:product|aw\/d))\/([A-Z0-9]{10})\b/i)?.[1] ||
                body.match(/["']asin["']\s*[:=]\s*["']([A-Z0-9]{10})["']/i)?.[1] ||
                body.match(/\/dp\/([A-Z0-9]{10})\b/i)?.[1];
              if (fromBody) {
                working = `https://www.amazon.com.mx/dp/${fromBody.toUpperCase()}`;
                provenance.push('asin_from_shortlink_html');
              }
            }
          } catch {
            /* keep hop URL */
          }
        } else {
          provenance.push(`shortlink_failed:${result.ok === false ? 'blocked_or_error' : 'empty'}`);
        }
      } catch {
        provenance.push('shortlink_exception');
      } finally {
        clearTimeout(timeoutId);
      }
    }

    const asin = extractAmazonAsin(working) ?? asinBeforeExpand;
    if (!asin) {
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

    const resolvedHost = preferMarketplaceHost(working, inputUrl);

    // Prefer /dp/{ASIN} on a real marketplace host (never leave link.amazon as canonical).
    let canonicalUrl = normalizeOfferUrl(working) || working;
    try {
      const u = new URL(working);
      if (isOfferAmazonHost(u.hostname) && !isAmazonExpandableHost(u.hostname)) {
        u.pathname = `/dp/${asin}`;
        u.search = '';
        u.hash = '';
        canonicalUrl = u.toString();
        provenance.push('canonical_dp');
      } else {
        // Hop still expandable, or ASIN only from input path: synthesize marketplace /dp/.
        let marketHost = 'www.amazon.com.mx';
        if (isOfferAmazonHost(resolvedHost) && !isAmazonExpandableHost(resolvedHost)) {
          marketHost = resolvedHost.startsWith('www.') ? resolvedHost : `www.${resolvedHost}`;
        }
        canonicalUrl = `https://${marketHost}/dp/${asin}`;
        provenance.push('canonical_dp_synthesized');
      }
    } catch {
      /* keep */
    }

    return {
      provider: 'amazon',
      canonicalUrl,
      productFingerprint: `amz:${asin}`,
      productIdentity: productIdentityForAsin(
        (() => {
          try {
            return new URL(canonicalUrl).hostname;
          } catch {
            return resolvedHost;
          }
        })(),
        asin,
      ),
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
