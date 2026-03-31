/**
 * Fetch + parse de metadatos de página de producto (misma heurística que /api/parse-offer-url).
 * Duplicado a propósito para no acoplar el cron al handler HTTP.
 */
import { inferStoreFromHostname } from '@/lib/inferStoreFromHostname';
import { sanitizeOfferTitle } from '@/lib/sanitizeOfferTitle';
import { isBlockedOfferParseUrl } from '@/lib/server/fetchUrlSafety';
import type { OfferQualitySignals } from './offerQualitySignals';
import { BOT_INGEST_USER_AGENT } from './ingestHttp';

const FETCH_TIMEOUT_MS = 12_000;

function getDomain(hostname: string): string {
  return hostname.replace(/^www\./, '').toLowerCase();
}

function getMetaContent(html: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const propertyMatch = html.match(
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
      'i'
    )
  );
  if (propertyMatch) return propertyMatch[1].trim() || null;
  const contentFirstMatch = html.match(
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`,
      'i'
    )
  );
  return contentFirstMatch ? contentFirstMatch[1].trim() || null : null;
}

function getById(html: string, id: string, attr: 'content' | 'src' | 'text'): string | null {
  const idEsc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (attr === 'text') {
    const m = html.match(new RegExp(`<[^>]+id=["']${idEsc}["'][^>]*>([\\s\\S]*?)<\\/`, 'i'));
    return m ? m[1].replace(/<[^>]+>/g, '').trim() || null : null;
  }
  const m = html.match(
    new RegExp(`<[^>]+id=["']${idEsc}["'][^>]+${attr}=["']([^"']*)["']`, 'i')
  );
  if (m) return m[1].trim() || null;
  const m2 = html.match(
    new RegExp(`<[^>]+${attr}=["']([^"']*)["'][^>]+id=["']${idEsc}["']`, 'i')
  );
  return m2 ? m2[1].trim() || null : null;
}

function absoluteUrl(base: string, path: string | null): string | null {
  if (!path || !path.trim()) return null;
  const trimmed = path.trim();
  let href: string;
  if (/^https?:\/\//i.test(trimmed)) href = trimmed;
  else {
    try {
      href = new URL(trimmed, base).href;
    } catch {
      return null;
    }
  }
  try {
    const u = new URL(href);
    if (isBlockedOfferParseUrl(u).blocked) return null;
    return u.href;
  } catch {
    return null;
  }
}

function parseAmazon(html: string, base: string): { title: string | null; image: string | null; store: string } {
  const title =
    getMetaContent(html, 'og:title') ||
    getById(html, 'productTitle', 'text') ||
    null;
  const rawImage =
    getMetaContent(html, 'og:image') ||
    getById(html, 'landingImage', 'src') ||
    null;
  const image = absoluteUrl(base, rawImage);
  return {
    title: title && title.length > 0 ? title : null,
    image,
    store: 'Amazon',
  };
}

function parseMercadoLibre(html: string, base: string): { title: string | null; image: string | null; store: string } {
  const title = getMetaContent(html, 'og:title') || null;
  const rawImage = getMetaContent(html, 'og:image') || null;
  const image = absoluteUrl(base, rawImage);
  return {
    title: title && title.length > 0 ? title : null,
    image,
    store: 'Mercado Libre',
  };
}

function parsePositiveNumber(raw: string | null | undefined): number | null {
  if (!raw || !String(raw).trim()) return null;
  const n = parseFloat(String(raw).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parsePositiveLocalizedNumber(raw: string | null | undefined): number | null {
  if (!raw || !String(raw).trim()) return null;
  const clean = String(raw).replace(/[^\d,.-]/g, '').trim();
  if (!clean) return null;
  const hasComma = clean.includes(',');
  const hasDot = clean.includes('.');
  let normalized = clean;
  if (hasComma && hasDot) {
    if (clean.lastIndexOf('.') > clean.lastIndexOf(',')) {
      normalized = clean.replace(/,/g, '');
    } else {
      normalized = clean.replace(/\./g, '').replace(',', '.');
    }
  } else if (hasComma && !hasDot) {
    const parts = clean.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      normalized = `${parts[0].replace(/,/g, '')}.${parts[1]}`;
    } else {
      normalized = clean.replace(/,/g, '');
    }
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

type ExtractedPrices = { discount: number | null; original: number | null };

function extractSuggestedPrices(html: string): ExtractedPrices {
  let discount: number | null =
    parsePositiveLocalizedNumber(getMetaContent(html, 'og:price:amount')) ||
    parsePositiveLocalizedNumber(getMetaContent(html, 'product:price:amount'));
  let original: number | null = parsePositiveNumber(getMetaContent(html, 'product:original_price:amount'));

  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw || raw.length > 500_000) continue;
    try {
      const parsed = JSON.parse(raw);
      scanLdJson(parsed);
    } catch {
      /* inválido */
    }
  }

  function considerOffer(off: Record<string, unknown>) {
    const low = off.lowPrice;
    const high = off.highPrice;
    if (typeof low === 'number' && low > 0) discount = discount ?? low;
    else if (typeof low === 'string') {
      const n = parsePositiveLocalizedNumber(low);
      if (n) discount = discount ?? n;
    }
    const p = off.price;
    if (typeof p === 'number' && p > 0) discount = discount ?? p;
    else if (typeof p === 'string') {
      const n = parsePositiveLocalizedNumber(p);
      if (n) discount = discount ?? n;
    }
    if (typeof high === 'number' && high > 0) original = original ?? high;
    else if (typeof high === 'string') {
      const n = parsePositiveLocalizedNumber(high);
      if (n) original = original ?? n;
    }
  }

  function scanLdJson(node: unknown) {
    if (node == null) return;
    if (Array.isArray(node)) {
      node.forEach(scanLdJson);
      return;
    }
    if (typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    if (o['@graph']) scanLdJson(o['@graph']);

    const types = o['@type'];
    const typeStr = Array.isArray(types) ? types.map(String).join(',') : String(types ?? '');

    if (typeStr.includes('AggregateOffer')) {
      considerOffer(o);
    }
    if (typeStr.includes('Offer')) {
      considerOffer(o);
    }
    if (typeStr.includes('Product') && o.offers) {
      scanLdJson(o.offers);
    }
  }

  if (discount == null) {
    const itemPropPrice = html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i)?.[1];
    discount = parsePositiveLocalizedNumber(itemPropPrice);
  }

  if (discount == null) {
    const priceMatch =
      html.match(/["']price["']\s*:\s*["']([^"']+)["']/i)?.[1] ??
      html.match(/["']price["']\s*:\s*([0-9][0-9.,]+)/i)?.[1] ??
      null;
    discount = parsePositiveLocalizedNumber(priceMatch);
  }

  if (original == null) {
    const originalMatch =
      html.match(/["']original_price["']\s*:\s*["']([^"']+)["']/i)?.[1] ??
      html.match(/["']priceBefore["']\s*:\s*["']([^"']+)["']/i)?.[1] ??
      null;
    original = parsePositiveLocalizedNumber(originalMatch);
  }

  if (original != null && discount != null && original < discount) {
    const tmp = original;
    original = discount;
    discount = tmp;
  }

  return { discount, original };
}

function extractQualitySignalsFromLdJson(html: string): OfferQualitySignals {
  const signals: OfferQualitySignals = {};
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw || raw.length > 500_000) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    scanLdForRating(parsed);
  }

  function considerProduct(o: Record<string, unknown>) {
    const agg = o.aggregateRating as Record<string, unknown> | undefined;
    if (agg) {
      const av = agg.ratingValue ?? agg.ratingvalue;
      const cnt = agg.ratingCount ?? agg.reviewCount ?? agg.reviewcount;
      if (typeof av === 'number' && Number.isFinite(av)) signals.ratingAverage = av;
      else if (typeof av === 'string') {
        const n = Number.parseFloat(av);
        if (Number.isFinite(n)) signals.ratingAverage = n;
      }
      if (typeof cnt === 'number' && Number.isFinite(cnt)) signals.ratingCount = cnt;
      else if (typeof cnt === 'string') {
        const n = Number.parseInt(cnt, 10);
        if (Number.isFinite(n)) signals.ratingCount = n;
      }
    }
  }

  function scanLdForRating(node: unknown) {
    if (node == null) return;
    if (Array.isArray(node)) {
      node.forEach(scanLdForRating);
      return;
    }
    if (typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    if (o['@graph']) scanLdForRating(o['@graph']);

    const types = o['@type'];
    const typeStr = Array.isArray(types) ? types.map(String).join(',') : String(types ?? '');
    if (typeStr.includes('Product')) {
      considerProduct(o);
    }
  }

  return signals;
}

function parseGeneric(html: string, base: string): { title: string | null; image: string | null; store: string | null } {
  const title =
    getMetaContent(html, 'og:title') ||
    getMetaContent(html, 'twitter:title') ||
    null;
  const rawImage =
    getMetaContent(html, 'og:image') ||
    getMetaContent(html, 'twitter:image') ||
    null;
  const image = absoluteUrl(base, rawImage);
  const store =
    getMetaContent(html, 'og:site_name') ||
    getMetaContent(html, 'application-name') ||
    null;
  return {
    title: title && title.length > 0 ? title : null,
    image,
    store: store && store.length > 0 ? store : null,
  };
}

export type ParsedOfferMetadata = {
  canonicalUrl: string;
  title: string;
  store: string;
  imageUrl: string;
  discountPrice: number;
  originalPrice: number | null;
  discountPercent: number;
  signals?: OfferQualitySignals;
};

export async function fetchParsedOfferMetadata(rawUrl: string): Promise<ParsedOfferMetadata | null> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;

  const block = isBlockedOfferParseUrl(url);
  if (block.blocked) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url.href, {
      signal: controller.signal,
      headers: {
        'User-Agent': BOT_INGEST_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
  clearTimeout(timeoutId);

  if (!res.ok) return null;

  const html = await res.text();
  const finalUrl = res.url ? new URL(res.url) : url;
  const base = finalUrl.origin + finalUrl.pathname;
  const domain = getDomain(finalUrl.hostname);
  const prices = extractSuggestedPrices(html);

  const isAmazon =
    domain === 'amazon.com' ||
    domain === 'amazon.com.mx' ||
    domain.endsWith('.amazon.com') ||
    domain.endsWith('.amazon.com.mx');

  const isMercadoLibre =
    domain === 'mercadolibre.com' ||
    domain === 'mercadolibre.com.mx' ||
    domain.endsWith('.mercadolibre.com') ||
    domain.endsWith('.mercadolibre.com.mx');

  let data: { title: string | null; image: string | null; store: string | null };
  if (isAmazon) {
    const d = parseAmazon(html, base);
    data = { ...d, store: d.store };
  } else if (isMercadoLibre) {
    const d = parseMercadoLibre(html, base);
    data = { ...d, store: d.store };
  } else {
    data = parseGeneric(html, base);
  }

  const titleRaw = sanitizeOfferTitle(data.title) ?? data.title?.trim();
  if (!titleRaw) return null;

  const store =
    (data.store && data.store.trim()) ||
    inferStoreFromHostname(finalUrl.hostname) ||
    'Tienda';

  const imageUrl = data.image || '/placeholder.png';

  const discount = prices.discount;
  const original = prices.original;

  let discountPrice: number;
  let originalPrice: number | null;
  if (discount != null && original != null && original > discount) {
    discountPrice = discount;
    originalPrice = original;
  } else if (discount != null) {
    discountPrice = discount;
    originalPrice = original != null && original > discount ? original : null;
  } else {
    return null;
  }

  const discountPercent =
    originalPrice != null && originalPrice > 0
      ? Math.round((1 - discountPrice / originalPrice) * 100)
      : 0;

  const ldSignals = extractQualitySignalsFromLdJson(html);
  const hasSignal =
    ldSignals.ratingAverage != null ||
    ldSignals.ratingCount != null ||
    ldSignals.soldQuantity != null ||
    ldSignals.condition != null;

  return {
    canonicalUrl: finalUrl.href,
    title: titleRaw,
    store,
    imageUrl,
    discountPrice,
    originalPrice,
    discountPercent,
    ...(hasSignal ? { signals: ldSignals } : {}),
  };
}
