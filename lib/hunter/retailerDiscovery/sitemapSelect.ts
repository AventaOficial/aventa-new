import { locMatchesPromoSlug, PROMO_SLUG_PATTERN } from '@/lib/hunter/dayToDay/surfaces';
import { looksLikeProductUrl } from '@/lib/hunter/dayToDay/fetchPublic';

export type SitemapKind = 'index' | 'product' | 'promotion' | 'landing' | 'image' | 'other';

export function classifySitemapUrl(url: string): SitemapKind {
  const lower = url.toLowerCase();
  if (/image|img[-_]?sitemap|sitemap[-_]?image/i.test(lower)) return 'image';
  if (/promo|oferta|descuento|liquidaci|sale[-_]?sitemap|sitemap[-_]?sale/i.test(lower)) return 'promotion';
  if (/landing/i.test(lower)) return 'landing';
  if (/product|pdp|item[-_]?sitemap|sitemap[-_]?product/i.test(lower)) return 'product';
  if (/sitemap_\d+_\d+/i.test(lower)) return 'product';
  if (/sitemapindex|sitemap_\d+\.xml/i.test(lower) && !/sitemap_\d+_\d+/i.test(lower)) return 'index';
  return 'other';
}

const KIND_SCORE: Record<SitemapKind, number> = {
  promotion: 80,
  product: 70,
  landing: 40,
  other: 20,
  index: 10,
  image: 0,
};

/** Determinista: score desc, luego URL asc. Image score 0 se descarta. */
export function selectChildSitemaps(locs: string[], max: number): string[] {
  const ranked = locs
    .filter((url) => classifySitemapUrl(url) !== 'image')
    .map((url) => {
      const kind = classifySitemapUrl(url);
      return { url, kind, score: KIND_SCORE[kind] };
    })
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
  const preferred = ranked.filter((row) => row.kind === 'promotion' || row.kind === 'product');
  const pool = preferred.length > 0 ? preferred : ranked.filter((row) => row.score > 0);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of pool) {
    if (seen.has(row.url)) continue;
    seen.add(row.url);
    out.push(row.url);
    if (out.length >= max) break;
  }
  return out;
}

export function isSitemapIndexXml(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}

function sameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

function isHomepage(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname === '/' || u.pathname === '';
  } catch {
    return false;
  }
}

/**
 * Slug de campaña (2x1 / 3x2), no medida de plomería (`1-2x1-2`) ni `2x1l`.
 */
export function isStrictPromoProductUrl(url: string, pattern = PROMO_SLUG_PATTERN): boolean {
  if (/\d[-/]2x1[-/]\d/i.test(url) && !/-2x1-[a-záéíóúñ]/i.test(url)) return false;
  return locMatchesPromoSlug(url, pattern);
}

/**
 * PDPs en orden determinista: slugs promo estrictos primero, luego documento.
 * No usa Math.random. No trata 2x1l / 1-2x1-2 como promo.
 */
export function selectProductUrls(
  locs: string[],
  opts: { origin: string; max: number; locPattern?: string },
): string[] {
  const pattern = opts.locPattern ?? PROMO_SLUG_PATTERN;
  const products = locs.filter(
    (url) => sameOrigin(url, opts.origin) && looksLikeProductUrl(url) && !isHomepage(url),
  );
  const promo = products.filter((url) => isStrictPromoProductUrl(url, pattern));
  const rest = products.filter((url) => !isStrictPromoProductUrl(url, pattern));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of [...promo, ...rest]) {
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= opts.max) break;
  }
  return out;
}

/** Cuántos child sitemaps caben si queremos dejar hueco para PDPs. */
export function sitemapFetchBudget(remainingRequests: number, maxSitemaps: number, minPdps = 4): number {
  if (remainingRequests <= 0) return 0;
  const reserved = Math.min(minPdps, Math.max(0, remainingRequests - 1));
  return Math.min(maxSitemaps, Math.max(1, remainingRequests - reserved));
}
