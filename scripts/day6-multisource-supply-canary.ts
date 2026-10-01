/**
 * Day 6 — Safe staging dry-run for multisource supply.
 *
 * Proves: Liverpool seeds (if configured) + isolation + per-source funnel.
 * Never enables mint / money.
 *
 *   npx tsx --env-file=.env.local scripts/day6-multisource-supply-canary.ts
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBotIngestConfig } from '../lib/bots/ingest/config';
import { runContinuousDiscoveryCycle } from '../lib/hunter/discovery/continuousDiscoveryCycle';
import { liverpoolSeedsSource } from '../lib/hunter/sources/liverpoolSeeds';
import { HUNTER_SOURCES } from '../lib/hunter/sources';
import { summarizeRetailerMatrix } from '../lib/hunter/retailerCapabilityMatrix';
import { ML_PRICE_MIN_HISTORY_DAYS } from '../lib/bots/ingest/mlPriceEngine';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'scripts/_day6_reports');

async function main() {
  process.env.AVENTA_SUPABASE_TARGET = process.env.AVENTA_SUPABASE_TARGET || 'staging';

  const config = loadBotIngestConfig();
  const matrix = summarizeRetailerMatrix();

  // Prefer isolated sources for canary: liverpool seeds + env_urls only when present
  const sources = HUNTER_SOURCES.filter(
    (s) =>
      s.id === 'liverpool_mx' ||
      s.id === 'env_urls' ||
      s.id === 'ml_api_legacy' ||
      s.id === 'amazon_asin',
  );

  const report = await runContinuousDiscoveryCycle({
    config,
    dryRun: true,
    allowMint: false,
    includeSticky: true,
    maxPrioritized: 12,
    sources,
    rotationWave: 0,
  });

  const liverpoolConfigured = liverpoolSeedsSource.isConfigured?.({
    config,
    rotationWave: 0,
  });

  const out = {
    at: new Date().toISOString(),
    ML_PRICE_MIN_HISTORY_DAYS,
    matrixSummary: matrix,
    liverpoolConfigured: Boolean(liverpoolConfigured),
    liverpoolUrlCount: config.liverpoolUrls.length,
    cycle_id: report.cycle_id,
    dryRun: report.dryRun,
    mintAttempted: report.mintAttempted,
    operator_verdict: report.operator_verdict,
    sources: report.sources,
    bySource: report.bySource,
    funnel: report.funnel,
    cycleFunnelBottleneck: report.cycleFunnel.bottleneck,
    safety: {
      money: 'OFF',
      machineMint: 'OFF',
      allowMint: false,
      dryRun: true,
    },
  };

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, `day6-report-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(out, null, 2), 'utf8');
  writeFileSync(join(OUT_DIR, 'day6-report-latest.json'), JSON.stringify(out, null, 2), 'utf8');
  console.log(JSON.stringify({ ok: true, path, ...out }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
