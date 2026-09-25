/**
 * Day 3 — Continuous discovery cycle (staging).
 *
 * No manual URL paste. Discovery → canonicalize → prioritize → enrich → DQE → S6.1 → optional S7.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/day3-continuous-discovery-cycle.ts
 *   npx tsx --env-file=.env.local scripts/day3-continuous-discovery-cycle.ts --execute --cap=2
 *   npx tsx --env-file=.env.local scripts/day3-continuous-discovery-cycle.ts --execute --idempotency
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  assertDay2StagingWritable,
  readDay2SafetySnapshot,
} from '../lib/bots/ingest/day2StagingCanary';
import { runContinuousDiscoveryCycle } from '../lib/hunter/discovery';
import { assertStagingSupabaseUrl, STAGING_SUPABASE_REF } from '../lib/supabase/projectRefs';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'scripts/_day3_reports');
const PM_SEED_PATH = join(ROOT, 'scripts/_day2_pm_seed.json');

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
  const capArg = argv.find((a) => a.startsWith('--cap='));
  const cap = capArg ? Number.parseInt(capArg.slice('--cap='.length), 10) : 2;
  return {
    execute,
    idempotency,
    cap: Number.isFinite(cap) ? Math.max(0, Math.min(5, cap)) : 2,
  };
}

async function seedStagingPriceMemoryFromCensus(sb: SupabaseClient): Promise<{
  upserted: number;
  error: string | null;
}> {
  if (!existsSync(PM_SEED_PATH)) {
    return { upserted: 0, error: 'missing_pm_seed' };
  }
  const seed = JSON.parse(readFileSync(PM_SEED_PATH, 'utf8')) as {
    rows?: Array<{
      product_id: string;
      last_price: number;
      min_price: number;
      list_price: number | null;
      recorded_on: string;
    }>;
  };
  const rows = (seed.rows ?? []).map((r) => ({
    marketplace: 'mercadolibre',
    product_id: r.product_id,
    last_price: r.last_price,
    min_price: r.min_price,
    list_price: r.list_price,
    currency: 'MXN',
    recorded_on: r.recorded_on,
  }));
  if (rows.length === 0) return { upserted: 0, error: 'empty_seed' };
  const { error } = await sb.from('product_price_snapshots').upsert(rows, {
    onConflict: 'marketplace,product_id,recorded_on',
  });
  return { upserted: error ? 0 : rows.length, error: error?.message ?? null };
}

async function measurePriceMemory(sb: SupabaseClient) {
  const { count: obsCount, error: countErr } = await sb
    .from('product_price_snapshots')
    .select('*', { count: 'exact', head: true })
    .eq('marketplace', 'mercadolibre');

  const { data: products, error: rowsErr } = await sb
    .from('product_price_snapshots')
    .select('product_id, recorded_on')
    .eq('marketplace', 'mercadolibre')
    .limit(8000);

  const byProduct = new Map<string, Set<string>>();
  for (const row of products ?? []) {
    const id = String((row as { product_id?: string }).product_id ?? '');
    const day = String((row as { recorded_on?: string }).recorded_on ?? '').slice(0, 10);
    if (!id || !day) continue;
    if (!byProduct.has(id)) byProduct.set(id, new Set());
    byProduct.get(id)!.add(day);
  }

  let historyReady = 0;
  let nearReady = 0;
  let notReady = 0;
  const minDays = 4;
  for (const days of byProduct.values()) {
    const n = days.size;
    if (n >= minDays) historyReady += 1;
    else if (n === minDays - 1) nearReady += 1;
    else notReady += 1;
  }

  const allDays = new Set<string>();
  for (const days of byProduct.values()) {
    for (const d of days) allDays.add(d);
  }

  return {
    observations: obsCount ?? 0,
    uniqueProducts: byProduct.size,
    calendarDays: allDays.size,
    historyReady,
    nearReady,
    notReady,
    sampleRows: products?.length ?? 0,
    errors: {
      count: countErr?.message ?? null,
      rows: rowsErr?.message ?? null,
    },
  };
}

async function main() {
  loadEnvFile(join(ROOT, '.env.local'), { override: true });
  loadEnvFile(join(ROOT, '.env'), { override: false });

  process.env.AVENTA_SUPABASE_TARGET = 'staging';
  process.env.AVENTA_EXPECTED_SUPABASE_REF =
    process.env.AVENTA_EXPECTED_SUPABASE_REF?.trim() || STAGING_SUPABASE_REF;

  if (!process.env.DAY2_S7_MACHINE_AUTHOR_ID?.trim()) {
    process.env.DAY2_S7_MACHINE_AUTHOR_ID = 'd0903a8f-2e68-4d8a-b66a-59c18afc1b09';
  }
  // Sole S7 author — mirrors Day2 staging canary (no dual TECH/STAPLES)
  process.env.BOT_INGEST_USER_ID = process.env.DAY2_S7_MACHINE_AUTHOR_ID;
  delete process.env.BOT_INGEST_USER_ID_TECH;
  delete process.env.BOT_INGEST_USER_ID_STAPLES;

  const args = parseArgs(process.argv.slice(2));
  const safety = readDay2SafetySnapshot(process.env);
  const writable = assertDay2StagingWritable(safety);
  if (!writable.ok) {
    console.error('STOP: staging safety', writable.error);
    process.exit(1);
  }

  assertStagingSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    console.error('STOP: missing Supabase key');
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  mkdirSync(OUT_DIR, { recursive: true });

  const pmSeed = await seedStagingPriceMemoryFromCensus(sb);
  console.log('[day3] PM seed', JSON.stringify(pmSeed));
  if (pmSeed.error) {
    console.error('STOP: PM seed failed', pmSeed.error);
    process.exit(1);
  }

  const pmBefore = await measurePriceMemory(sb);
  console.log('[day3] Price Memory before cycle', JSON.stringify(pmBefore));

  const report1 = await runContinuousDiscoveryCycle({
    dryRun: !args.execute,
    allowStagingMint: args.execute,
    mintCap: args.cap,
    excludeEnvUrls: true,
    includeStickyNearReady: true,
    maxPrioritized: 16,
  });

  console.log('[day3] cycle1', JSON.stringify({
    cycle_id: report1.cycle_id,
    dryRun: report1.dryRun,
    sources: report1.sources,
    funnel: report1.funnel,
    automation: report1.automation,
    operator_verdict: report1.operator_verdict,
    mintResults: report1.mintResults,
    gateSamples: report1.gateSamples.slice(0, 8),
  }, null, 2));

  let report2 = null;
  if (args.idempotency) {
    report2 = await runContinuousDiscoveryCycle({
      dryRun: !args.execute,
      allowStagingMint: args.execute,
      mintCap: args.cap,
      excludeEnvUrls: true,
      includeStickyNearReady: true,
      maxPrioritized: 16,
    });
    console.log('[day3] cycle2 (idempotency)', JSON.stringify({
      cycle_id: report2.cycle_id,
      funnel: report2.funnel,
      mintResults: report2.mintResults,
      operator_verdict: report2.operator_verdict,
    }, null, 2));
  }

  const pmAfter = await measurePriceMemory(sb);

  const pendingSample =
    report1.mintResults
      .filter((m) => m.ok && m.offerId)
      .slice(0, 5);

  let dbOffers: unknown[] = [];
  if (pendingSample.length > 0) {
    const ids = pendingSample.map((p) => p.offerId!);
    const { data } = await sb
      .from('offers')
      .select('id,status,product_fingerprint,ingestion_identity_key,created_at')
      .in('id', ids);
    dbOffers = data ?? [];
  }

  const out = {
    at: new Date().toISOString(),
    safety,
    pmSeed,
    pmBefore,
    pmAfter,
    cycle1: report1,
    cycle2: report2,
    dbOffers,
  };

  const path = join(OUT_DIR, `day3-report-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(out, null, 2), 'utf8');
  writeFileSync(join(OUT_DIR, 'day3-report-latest.json'), JSON.stringify(out, null, 2), 'utf8');
  console.log('[day3] wrote', path);
  console.log('[day3] verdict', report1.operator_verdict);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
