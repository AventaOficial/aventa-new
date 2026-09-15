/**
 * Dry-run REAL del Supply Engine (red → ML API).
 * NO escribe ofertas. Price Memory puede registrar snapshots de precio (no offers).
 *
 *   npx tsx --env-file=.env.local scripts/supply-engine-real-dry-run.ts
 *
 * Requiere ML_OAUTH_ENABLED=1 y token en mercadolibre_oauth_tokens (search público → 403).
 * Waves pequeñas: 0,1,2 × 3 nichos.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  emptySupplyTelemetryRollup,
  ratesFromCounters,
  recordSupplyCandidateTelemetry,
  runSupplyEngine,
  summarizeSupplyEngineReport,
  topKeysByGoodDeals,
  type SupplyEngineCandidateView,
  type SupplyEngineReport,
} from '../lib/hunter/supply';

// Fail-closed: sin OAuth el search ML responde 403 desde muchas redes.
if (!process.env.ML_OAUTH_ENABLED) {
  process.env.ML_OAUTH_ENABLED = '1';
}

const NICHES = ['beauty', 'electronics', 'day_to_day'] as const;
const WAVES = [0, 1] as const;

type SampleRow = {
  bucket: string;
  nicheId: string;
  query: string | null;
  sourceId: string;
  title: string | null;
  price: number | null;
  originalPrice: number | null;
  labelDiscountPercent: number | null;
  dealScore: number;
  priceClass: string;
  laneHint: string;
  qualification: string | null;
  qualityReason: string;
  url: string;
};

function sampleFrom(views: SupplyEngineCandidateView[], nicheId: string): SampleRow[] {
  return views.map((v) => ({
    bucket: v.qualityBucket,
    nicheId,
    query: v.query,
    sourceId: v.sourceId,
    title: v.title,
    price: v.price,
    originalPrice: v.originalPrice,
    labelDiscountPercent: v.labelDiscountPercent,
    dealScore: v.deal.dealScore,
    priceClass: v.deal.priceClass,
    laneHint: v.deal.laneHint,
    qualification: v.qualification,
    qualityReason: v.qualityReason,
    url: v.canonicalUrl,
  }));
}

function pickBucket(rows: SampleRow[], bucket: string, n: number) {
  return rows
    .filter((r) => r.bucket === bucket)
    .sort((a, b) => b.dealScore - a.dealScore)
    .slice(0, n);
}

async function main() {
  const startedAt = new Date().toISOString();
  const rollup = emptySupplyTelemetryRollup();
  const reports: Array<{ nicheId: string; wave: number; summary: ReturnType<typeof summarizeSupplyEngineReport> }> =
    [];
  const allSamples: SampleRow[] = [];
  const totals = {
    discovered: 0,
    unique: 0,
    duplicates: 0,
    verified: 0,
    approvalReady: 0,
    insufficientEvidence: 0,
    falseDiscounts: 0,
    historicalLows: 0,
    priceDrops: 0,
    anomalies: 0,
    rejected: 0,
    sourceFailures: 0,
    excellent: 0,
    good: 0,
    mediocre: 0,
    filler: 0,
    wroteOffers: 0,
  };

  for (const nicheId of NICHES) {
    for (const wave of WAVES) {
      console.error(`[real-dry-run] niche=${nicheId} wave=${wave} …`);
      const report: SupplyEngineReport = await runSupplyEngine({
        mode: 'dry_run',
        nicheId,
        wave,
        allowWrite: false,
        persistSnapshots: false,
      });

      if (report.wroteOffers) {
        throw new Error('FAIL-CLOSED: dry-run escribió ofertas — abortando');
      }

      const summary = summarizeSupplyEngineReport(report);
      reports.push({ nicheId, wave, summary });
      console.error(
        `[real-dry-run] niche=${nicheId} wave=${wave} discovered=${summary.metrics.discovered} approvalReady=${summary.metrics.approvalReady} latencyMs=${summary.metrics.processingLatencyMs}`,
      );

      totals.discovered += report.metrics.discovered;
      totals.unique += report.metrics.unique;
      totals.duplicates += report.metrics.duplicates;
      totals.verified += report.metrics.verified;
      totals.approvalReady += report.metrics.approvalReady;
      totals.insufficientEvidence += report.metrics.insufficientEvidence;
      totals.falseDiscounts += report.metrics.falseDiscounts;
      totals.historicalLows += report.metrics.historicalLows;
      totals.priceDrops += report.metrics.priceDrops;
      totals.anomalies += report.metrics.anomalies;
      totals.rejected += report.metrics.rejected;
      totals.sourceFailures += report.metrics.sourceFailures;
      if (report.wroteOffers) totals.wroteOffers += 1;

      for (const v of report.candidates) {
        if (v.qualityBucket === 'excellent') totals.excellent += 1;
        if (v.qualityBucket === 'good') totals.good += 1;
        if (v.qualityBucket === 'mediocre') totals.mediocre += 1;
        if (v.qualityBucket === 'filler') totals.filler += 1;

        const approvalReady =
          (v.qualification === 'VERIFIED_DEAL' || v.qualification === 'PROMOTION') &&
          v.deal.priceClass !== 'false_discount' &&
          v.deal.dealScore >= 35;

        recordSupplyCandidateTelemetry(rollup, {
          nicheId,
          sourceId: v.sourceId,
          query: v.query,
          category: v.categoryId,
          merchant: v.merchant,
          isUnique: true,
          isDuplicate: false,
          approvalReady,
          bucket: v.qualityBucket,
          priceClass: v.deal.priceClass,
          laneHint: v.deal.laneHint,
        });
      }

      allSamples.push(...sampleFrom(report.candidates, nicheId));
    }
  }

  const qualityRate =
    totals.unique > 0
      ? Math.round(((totals.excellent + totals.good) / Math.max(1, allSamples.length)) * 1000) / 10
      : 0;
  const approvalReadyRate =
    totals.unique > 0 ? Math.round((totals.approvalReady / totals.unique) * 1000) / 10 : 0;

  const out = {
    startedAt,
    finishedAt: new Date().toISOString(),
    mode: 'dry_run',
    wroteOffers: false,
    note: 'Real ML API dry-run. No offer inserts. Waves 0-1 × 3 niches.',
    totals,
    qualityRatePct_goodPlusExcellent_of_samples: qualityRate,
    approvalReadyRatePct_of_unique: approvalReadyRate,
    goodDealsPerDiscovered:
      totals.discovered > 0
        ? Math.round(((totals.excellent + totals.good) / totals.discovered) * 1000) / 10
        : 0,
    byNiche: Object.fromEntries(
      Object.entries(rollup.byNiche).map(([k, c]) => [k, { ...c, rates: ratesFromCounters(c) }]),
    ),
    topQueries: topKeysByGoodDeals(rollup.byQuery, 12),
    topSources: topKeysByGoodDeals(rollup.bySource, 8),
    topCategories: topKeysByGoodDeals(rollup.byCategory, 8),
    samples: {
      excellent: pickBucket(allSamples, 'excellent', 8),
      good: pickBucket(allSamples, 'good', 8),
      mediocre: pickBucket(allSamples, 'mediocre', 6),
      filler: pickBucket(allSamples, 'filler', 6),
      rejected: pickBucket(allSamples, 'rejected', 6),
    },
    runs: reports,
  };

  const dir = join(process.cwd(), 'tmp');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `supply-real-dry-run-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(out, null, 2), 'utf8');
  console.log(JSON.stringify({ reportPath: path, totals: out.totals, qualityRate, approvalReadyRate }, null, 2));
  console.log(`\nFull report: ${path}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
