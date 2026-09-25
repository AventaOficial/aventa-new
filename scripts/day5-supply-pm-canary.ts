/**
 * Day 5 — Supply + Price Memory staging canary.
 *
 * Demonstrates: worker-meta → PM persist → freshness cycle → idempotency.
 *
 *   npx tsx --env-file=.env.local scripts/day5-supply-pm-canary.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  assertDay2StagingWritable,
  readDay2SafetySnapshot,
} from '../lib/bots/ingest/day2StagingCanary';
import { persistPriceMemoryFromWorkerMetas } from '../lib/bots/ingest/persistWorkerPriceMemory';
import type { ParsedOfferMetadata } from '../lib/bots/ingest/fetchParsedOfferMetadata';
import {
  measurePriceMemoryCensus,
  runPriceMemoryFreshnessCycle,
} from '../lib/hunter/priceMemory';
import { readSupplyFreshnessStatus } from '../lib/hunter/supply/supplyFreshnessStatus';
import { assertStagingSupabaseUrl, STAGING_SUPABASE_REF } from '../lib/supabase/projectRefs';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'scripts/_day5_reports');
const DISCOVERY_PATH = join(ROOT, 'scripts/_day2_discovery.json');

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

function loadDiscoveryMetas(): ParsedOfferMetadata[] {
  if (!existsSync(DISCOVERY_PATH)) return [];
  const raw = JSON.parse(readFileSync(DISCOVERY_PATH, 'utf8')) as {
    candidates?: Array<Record<string, unknown>>;
  };
  const out: ParsedOfferMetadata[] = [];
  for (const c of raw.candidates ?? []) {
    const url = String(c.canonicalUrl || c.url || '');
    const title = String(c.title || '');
    const discountPrice = Number(c.discountPrice);
    if (!url || !title || !Number.isFinite(discountPrice) || discountPrice <= 0) continue;
    const originalPrice =
      c.originalPrice == null ? null : Number(c.originalPrice);
    out.push({
      canonicalUrl: url,
      title,
      store: String(c.store || 'Mercado Libre'),
      imageUrl: String(c.imageUrl || ''),
      discountPrice,
      originalPrice:
        originalPrice != null && Number.isFinite(originalPrice) && originalPrice > discountPrice
          ? originalPrice
          : null,
      discountPercent: Number(c.discountPercent) || 0,
      signals: {
        originalPriceProvenance: 'listing_card',
        cardDiscountSource: 'card_strikethrough',
      },
    });
  }
  return out;
}

async function main() {
  loadEnvFile(join(ROOT, '.env.local'), { override: true });
  process.env.AVENTA_SUPABASE_TARGET = 'staging';
  process.env.AVENTA_EXPECTED_SUPABASE_REF =
    process.env.AVENTA_EXPECTED_SUPABASE_REF?.trim() || STAGING_SUPABASE_REF;

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

  const before = await measurePriceMemoryCensus({ supabase: sb as never });
  console.log('[day5] PM before', JSON.stringify(before));

  const metas = loadDiscoveryMetas();
  // Simulate ml_worker batch → PM (the missing link in production cadence collapse)
  const persist1 = await persistPriceMemoryFromWorkerMetas(metas, {
    sourceDetail: 'day5:worker_pm_canary',
  });
  console.log('[day5] worker→PM persist1', JSON.stringify(persist1));

  const persist2 = await persistPriceMemoryFromWorkerMetas(metas, {
    sourceDetail: 'day5:worker_pm_canary',
  });
  console.log('[day5] worker→PM persist2 (idempotent)', JSON.stringify(persist2));

  const mid = await measurePriceMemoryCensus({ supabase: sb as never });

  const freshness = await runPriceMemoryFreshnessCycle({
    maxTargets: 8,
    persist: true,
  });
  console.log(
    '[day5] freshness',
    JSON.stringify({
      cycle_id: freshness.cycle_id,
      targetsSelected: freshness.targetsSelected,
      observeOk: freshness.observeOk,
      snapshotsPersisted: freshness.snapshotsPersisted,
      losses: freshness.losses,
      largestLoss: freshness.largestLoss,
      diagnosis: freshness.diagnosis,
    }),
  );

  const after = await measurePriceMemoryCensus({ supabase: sb as never });
  const status = await readSupplyFreshnessStatus({ supabase: sb as never });

  const out = {
    at: new Date().toISOString(),
    safety,
    rootCause:
      'ml_api_legacy invocation cadence collapsed (~100→1/day); ml_worker kept discovering but never called recordMlDailySnapshots — PM tip volume tracked ml_api, not worker.',
    before,
    mid,
    after,
    persist1,
    persist2,
    freshness,
    status,
    deltaRowsToday: after.rowsToday - before.rowsToday,
  };

  const path = join(OUT_DIR, `day5-report-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(out, null, 2), 'utf8');
  writeFileSync(join(OUT_DIR, 'day5-report-latest.json'), JSON.stringify(out, null, 2), 'utf8');
  console.log('[day5] wrote', path);
  console.log('[day5] deltaRowsToday', out.deltaRowsToday);
  console.log('[day5] status', status.verdict);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
