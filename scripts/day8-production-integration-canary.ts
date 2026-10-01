/**
 * Day 8 — Staging canary: integrate Day6+Day7 continuous discovery with durable truth.
 *
 * Dry-run. No mint. No money.
 *
 *   npx tsx --env-file=.env.local scripts/day8-production-integration-canary.ts
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBotIngestConfig } from '../lib/bots/ingest/config';
import { ML_PRICE_MIN_HISTORY_DAYS } from '../lib/bots/ingest/mlPriceEngine';
import { runContinuousDiscoveryCycle } from '../lib/hunter/discovery/continuousDiscoveryCycle';
import { selectNearReadyStickyTargets } from '../lib/hunter/supply/nearReadySticky';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'scripts/_day8_reports');

async function main() {
  process.env.AVENTA_SUPABASE_TARGET = process.env.AVENTA_SUPABASE_TARGET || 'staging';

  const config = loadBotIngestConfig();
  const nearReady = await selectNearReadyStickyTargets({
    config: { maxTargets: 24, cooldownHours: 1 },
  });

  const report = await runContinuousDiscoveryCycle({
    config,
    dryRun: true,
    allowStagingMint: false,
    includeStickyNearReady: true,
    excludeEnvUrls: true,
    maxPrioritized: 16,
    persistTruth: true,
    rotationWave: 0,
  });

  const vy = report.verifiedYield;
  const id = Math.max(1, vy.identity_valid);
  const out = {
    at: new Date().toISOString(),
    day: 8,
    ML_PRICE_MIN_HISTORY_DAYS,
    cycle_id: report.cycle_id,
    dryRun: report.dryRun,
    mintAttempted: report.mintAttempted,
    operator_verdict: report.operator_verdict,
    nearReady: {
      pool: nearReady.poolNearReady,
      one: nearReady.poolOneDayAway,
      two: nearReady.poolTwoDaysAway,
      three: nearReady.poolThreeDaysAway,
      selected: nearReady.targets.length,
    },
    funnel: {
      discovered: vy.discovered,
      canonicalized: vy.canonicalized,
      identity_valid: vy.identity_valid,
      pm_ready: vy.pm_ready,
      offer_standard_pass: vy.offer_standard_pass,
      dqe_verified: vy.dqe_verified,
      dqe_potential: vy.dqe_potential,
      s61_pass: vy.s61_pass,
      s61_blocked: vy.s61_blocked,
      pending: vy.pending,
      duplicate: vy.duplicate,
      fetch_blocked: vy.fetch_blocked,
      insufficient_history: vy.insufficient_history,
      artificial_price: vy.artificial_price,
      provenance_failure: vy.provenance_failure,
    },
    rates: {
      ...vy.rates,
      provenance_failure_rate:
        vy.identity_valid > 0
          ? Math.round((vy.provenance_failure / id) * 10000) / 10000
          : null,
      fetch_block_rate:
        vy.identity_valid > 0
          ? Math.round((vy.fetch_blocked / id) * 10000) / 10000
          : null,
    },
    terminal_reason_counts: vy.terminal_reason_counts,
    near_ready_buckets: vy.near_ready,
    automation: {
      blocked: report.automation.blocked,
      blocked_quality: report.automation.blocked_quality,
      blocked_external: report.automation.blocked_external,
      duplicates: report.automation.duplicates,
      failed: report.automation.failed,
      automation_rate: report.automation.automation_rate,
      terminal_rate: report.automation.terminal_rate,
    },
    sources: report.sources,
    bySource: report.bySource,
    truthPersist: report.truthPersist ?? null,
    safety: {
      money: 'OFF',
      rewards: 'OFF',
      commissions: 'OFF',
      settlement: 'OFF',
      distribution: 'OFF',
      machineMint: 'OFF',
      autoPublish: 'OFF',
      dryRun: true,
      soleWriter: true,
      dqeAuthoritative: true,
      s61Authoritative: true,
      ML_PRICE_MIN_HISTORY_DAYS,
    },
  };

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, `day8-report-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(out, null, 2), 'utf8');
  writeFileSync(join(OUT_DIR, 'day8-report-latest.json'), JSON.stringify(out, null, 2), 'utf8');
  console.log(JSON.stringify({ ok: true, path, ...out }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
