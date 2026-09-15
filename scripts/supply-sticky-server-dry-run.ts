/**
 * Dry-run sticky/server path para beauty, electronics, day_to_day.
 * WRITE off. Imprime funnel sticky separado.
 */
import {
  runSupplyEngine,
  summarizeSupplyEngineReport,
} from '../lib/hunter/supply';

if (!process.env.ML_OAUTH_ENABLED) {
  process.env.ML_OAUTH_ENABLED = '1';
}

const niches = ['beauty', 'electronics', 'day_to_day'] as const;

async function main() {
  const rows = [];
  for (const nicheId of niches) {
    const report = await runSupplyEngine({
      mode: 'dry_run',
      nicheId,
      persistSnapshots: true,
      enableSticky: true,
    });
    const s = summarizeSupplyEngineReport(report);
    const m = report.metrics;
    rows.push({
      niche: nicheId,
      wroteOffers: report.wroteOffers,
      stickyDiscovered: m.stickyCandidates,
      stickyApiAttempted: m.stickyApiAttempted,
      stickyApiSuccess: m.stickyApiSuccess,
      stickyApiBlocked: m.stickyApiBlocked,
      stickyNotFound: m.stickyNotFound,
      stickyPriceVerified: m.stickyPriceVerified,
      stickyEvidenceRich: m.stickyEvidenceRich,
      stickyVerified: m.stickyVerified,
      stickyHistoryReady: m.stickyHistoryReady,
      stickyPriceDrop: m.stickyPriceDrop,
      stickyHistoricalLow: m.stickyHistoricalLow,
      stickyApprovalReady: m.stickyApprovalReady,
      freshDiscovered: m.freshCandidates,
      freshVerified: m.freshVerified,
      freshApprovalReady: m.freshApprovalReady,
      bottleneck: s.stickyVsFresh.bottleneck,
      note: report.note,
    });
  }
  console.log(JSON.stringify({ ok: true, wroteOffers: false, rows }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
