/**
 * Discovery novelty / repeat metrics — FACT + DERIVED only.
 * Distinguishes URL · Identity · Product novelty. Never invents IDs.
 */

import { jaccardOverlap, productIdentityKey, repeatRate } from './discoveryMetrics';

export type NoveltyKeyKind = 'url' | 'identity' | 'product';

export type NoveltyCandidateInput = {
  canonicalUrl?: string | null;
  sourceUrl?: string | null;
  productFingerprint?: string | null;
  productIdentifier?: string | null;
  source?: string | null;
  category?: string | null;
  rotQuery?: string | null;
  rotPage?: number | null;
  rotSeedId?: string | null;
};

export type ConcentrationStat = {
  key: string;
  count: number;
  share: number;
};

export type NoveltyRunMetrics = {
  discovered_count: number;
  unique_url_count: number;
  unique_identity_count: number;
  unique_product_count: number;
  /** 1 - unique/discovered. null if discovered=0 */
  repeat_url_rate: number | null;
  repeat_identity_rate: number | null;
  repeat_product_rate: number | null;
  novel_url_rate: number | null;
  novel_identity_rate: number | null;
  novel_product_rate: number | null;
  novel_url_count: number;
  novel_identity_count: number;
  novel_product_count: number;
  repeated_url_count: number;
  repeated_identity_count: number;
  repeated_product_count: number;
  jaccard_vs_previous_run: number | null;
  jaccard_vs_24h: number | null;
  jaccard_vs_7d: number | null;
  source_concentration: ConcentrationStat[];
  category_concentration: ConcentrationStat[];
  query_concentration: ConcentrationStat[];
  page_depth_novelty: {
    page: number | null;
    unique_urls: number;
    novel_vs_page1: number | null;
  }[];
  seed_novelty: ConcentrationStat[];
};

function urlKey(c: NoveltyCandidateInput): string | null {
  const u = (c.canonicalUrl || c.sourceUrl || '').trim().toLowerCase();
  return u || null;
}

function identityKey(c: NoveltyCandidateInput): string | null {
  return productIdentityKey({
    productFingerprint: c.productFingerprint,
    productIdentifier: c.productIdentifier,
    canonicalUrl: c.canonicalUrl || c.sourceUrl,
  });
}

/** Product key prefers fingerprint; falls back to identifier only (not URL). */
function productKey(c: NoveltyCandidateInput): string | null {
  const fp = c.productFingerprint?.trim();
  if (fp) return fp;
  const id = c.productIdentifier?.trim();
  if (id) return id;
  return null;
}

function uniqueKeys(
  rows: readonly NoveltyCandidateInput[],
  pick: (c: NoveltyCandidateInput) => string | null,
): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const k = pick(r);
    if (k) set.add(k);
  }
  return [...set];
}

function concentration(
  rows: readonly NoveltyCandidateInput[],
  pick: (c: NoveltyCandidateInput) => string | null,
  topN = 10,
): ConcentrationStat[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const k = pick(r);
    if (!k) continue;
    total += 1;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (total === 0) return [];
  return [...counts.entries()]
    .map(([key, count]) => ({
      key,
      count,
      share: Math.round((count / total) * 1000) / 1000,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

function novelVsHistory(
  runKeys: readonly string[],
  history: ReadonlySet<string>,
): { novel: number; repeated: number; rate: number | null } {
  const unique = [...new Set(runKeys.filter(Boolean))];
  let novel = 0;
  for (const k of unique) {
    if (!history.has(k)) novel += 1;
  }
  const repeated = unique.length - novel;
  return {
    novel,
    repeated,
    rate: unique.length === 0 ? null : novel / unique.length,
  };
}

export function computeNoveltyRunMetrics(input: {
  runCandidates: readonly NoveltyCandidateInput[];
  /** Identity keys from the immediately previous run (same source preferred). */
  previousRunIdentities?: ReadonlySet<string> | readonly string[];
  /** Identity keys observed in last 24h (excluding current run optional). */
  identities24h?: ReadonlySet<string> | readonly string[];
  /** Identity keys observed in last 7d. */
  identities7d?: ReadonlySet<string> | readonly string[];
  /** URL history for URL novelty (optional; defaults to identity windows if absent). */
  urls24h?: ReadonlySet<string> | readonly string[];
  urls7d?: ReadonlySet<string> | readonly string[];
  products24h?: ReadonlySet<string> | readonly string[];
  products7d?: ReadonlySet<string> | readonly string[];
}): NoveltyRunMetrics {
  const rows = input.runCandidates;
  const discovered = rows.length;
  const urls = uniqueKeys(rows, urlKey);
  const identities = uniqueKeys(rows, identityKey);
  const products = uniqueKeys(rows, productKey);

  const histId24 = toSet(input.identities24h);
  const histId7 = toSet(input.identities7d);
  const histUrl24 = toSet(input.urls24h ?? input.identities24h);
  const histUrl7 = toSet(input.urls7d ?? input.identities7d);
  const histProd24 = toSet(input.products24h);
  const histProd7 = toSet(input.products7d);
  const prev = toSet(input.previousRunIdentities);

  const urlNov = novelVsHistory(urls, histUrl7.size ? histUrl7 : histUrl24);
  const idNov = novelVsHistory(identities, histId7.size ? histId7 : histId24);
  const prodNov = novelVsHistory(
    products,
    histProd7.size ? histProd7 : histProd24.size ? histProd24 : histId7,
  );

  // Prefer 7d for novel_*_rate when available; else 24h.
  const urlRate = histUrl7.size
    ? novelVsHistory(urls, histUrl7).rate
    : histUrl24.size
      ? novelVsHistory(urls, histUrl24).rate
      : null;
  const idRate = histId7.size
    ? novelVsHistory(identities, histId7).rate
    : histId24.size
      ? novelVsHistory(identities, histId24).rate
      : null;
  const prodRate =
    products.length === 0
      ? null
      : histProd7.size
        ? novelVsHistory(products, histProd7).rate
        : histProd24.size
          ? novelVsHistory(products, histProd24).rate
          : idRate;

  const pageMap = new Map<number | null, Set<string>>();
  for (const r of rows) {
    const page = r.rotPage != null && Number.isFinite(r.rotPage) ? Number(r.rotPage) : null;
    const u = urlKey(r);
    if (!u) continue;
    if (!pageMap.has(page)) pageMap.set(page, new Set());
    pageMap.get(page)!.add(u);
  }
  const page1 = pageMap.get(1) ?? new Set<string>();
  const page_depth_novelty = [...pageMap.entries()]
    .map(([page, set]) => {
      let novel = 0;
      if (page !== 1 && page1.size > 0) {
        for (const u of set) if (!page1.has(u)) novel += 1;
      } else if (page === 1) {
        novel = set.size;
      }
      return {
        page,
        unique_urls: set.size,
        novel_vs_page1: page === 1 || page1.size === 0 ? null : novel / Math.max(set.size, 1),
      };
    })
    .sort((a, b) => (a.page ?? 999) - (b.page ?? 999));

  return {
    discovered_count: discovered,
    unique_url_count: urls.length,
    unique_identity_count: identities.length,
    unique_product_count: products.length,
    repeat_url_rate: repeatRate(discovered, urls.length),
    repeat_identity_rate: repeatRate(discovered, identities.length),
    repeat_product_rate: products.length === 0 ? null : repeatRate(discovered, products.length),
    novel_url_rate: urlRate,
    novel_identity_rate: idRate,
    novel_product_rate: prodRate,
    novel_url_count: urlNov.novel,
    novel_identity_count: idNov.novel,
    novel_product_count: prodNov.novel,
    repeated_url_count: urlNov.repeated,
    repeated_identity_count: idNov.repeated,
    repeated_product_count: prodNov.repeated,
    jaccard_vs_previous_run: prev.size ? jaccardOverlap(identities, prev) : null,
    jaccard_vs_24h: histId24.size ? jaccardOverlap(identities, histId24) : null,
    jaccard_vs_7d: histId7.size ? jaccardOverlap(identities, histId7) : null,
    source_concentration: concentration(rows, (c) => c.source?.trim() || null),
    category_concentration: concentration(rows, (c) => c.category?.trim() || null),
    query_concentration: concentration(rows, (c) => c.rotQuery?.trim() || null),
    page_depth_novelty,
    seed_novelty: concentration(rows, (c) => c.rotSeedId?.trim() || null),
  };
}

function toSet(v: ReadonlySet<string> | readonly string[] | undefined): Set<string> {
  if (!v) return new Set();
  if (v instanceof Set) return v;
  return new Set([...v].filter(Boolean));
}

export { urlKey as noveltyUrlKey, identityKey as noveltyIdentityKey, productKey as noveltyProductKey };
