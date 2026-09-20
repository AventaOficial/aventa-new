import {
  isMercadoLibreHost,
  resolveMercadoLibreItem,
  isMercadoLibreNavigableProductUrl,
} from '@/lib/offers/resolveMercadoLibreItem';
import { normalizeOfferUrl } from './normalizeOfferUrl';
import type { OfferUrlResolveResult } from './types';

function siteLabel(hostname: string): string {
  const h = hostname.toLowerCase().replace(/^www\./, '').replace(/^articulo\./, '');
  if (h.includes('mercadolibre.com.mx') || h.includes('mercadolibre.mx')) return 'mercadolibre_mx';
  if (h.includes('mercadolibre.com.ar')) return 'mercadolibre_ar';
  if (h.includes('mercadolivre.com.br')) return 'mercadolibre_br';
  return 'mercadolibre';
}

function variantFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const attrs = u.searchParams.get('attributes');
    return attrs?.trim() ? attrs.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Mercado Libre resolver — identity from resolveMercadoLibreItem (S6.8 authority).
 * Never invents bare /{MLM} paths. Preserves attributes as variantIdentity.
 */
export async function resolveMercadoLibreOfferUrl(
  rawUrl: string,
): Promise<OfferUrlResolveResult> {
  const inputUrl = normalizeOfferUrl(rawUrl) || rawUrl.trim();
  const provenance: string[] = ['ml_resolver'];

  let working = inputUrl;

  // Expand meli.la via existing shortlink authority
  try {
    const host = new URL(working).hostname.toLowerCase();
    if (host === 'meli.la' || host.endsWith('.meli.la')) {
      provenance.push('meli_la_expand');
      const { resolveMercadoLibreShortlinks } = await import('@/lib/offerUrl');
      working = await resolveMercadoLibreShortlinks(working);
      if (working !== inputUrl) provenance.push('meli_la_resolved');
    }
  } catch {
    provenance.push('host_parse_error');
  }

  // Identity must use RAW-ish URL before aggressive strip of variant params —
  // normalizeOfferUrl already preserves attributes; resolve against both.
  const resolved =
    resolveMercadoLibreItem(rawUrl.trim()) ??
    resolveMercadoLibreItem(working) ??
    resolveMercadoLibreItem(inputUrl);

  if (!resolved?.itemId && !resolved?.catalogProductId) {
    // User-product only?
    const { extractMercadoLibreUserProductId } = await import(
      '@/lib/offers/resolveMercadoLibreItem'
    );
    const up = extractMercadoLibreUserProductId(working) ?? extractMercadoLibreUserProductId(rawUrl);
    if (up) {
      const canonical = normalizeOfferUrl(
        resolved?.canonicalUrl || working,
      );
      return {
        provider: 'mercado_libre',
        canonicalUrl: canonical || working,
        productFingerprint: `ml:${up}`,
        productIdentity: null, // not an API item id — fail-soft identity label
        variantIdentity: variantFromUrl(working),
        resolvedUrl: working !== inputUrl ? working : null,
        confidence: 'medium',
        provenance: [...provenance, 'user_product_only'],
        inputUrl,
      };
    }

    return {
      provider: 'mercado_libre',
      canonicalUrl: normalizeOfferUrl(working) || working,
      productFingerprint: null,
      productIdentity: null,
      variantIdentity: variantFromUrl(working),
      resolvedUrl: working !== inputUrl ? working : null,
      confidence: 'low',
      provenance: [...provenance, 'identity_missing'],
      inputUrl,
    };
  }

  const itemId = resolved.itemId;
  let host = 'www.mercadolibre.com.mx';
  try {
    host = new URL(working).hostname;
  } catch {
    /* default */
  }

  // Prefer navigable canonical from resolver; then strip tracking only
  let canonicalSource =
    resolved.canonicalUrl && isMercadoLibreNavigableProductUrl(resolved.canonicalUrl)
      ? resolved.canonicalUrl
      : working;

  // Re-attach variant attributes if strip lost them from canonical but original had them
  const variant = variantFromUrl(rawUrl) ?? variantFromUrl(working);
  try {
    const u = new URL(canonicalSource);
    if (variant && !u.searchParams.get('attributes')) {
      u.searchParams.set('attributes', variant);
    }
    canonicalSource = u.toString();
  } catch {
    /* keep */
  }

  const canonicalUrl = normalizeOfferUrl(canonicalSource) || canonicalSource;

  // Ensure attributes survive normalize (identity of variant)
  let finalCanonical = canonicalUrl;
  if (variant) {
    try {
      const u = new URL(canonicalUrl);
      if (!u.searchParams.get('attributes')) {
        u.searchParams.set('attributes', variant);
        finalCanonical = u.toString();
      }
    } catch {
      /* keep */
    }
  }

  const fingerprint = itemId ? `ml:${itemId}` : null;
  const productIdentity =
    itemId != null ? `${siteLabel(host)}:pid:${itemId}` : null;

  return {
    provider: 'mercado_libre',
    canonicalUrl: finalCanonical,
    productFingerprint: fingerprint,
    productIdentity,
    variantIdentity: variant,
    resolvedUrl: working !== inputUrl ? working : null,
    confidence: resolved.confidence === 'high' ? 'high' : resolved.confidence === 'medium' ? 'medium' : 'low',
    provenance: [
      ...provenance,
      `item:${itemId ?? 'none'}`,
      `method:${resolved.resolutionMethod}`,
    ],
    inputUrl,
  };
}

export function isMercadoLibreOfferHost(url: string): boolean {
  try {
    return isMercadoLibreHost(new URL(url).hostname);
  } catch {
    return false;
  }
}
