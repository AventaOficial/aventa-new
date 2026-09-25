/**
 * Day 8 closure — staging canary for scheduled continuous discovery.
 * Runs the same hour-bucket cycle twice. Expects one snapshot (upsert).
 * cronSafe: never mints.
 *
 *   npx tsx --env-file=.env.local scripts/day8-continuous-cron-canary.ts
 */

import { createServerClient } from '../lib/supabase/server';
import { DISCOVERY_CYCLE_SNAPSHOT_TABLE } from '../lib/hunter/discovery/persistContinuousDiscoveryTruth';
import { scheduledContinuousCycleId } from '../lib/hunter/discovery/continuousCronContract';
import { runContinuousDiscoveryCycle } from '../lib/hunter/discovery/continuousDiscoveryCycle';
import { loadBotIngestConfig } from '../lib/bots/ingest/config';
import { ML_PRICE_MIN_HISTORY_DAYS } from '../lib/bots/ingest/mlPriceEngine';

async function main() {
  process.env.AVENTA_SUPABASE_TARGET = process.env.AVENTA_SUPABASE_TARGET || 'staging';
  delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;

  const cycleId = scheduledContinuousCycleId(new Date());
  const config = loadBotIngestConfig();
  const run = () =>
    runContinuousDiscoveryCycle({
      config,
      cronSafe: true,
      dryRun: true,
      allowStagingMint: true,
      excludeEnvUrls: true,
      includeStickyNearReady: true,
      cycleId,
      persistTruth: true,
      maxPrioritized: 8,
    });

  const first = await run();
  const second = await run();

  const client = createServerClient();
  const snaps = await client
    .from(DISCOVERY_CYCLE_SNAPSHOT_TABLE)
    .select('cycle_id')
    .eq('cycle_id', cycleId);
  const supply = await client
    .from('hunter_supply_runs')
    .select('run_id, source_id')
    .eq('run_id', cycleId);

  const out = {
    ok: true,
    ML_PRICE_MIN_HISTORY_DAYS,
    cycle_id: cycleId,
    first_dry_run: first.dryRun,
    first_mint_attempted: first.mintAttempted,
    second_dry_run: second.dryRun,
    second_mint_attempted: second.mintAttempted,
    pending_created: first.funnel.pending_created + second.funnel.pending_created,
    snapshot_rows: snaps.data?.length ?? 0,
    snapshot_error: snaps.error?.message ?? null,
    supply_rows: supply.data?.length ?? 0,
    supply_error: supply.error?.message ?? null,
    verified_yield: second.verifiedYield.rates.verified_yield,
    terminal_reason_counts: second.verifiedYield.terminal_reason_counts,
    idempotent_snapshot: (snaps.data?.length ?? 0) === 1,
  };
  console.log(JSON.stringify(out, null, 2));
  if (!out.idempotent_snapshot || out.pending_created !== 0 || out.first_mint_attempted) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
