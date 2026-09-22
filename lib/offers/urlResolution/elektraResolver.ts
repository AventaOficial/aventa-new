import { isOfferElektraHost } from '@/lib/offers/commerceHostAllowlist';
import { normalizeOfferUrl } from './normalizeOfferUrl';
import type { OfferUrlResolveResult } from './types';

/** Id/SKU numérico en path o query de Elektra. */
export function extractElektraProductId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    for (const key of ['sku', 'productId', 'id', 'pid', 'product_id']) {
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

export async function resolveElektraOfferUrl(rawUrl: string): Promise<OfferUrlResolveResult> {
  const inputUrl = normalizeOfferUrl(rawUrl) || rawUrl.trim();
  const provenance: string[] = ['elektra_resolver'];

  try {
    const host = new URL(inputUrl).hostname;
    if (!isOfferElektraHost(host)) {
      return {
        provider: 'unknown',
        canonicalUrl: inputUrl,
        productFingerprint: null,
        productIdentity: null,
        variantIdentity: null,
        resolvedUrl: null,
        confidence: 'low',
        provenance: [...provenance, 'not_elektra_host'],
        inputUrl,
      };
    }

    const productId = extractElektraProductId(inputUrl);
    let canonicalUrl = inputUrl;
    try {
      const u = new URL(inputUrl);
      u.search = '';
      u.hash = '';
      canonicalUrl = u.toString();
      provenance.push('canonical_stripped');
    } catch {
      /* keep */
    }

    if (!productId) {
      return {
        provider: 'elektra',
        canonicalUrl,
        productFingerprint: null,
        productIdentity: null,
        variantIdentity: null,
        resolvedUrl: null,
        confidence: 'low',
        provenance: [...provenance, 'product_id_missing'],
        inputUrl,
      };
    }

    return {
      provider: 'elektra',
      canonicalUrl,
      productFingerprint: `elk:${productId}`,
      productIdentity: `elektra_mx:sku:${productId}`,
      variantIdentity: null,
      resolvedUrl: null,
      confidence: 'high',
      provenance: [...provenance, 'id_from_path'],
      inputUrl,
    };
  } catch {
    return {
      provider: 'elektra',
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
