/**
 * Resolución central de URLs Mercado Libre → siteId + itemId.
 * Prioriza señales explícitas de item sobre IDs de catálogo en /p/.
 * Lee query y hash (URLSearchParams no incluye el fragment).
 */

export type MercadoLibreResolutionMethod =
  | 'query_wid'
  | 'query_item_id'
  | 'query_pdp_filters'
  | 'hash_wid'
  | 'hash_item_id'
  | 'path_item'
  | 'path_catalog'
  | 'unresolved';

export type MercadoLibreResolutionConfidence = 'high' | 'medium' | 'low';

export type MercadoLibreItemResolution = {
  siteId: string | null;
  itemId: string | null;
  catalogProductId: string | null;
  permalink: string | null;
  canonicalUrl: string | null;
  source: 'url';
  confidence: MercadoLibreResolutionConfidence;
  resolutionMethod: MercadoLibreResolutionMethod;
};

const ML_ID_RE = /^ML[A-Z]{0,3}-?\d+$/i;

const HOST_SITE: Record<string, string> = {
  'mercadolibre.com.mx': 'MLM',
  'mercadolibre.com.ar': 'MLA',
  'mercadolibre.com.br': 'MLB',
  'mercadolibre.com.co': 'MLC',
  'mercadolibre.com.uy': 'MLU',
  'mercadolibre.com.pe': 'MPE',
  'mercadolibre.com.ve': 'MLV',
  'mercadolibre.com.ec': 'MEC',
  'mercadolibre.com.bo': 'MBO',
  'mercadolibre.com.pa': 'MPA',
  'mercadolibre.com.py': 'MPY',
  'mercadolibre.cl': 'MLC',
};

function normalizeMlId(raw: string): string {
  return raw.replace(/-/g, '').toUpperCase();
}

function isMlId(raw: string | null | undefined): raw is string {
  return Boolean(raw && ML_ID_RE.test(raw.trim()));
}

function siteFromItemId(itemId: string): string | null {
  const m = itemId.match(/^(ML[A-Z]{0,3})\d+$/i);
  return m ? m[1].toUpperCase() : null;
}

function siteFromHostname(hostname: string): string | null {
  const host = hostname.replace(/^www\./i, '').toLowerCase();
  if (HOST_SITE[host]) return HOST_SITE[host];
  for (const [suffix, site] of Object.entries(HOST_SITE)) {
    if (host.endsWith(`.${suffix}`)) return site;
  }
  return null;
}

function hashSearchParams(url: URL): URLSearchParams {
  const raw = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  if (!raw) return new URLSearchParams();
  return new URLSearchParams(raw);
}

function itemIdFromPdpFilters(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/item_id:(ML[A-Z]{0,3}-?\d+)/i);
  return m?.[1] ? normalizeMlId(m[1]) : null;
}

function pathCatalogId(pathname: string): string | null {
  const m = pathname.match(/\/p\/((?:ML[A-Z]{0,3})-?\d+)/i);
  return m?.[1] ? normalizeMlId(m[1]) : null;
}

function pathItemId(pathname: string): string | null {
  const m = pathname.match(/\/((?:ML[A-Z]{1,3})-?\d{6,})(?:[/?#-]|$)/i);
  return m?.[1] ? normalizeMlId(m[1]) : null;
}

function buildCanonicalUrl(params: {
  origin: string;
  itemId: string;
  catalogProductId: string | null;
  permalink: string | null;
}): string {
  if (params.permalink?.trim()) return params.permalink.trim();
  if (params.catalogProductId) {
    const u = new URL(`${params.origin.replace(/\/+$/, '')}/p/${params.catalogProductId}`);
    u.searchParams.set('wid', params.itemId);
    return u.toString();
  }
  return `${params.origin.replace(/\/+$/, '')}/${params.itemId}`;
}

/**
 * Normaliza URL pegada antes de resolver (espacios, saltos de línea, BOM).
 * Compartida entre frontend y backend.
 */
export function normalizeMercadoLibreInputUrl(raw: string): string {
  let s = raw.trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
  if (!s) return '';
  s = s.replace(/\s+/g, '');
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s.replace(/^\/\//, '')}`;
  }
  return s;
}

export function isMercadoLibreHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./i, '').toLowerCase();
  return (
    host.includes('mercadolibre.') ||
    host === 'meli.la' ||
    host.endsWith('.meli.la')
  );
}

/**
 * Resuelve siteId + itemId desde una URL Mercado Libre.
 * No depende de regex frágiles sobre toda la URL: inspecciona pathname, search y hash.
 */
export function resolveMercadoLibreItem(rawUrl: string): MercadoLibreItemResolution | null {
  const trimmed = normalizeMercadoLibreInputUrl(rawUrl);
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (!isMercadoLibreHost(url.hostname)) return null;

  const hashParams = hashSearchParams(url);
  const catalogProductId = pathCatalogId(url.pathname);
  const pathItem = pathItemId(url.pathname);

  type Signal = { itemId: string; method: MercadoLibreResolutionMethod; confidence: MercadoLibreResolutionConfidence };
  const signals: Signal[] = [];

  const queryWid = url.searchParams.get('wid');
  if (isMlId(queryWid)) {
    signals.push({ itemId: normalizeMlId(queryWid), method: 'query_wid', confidence: 'high' });
  }

  for (const key of ['item_id', 'itemId'] as const) {
    const v = url.searchParams.get(key);
    if (isMlId(v)) {
      signals.push({ itemId: normalizeMlId(v), method: 'query_item_id', confidence: 'high' });
    }
  }

  const fromPdp = itemIdFromPdpFilters(url.searchParams.get('pdp_filters'));
  if (fromPdp) {
    signals.push({ itemId: fromPdp, method: 'query_pdp_filters', confidence: 'high' });
  }

  const hashWid = hashParams.get('wid');
  if (isMlId(hashWid)) {
    signals.push({ itemId: normalizeMlId(hashWid), method: 'hash_wid', confidence: 'high' });
  }

  for (const key of ['item_id', 'itemId'] as const) {
    const v = hashParams.get(key);
    if (isMlId(v)) {
      signals.push({ itemId: normalizeMlId(v), method: 'hash_item_id', confidence: 'high' });
    }
  }

  if (pathItem && !catalogProductId) {
    signals.push({ itemId: pathItem, method: 'path_item', confidence: 'medium' });
  } else if (pathItem && catalogProductId && pathItem !== catalogProductId) {
    signals.push({ itemId: pathItem, method: 'path_item', confidence: 'low' });
  }

  if (catalogProductId && signals.length === 0) {
    signals.push({
      itemId: catalogProductId,
      method: 'path_catalog',
      confidence: 'low',
    });
  }

  const winner = signals.find((s) => s.confidence === 'high') ?? signals[0];
  if (!winner) {
    return {
      siteId: siteFromHostname(url.hostname),
      itemId: null,
      catalogProductId,
      permalink: null,
      canonicalUrl: null,
      source: 'url',
      confidence: 'low',
      resolutionMethod: 'unresolved',
    };
  }

  const itemId = winner.itemId;
  const siteId = siteFromItemId(itemId) ?? siteFromHostname(url.hostname);
  const canonicalUrl = buildCanonicalUrl({
    origin: url.origin,
    itemId,
    catalogProductId: catalogProductId && catalogProductId !== itemId ? catalogProductId : null,
    permalink: null,
  });

  return {
    siteId,
    itemId,
    catalogProductId,
    permalink: null,
    canonicalUrl,
    source: 'url',
    confidence: winner.confidence,
    resolutionMethod: winner.method,
  };
}

/** Compat: devuelve solo itemId normalizado o null. */
export function extractMercadoLibreItemId(rawUrl: string): string | null {
  return resolveMercadoLibreItem(rawUrl)?.itemId ?? null;
}
