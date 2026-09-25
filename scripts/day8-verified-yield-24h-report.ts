/**
 * Day 8 — 24h VERIFIED-yield readout from durable tables.
 *
 * Reads hunter_supply_runs (+ discovery_cycle_snapshots when present).
 *
 *   npx tsx --env-file=.env.local scripts/day8-verified-yield-24h-report.ts
 */

import { createServerClient } from '../lib/supabase/server';
import { DISCOVERY_CYCLE_SNAPSHOT_TABLE } from '../lib/hunter/discovery/persistContinuousDiscoveryTruth';

async function main() {
  process.env.AVENTA_SUPABASE_TARGET = process.env.AVENTA_SUPABASE_TARGET || 'staging';
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const client = createServerClient();

  const supply = await client
    .from('hunter_supply_runs')
    .select(
      'run_id, source_id, status, candidates_discovered, candidates_qualified, verified_deals, potential_deals, duplicates, rejected, pending, errors, started_at',
    )
    .gte('started_at', since)
    .order('started_at', { ascending: false })
    .limit(2000);

  const snaps = await client
    .from(DISCOVERY_CYCLE_SNAPSHOT_TABLE)
    .select('cycle_id, started_at, dry_run, payload')
    .gte('started_at', since)
    .order('started_at', { ascending: false })
    .limit(200);

  const bySource = new Map<
    string,
    {
      discovered: number;
      qualified: number;
      verified: number;
      potential: number;
      pending: number;
      duplicates: number;
      rejected: number;
      runs: number;
    }
  >();

  for (const row of supply.data ?? []) {
    const sid = String((row as { source_id: string }).source_id);
    const prev = bySource.get(sid) ?? {
      discovered: 0,
      qualified: 0,
      verified: 0,
      potential: 0,
      pending: 0,
      duplicates: 0,
      rejected: 0,
      runs: 0,
    };
    prev.runs += 1;
    prev.discovered += Number((row as { candidates_discovered: number }).candidates_discovered) || 0;
    prev.qualified += Number((row as { candidates_qualified: number }).candidates_qualified) || 0;
    prev.verified += Number((row as { verified_deals: number }).verified_deals) || 0;
    prev.potential += Number((row as { potential_deals: number }).potential_deals) || 0;
    prev.pending += Number((row as { pending: number }).pending) || 0;
    prev.duplicates += Number((row as { duplicates: number }).duplicates) || 0;
    prev.rejected += Number((row as { rejected: number }).rejected) || 0;
    bySource.set(sid, prev);
  }

  const sourceYield = [...bySource.entries()].map(([source_id, s]) => ({
    source_id,
    ...s,
    verified_yield: s.qualified > 0 ? Math.round((s.verified / s.qualified) * 10000) / 10000 : null,
  }));

  const snapshotSummary = (snaps.data ?? []).map((row) => {
    const payload = (row as { payload?: Record<string, unknown> }).payload ?? {};
    const rates = (payload.rates ?? {}) as Record<string, number | null>;
    const terminals = (payload.terminal_reason_counts ?? {}) as Record<string, number>;
    return {
      cycle_id: (row as { cycle_id: string }).cycle_id,
      started_at: (row as { started_at: string }).started_at,
      dry_run: (row as { dry_run: boolean }).dry_run,
      rates,
      terminal_reason_counts: terminals,
    };
  });

  const out = {
    at: new Date().toISOString(),
    window: 'h24',
    since,
    supply_rows: supply.data?.length ?? 0,
    supply_error: supply.error?.message ?? null,
    snapshot_rows: snaps.data?.length ?? 0,
    snapshot_error: snaps.error?.message ?? null,
    sourceYield: sourceYield.sort((a, b) => b.verified - a.verified || b.discovered - a.discovered),
    recentCycles: snapshotSummary.slice(0, 20),
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
