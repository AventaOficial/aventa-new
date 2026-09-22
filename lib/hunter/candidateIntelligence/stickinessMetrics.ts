/**
 * Stickiness diagnostics — explanatory, not business decisions.
 */

import { resolveCandidateIdentity, type ResolveIdentityInput } from './candidateIdentity';

export type StickinessFlags = {
  STICKY_URL: boolean;
  STICKY_IDENTITY: boolean;
  STICKY_QUERY: boolean;
  STICKY_SOURCE: boolean;
};

export type StickinessReport = {
  discovered: number;
  unique_url: number;
  unique_identity: number;
  unique_url_rate: number | null;
  unique_identity_rate: number | null;
  repeat_url_rate: number | null;
  repeat_identity_rate: number | null;
  concentration_top10: number | null;
  concentration_top20: number | null;
  per_source_repeat: Array<{ source: string; discovered: number; unique: number; repeat_rate: number | null }>;
  per_query_repeat: Array<{ query: string; discovered: number; unique: number; repeat_rate: number | null }>;
  per_seed_repeat: Array<{ seed: string; discovered: number; unique: number; repeat_rate: number | null }>;
  per_page_repeat: Array<{ page: string; discovered: number; unique: number; repeat_rate: number | null }>;
  diagnostics: StickinessFlags;
  thresholds: { sticky_repeat: number; sticky_concentration_top10: number };
  note: string;
};

type Row = ResolveIdentityInput & {
  source?: string | null;
  rotQuery?: string | null;
  rotSeedId?: string | null;
  rotPage?: number | null;
  canonicalUrl?: string | null;
};

const STICKY_REPEAT = 0.7;
const STICKY_TOP10 = 0.5;

function rate(unique: number, discovered: number): number | null {
  if (discovered <= 0) return null;
  return 1 - unique / discovered;
}

function uniqueRate(unique: number, discovered: number): number | null {
  if (discovered <= 0) return null;
  return unique / discovered;
}

function groupRepeat(
  rows: readonly Row[],
  keyFn: (r: Row) => string | null,
  idFn: (r: Row) => string | null,
): Array<{ key: string; discovered: number; unique: number; repeat_rate: number | null }> {
  const groups = new Map<string, { n: number; ids: Set<string> }>();
  for (const r of rows) {
    const k = keyFn(r);
    if (!k) continue;
    const id = idFn(r);
    const g = groups.get(k) ?? { n: 0, ids: new Set() };
    g.n += 1;
    if (id) g.ids.add(id);
    groups.set(k, g);
  }
  return [...groups.entries()]
    .map(([key, g]) => ({
      key,
      discovered: g.n,
      unique: g.ids.size,
      repeat_rate: rate(g.ids.size, g.n),
    }))
    .sort((a, b) => b.discovered - a.discovered)
    .slice(0, 20);
}

export function computeStickinessReport(rows: readonly Row[]): StickinessReport {
  const discovered = rows.length;
  const urls = new Set<string>();
  const ids = new Set<string>();
  const idCounts = new Map<string, number>();

  for (const r of rows) {
    const u = (r.canonicalUrl || '').trim().toLowerCase();
    if (u) urls.add(u);
    const id = resolveCandidateIdentity(r).identityKey;
    if (id) {
      ids.add(id);
      idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    }
  }

  const sortedCounts = [...idCounts.values()].sort((a, b) => b - a);
  const top10 = sortedCounts.slice(0, 10).reduce((a, b) => a + b, 0);
  const top20 = sortedCounts.slice(0, 20).reduce((a, b) => a + b, 0);
  const concentration_top10 = discovered > 0 && ids.size > 0 ? top10 / discovered : null;
  const concentration_top20 = discovered > 0 && ids.size > 0 ? top20 / discovered : null;

  const repeat_url_rate = rate(urls.size, discovered);
  const repeat_identity_rate = rate(ids.size, discovered);

  const per_source = groupRepeat(
    rows,
    (r) => r.source?.trim() || null,
    (r) => resolveCandidateIdentity(r).identityKey,
  );
  const per_query = groupRepeat(
    rows,
    (r) => r.rotQuery?.trim() || null,
    (r) => resolveCandidateIdentity(r).identityKey,
  );
  const per_seed = groupRepeat(
    rows,
    (r) => r.rotSeedId?.trim() || null,
    (r) => resolveCandidateIdentity(r).identityKey,
  );
  const per_page = groupRepeat(
    rows,
    (r) => (r.rotPage != null && Number.isFinite(r.rotPage) ? String(r.rotPage) : null),
    (r) => resolveCandidateIdentity(r).identityKey,
  );

  const diagnostics: StickinessFlags = {
    STICKY_URL: (repeat_url_rate ?? 0) >= STICKY_REPEAT,
    STICKY_IDENTITY: (repeat_identity_rate ?? 0) >= STICKY_REPEAT,
    STICKY_QUERY: per_query.some((q) => (q.repeat_rate ?? 0) >= STICKY_REPEAT && q.discovered >= 5),
    STICKY_SOURCE: per_source.some((s) => (s.repeat_rate ?? 0) >= STICKY_REPEAT && s.discovered >= 10),
  };

  return {
    discovered,
    unique_url: urls.size,
    unique_identity: ids.size,
    unique_url_rate: uniqueRate(urls.size, discovered),
    unique_identity_rate: uniqueRate(ids.size, discovered),
    repeat_url_rate,
    repeat_identity_rate,
    concentration_top10,
    concentration_top20,
    per_source_repeat: per_source.map(({ key, ...rest }) => ({ source: key, ...rest })),
    per_query_repeat: per_query.map(({ key, ...rest }) => ({ query: key, ...rest })),
    per_seed_repeat: per_seed.map(({ key, ...rest }) => ({ seed: key, ...rest })),
    per_page_repeat: per_page.map(({ key, ...rest }) => ({ page: key, ...rest })),
    diagnostics,
    thresholds: { sticky_repeat: STICKY_REPEAT, sticky_concentration_top10: STICKY_TOP10 },
    note:
      concentration_top10 != null && concentration_top10 >= STICKY_TOP10
        ? 'Top-10 identities dominate share — inventory concentration high.'
        : 'Stickiness flags are diagnostic only; no policy change.',
  };
}
