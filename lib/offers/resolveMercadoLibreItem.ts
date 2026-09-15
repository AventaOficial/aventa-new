/**
 * Resolución central de URLs Mercado Libre → siteId + itemId.
 * Prioriza señales explícitas de item sobre IDs de catálogo en /p/.
 * Lee query y hash (URLSearchParams no incluye el fragment).
 *
 * CONTRATO canonicalUrl:
 * - Es un permalink navegable real (conserva pathname), o null.
 * - NUNCA inventa `origin/{ITEM_ID}` ni `origin/{MLMU}` (bare-ID).
 * - UPP `/{slug}/up/{MLMU…}` se preserva; MLMU ≠ item_id de /items.
 * - item_id ≠ public URL; user_product_id ≠ bare path.
 */

export type MercadoLibreResolutionMethod =
  | 'query_wid'
  | 'query_item_id'
  | 'query_pdp_filters'
  | 'hash_wid'
  | 'hash_item_id'
  | 'path_item'
  | 'path_catalog'
  | 'path_user_product'
  | 'unresolved';

export type MercadoLibreResolutionConfidence = 'high' | 'medium' | 'low';

export type MercadoLibreItemResolution = {
  siteId: string | null;
  itemId: string | null;
  catalogProductId: string | null;
  permalink: string | null;
  /** Permalink navegable, o null si no se puede sin inventar. */
  canonicalUrl: string | null;
  source: 'url';
  confidence: MercadoLibreResolutionConfidence;
  resolutionMethod: MercadoLibreResolutionMethod;
};

const ML_ID_RE = /^ML[A-Z]{0,3}-?\d+$/i;

/** Query keys de tracking/afiliado que no definen identidad de producto. */
const DROP_QUERY_KEYS = new Set([
  'tag',
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
  'origin',
  'sid',
  'action',
  'ref',
  'ref_',
]);

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

/**
 * IDs de `/up/MLMU…` (user product). Parecen ML* pero NO sirven en `/items/{id}` (404).
 * Distinto de items Uruguay `MLU`+dígitos: aquí el prefijo tiene letra de sitio + `U`
 * (p.ej. `MLMU123`, `MLAU123`).
 */
export function isMercadoLibreUserProductId(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return /^ML[A-Z]U\d+$/i.test(normalizeMlId(raw));
}

/** True si el id puede consultarse en `/items/{id}` sin inventar. */
export function isMercadoLibreApiItemId(raw: string | null | undefined): boolean {
  if (!isMlId(raw)) return false;
  return !isMercadoLibreUserProductId(raw);
}

/** ID estable de `/up/MLMU…` para fingerprint/dedupe; no es item API. */
export function extractMercadoLibreUserProductId(rawUrl: string): string | null {
  try {
    const url = new URL(normalizeMercadoLibreInputUrl(rawUrl));
    if (!isMercadoLibreHost(url.hostname)) return null;
    const m = url.pathname.match(/\/up\/((?:ML[A-Z]U)-?\d+)/i);
    return m?.[1] ? normalizeMlId(m[1]) : null;
  } catch {
    return null;
  }
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

/**
 * Pathname de producto navegable en ML (no bare `/{ITEM_ID}`).
 * - `/p/MLM…` o `/slug/p/MLM…`
 * - `articulo…/MLM-123456-_JM…`
 * - `/up/MLMU…` (user product page)
 */
export function isMercadoLibreNavigableProductPath(pathname: string): boolean {
  const p = pathname || '';
  if (/\/p\/(?:ML[A-Z]{0,3})-?\d+/i.test(p)) return true;
  // articulo…/MLM-123… (guion obligatorio — distinto de bare /MLM123)
  if (/\/(?:ML[A-Z]{1,3})-\d+/i.test(p)) return true;
  if (/\/up\/(?:ML[A-Z]U)-?\d+/i.test(p)) return true;
  return false;
}

/** True si la URL es bare-ID: `https://host/MLM123456` (± query). */
export function isMercadoLibreBareItemPathUrl(rawUrl: string): boolean {
  try {
    const url = new URL(normalizeMercadoLibreInputUrl(rawUrl));
    if (!isMercadoLibreHost(url.hostname)) return false;
    if (isMercadoLibreNavigableProductPath(url.pathname)) return false;
    const p = url.pathname.replace(/\/+$/, '') || '/';
    return /^\/(?:ML[A-Z]{0,3})-?\d{6,}$/i.test(p);
  } catch {
    return false;
  }
}

/** Permalink ML navegable (host ML + path de producto real). */
export function isMercadoLibreNavigableProductUrl(rawUrl: string): boolean {
  try {
    const url = new URL(normalizeMercadoLibreInputUrl(rawUrl));
    if (!isMercadoLibreHost(url.hostname)) return false;
    if (url.hostname.toLowerCase() === 'meli.la' || url.hostname.toLowerCase().endsWith('.meli.la')) {
      // Shortlinks: navegables hasta expandir; no son bare-ID.
      return url.pathname.replace(/\/+$/, '').length > 1;
    }
    return isMercadoLibreNavigableProductPath(url.pathname);
  } catch {
    return false;
  }
}

function stripTrackingQuery(url: URL): URL {
  const out = new URL(url.href);
  out.hash = '';
  for (const key of [...out.searchParams.keys()]) {
    if (DROP_QUERY_KEYS.has(key.toLowerCase())) {
      out.searchParams.delete(key);
    }
  }
  return out;
}

/**
 * Preserva un permalink ya navegable (incl. UPP `/{slug}/up/MLMU…`).
 * Nunca inventa `/{MLMU}` ni `/shopping/up/…`.
 */
function preserveNavigablePermalink(inputUrl: URL): string | null {
  if (!isMercadoLibreNavigableProductPath(inputUrl.pathname)) return null;
  return stripTrackingQuery(inputUrl).toString();
}

/**
 * Construye canonical navegable o null.
 * NUNCA retorna `origin/{itemId}` ni `origin/{MLMU}`.
 */
function buildCanonicalUrl(params: {
  inputUrl: URL;
  itemId: string;
  catalogProductId: string | null;
  permalink: string | null;
}): string | null {
  if (params.permalink?.trim()) return params.permalink.trim();

  // A) Preservar pathname real si ya es permalink navegable (/p/, articulo, /up/).
  if (isMercadoLibreNavigableProductPath(params.inputUrl.pathname)) {
    const u = stripTrackingQuery(params.inputUrl);
    if (/\/p\//i.test(u.pathname) && params.itemId && !u.searchParams.get('wid')) {
      u.searchParams.set('wid', params.itemId);
    }
    return u.toString();
  }

  // B) Reconstrucción segura SOLO como /p/{catalog}?wid={item} (forma pública conocida).
  // Incluye catalog === item: /p/MLM123?wid=MLM123 — válido; /MLM123 — no.
  // Nunca reconstruye User Product como bare /{MLMU} ni /shopping/up/{MLMU}.
  if (params.catalogProductId && isMercadoLibreApiItemId(params.catalogProductId)) {
    const u = new URL(`${params.inputUrl.origin.replace(/\/+$/, '')}/p/${params.catalogProductId}`);
    u.searchParams.set('wid', params.itemId);
    return u.toString();
  }

  // C) Solo item_id / bare path → fail-closed.
  return null;
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

  type Signal = {
    itemId: string;
    method: MercadoLibreResolutionMethod;
    confidence: MercadoLibreResolutionConfidence;
  };
  const signals: Signal[] = [];

  const pushSignal = (
    itemId: string,
    method: MercadoLibreResolutionMethod,
    confidence: MercadoLibreResolutionConfidence,
  ) => {
    // Nunca promover MLMU/user-product a item_id de API.
    if (!isMercadoLibreApiItemId(itemId)) return;
    signals.push({ itemId, method, confidence });
  };

  const queryWid = url.searchParams.get('wid');
  if (isMlId(queryWid)) {
    pushSignal(normalizeMlId(queryWid), 'query_wid', 'high');
  }

  for (const key of ['item_id', 'itemId'] as const) {
    const v = url.searchParams.get(key);
    if (isMlId(v)) {
      pushSignal(normalizeMlId(v), 'query_item_id', 'high');
    }
  }

  const fromPdp = itemIdFromPdpFilters(url.searchParams.get('pdp_filters'));
  if (fromPdp) {
    pushSignal(fromPdp, 'query_pdp_filters', 'high');
  }

  const hashWid = hashParams.get('wid');
  if (isMlId(hashWid)) {
    pushSignal(normalizeMlId(hashWid), 'hash_wid', 'high');
  }

  for (const key of ['item_id', 'itemId'] as const) {
    const v = hashParams.get(key);
    if (isMlId(v)) {
      pushSignal(normalizeMlId(v), 'hash_item_id', 'high');
    }
  }

  // Bare `/{ITEM_ID}` no es path de producto: no usarlo como señal path_item.
  const barePath = isMercadoLibreBareItemPathUrl(url.href);
  if (!barePath) {
    if (pathItem && !catalogProductId) {
      pushSignal(pathItem, 'path_item', 'medium');
    } else if (pathItem && catalogProductId && pathItem !== catalogProductId) {
      pushSignal(pathItem, 'path_item', 'low');
    }
  } else if (pathItem && isMercadoLibreApiItemId(pathItem)) {
    // Identidad sí; canonical no.
    pushSignal(pathItem, 'path_item', 'low');
  }

  if (catalogProductId && signals.length === 0 && isMercadoLibreApiItemId(catalogProductId)) {
    signals.push({
      itemId: catalogProductId,
      method: 'path_catalog',
      confidence: 'low',
    });
  }

  const winner = signals.find((s) => s.confidence === 'high') ?? signals[0];
  if (!winner) {
    // UPP / articulo / /p/ sin item API: preservar permalink navegable; bare → null.
    const preserved = preserveNavigablePermalink(url);
    const userProductId = extractMercadoLibreUserProductId(url.href);
    return {
      siteId: siteFromHostname(url.hostname),
      itemId: null,
      catalogProductId,
      permalink: null,
      canonicalUrl: preserved,
      source: 'url',
      confidence: preserved ? 'medium' : 'low',
      resolutionMethod: preserved
        ? userProductId
          ? 'path_user_product'
          : 'path_item'
        : 'unresolved',
    };
  }

  const itemId = winner.itemId;
  const siteId = siteFromItemId(itemId) ?? siteFromHostname(url.hostname);
  // Conservar catalog aunque catalog === item: permite /p/{id}?wid={id}.
  const canonicalUrl = buildCanonicalUrl({
    inputUrl: url,
    itemId,
    catalogProductId,
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
