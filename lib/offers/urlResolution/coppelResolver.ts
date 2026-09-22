import { isCoppelExpandableHost, isOfferCoppelHost } from '@/lib/offers/commerceHostAllowlist';
import { normalizeOfferUrl } from './normalizeOfferUrl';
import type { OfferUrlResolveResult } from './types';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const RESOLVE_TIMEOUT_MS = 14_000;
const MAX_REDIRECTS = 8;

/** SKU/id numérico al final del path o en query (p.ej. …-1234567 / ?sku=). */
export function extractCoppelProductId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    for (const key of ['sku', 'productId', 'id', 'pid']) {
      const q = u.searchParams.get(key);
      if (q && /^\d{5,}$/.test(q.trim())) return q.trim();
    }
    const parts = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    const last = parts[parts.length - 1] ?? '';
    const trailing = last.match(/(\d{5,})$/);
    if (trailing?.[1]) return trailing[1];
    for (let i = parts.length - 1; i >= 0; i--) {
      const seg = parts[i] ?? '';
      if (/^\d{5,}$/.test(seg)) return seg;
    }
    return null;
  } catch {
    return null;
  }
}

export async function resolveCoppelOfferUrl(rawUrl: string): Promise<OfferUrlResolveResult> {
  const inputUrl = normalizeOfferUrl(rawUrl) || rawUrl.trim();
  const provenance: string[] = ['coppel_resolver'];
  let working = inputUrl;

  try {
    const host = new URL(working).hostname;
    if (!isOfferCoppelHost(host) && !isCoppelExpandableHost(host)) {
      return {
        provider: 'unknown',
        canonicalUrl: working,
        productFingerprint: null,
        productIdentity: null,
        variantIdentity: null,
        resolvedUrl: null,
        confidence: 'low',
        provenance: [...provenance, 'not_coppel_host'],
        inputUrl,
      };
    }

    const idBefore = extractCoppelProductId(working);
    if (idBefore) provenance.push('id_from_input_path');

    if (isCoppelExpandableHost(host)) {
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
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'es-MX,es;q=0.9',
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

    const productId = extractCoppelProductId(working) ?? idBefore;
    const cleaned = normalizeOfferUrl(working) || working;
    if (!productId) {
      return {
        provider: 'coppel',
        canonicalUrl: cleaned,
        productFingerprint: null,
        productIdentity: null,
        variantIdentity: null,
        resolvedUrl: working !== inputUrl ? working : null,
        confidence: 'low',
        provenance: [...provenance, 'product_id_missing'],
        inputUrl,
      };
    }

    let canonicalUrl = cleaned;
    try {
      const u = new URL(working);
      if (isOfferCoppelHost(u.hostname) && !isCoppelExpandableHost(u.hostname)) {
        u.search = '';
        u.hash = '';
        canonicalUrl = u.toString();
        provenance.push('canonical_stripped');
      }
    } catch {
      /* keep */
    }

    return {
      provider: 'coppel',
      canonicalUrl,
      productFingerprint: `cpl:${productId}`,
      productIdentity: `coppel_mx:sku:${productId}`,
      variantIdentity: null,
      resolvedUrl: working !== inputUrl ? working : null,
      confidence: 'high',
      provenance,
      inputUrl,
    };
  } catch {
    return {
      provider: 'coppel',
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
