import { isOfferWalmartHost, isWalmartExpandableHost } from '@/lib/offers/commerceHostAllowlist';
import { normalizeOfferUrl } from './normalizeOfferUrl';
import type { OfferUrlResolveResult } from './types';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const RESOLVE_TIMEOUT_MS = 14_000;
const MAX_REDIRECTS = 8;

/** Item id numérico en `/ip/{slug}/{id}` o `/ip/{id}`. */
export function extractWalmartItemId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const parts = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    const ipIdx = parts.findIndex((p) => p.toLowerCase() === 'ip');
    if (ipIdx < 0) return null;
    const after = parts.slice(ipIdx + 1);
    if (after.length === 0) return null;
    // Prefer last numeric segment (slug/.../12345 or bare /ip/12345)
    for (let i = after.length - 1; i >= 0; i--) {
      const seg = after[i] ?? '';
      if (/^\d{4,}$/.test(seg)) return seg;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Expand Walmart shortlinks + canonicalize to /ip/{itemId}.
 * Fail-closed without inventing item ids.
 */
export async function resolveWalmartOfferUrl(rawUrl: string): Promise<OfferUrlResolveResult> {
  const inputUrl = normalizeOfferUrl(rawUrl) || rawUrl.trim();
  const provenance: string[] = ['walmart_resolver'];
  let working = inputUrl;

  try {
    const host = new URL(working).hostname;
    if (!isOfferWalmartHost(host) && !isWalmartExpandableHost(host)) {
      return {
        provider: 'unknown',
        canonicalUrl: working,
        productFingerprint: null,
        productIdentity: null,
        variantIdentity: null,
        resolvedUrl: null,
        confidence: 'low',
        provenance: [...provenance, 'not_walmart_host'],
        inputUrl,
      };
    }

    const idBefore = extractWalmartItemId(working);
    if (idBefore) provenance.push('item_from_input_path');

    if (isWalmartExpandableHost(host)) {
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
          maxRedirects: MAX_REDIRECTS,
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
          provenance.push('shortlink_failed');
        }
      } catch {
        provenance.push('shortlink_exception');
      } finally {
        clearTimeout(timeoutId);
      }
    }

    const itemId = extractWalmartItemId(working) ?? idBefore;
    if (!itemId) {
      return {
        provider: 'walmart',
        canonicalUrl: normalizeOfferUrl(working) || working,
        productFingerprint: null,
        productIdentity: null,
        variantIdentity: null,
        resolvedUrl: working !== inputUrl ? working : null,
        confidence: 'low',
        provenance: [...provenance, 'item_id_missing'],
        inputUrl,
      };
    }

    let marketHost = 'www.walmart.com.mx';
    try {
      const wh = new URL(working).hostname;
      if (isOfferWalmartHost(wh) && !isWalmartExpandableHost(wh)) {
        marketHost = wh.startsWith('www.') ? wh : `www.${wh.replace(/^www\./, '')}`;
        // Prefer .mx for Aventa when host is walmart.com without regional path certainty
        if (wh.replace(/^www\./, '') === 'walmart.com') {
          marketHost = 'www.walmart.com.mx';
        }
      }
    } catch {
      /* keep mx */
    }

    const canonicalUrl = `https://${marketHost}/ip/${itemId}`;
    provenance.push('canonical_ip');

    return {
      provider: 'walmart',
      canonicalUrl,
      productFingerprint: `wmt:${itemId}`,
      productIdentity: `walmart_mx:item:${itemId}`,
      variantIdentity: null,
      resolvedUrl: working !== inputUrl ? working : null,
      confidence: 'high',
      provenance,
      inputUrl,
    };
  } catch {
    return {
      provider: 'walmart',
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
