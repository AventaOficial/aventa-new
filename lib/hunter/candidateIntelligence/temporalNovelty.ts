/**
 * Temporal novelty / Jaccard with NON-OVERLAPPING windows.
 *
 * Methodology:
 * - current window: [since, until]
 * - baseline_24h: [since - 24h, since)   (exclusive of current)
 * - baseline_7d:  [since - 7d, since)    (exclusive of current)
 *
 * Identity key = resolveCandidateIdentity().identityKey
 * Never coerce null → 0.
 */

import { jaccardOverlap } from './discoveryMetrics';
import { resolveCandidateIdentity, type ResolveIdentityInput } from './candidateIdentity';

export type TemporalWindowSpec = {
  current: { since: string; until: string };
  baseline_24h: { since: string; until: string } | null;
  baseline_7d: { since: string; until: string } | null;
  identityKeyUsed: 'typed_identity_key';
  note: string;
};

export type TemporalNoveltyReport = {
  windows: TemporalWindowSpec;
  current_unique_identities: number;
  current_unique_urls: number;
  /** null when baseline empty or insufficient (0 identities). */
  novelty_24h: number | null;
  novelty_7d: number | null;
  jaccard_24h: number | null;
  jaccard_7d: number | null;
  novel_identity_count_24h: number | null;
  novel_identity_count_7d: number | null;
  baseline_24h_size: number;
  baseline_7d_size: number;
  sufficient_baseline_24h: boolean;
  sufficient_baseline_7d: boolean;
};

const MIN_BASELINE = 1; // mathematical minimum; still return null if baseline empty

export function buildTemporalWindows(sinceIso: string, untilIso: string): TemporalWindowSpec {
  const sinceMs = Date.parse(sinceIso);
  const untilMs = Date.parse(untilIso);
  if (!Number.isFinite(sinceMs) || !Number.isFinite(untilMs) || untilMs <= sinceMs) {
    return {
      current: { since: sinceIso, until: untilIso },
      baseline_24h: null,
      baseline_7d: null,
      identityKeyUsed: 'typed_identity_key',
      note: 'Invalid current window — baselines unavailable.',
    };
  }
  const b24Until = new Date(sinceMs).toISOString();
  const b24Since = new Date(sinceMs - 24 * 60 * 60 * 1000).toISOString();
  const b7Until = new Date(sinceMs).toISOString();
  const b7Since = new Date(sinceMs - 7 * 24 * 60 * 60 * 1000).toISOString();
  return {
    current: { since: sinceIso, until: untilIso },
    baseline_24h: { since: b24Since, until: b24Until },
    baseline_7d: { since: b7Since, until: b7Until },
    identityKeyUsed: 'typed_identity_key',
    note:
      'Baselines are strictly before `since` (half-open [baseline_since, since)). No overlap with current window.',
  };
}

function identityKeys(rows: readonly ResolveIdentityInput[]): Set<string> {
  const set = new Set<string>();
  for (const r of rows) {
    const id = resolveCandidateIdentity(r).identityKey;
    if (id) set.add(id);
  }
  return set;
}

function urlKeys(rows: readonly ResolveIdentityInput[]): Set<string> {
  const set = new Set<string>();
  for (const r of rows) {
    const u = (r.canonicalUrl || r.sourceUrl || '').trim().toLowerCase();
    if (u) set.add(u);
  }
  return set;
}

export function computeTemporalNovelty(input: {
  since: string;
  until: string;
  currentRows: readonly ResolveIdentityInput[];
  /** Rows observed in baseline_24h window (caller loads). */
  baseline24hRows?: readonly ResolveIdentityInput[];
  /** Rows observed in baseline_7d window (caller loads). */
  baseline7dRows?: readonly ResolveIdentityInput[];
}): TemporalNoveltyReport {
  const windows = buildTemporalWindows(input.since, input.until);
  const currentIds = identityKeys(input.currentRows);
  const currentUrls = urlKeys(input.currentRows);
  const b24 = identityKeys(input.baseline24hRows ?? []);
  const b7 = identityKeys(input.baseline7dRows ?? []);

  const sufficient24 = b24.size >= MIN_BASELINE && windows.baseline_24h != null;
  const sufficient7 = b7.size >= MIN_BASELINE && windows.baseline_7d != null;

  const novelVs = (current: Set<string>, baseline: Set<string>) => {
    let novel = 0;
    for (const k of current) if (!baseline.has(k)) novel += 1;
    return {
      novel,
      rate: current.size === 0 ? null : novel / current.size,
    };
  };

  const n24 = sufficient24 ? novelVs(currentIds, b24) : { novel: null as number | null, rate: null };
  const n7 = sufficient7 ? novelVs(currentIds, b7) : { novel: null as number | null, rate: null };

  return {
    windows,
    current_unique_identities: currentIds.size,
    current_unique_urls: currentUrls.size,
    novelty_24h: n24.rate,
    novelty_7d: n7.rate,
    jaccard_24h: sufficient24 ? jaccardOverlap(currentIds, b24) : null,
    jaccard_7d: sufficient7 ? jaccardOverlap(currentIds, b7) : null,
    novel_identity_count_24h: n24.novel,
    novel_identity_count_7d: n7.novel,
    baseline_24h_size: b24.size,
    baseline_7d_size: b7.size,
    sufficient_baseline_24h: sufficient24,
    sufficient_baseline_7d: sufficient7,
  };
}
