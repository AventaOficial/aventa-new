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

export function extractMercadoLibreItemId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const normalize = (raw: string) => raw.replace(/-/g, '').toUpperCase();
    const directId =
      url.searchParams.get('wid') ||
      url.searchParams.get('item_id') ||
      url.searchParams.get('itemId');
    if (directId && /^ML[A-Z]{0,3}-?\d+$/i.test(directId.trim())) {
      return normalize(directId.trim());
    }

    const pdpFilters = url.searchParams.get('pdp_filters');
    const fromFilters = pdpFilters?.match(/item_id:(ML[A-Z]{0,3}-?\d+)/i)?.[1];
    if (fromFilters) return normalize(fromFilters);

    const fromPath = url.pathname.match(/\/((?:ML[A-Z]{1,3})-?\d{6,})(?:[/?#-]|$)/i)?.[1];
    return fromPath ? normalize(fromPath) : null;
  } catch {
    return null;
  }
}

export function extractAmazonAsin(rawUrl: string): string | null {
  try {
    const upper = rawUrl.toUpperCase();
    const dp = upper.match(/\/(?:DP|GP\/PRODUCT|GP\/AW\/D)\/([A-Z0-9]{10})\b/);
    if (dp?.[1]) return dp[1];
    const u = new URL(rawUrl);
    const asinParam = u.searchParams.get('asin') || u.searchParams.get('ASIN');
    if (asinParam && /^[A-Z0-9]{10}$/i.test(asinParam.trim())) {
      return asinParam.trim().toUpperCase();
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
  return host.includes('amazon.') || host === 'amzn.to' || host === 'a.co';
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
