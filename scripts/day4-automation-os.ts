/**
 * Day 4 — Staging operating-system proof.
 *
 * 1) PM freshness observe-only
 * 2) Continuous discovery dry-run (funnel + automation KPI)
 * 3) Optional --execute mint path (idempotent)
 *
 *   npx tsx --env-file=.env.local scripts/day4-automation-os.ts
 *   npx tsx --env-file=.env.local scripts/day4-automation-os.ts --execute --idempotency
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  assertDay2StagingWritable,
  readDay2SafetySnapshot,
} from '../lib/bots/ingest/day2StagingCanary';
import { runContinuousDiscoveryCycle } from '../lib/hunter/discovery';
import {
  measurePriceMemoryCensus,
  runPriceMemoryFreshnessCycle,
} from '../lib/hunter/priceMemory';
import { summarizeRetailerMatrix } from '../lib/hunter/retailerCapabilityMatrix';
import { remainingHumanRequiredSteps } from '../lib/hunter/humanInterventionMatrix';
import { assertStagingSupabaseUrl, STAGING_SUPABASE_REF } from '../lib/supabase/projectRefs';
import { AUTOMATION_KPI_FORMULAS } from '../lib/bots/ingest/automationCycleMetrics';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'scripts/_day4_reports');

function loadEnvFile(path: string, { override = false } = {}) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    const key = m[1].trim();
    if (override || process.env[key] == null) process.env[key] = v;
  }
}

function parseArgs(argv: string[]) {
  const execute = argv.includes('--execute');
  const idempotency = argv.includes('--idempotency');
  return { execute, idempotency };
}

async function main() {
  loadEnvFile(join(ROOT, '.env.local'), { override: true });
  process.env.AVENTA_SUPABASE_TARGET = 'staging';
  process.env.AVENTA_EXPECTED_SUPABASE_REF =
    process.env.AVENTA_EXPECTED_SUPABASE_REF?.trim() || STAGING_SUPABASE_REF;

  if (!process.env.DAY2_S7_MACHINE_AUTHOR_ID?.trim()) {
    process.env.DAY2_S7_MACHINE_AUTHOR_ID = 'd0903a8f-2e68-4d8a-b66a-59c18afc1b09';
  }
  process.env.BOT_INGEST_USER_ID = process.env.DAY2_S7_MACHINE_AUTHOR_ID;
  delete process.env.BOT_INGEST_USER_ID_TECH;
  delete process.env.BOT_INGEST_USER_ID_STAPLES;

  const args = parseArgs(process.argv.slice(2));
  const safety = readDay2SafetySnapshot(process.env);
  const writable = assertDay2StagingWritable(safety);
  if (!writable.ok) {
    console.error('STOP:', writable.error);
    process.exit(1);
  }
  assertStagingSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  mkdirSync(OUT_DIR, { recursive: true });

  const stagingPm = await measurePriceMemoryCensus({
    supabase: sb as never,
  });
  console.log('[day4] staging PM census', JSON.stringify(stagingPm));

  const freshness = await runPriceMemoryFreshnessCycle({
    maxTargets: 8,
    persist: true,
  });
  console.log(
    '[day4] freshness',
    JSON.stringify({
      cycle_id: freshness.cycle_id,
      observeOk: freshness.observeOk,
      snapshotsPersisted: freshness.snapshotsPersisted,
      losses: freshness.losses,
      largestLoss: freshness.largestLoss,
      diagnosis: freshness.diagnosis,
    }),
  );

  const discovery = await runContinuousDiscoveryCycle({
    dryRun: !args.execute,
    allowStagingMint: args.execute,
    mintCap: 2,
    excludeEnvUrls: true,
    includeStickyNearReady: true,
    maxPrioritized: 12,
  });

  let discovery2 = null;
  if (args.idempotency) {
    discovery2 = await runContinuousDiscoveryCycle({
      dryRun: !args.execute,
      allowStagingMint: args.execute,
      mintCap: 2,
      excludeEnvUrls: true,
      includeStickyNearReady: true,
      maxPrioritized: 12,
    });
  }

  const { count: pending } = await sb
    .from('offers')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .is('deleted_at', null);
  const { count: observations } = await sb
    .from('offer_observations')
    .select('*', { count: 'exact', head: true });

  const out = {
    at: new Date().toISOString(),
    safety,
    kpiFormulas: AUTOMATION_KPI_FORMULAS,
    stagingPm,
    freshness,
    discovery,
    discovery2,
    retailers: summarizeRetailerMatrix(),
    humanRemaining: remainingHumanRequiredSteps().map((r) => ({
      id: r.id,
      status: r.day4Status,
      safetyCritical: r.safetyCritical,
    })),
    db: { pending: pending ?? null, observations: observations ?? null },
  };

  const path = join(OUT_DIR, `day4-report-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(out, null, 2), 'utf8');
  writeFileSync(join(OUT_DIR, 'day4-report-latest.json'), JSON.stringify(out, null, 2), 'utf8');
  console.log('[day4] wrote', path);
  console.log('[day4] automation', JSON.stringify(discovery.automation));
  console.log('[day4] verdict', discovery.operator_verdict);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
