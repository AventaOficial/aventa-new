/**
 * Day 2 — Staging ingestion canary (real architecture path).
 *
 * Hunter candidate → extract → identity → Price Memory → Offer Standard → DQE → S6.1
 * → (worker sole writer | S7 bridge) → ingestOfferObservation → observation + pending
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/day2-staging-ingestion-canary.ts
 *   npx tsx --env-file=.env.local scripts/day2-staging-ingestion-canary.ts --execute
 *   npx tsx --env-file=.env.local scripts/day2-staging-ingestion-canary.ts --execute --cap=3
 *
 * Safety: staging only. Money/distribution/auto-publish must stay OFF.
 * Writes: BOT_INGEST_MACHINE_PENDING_WRITES only inside withMachinePendingWritesEnabled.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ExternalWorkerCandidate } from '../lib/bots/ingest/externalWorker';
import { processExternalWorkerBatch } from '../lib/bots/ingest/externalWorker';
import {
  S67_CANARY_DEFAULT_CAP,
  S67_CANARY_HARD_CAP,
  selectCanaryCandidates,
  withMachinePendingWritesEnabled,
  type CanarySelectionRow,
} from '../lib/bots/ingest/machineInsertCanary';
import { isMachinePendingWriteEnabled } from '../lib/bots/ingest/machineLiveInsertEligibility';
import {
  metricsFromWorkerResults,
  buildAutomationCycleMetrics,
} from '../lib/bots/ingest/automationCycleMetrics';
import {
  assertDay2StagingWritable,
  classifyDay2Candidate,
  emptyDay2FunnelCounts,
  readDay2SafetySnapshot,
  type Day2FunnelCounts,
} from '../lib/bots/ingest/day2StagingCanary';
import { loadBotIngestConfig } from '../lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '../lib/bots/ingest/fetchParsedOfferMetadata';
import type { IngestItem } from '../lib/bots/ingest/types';
import { writePendingViaS7Bridge } from '../lib/supply/s7Bridge/writePendingViaS7Bridge';
import {
  normalizeMlWorkerListing,
  buildMlWorkerSourceEventId,
} from '../lib/supplyIntelligence/adapters/mlWorkerListingAdapter';
import { runMlWorkerListingDryRun } from '../lib/supplyIntelligence/dryRunPipeline';
import { strongProductFingerprintForUrl } from '../lib/offers/findDuplicateOffer';
import { selectNearReadyStickyTargets } from '../lib/hunter/supply/nearReadySticky';
import {
  normalizeMlProductId,
  recordMlDailySnapshots,
  ML_PRICE_TZ,
} from '../lib/bots/ingest/mlPriceEngine';
import { formatYmdInTz } from '../lib/bots/ingest/ingestZonedTime';
import { assertStagingSupabaseUrl, STAGING_SUPABASE_REF } from '../lib/supabase/projectRefs';
import { prioritizeAcquisitionPool } from '../lib/hunter/offerStandard';
import { toParsedMeta } from '../lib/bots/ingest/externalWorker';
import { enrichWithPriceIntel } from '../lib/bots/ingest/priceIntel';
import { evaluateMachineCandidateGate } from '../lib/bots/ingest/candidateInsertGate';
import { evaluateDealQualityFromParsedMeta } from '../lib/hunter/dealQuality';

const ROOT = process.cwd();
const DISCOVERY_PATH = join(ROOT, 'scripts/_day2_discovery.json');
const PM_SEED_PATH = join(ROOT, 'scripts/_day2_pm_seed.json');
const OUT_DIR = join(ROOT, 'scripts/_day2_reports');

const STAGING_WORKER_AUTHOR =
  process.env.S67_STAGING_CANARY_AUTHOR_ID?.trim() ||
  '6aa733d4-02cb-4c64-92fc-cf45fdcee344';
/** Dedicated machine author for S7 bridge (seed admin forbidden by assertDedicatedMachineAuthor). */
const STAGING_S7_AUTHOR =
  process.env.DAY2_S7_MACHINE_AUTHOR_ID?.trim() ||
  'd0903a8f-2e68-4d8a-b66a-59c18afc1b09';

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

function asCandidate(raw: unknown): ExternalWorkerCandidate | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const url = typeof r.url === 'string' ? r.url : '';
  const title = typeof r.title === 'string' ? r.title : '';
  const discountPrice = Number(r.discountPrice);
  if (!url || !title || !Number.isFinite(discountPrice)) return null;
  const originalPrice =
    r.originalPrice == null
      ? null
      : Number.isFinite(Number(r.originalPrice))
        ? Number(r.originalPrice)
        : null;
  return {
    url,
    title,
    store: typeof r.store === 'string' ? r.store : null,
    imageUrl: typeof r.imageUrl === 'string' ? r.imageUrl : null,
    discountPrice,
    originalPrice,
    discountPercent:
      r.discountPercent == null
        ? null
        : Number.isFinite(Number(r.discountPercent))
          ? Number(r.discountPercent)
          : null,
    canonicalUrl: typeof r.canonicalUrl === 'string' ? r.canonicalUrl : null,
    sourceDetail: typeof r.sourceDetail === 'string' ? r.sourceDetail : null,
    signals:
      r.signals && typeof r.signals === 'object'
        ? (r.signals as ExternalWorkerCandidate['signals'])
        : null,
    cardDiscountSource:
      typeof r.cardDiscountSource === 'string'
        ? (r.cardDiscountSource as ExternalWorkerCandidate['cardDiscountSource'])
        : null,
    cardBadgePercent:
      r.cardBadgePercent == null
        ? null
        : Number.isFinite(Number(r.cardBadgePercent))
          ? Number(r.cardBadgePercent)
          : null,
    pdpBlocked: r.pdpBlocked === true ? true : r.pdpBlocked === false ? false : null,
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

async function countExact(
  sb: SupabaseClient,
  table: string,
): Promise<{ count: number | null; error: string | null }> {
  const { count, error } = await sb.from(table).select('id', { count: 'exact', head: true });
  return { count: count ?? null, error: error?.message ?? null };
}

async function snapshotDb(sb: SupabaseClient) {
  const errors: string[] = [];
  const offers = await countExact(sb, 'offers');
  const observations = await countExact(sb, 'offer_observations');
  const pending = await sb
    .from('offers')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .is('deleted_at', null);
  if (offers.error) errors.push(`offers:${offers.error}`);
  if (observations.error) errors.push(`offer_observations:${observations.error}`);
  if (pending.error) errors.push(`pending:${pending.error.message}`);
  const pps = await sb
    .from('product_price_snapshots')
    .select('id', { count: 'exact', head: true })
    .eq('marketplace', 'mercadolibre');
  if (pps.error) errors.push(`pps:${pps.error.message}`);
  return {
    offersTotal: offers.count,
    offersPending: pending.count ?? null,
    offerObservations: observations.count,
    priceMemoryRows: pps.count ?? null,
    errors,
  };
}

function candidateToIngestItem(c: ExternalWorkerCandidate): IngestItem {
  const original =
    c.originalPrice != null && c.originalPrice > c.discountPrice ? c.originalPrice : null;
  const meta: ParsedOfferMetadata = {
    canonicalUrl: c.canonicalUrl || c.url,
    title: c.title,
    store: c.store || 'Mercado Libre',
    imageUrl: c.imageUrl || '',
    discountPrice: c.discountPrice,
    originalPrice: original,
    discountPercent:
      c.discountPercent ??
      (original != null && original > 0
        ? Math.round(((original - c.discountPrice) / original) * 100)
        : 0),
    signals: {
      ...(c.signals ?? {}),
      originalPriceProvenance: 'listing_card',
      cardDiscountSource: c.cardDiscountSource ?? 'card_strikethrough',
    },
  };
  return {
    url: c.canonicalUrl || c.url,
    source: 'ml_worker',
    precomputedMeta: meta,
    sourceDetail: c.sourceDetail ?? 'day2_canary',
    pdpBlocked: c.pdpBlocked,
  };
}

async function runStickyNearReady(sb: SupabaseClient, cap: number) {
  const report = await selectNearReadyStickyTargets({
    supabase: sb as never,
    config: { maxTargets: Math.min(cap, 8), cooldownHours: 1 },
  });
  const todayYmd = formatYmdInTz(new Date(), ML_PRICE_TZ);
  let snapshotsWritten = 0;
  const details: Array<Record<string, unknown>> = [];

  for (const t of report.targets) {
    const productId = normalizeMlProductId(t.productId);
    if (!productId || t.lastPrice == null || !(t.lastPrice > 0)) {
      details.push({
        productId: t.productId,
        status: 'FAILED',
        reason: 'invalid_id_or_price',
      });
      continue;
    }
    // Re-observe with last known price (idempotent daily upsert). Does not invent a new price.
    const beforeCount = await sb
      .from('product_price_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('marketplace', 'mercadolibre')
      .eq('product_id', productId)
      .eq('recorded_on', todayYmd);
    await recordMlDailySnapshots([
      {
        productId,
        current: t.lastPrice,
        listPrice: null,
        regularPrice: null,
        nicheId: null,
      },
    ]);
    const afterCount = await sb
      .from('product_price_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('marketplace', 'mercadolibre')
      .eq('product_id', productId)
      .eq('recorded_on', todayYmd);
    const wrote =
      (afterCount.count ?? 0) > 0 &&
      ((beforeCount.count ?? 0) === 0 || (afterCount.count ?? 0) >= (beforeCount.count ?? 0));
    if (wrote) snapshotsWritten += 1;
    details.push({
      productId,
      priorDays: t.priorDays,
      daysUntilReady: t.daysUntilReady,
      status: wrote ? 'READY' : 'PARTIAL',
      recordedOn: todayYmd,
    });
  }

  return { report, snapshotsWritten, details, todayYmd };
}

function buildS7MetaFromCandidate(c: ExternalWorkerCandidate): ParsedOfferMetadata | null {
  const url = (c.canonicalUrl || c.url || '').trim();
  const title = (c.title || '').trim();
  const imageUrl = (c.imageUrl || '').trim();
  const sale = c.discountPrice;
  if (!url || !title || !imageUrl || !(sale > 0)) return null;
  const original =
    c.originalPrice != null && c.originalPrice > sale ? c.originalPrice : null;
  return {
    canonicalUrl: url,
    title: title.slice(0, 500),
    store: (c.store || 'Mercado Libre').slice(0, 200),
    imageUrl: imageUrl.slice(0, 2048),
    discountPrice: sale,
    originalPrice: original,
    discountPercent:
      c.discountPercent ??
      (original != null && original > 0
        ? Math.round(((original - sale) / original) * 100)
        : 0),
    signals: {
      ...(c.signals ?? {}),
      originalPriceProvenance: 'listing_card',
      cardDiscountSource: c.cardDiscountSource ?? 'card_strikethrough',
    },
  };
}

async function main() {
  const execute = process.argv.includes('--execute');
  const canaryCapArg = process.argv.find((a) => a.startsWith('--cap='));
  const canaryCap = Math.min(
    S67_CANARY_HARD_CAP,
    Math.max(
      1,
      canaryCapArg
        ? Number.parseInt(canaryCapArg.slice('--cap='.length), 10) ||
            S67_CANARY_DEFAULT_CAP
        : S67_CANARY_DEFAULT_CAP,
    ),
  );

  loadEnvFile(join(ROOT, '.env.local'));

  // Fail-closed money/distribution
  process.env.REWARDS_PROGRAM_ACTIVE = 'false';
  process.env.COMMISSION_PROGRAM_ACTIVE = 'false';
  process.env.SETTLEMENT_BRIDGE_ENABLED = 'false';
  process.env.DISTRIBUTION_ENGINE_ENABLED = 'false';
  delete process.env.HUNTER_AUTO_PUBLISH;
  delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) {
    console.error('STOP: missing Supabase URL/service role');
    process.exit(1);
  }

  try {
    assertStagingSupabaseUrl(url);
  } catch (e) {
    console.error('STOP:', e instanceof Error ? e.message : e);
    process.exit(1);
  }

  const safety = readDay2SafetySnapshot();
  const writable = assertDay2StagingWritable(safety);
  if (!writable.ok) {
    console.error('STOP:', writable.error);
    console.error(JSON.stringify(safety, null, 2));
    process.exit(1);
  }

  process.env.BOT_INGEST_ENABLED = '1';
  process.env.BOT_INGEST_USER_ID = STAGING_WORKER_AUTHOR;
  delete process.env.BOT_INGEST_USER_ID_TECH;
  delete process.env.BOT_INGEST_USER_ID_STAPLES;

  if (!existsSync(DISCOVERY_PATH)) {
    console.error('STOP: missing discovery fixture', DISCOVERY_PATH);
    process.exit(1);
  }

  const discoveryRaw = JSON.parse(readFileSync(DISCOVERY_PATH, 'utf8')) as {
    candidates?: unknown[];
  };
  const allCandidates = (discoveryRaw.candidates ?? [])
    .map(asCandidate)
    .filter((c): c is ExternalWorkerCandidate => c != null);

  // Offer Standard acquisition ranking (does not bypass DQE)
  const acquisitionRanked = prioritizeAcquisitionPool(
    allCandidates.map((c) => candidateToIngestItem(c)),
  );
  const offerStandardPass = acquisitionRanked.length;

  const dryRun = await runMlWorkerListingDryRun({
    candidates: allCandidates,
    maxItems: allCandidates.length,
    runId: `day2_dry_${Date.now().toString(36)}`,
  });

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const config = loadBotIngestConfig();

  const pmSeed = await seedStagingPriceMemoryFromCensus(sb);
  if (pmSeed.error) {
    console.error('STOP: staging PM seed failed', pmSeed.error);
    process.exit(1);
  }

  // Live-equivalent selection: Price Memory (staging) + DQE + S6.1 — not dry-run alone.
  // Dry-run ignores DB history; listing_card without historyReady correctly suppresses.
  const selectionRows: CanarySelectionRow[] = [];
  for (let i = 0; i < allCandidates.length; i += 1) {
    const c = allCandidates[i]!;
    const norm = normalizeMlWorkerListing(c);
    const expectedEventId = buildMlWorkerSourceEventId(c);
    const dryItem =
      dryRun.items.find((it) => it.sourceEventId === expectedEventId) ?? dryRun.items[i];
    let meta = toParsedMeta(c);
    let historyReady = false;
    let gateWouldInsert = false;
    let qualityDecision: string | null = dryItem?.qualityDecision ?? null;
    let reasonCodes: string[] = dryItem?.reasonCodes ?? [];
    let evidenceLevel: string | null = dryItem?.evidenceLevel ?? null;

    if (meta) {
      meta = await enrichWithPriceIntel(meta, config, { preserveLabelDiscount: true });
      historyReady = meta.signals?.historyReady === true;
      const dealQuality = evaluateDealQualityFromParsedMeta(meta, {
        source: 'day2_canary',
        productFingerprint: strongProductFingerprintForUrl(c.canonicalUrl || c.url),
      });
      const gate = evaluateMachineCandidateGate({
        url: meta.canonicalUrl,
        meta,
        config,
        verifierDecision: 'pending',
        verifierReasons: [],
        duplicate: null,
        dealScore: null,
        dealQuality,
        pdpBlocked: c.pdpBlocked,
      });
      gateWouldInsert = gate.wouldInsert === true;
      qualityDecision = gate.qualityDecision;
      reasonCodes = gate.reasonCodes;
      evidenceLevel = gate.evidenceLevel;
    }

    const fp =
      strongProductFingerprintForUrl(c.canonicalUrl || c.url) ??
      dryItem?.productFingerprint ??
      null;
    let duplicate = false;
    if (fp) {
      const { data } = await sb
        .from('offers')
        .select('id,status')
        .eq('product_fingerprint', fp)
        .is('deleted_at', null)
        .limit(1);
      if (data && data.length > 0) duplicate = true;
    }

    selectionRows.push({
      index: i,
      url: c.url,
      canonicalUrl: c.canonicalUrl || c.url,
      sourceEventId: dryItem?.sourceEventId ?? (norm.ok ? expectedEventId : null),
      idempotencyKey: dryItem?.observationIdempotencyKey ?? null,
      productFingerprint: fp,
      qualityDecision,
      wouldInsert: gateWouldInsert && !duplicate,
      reasonCodes: reasonCodes as CanarySelectionRow['reasonCodes'],
      evidenceLevel: evidenceLevel as CanarySelectionRow['evidenceLevel'],
      confidence: null,
      dealScore: dryItem?.dealScore ?? null,
      verifierScore: null,
      originalPriceProvenance:
        (c.signals?.originalPriceProvenance as string | undefined) ?? null,
      cardDiscountSource:
        c.cardDiscountSource ??
        (c.signals?.cardDiscountSource as string | undefined) ??
        null,
      imageUrl: c.imageUrl ?? null,
      pdpBlocked: c.pdpBlocked ?? null,
      duplicate,
    });
    void historyReady;
  }

  const selected = selectCanaryCandidates(selectionRows, canaryCap);
  const selectedCandidates = selected.map((row) => allCandidates[row.index]!);

  mkdirSync(OUT_DIR, { recursive: true });
  const before = await snapshotDb(sb);
  const stickyDry = await selectNearReadyStickyTargets({
    supabase: sb as never,
    config: { maxTargets: 8, cooldownHours: 1 },
  });

  const funnel: Day2FunnelCounts = emptyDay2FunnelCounts();
  funnel.candidates = allCandidates.length;
  funnel.extracted = selectionRows.filter((r) => Boolean(r.productFingerprint) || Boolean(r.url)).length;
  funnel.identified = selectionRows.filter((r) => Boolean(r.productFingerprint)).length;
  funnel.price_memory_ready = selectionRows.filter((r) =>
    (r.reasonCodes ?? []).includes('VERIFIED_CARD_PRICE') ||
    !(r.reasonCodes ?? []).includes('INSUFFICIENT_HISTORY'),
  ).length;
  funnel.offer_standard_pass = offerStandardPass;
  funnel.dqe_pass = selectionRows.filter(
    (r) =>
      r.qualityDecision === 'VERIFIED_OPPORTUNITY' ||
      String(r.qualityDecision || '').includes('VERIFIED') ||
      String(r.qualityDecision || '').includes('POTENTIAL'),
  ).length;
  funnel.s61_pass = selectionRows.filter((r) => r.wouldInsert && !r.duplicate).length;

  const report: Record<string, unknown> = {
    meta: {
      mode: 'DAY2_STAGING_INGESTION_CANARY',
      generatedAt: new Date().toISOString(),
      stagingRef: STAGING_SUPABASE_REF,
      safety,
      canaryCap,
      execute,
      workerAuthorPrefix: STAGING_WORKER_AUTHOR.slice(0, 8),
      s7AuthorPrefix: STAGING_S7_AUTHOR.slice(0, 8),
    },
    priceMemoryStagingBefore: before,
    stickyNearReady: stickyDry,
    dryRun: {
      wouldInsertCount: dryRun.wouldInsertCount,
      offerInsertedAlwaysFalse: dryRun.items.every((i) => i.offerInserted === false),
      suppressed: dryRun.lowQualitySuppressions,
      duplicates: dryRun.duplicateSuppressions,
      failed: dryRun.errorCount,
    },
    offerStandard: {
      poolSize: allCandidates.length,
      rankedCount: offerStandardPass,
    },
    selection: {
      poolSize: selectionRows.length,
      eligibleCount: selectionRows.filter(
        (r) =>
          r.qualityDecision === 'VERIFIED_OPPORTUNITY' && r.wouldInsert && !r.duplicate,
      ).length,
      selected,
    },
    funnel,
    live: null,
    s7: null,
    stickyLive: null,
    idempotency: null,
    after: null,
    deltas: null,
    automation: null,
    classifications: [] as Array<Record<string, unknown>>,
    stop: null as unknown,
  };

  if (!execute) {
    report.stop = { reason: 'dry_run_only', note: 'Re-run with --execute for live staging writes' };
    const outPath = join(OUT_DIR, `day2-report-${Date.now()}.json`);
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    writeFileSync(join(OUT_DIR, 'day2-report-latest.json'), JSON.stringify(report, null, 2));
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: 'reconcile',
          outPath,
          eligible: selected.length,
          stickyNearReady: stickyDry.poolNearReady,
          oneDayAway: stickyDry.poolOneDayAway,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (selectedCandidates.length === 0) {
    report.stop = { reason: 'no_eligible_candidates' };
    writeFileSync(join(OUT_DIR, 'day2-report-latest.json'), JSON.stringify(report, null, 2));
    console.error('STOP: no eligible canary candidates');
    process.exit(1);
  }

  // Prefer proving S7 bridge with the first eligible VERIFIED candidate, then worker for the rest.
  const s7Candidate = selectedCandidates[0] ?? null;
  const workerCandidates =
    selectedCandidates.length > 1 ? selectedCandidates.slice(1) : selectedCandidates;

  let s7Result: Record<string, unknown> | null = null;
  if (s7Candidate) {
    const meta = buildS7MetaFromCandidate(s7Candidate);
    if (meta) {
      const enriched = await enrichWithPriceIntel(meta, loadBotIngestConfig(), {
        preserveLabelDiscount: true,
      });
      process.env.BOT_INGEST_USER_ID = STAGING_S7_AUTHOR;
      const s7Live = await withMachinePendingWritesEnabled(async () => {
        const cfg = loadBotIngestConfig();
        return writePendingViaS7Bridge({
          config: cfg,
          meta: enriched,
          ingestSource: 'day2_s7_canary',
          ingestSourceDetail: 'day2_staging_canary',
          moderatorNote: '[day2] S7 bridge canary pending',
          requireDedicatedAuthor: true,
        });
      });
      process.env.BOT_INGEST_USER_ID = STAGING_WORKER_AUTHOR;
      s7Result = {
        ok: s7Live.ok === true,
        result: s7Live,
        url: s7Candidate.url,
      };
      if (s7Live.ok === true) {
        funnel.s7_pass += 1;
        funnel.pending_created += 1;
      }
    } else {
      s7Result = { ok: false, error: 'buildS7Meta_failed', url: s7Candidate.url };
    }
  }

  const liveStarted = Date.now();
  const liveReport = await withMachinePendingWritesEnabled(async () => {
    if (!isMachinePendingWriteEnabled()) {
      throw new Error('writes flag failed to enable in-process');
    }
    return processExternalWorkerBatch({
      candidates: workerCandidates,
      canaryCap: Math.max(1, workerCandidates.length),
      dryRun: false,
      discovery: {
        cycleIndex: 0,
        seedsAvailable: 1,
        seedsAttempted: 1,
        seedsSuccessful: 1,
        seedsZeroResults: 0,
        seedsFailed: 0,
        bySeed: [
          {
            id: 'day2_canary',
            status: 'ok',
            rawLinks: workerCandidates.length,
            accepted: workerCandidates.length,
          },
        ],
      },
    });
  });

  if (isMachinePendingWriteEnabled()) {
    report.stop = { reason: 'flag_leakage' };
    writeFileSync(join(OUT_DIR, 'day2-report-latest.json'), JSON.stringify(report, null, 2));
    console.error('STOP: feature flag leakage');
    process.exit(1);
  }

  const inserted = liveReport.results.filter((r) => r.status === 'inserted');
  const duplicates = liveReport.results.filter((r) => r.status === 'duplicate');
  const skipped = liveReport.results.filter((r) => r.status === 'skipped');
  const errors = liveReport.results.filter((r) => r.status === 'error');

  funnel.pending_created += inserted.length;
  funnel.duplicates += duplicates.length;
  funnel.blocked += skipped.length;
  funnel.failed += errors.length;

  const offerIds = inserted
    .map((r) => ('offerId' in r ? r.offerId : null))
    .filter(Boolean) as string[];
  if (s7Result && s7Result.ok === true) {
    const sid = (s7Result.result as { offerId?: string })?.offerId;
    if (sid) offerIds.push(sid);
  }

  // Verify observations for minted offers
  let observationsCreated = 0;
  let observationRows: unknown[] = [];
  if (offerIds.length > 0) {
    const { data: obs } = await sb
      .from('offer_observations')
      .select(
        'id,offer_id,identity_key,idempotency_key,source,price,observed_at,canonical_url,created_at',
      )
      .in('offer_id', offerIds);
    observationRows = obs ?? [];
    observationsCreated = observationRows.length;
  }
  funnel.observations_created = observationsCreated;

  const after = await snapshotDb(sb);
  const stickyLive = await runStickyNearReady(sb, 8);

  // Idempotency second pass
  let idempotency: Record<string, unknown> | null = null;
  if (workerCandidates[0] && inserted.length > 0) {
    const retryCand =
      workerCandidates.find((c) =>
        inserted.some((r) => r.url === c.url || r.url === c.canonicalUrl),
      ) ?? workerCandidates[0];
    const beforeOffers = after.offersTotal;
    const beforeObs = after.offerObservations;
    const retryReport = await withMachinePendingWritesEnabled(async () =>
      processExternalWorkerBatch({
        candidates: [retryCand],
        canaryCap: 1,
        dryRun: false,
      }),
    );
    const afterRetry = await snapshotDb(sb);
    const retryInserted = retryReport.results.filter((r) => r.status === 'inserted');
    idempotency = {
      url: retryCand.url,
      retryResults: retryReport.results,
      secondInsertCreated: retryInserted.length > 0,
      offersDelta:
        beforeOffers != null && afterRetry.offersTotal != null
          ? afterRetry.offersTotal - beforeOffers
          : null,
      observationsDelta:
        beforeObs != null && afterRetry.offerObservations != null
          ? afterRetry.offerObservations - beforeObs
          : null,
      duplicateOrNoop:
        retryInserted.length === 0 ||
        retryReport.results.every((r) => r.status === 'duplicate'),
    };
    if (retryInserted.length > 0) {
      report.stop = { reason: 'idempotency_second_offer', idempotency };
      writeFileSync(join(OUT_DIR, 'day2-report-latest.json'), JSON.stringify(report, null, 2));
      console.error('STOP: idempotency failed');
      process.exit(1);
    }
  }

  const classifications = selectionRows.map((row) => {
    const live = liveReport.results.find(
      (r) => r.url === row.url || r.url === row.canonicalUrl,
    );
    const cls = classifyDay2Candidate({
      extracted: true,
      identified: Boolean(row.productFingerprint),
      historyReady: !(row.reasonCodes ?? []).includes('PARTIAL_NO_HISTORY'),
      offerStandardRanked: true,
      dqePass:
        row.qualityDecision === 'VERIFIED_OPPORTUNITY' ||
        String(row.qualityDecision || '').includes('VERIFIED'),
      s61Pass: row.wouldInsert === true,
      liveStatus: live?.status ?? (row.duplicate ? 'duplicate' : null),
      skipReason:
        live?.status === 'skipped'
          ? live.reason
          : live?.status === 'error'
            ? live.message
            : null,
    });
    if (cls === 'READY') funnel.ready += 1;
    else if (cls === 'PARTIAL') funnel.partial += 1;
    else if (cls === 'DUPLICATE') funnel.duplicates += 1;
    else if (cls === 'RETRYABLE') funnel.retryable += 1;
    else if (cls === 'FAILED') funnel.failed += 1;
    else funnel.blocked += 1;
    return {
      url: row.url,
      fingerprint: row.productFingerprint,
      class: cls,
      qualityDecision: row.qualityDecision,
      wouldInsert: row.wouldInsert,
      liveStatus: live?.status ?? null,
    };
  });

  const automationBase = metricsFromWorkerResults(
    liveReport.results.map((r) => ({
      status: r.status,
      skipReason:
        r.status === 'skipped'
          ? r.reason
          : r.status === 'error'
            ? r.message
            : null,
    })),
  );
  const automation =
    s7Result?.ok === true
      ? buildAutomationCycleMetrics({
          ...automationBase,
          candidate_count: automationBase.candidate_count + 1,
          auto_processed: automationBase.auto_processed + 1,
          pending_created: automationBase.pending_created + 1,
        })
      : automationBase;

  // Non-pending guard
  if (offerIds.length > 0) {
    const { data: rows } = await sb
      .from('offers')
      .select('id,status')
      .in('id', offerIds);
    const bad = (rows ?? []).filter((o) => o.status !== 'pending');
    if (bad.length > 0) {
      report.stop = { reason: 'status_not_pending', bad };
      writeFileSync(join(OUT_DIR, 'day2-report-latest.json'), JSON.stringify(report, null, 2));
      console.error('STOP: non-pending status');
      process.exit(1);
    }
  }

  report.funnel = funnel;
  report.live = {
    latencyMs: Date.now() - liveStarted,
    summary: liveReport.summary,
    results: liveReport.results,
    insertedCount: inserted.length,
    duplicateCount: duplicates.length,
    skippedCount: skipped.length,
    errorCount: errors.length,
    offerIds,
    observationRows,
    observationsCreated,
  };
  report.s7 = s7Result;
  report.stickyLive = stickyLive;
  report.idempotency = idempotency;
  report.after = after;
  report.deltas = {
    offersTotal:
      before.offersTotal != null && after.offersTotal != null
        ? after.offersTotal - before.offersTotal
        : null,
    offersPending:
      before.offersPending != null && after.offersPending != null
        ? after.offersPending - before.offersPending
        : null,
    offerObservations:
      before.offerObservations != null && after.offerObservations != null
        ? after.offerObservations - before.offerObservations
        : null,
    priceMemoryRows:
      before.priceMemoryRows != null && after.priceMemoryRows != null
        ? after.priceMemoryRows - before.priceMemoryRows
        : null,
  };
  report.automation = automation;
  report.classifications = classifications;
  report.stop = {
    reason: null,
    completed: true,
    flagAfter: isMachinePendingWriteEnabled(),
  };

  const outPath = join(OUT_DIR, `day2-report-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  writeFileSync(join(OUT_DIR, 'day2-report-latest.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: 'execute',
        outPath,
        pendingCreated: funnel.pending_created,
        observationsCreated,
        offerIds,
        s7: s7Result?.ok ?? null,
        stickySnapshots: stickyLive.snapshotsWritten,
        automation_rate: automation.automation_rate,
        flagAfter: isMachinePendingWriteEnabled(),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
