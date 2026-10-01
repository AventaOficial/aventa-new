/**
 * Fingerprint estable de una URL de oferta para detectar duplicados.
 * Ignora tags de afiliado y ruido de query; conserva identidad de producto
 * (ASIN Amazon, item id Mercado Libre, pathname en el resto).
 */

const AFFILIATE_QUERY_KEYS = new Set([
  'tag',
  'ascsubtag',
  'ref',
  'ref_',
  'linkcode',
  'camp',
  'creative',
  'creativeasin',
  'adid',
  'matt_tool',
  'matt_word',
  'matt_source',
  'matt_medium',
  'matt_campaign',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
]);

export {
  extractMercadoLibreItemId,
  extractMercadoLibreUserProductId,
  resolveMercadoLibreItem,
  resolveMercadoLibreListingExternalId,
  hasMercadoLibreListingIdentity,
} from '@/lib/offers/resolveMercadoLibreItem';
import {
  extractMercadoLibreItemId,
  extractMercadoLibreUserProductId,
} from '@/lib/offers/resolveMercadoLibreItem';
import { extractLiverpoolProductId } from '@/lib/offers/urlResolution/liverpoolResolver';
import { isOfferLiverpoolHost } from '@/lib/offers/commerceHostAllowlist';

const ASIN_RE = /^[A-Z0-9]{10}$/i;

/**
 * Extrae ASIN de URLs Amazon (path /dp/, query, o path corto en hops como link.amazon/{ASIN}).
 * No inventa identidad: solo acepta tokens de 10 chars alfanuméricos.
 */
export function extractAmazonAsin(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    // Never invent Amazon identity from non-Amazon hosts (e.g. Liverpool 10-digit SKUs).
    if (!isAmazonHost(u.hostname)) return null;
    const upper = rawUrl.toUpperCase();
    const dp = upper.match(/\/(?:DP|GP\/PRODUCT|GP\/AW\/D|EXEC\/OBIDOS\/ASIN)\/([A-Z0-9]{10})\b/);
    if (dp?.[1]) return dp[1];
    const asinParam = u.searchParams.get('asin') || u.searchParams.get('ASIN');
    if (asinParam && ASIN_RE.test(asinParam.trim())) {
      return asinParam.trim().toUpperCase();
    }
    // Share/short hops: https://link.amazon/B0XXXXXXXX or /d/B0XXXXXXXX
    const pathSeg = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    for (let i = pathSeg.length - 1; i >= 0; i--) {
      const seg = pathSeg[i] ?? '';
      if (ASIN_RE.test(seg)) return seg.toUpperCase();
      // Skip single-letter path prefixes like /d/ on a.co
      if (seg.length === 1) continue;
    }
    return null;
  } catch {
    return null;
  }
}

function isWeakProductPath(path: string): boolean {
  const p = path.replace(/\/+$/, '') || '/';
  if (p === '/') return true;
  if (
    /^\/(s|search|gp\/search|gp\/slredirect|gp\/bestsellers|stores?|deals|gp\/goldbox)(\/|$)/i.test(p)
  ) {
    return true;
  }
  return p.length < 6;
}

function hostKey(hostname: string): string {
  return hostname.replace(/^www\./i, '').toLowerCase();
}

function isMercadoLibreHost(hostname: string): boolean {
  const host = hostKey(hostname);
  return (
    host === 'mercadolibre.com' ||
    host === 'mercadolibre.com.mx' ||
    host.endsWith('.mercadolibre.com.mx') ||
    host === 'meli.la' ||
    host.endsWith('.meli.la')
  );
}

function isAmazonHost(hostname: string): boolean {
  const host = hostKey(hostname);
  return (
    host.includes('amazon.') ||
    host === 'amzn.to' ||
    host === 'a.co' ||
    host === 'link.amazon' ||
    host.endsWith('.link.amazon')
  );
}

function isLiverpoolHost(hostname: string): boolean {
  return isOfferLiverpoolHost(hostname);
}

/** Liverpool PDP SKU for strong identity — never homepage / category. */
export function extractLiverpoolSkuForFingerprint(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl.trim());
    if (!isLiverpoolHost(u.hostname)) return null;
    // Require explicit PDP path so category/home numeric noise cannot mint identity.
    if (!/\/tienda\/pdp\//i.test(u.pathname) && !u.searchParams.get('productId')) {
      return null;
    }
    return extractLiverpoolProductId(rawUrl);
  } catch {
    return null;
  }
}

/**
 * Clave comparable entre URLs del mismo producto con distintos tags/tracking.
 * Devuelve null si la URL no es parseable.
 */
export function offerUrlFingerprint(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    const host = hostKey(u.hostname);

    if (isMercadoLibreHost(u.hostname)) {
      const itemId = extractMercadoLibreItemId(trimmed);
      if (itemId) return `ml:${itemId}`;
      // /up/MLMU… no es item API, pero sí huella estable para dedupe.
      const userProductId = extractMercadoLibreUserProductId(trimmed);
      if (userProductId) return `ml:${userProductId}`;
      if (host === 'meli.la' || host.endsWith('.meli.la')) {
        const shortId = u.pathname.replace(/^\//, '').split('/')[0];
        if (shortId) return `meli.la:${shortId.toLowerCase()}`;
      }
      const path = u.pathname.replace(/\/+$/, '') || '/';
      if (isWeakProductPath(path)) return null;
    }

    if (isAmazonHost(u.hostname)) {
      const asin = extractAmazonAsin(trimmed);
      if (asin) return `amz:${asin}`;
      const path = u.pathname.replace(/\/+$/, '') || '/';
      if (isWeakProductPath(path)) return null;
    }

    if (isLiverpoolHost(u.hostname)) {
      const sku = extractLiverpoolSkuForFingerprint(trimmed);
      if (sku) return `liv:${sku}`;
      // Homepage / search / category — not a product identity.
      return null;
    }

    const path = u.pathname.replace(/\/+$/, '') || '/';
    if (isWeakProductPath(path)) return null;
    const kept = new URLSearchParams();
    u.searchParams.forEach((value, key) => {
      const k = key.toLowerCase();
      if (AFFILIATE_QUERY_KEYS.has(k)) return;
      if (k.startsWith('utm_')) return;
      kept.set(k, value);
    });
    const qs = kept.toString();
    return `url:${host}${path.toLowerCase()}${qs ? `?${qs}` : ''}`;
  } catch {
    return trimmed.split('?')[0].toLowerCase() || null;
  }
}

/** True si ambas URLs representan el mismo producto/destino (ignorando afiliado). */
export function offerUrlsAreSameProduct(a: string, b: string): boolean {
  const fa = offerUrlFingerprint(a);
  const fb = offerUrlFingerprint(b);
  if (!fa || !fb) return false;
  return fa === fb;
}
