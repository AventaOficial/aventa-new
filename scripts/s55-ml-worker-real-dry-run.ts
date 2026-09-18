/**
 * S5.5 — Real ml_worker discovery → S4 dry-run pipeline (local only).
 *
 * Reads READ-ONLY scrape output from smoke-gate-v2-discovery.mjs.
 * NEVER posts to Aventa. NEVER inserts offers / moderation / distribution.
 *
 *   node workers/mercadolibre-worker/scripts/smoke-gate-v2-discovery.mjs
 *   npx tsx scripts/s55-ml-worker-real-dry-run.ts
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExternalWorkerCandidate } from '../lib/bots/ingest/externalWorker';
import {
  buildMlWorkerSourceEventId,
  normalizeMlWorkerListing,
} from '../lib/supplyIntelligence/adapters/mlWorkerListingAdapter';
import {
  runMlWorkerListingDryRun,
  type DryRunItemResult,
  type DryRunReport,
} from '../lib/supplyIntelligence/dryRunPipeline';

const ROOT = process.cwd();
const DEFAULT_IN = join(ROOT, 'scripts/_smoke-gate-v2-discovery.json');
const OUT_DIR = join(ROOT, 'scripts/_s55_reports');

type ObservationClass = 'VALID' | 'PARTIAL' | 'INVALID';

type ObsAudit = {
  index: number;
  classification: ObservationClass;
  missing: string[];
  sourceEventId: string | null;
  url: string;
  title: string;
  discountPrice: number | null;
  originalPrice: number | null;
};

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
  };
}

function classifyObservation(c: ExternalWorkerCandidate): ObsAudit {
  const missing: string[] = [];
  const n = normalizeMlWorkerListing(c);
  if (!n.ok) {
    return {
      index: -1,
      classification: 'INVALID',
      missing: [n.reason],
      sourceEventId: null,
      url: c.url.slice(0, 120),
      title: c.title.slice(0, 80),
      discountPrice: Number.isFinite(c.discountPrice) ? c.discountPrice : null,
      originalPrice: c.originalPrice ?? null,
    };
  }
  const { meta, sourceEventId } = n.value;
  if (!meta.imageUrl) missing.push('image');
  if (meta.originalPrice == null || meta.originalPrice <= meta.discountPrice) {
    missing.push('original_or_reference_price');
  }
  if (!meta.store?.trim()) missing.push('merchant');
  if (meta.discountPercent <= 0) missing.push('discount_percent');
  return {
    index: -1,
    classification: missing.length === 0 ? 'VALID' : 'PARTIAL',
    missing,
    sourceEventId,
    url: meta.canonicalUrl.slice(0, 120),
    title: meta.title.slice(0, 80),
    discountPrice: meta.discountPrice,
    originalPrice: meta.originalPrice,
  };
}

function p95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[Math.max(0, idx)] ?? null;
}

function fingerprintReport(report: DryRunReport): string {
  const payload = report.items.map((i) => ({
    sourceEventId: i.sourceEventId,
    observationIdempotencyKey: i.observationIdempotencyKey,
    status: i.status,
    reason: i.reason,
    dealScore: i.dealScore,
    productFingerprint: i.productFingerprint,
  }));
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function pickManual(items: DryRunItemResult[], status: DryRunItemResult['status'], n: number) {
  const pool = items.filter((i) => i.status === status);
  if (status === 'WOULD_INSERT' || status === 'SCORED') {
    return [...pool].sort((a, b) => (b.dealScore ?? 0) - (a.dealScore ?? 0)).slice(0, n);
  }
  return pool.slice(0, n);
}

async function main() {
  const inPath = process.env.S55_DISCOVERY_JSON?.trim() || DEFAULT_IN;
  if (!existsSync(inPath)) {
    console.error(`[s55] missing discovery JSON: ${inPath}`);
    console.error('[s55] run smoke-gate-v2-discovery.mjs first (READ-ONLY)');
    process.exit(2);
  }

  const raw = JSON.parse(readFileSync(inPath, 'utf8')) as {
    meta?: Record<string, unknown>;
    discovery?: Record<string, unknown>;
    candidates?: unknown[];
  };

  const parsed = (raw.candidates ?? [])
    .map(asCandidate)
    .filter((c): c is ExternalWorkerCandidate => c != null)
    .slice(0, 50);

  const fetchLatencyMs =
    typeof raw.meta?.elapsedMs === 'number' ? Number(raw.meta.elapsedMs) : null;

  const audits: ObsAudit[] = parsed.map((c, index) => {
    const a = classifyObservation(c);
    return { ...a, index };
  });

  const tNorm0 = Date.now();
  const normOk = parsed.filter((c) => normalizeMlWorkerListing(c).ok).length;
  const normalizationLatencyMs = Date.now() - tNorm0;

  const tIntel0 = Date.now();
  const report1 = await runMlWorkerListingDryRun({
    candidates: parsed,
    maxItems: Math.min(50, Math.max(1, parsed.length || 1)),
    runId: 's55_pass1',
  });
  const intelligenceLatencyMs = Date.now() - tIntel0;

  const tIdem0 = Date.now();
  const report2 = await runMlWorkerListingDryRun({
    candidates: parsed,
    maxItems: Math.min(50, Math.max(1, parsed.length || 1)),
    runId: 's55_pass2',
  });
  const idempotencyLatencyMs = Date.now() - tIdem0;

  const fp1 = fingerprintReport(report1);
  const fp2 = fingerprintReport(report2);
  const itemLatencies = report1.items.map((i) => i.latencyMs);

  const discountPercents = parsed
    .map((c) => {
      const n = normalizeMlWorkerListing(c);
      return n.ok ? n.value.meta.discountPercent : null;
    })
    .filter((v): v is number => v != null && v > 0);

  const writeSafety = {
    offersInserts: 0,
    moderationMutations: 0,
    distributionMutations: 0,
    rewardMutations: 0,
    economyMutations: 0,
    attributionMutations: 0,
    hunterSupplyRunsWrites: 0,
    proof:
      'Local pipeline only: no POST to /api/cron/bot-ingest-candidates; runMlWorkerListingDryRun sets offerInserted=false; smoke discovery is READ-ONLY.',
    everyOfferInsertedFalse: report1.items.every((i) => i.offerInserted === false),
  };

  const valid = audits.filter((a) => a.classification === 'VALID').length;
  const partial = audits.filter((a) => a.classification === 'PARTIAL').length;
  const invalid = audits.filter((a) => a.classification === 'INVALID').length;

  const outcome = {
    meta: {
      mode: 'S5.5_REAL_ML_WORKER_DRY_RUN',
      discoveryPath: inPath,
      discoveryMeta: raw.meta ?? null,
      sampleSize: parsed.length,
      hardCap: 50,
      generatedAt: new Date().toISOString(),
    },
    observationValidation: {
      totalFetched: parsed.length,
      valid,
      partial,
      invalid,
      audits,
    },
    normalization: {
      successCount: normOk,
      failureCount: parsed.length - normOk,
      successRate: parsed.length ? Math.round((normOk / parsed.length) * 1000) / 10 : 0,
      latencyMs: normalizationLatencyMs,
    },
    intelligence: {
      report: report1,
      latencyMs: intelligenceLatencyMs,
      scoreDistribution: report1.scoreDistribution,
      discountDistribution: {
        count: discountPercents.length,
        min: discountPercents.length ? Math.min(...discountPercents) : null,
        max: discountPercents.length ? Math.max(...discountPercents) : null,
        avg: discountPercents.length
          ? Math.round(
              (discountPercents.reduce((a, b) => a + b, 0) / discountPercents.length) * 10,
            ) / 10
          : null,
      },
    },
    outcomes: {
      WOULD_INSERT: report1.items.filter((i) => i.status === 'WOULD_INSERT').length,
      SUPPRESSED: report1.items.filter((i) => i.status === 'SUPPRESSED').length,
      DUPLICATE: report1.items.filter((i) => i.status === 'DUPLICATE').length,
      FAILED: report1.items.filter((i) => i.status === 'FAILED').length,
      DISCOVERED_NORMALIZED: report1.discoveries,
      offerInsertedAllFalse: writeSafety.everyOfferInsertedFalse,
    },
    manualInspection: {
      topScores: pickManual(report1.items, 'WOULD_INSERT', 3),
      suppressed: pickManual(report1.items, 'SUPPRESSED', 3),
      duplicates: pickManual(report1.items, 'DUPLICATE', 3),
      failures: pickManual(report1.items, 'FAILED', 3),
    },
    idempotency: {
      deterministic: fp1 === fp2,
      fingerprintPass1: fp1,
      fingerprintPass2: fp2,
      pass2LatencyMs: idempotencyLatencyMs,
      note:
        fp1 === fp2
          ? 'Same sourceEventId / idempotencyKey / outcome / score across two passes'
          : 'Mismatch — inspect diffs; do not artificially patch',
    },
    latency: {
      fetchMs: fetchLatencyMs,
      normalizationMs: normalizationLatencyMs,
      intelligenceMs: intelligenceLatencyMs,
      totalPipelineMs: report1.latencyMs,
      itemLatencyAvg:
        itemLatencies.length > 0
          ? Math.round(
              (itemLatencies.reduce((a, b) => a + b, 0) / itemLatencies.length) * 10,
            ) / 10
          : null,
      itemLatencyP95: p95(itemLatencies),
      discoverLatencyMs: report1.discoverLatencyMs,
      externalHttpCallsDuringPipeline: 0,
      playwrightLaunchesDuringPipeline: 0,
      note: 'Playwright only in smoke discovery step; S4 pipeline is in-memory',
    },
    sourceHealth: {
      discoveryOk: Array.isArray(raw.candidates),
      funnel: (raw.discovery as { qualityGate?: unknown } | undefined)?.qualityGate ?? null,
      seeds: raw.meta?.seeds ?? null,
    },
    writeSafety,
    identitySample: parsed.slice(0, 5).map((c) => ({
      sourceEventId: buildMlWorkerSourceEventId({
        url: c.url,
        canonicalUrl: c.canonicalUrl,
      }),
      url: c.url.slice(0, 100),
      title: c.title.slice(0, 60),
    })),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `s55-report-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(outcome, null, 2), 'utf8');
  writeFileSync(join(OUT_DIR, 's55-report-latest.json'), JSON.stringify(outcome, null, 2), 'utf8');

  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        sampleSize: parsed.length,
        valid,
        partial,
        invalid,
        wouldInsert: outcome.outcomes.WOULD_INSERT,
        suppressed: outcome.outcomes.SUPPRESSED,
        duplicates: outcome.outcomes.DUPLICATE,
        failed: outcome.outcomes.FAILED,
        idempotent: outcome.idempotency.deterministic,
        writeSafety,
        scoreDistribution: report1.scoreDistribution,
        fetchMs: fetchLatencyMs,
        intelligenceMs: intelligenceLatencyMs,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error('[s55:error]', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
