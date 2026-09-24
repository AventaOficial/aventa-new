/**
 * Supply learning from append-only hunter_supply_runs.
 * Does not discover, insert, or publish.
 */

import { recordSupplyWindow } from '@/lib/intelligence/telemetry';

/** Dry-run only. The hunter scheduler must not import the ranker. */
export const SUPPLY_PRIORITY_STAGE = 'shadow' as const;
export const SUPPLY_PRIORITY_ACTIVATES_SCHEDULER = false;

export type SupplyRunSample = {
  sourceId: string;
  sourceFamily: string;
  sourceLane: string;
  status: string;
  startedAt: string;
  candidatesDiscovered: number;
  candidatesQualified: number;
  verifiedDeals: number;
  duplicates: number;
  catalogOnly: number;
  rejected: number;
  pending: number;
  errors: number;
  durationMs: number;
};

export type SourceIntelligence = {
  sourceId: string;
  sourceFamily: string;
  sourceLane: string;
  runs: number;
  reliability: number | null;
  discoveryYield: number | null;
  verificationYield: number | null;
  falsePositiveRate: number | null;
  noiseShare: number | null;
  /** Time cost only. Currency cost is not in hunter_supply_runs. */
  medianLatencyMs: number | null;
  timeCostMs: number;
  hourBuckets: { hourUtc: number; runs: number; verified: number }[];
  sample: 'provided_rows';
};

function ratio(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num / den) * 10000) / 10000;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const a = sorted[mid - 1];
  const b = sorted[mid];
  if (a == null || b == null) return null;
  return (a + b) / 2;
}

export function summarizeSourceRuns(rows: SupplyRunSample[]): SourceIntelligence[] {
  recordSupplyWindow();
  const groups = new Map<string, SupplyRunSample[]>();
  for (const row of rows) {
    const key = `${row.sourceId}|${row.sourceFamily}|${row.sourceLane}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .map(([, list]) => {
      const first = list[0];
      const discovered = list.reduce((acc, row) => acc + row.candidatesDiscovered, 0);
      const qualified = list.reduce((acc, row) => acc + row.candidatesQualified, 0);
      const verified = list.reduce((acc, row) => acc + row.verifiedDeals, 0);
      const rejected = list.reduce((acc, row) => acc + row.rejected, 0);
      const duplicates = list.reduce((acc, row) => acc + row.duplicates, 0);
      const catalogOnly = list.reduce((acc, row) => acc + row.catalogOnly, 0);
      const ok = list.filter((row) => row.status === 'ok').length;
      const hours = new Map<number, { runs: number; verified: number }>();
      for (const row of list) {
        const hour = new Date(row.startedAt).getUTCHours();
        const bucket = hours.get(hour) ?? { runs: 0, verified: 0 };
        bucket.runs += 1;
        bucket.verified += row.verifiedDeals;
        hours.set(hour, bucket);
      }
      return {
        sourceId: first?.sourceId ?? '',
        sourceFamily: first?.sourceFamily ?? '',
        sourceLane: first?.sourceLane ?? '',
        runs: list.length,
        reliability: ratio(ok, list.length),
        discoveryYield: ratio(verified, discovered),
        verificationYield: ratio(verified, qualified),
        falsePositiveRate: ratio(rejected, rejected + verified),
        noiseShare: ratio(duplicates + catalogOnly, discovered),
        medianLatencyMs: median(list.map((row) => row.durationMs).filter((n) => n >= 0)),
        timeCostMs: list.reduce((acc, row) => acc + Math.max(0, row.durationMs), 0),
        hourBuckets: [...hours.entries()]
          .map(([hourUtc, bucket]) => ({ hourUtc, ...bucket }))
          .sort((a, b) => b.verified - a.verified || a.hourUtc - b.hourUtc),
        sample: 'provided_rows' as const,
      };
    })
    .sort((a, b) => (b.discoveryYield ?? -1) - (a.discoveryYield ?? -1) || b.runs - a.runs);
}

/** Prefer sources whose verified yield beats noise. Deterministic, not a crawler. */
export function rankSourcesForNextLook(sources: SourceIntelligence[]): string[] {
  return [...sources]
    .filter((source) => source.runs > 0 && (source.reliability ?? 0) >= 0.5)
    .sort((a, b) => {
      const yieldDelta = (b.discoveryYield ?? 0) - (a.discoveryYield ?? 0);
      if (yieldDelta !== 0) return yieldDelta;
      return (a.noiseShare ?? 1) - (b.noiseShare ?? 1);
    })
    .map((source) => source.sourceId);
}
