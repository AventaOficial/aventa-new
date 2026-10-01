/**
 * Day 7 — Safe staging dry-run for VERIFIED-yield diagnosis.
 *
 * Proves: near-ready buckets, terminal funnel, blocked_quality/external split.
 * Never enables mint / money.
 *
 *   npx tsx --env-file=.env.local scripts/day7-verified-yield-canary.ts
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBotIngestConfig } from '../lib/bots/ingest/config';
import { ML_PRICE_MIN_HISTORY_DAYS } from '../lib/bots/ingest/mlPriceEngine';
import { runContinuousDiscoveryCycle } from '../lib/hunter/discovery/continuousDiscoveryCycle';
import { selectNearReadyStickyTargets } from '../lib/hunter/supply/nearReadySticky';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'scripts/_day7_reports');

async function main() {
  process.env.AVENTA_SUPABASE_TARGET = process.env.AVENTA_SUPABASE_TARGET || 'staging';

  const config = loadBotIngestConfig();
  const nearReadyProbe = await selectNearReadyStickyTargets({
    config: { maxTargets: 24, cooldownHours: 1 },
  });

  const report = await runContinuousDiscoveryCycle({
    config,
    dryRun: true,
    allowStagingMint: false,
    includeStickyNearReady: true,
    maxPrioritized: 24,
    rotationWave: 0,
  });

  const out = {
    at: new Date().toISOString(),
    ML_PRICE_MIN_HISTORY_DAYS,
    nearReadyProbe: {
      poolNearReady: nearReadyProbe.poolNearReady,
      poolOneDayAway: nearReadyProbe.poolOneDayAway,
      poolTwoDaysAway: nearReadyProbe.poolTwoDaysAway,
      poolThreeDaysAway: nearReadyProbe.poolThreeDaysAway,
      budgetAllocation: nearReadyProbe.budgetAllocation,
    },
    cycle_id: report.cycle_id,
    dryRun: report.dryRun,
    mintAttempted: report.mintAttempted,
    operator_verdict: report.operator_verdict,
    verifiedYield: report.verifiedYield,
    terminalTraces: report.terminalTraces,
    automation: {
      blocked: report.automation.blocked,
      blocked_quality: report.automation.blocked_quality,
      blocked_external: report.automation.blocked_external,
      terminal_rate: report.automation.terminal_rate,
    },
    sources: report.sources,
    funnel: report.funnel,
    safety: {
      money: 'OFF',
      machineMint: 'OFF',
      allowStagingMint: false,
      dryRun: true,
    },
  };

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, `day7-report-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(out, null, 2), 'utf8');
  writeFileSync(join(OUT_DIR, 'day7-report-latest.json'), JSON.stringify(out, null, 2), 'utf8');
  console.log(JSON.stringify({ ok: true, path, ...out }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
