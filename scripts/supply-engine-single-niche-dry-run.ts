/**
 * Dry-run rápido de un solo nicho (default beauty). WRITE off.
 *   npx tsx --env-file=.env.local scripts/supply-engine-single-niche-dry-run.ts [nicheId]
 */
import {
  runSupplyEngine,
  summarizeSupplyEngineReport,
} from '../lib/hunter/supply';

if (!process.env.ML_OAUTH_ENABLED) {
  process.env.ML_OAUTH_ENABLED = '1';
}

async function main() {
  const nicheId = process.argv[2] || 'beauty';
  const report = await runSupplyEngine({
    mode: 'dry_run',
    nicheId,
    persistSnapshots: true,
  });
  const summary = summarizeSupplyEngineReport(report);
  const buckets = report.candidates.reduce<Record<string, number>>((acc, c) => {
    acc[c.qualityBucket] = (acc[c.qualityBucket] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    JSON.stringify(
      {
        ...summary,
        wroteOffers: report.wroteOffers,
        candidateSample: report.candidates.slice(0, 5).map((c) => ({
          title: c.title?.slice(0, 60),
          priceClass: c.deal.priceClass,
          historyReady: c.deal.historyReady,
          dealScore: c.deal.dealScore,
          bucket: c.qualityBucket,
          query: c.query,
          sourceId: c.sourceId,
        })),
        buckets,
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
