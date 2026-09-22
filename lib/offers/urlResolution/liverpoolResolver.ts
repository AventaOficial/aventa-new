import { isLiverpoolExpandableHost, isOfferLiverpoolHost } from '@/lib/offers/commerceHostAllowlist';
import { normalizeOfferUrl } from './normalizeOfferUrl';
import type { OfferUrlResolveResult } from './types';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const RESOLVE_TIMEOUT_MS = 14_000;
const MAX_REDIRECTS = 8;

/**
 * Extrae id/SKU numérico de PDPs Liverpool.
 * Ejemplos: /tienda/pdp/slug/1101234567  ·  queryId=… · sku en path final.
 */
export function extractLiverpoolProductId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const q =
      u.searchParams.get('productId') ||
      u.searchParams.get('sku') ||
      u.searchParams.get('skuId');
    if (q && /^\d{5,}$/.test(q.trim())) return q.trim();

    const parts = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    // Prefer last numeric segment of sufficient length
    for (let i = parts.length - 1; i >= 0; i--) {
      const seg = parts[i] ?? '';
      if (/^\d{5,}$/.test(seg)) return seg;
    }
    return null;
  } catch {
    return null;
  }
}

export async function resolveLiverpoolOfferUrl(rawUrl: string): Promise<OfferUrlResolveResult> {
  const inputUrl = normalizeOfferUrl(rawUrl) || rawUrl.trim();
  const provenance: string[] = ['liverpool_resolver'];
  let working = inputUrl;

  try {
    const host = new URL(working).hostname;
    if (!isOfferLiverpoolHost(host) && !isLiverpoolExpandableHost(host)) {
      return {
        provider: 'unknown',
        canonicalUrl: working,
        productFingerprint: null,
        productIdentity: null,
        variantIdentity: null,
        resolvedUrl: null,
        confidence: 'low',
        provenance: [...provenance, 'not_liverpool_host'],
        inputUrl,
      };
    }

    const idBefore = extractLiverpoolProductId(working);
    if (idBefore) provenance.push('id_from_input_path');

    if (isLiverpoolExpandableHost(host)) {
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

    const productId = extractLiverpoolProductId(working) ?? idBefore;
    const cleaned = normalizeOfferUrl(working) || working;

    if (!productId) {
      return {
        provider: 'liverpool',
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

    // Keep path structure when already a pdp; otherwise fingerprint alone is enough.
    let canonicalUrl = cleaned;
    try {
      const u = new URL(working);
      if (isOfferLiverpoolHost(u.hostname) && !isLiverpoolExpandableHost(u.hostname)) {
        u.search = '';
        u.hash = '';
        canonicalUrl = u.toString();
        provenance.push('canonical_stripped');
      }
    } catch {
      /* keep */
    }

    return {
      provider: 'liverpool',
      canonicalUrl,
      productFingerprint: `lvp:${productId}`,
      productIdentity: `liverpool_mx:sku:${productId}`,
      variantIdentity: null,
      resolvedUrl: working !== inputUrl ? working : null,
      confidence: 'high',
      provenance,
      inputUrl,
    };
  } catch {
    return {
      provider: 'liverpool',
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
