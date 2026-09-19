/**
 * S6.4 — Worker_card empirical validation (local, READ-ONLY).
 *
 *   npx tsx scripts/s64-worker-card-empirical.ts
 *
 * Uses scripts/_smoke-gate-v2-discovery.json (S5.5/S6.3 real scrape).
 * Never inserts / never POSTs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExternalWorkerCandidate } from '../lib/bots/ingest/externalWorker';
import {
  decomposeIngestScores,
  toWorkerCardDiagnosticRow,
} from '../lib/bots/ingest/workerCardScoreDiagnostics';
import {
  createDryRunGateConfig,
  normalizeMlWorkerListing,
  runMlWorkerListingDryRun,
} from '../lib/supplyIntelligence';

const ROOT = process.cwd();
const DEFAULT_IN = join(ROOT, 'scripts/_smoke-gate-v2-discovery.json');
const OUT_DIR = join(ROOT, 'scripts/_s64_reports');

function asCandidate(raw: unknown): ExternalWorkerCandidate | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const url = typeof r.url === 'string' ? r.url : '';
  const title = typeof r.title === 'string' ? r.title : '';
  const discountPrice = Number(r.discountPrice);
  if (!url || !title || !Number.isFinite(discountPrice)) return null;
  return {
    url,
    title,
    store: typeof r.store === 'string' ? r.store : null,
    imageUrl: typeof r.imageUrl === 'string' ? r.imageUrl : null,
    discountPrice,
    originalPrice:
      r.originalPrice == null
        ? null
        : Number.isFinite(Number(r.originalPrice))
          ? Number(r.originalPrice)
          : null,
    discountPercent:
      r.discountPercent == null
        ? null
        : Number.isFinite(Number(r.discountPercent))
          ? Number(r.discountPercent)
          : null,
    canonicalUrl: typeof r.canonicalUrl === 'string' ? r.canonicalUrl : null,
    sourceDetail: typeof r.sourceDetail === 'string' ? r.sourceDetail : null,
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
    pdpBlocked: r.pdpBlocked === true,
    signals:
      r.signals && typeof r.signals === 'object'
        ? (r.signals as ExternalWorkerCandidate['signals'])
        : null,
  };
}

function summarize(rows: Record<string, unknown>[]) {
  const deltas = rows.map((r) => Number(r.workerCardEstimatedDelta) || 0);
  const verifierActual = rows.map((r) => Number(r.verifierScore) || 0);
  const verifierCf = rows.map((r) => Number(r.counterfactualVerifierScore) || 0);
  const dealScores = rows.map((r) => Number(r.dealScore) || 0);
  const avg = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
  return {
    n: rows.length,
    imagePresent: rows.filter((r) => r.imagePresent === true).length,
    listingCardProv: rows.filter((r) => r.originalPriceProvenance === 'listing_card').length,
    cardStrikethrough: rows.filter((r) => r.cardDiscountSource === 'card_strikethrough').length,
    wouldInsert: rows.filter((r) => r.wouldInsert === true).length,
    verifierRejectActual: rows.filter((r) => r.verifierDecision === 'reject').length,
    verifierRejectCounterfactual: rows.filter(
      (r) => r.counterfactualVerifierDecision === 'reject',
    ).length,
    workerCardPresent: rows.filter((r) => r.workerCardPresent === true).length,
    avgDealScore: avg(dealScores),
    avgVerifierActual: avg(verifierActual),
    avgVerifierCounterfactual: avg(verifierCf),
    avgWorkerCardDelta: avg(deltas),
    minWorkerCardDelta: deltas.length ? Math.min(...deltas) : null,
    maxWorkerCardDelta: deltas.length ? Math.max(...deltas) : null,
  };
}

async function main() {
  const inPath = process.env.S64_DISCOVERY_JSON?.trim() || DEFAULT_IN;
  if (!existsSync(inPath)) {
    console.error(`[s64] missing discovery JSON: ${inPath}`);
    process.exit(2);
  }

  const raw = JSON.parse(readFileSync(inPath, 'utf8')) as {
    candidates?: unknown[];
    discovery?: Record<string, unknown>;
  };
  const candidates = (raw.candidates ?? [])
    .map(asCandidate)
    .filter((c): c is ExternalWorkerCandidate => c != null)
    .slice(0, 50);

  const config = createDryRunGateConfig({ maxPerRun: 50, candidatePoolMax: 50 });
  const rows: Record<string, unknown>[] = [];

  for (const c of candidates) {
    const n = normalizeMlWorkerListing(c);
    if (!n.ok) {
      rows.push({
        urlHost: null,
        normalizeFailed: n.reason,
        wouldInsert: false,
      });
      continue;
    }
    const decomp = decomposeIngestScores({
      meta: n.value.meta,
      config,
      pdpBlocked: c.pdpBlocked === true,
    });
    rows.push(
      toWorkerCardDiagnosticRow(n.value.sourceEventId, n.value.meta.canonicalUrl, decomp),
    );
  }

  const dryRun = await runMlWorkerListingDryRun({
    candidates,
    maxItems: 50,
    config,
  });

  const summary = summarize(rows);
  const payload = {
    meta: {
      mode: 'S6.4_WORKER_CARD_EMPIRICAL',
      discoveryPath: inPath,
      generatedAt: new Date().toISOString(),
      note: 'Counterfactual is diagnostic only — gate uses actual verifier. No production writes.',
    },
    summary,
    dryRun: {
      wouldInsertCount: dryRun.wouldInsertCount,
      suppressed: dryRun.lowQualitySuppressions,
      duplicates: dryRun.duplicateSuppressions,
      failed: dryRun.errorCount,
      offerInsertedAlwaysFalse: dryRun.items.every((i) => i.offerInserted === false),
      scoreDistribution: dryRun.scoreDistribution,
    },
    observations: {
      workerCardBoostIsVerifierOnly:
        'DealScore/computeDealSignals does not read listingTypeId=worker_card.',
      typicalBoostWhenSoldAndRatingMissing:
        'popularity 58 vs 40 (+18 component); rating 60 vs 55 (+5 component); weighted ≈ +5 total at default weights.',
      sampleSizeCaution: 'n=15 cannot validate or invalidate global scorer calibration.',
    },
    controlDataset: {
      available: false,
      reason:
        'No separate non-ml_worker discovery fixture with trusted provenance found in scripts/. Unit-test controls only.',
    },
    rows,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `s64-report-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  writeFileSync(join(OUT_DIR, 's64-report-latest.json'), JSON.stringify(payload, null, 2), 'utf8');

  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        summary,
        dryRun: payload.dryRun,
        writeSafety: { offersInserts: 0 },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error('[s64:error]', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
