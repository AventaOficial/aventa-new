/**
 * Dry-run sticky niche-aware: beauty, electronics, day_to_day.
 * WRITE off. Reporta funnel por nicho.
 *
 * STICKY_DRY_RUN_SHIFT_HOURS (default 25) desplaza `now` para demostrar
 * selección tras cooldown del día sin mutar el cooldown de producción.
 */
import {
  runSupplyEngine,
  summarizeSupplyEngineReport,
  loadStickyBudgetConfig,
  resolveStickyNicheBudget,
} from '../lib/hunter/supply';

if (!process.env.ML_OAUTH_ENABLED) {
  process.env.ML_OAUTH_ENABLED = '1';
}

const niches = ['beauty', 'electronics', 'day_to_day'] as const;
const shiftHours = Number.parseInt(process.env.STICKY_DRY_RUN_SHIFT_HOURS ?? '25', 10) || 0;

async function main() {
  const budgets = loadStickyBudgetConfig();
  const now = new Date(Date.now() + Math.max(0, shiftHours) * 3_600_000);
  const rows = [];
  for (const nicheId of niches) {
    const report = await runSupplyEngine({
      mode: 'dry_run',
      nicheId,
      persistSnapshots: true,
      enableSticky: true,
      now,
    });
    const s = summarizeSupplyEngineReport(report);
    const m = report.metrics;
    const sel = report.sticky?.selection;
    rows.push({
      niche: nicheId,
      nicheBudget: resolveStickyNicheBudget(nicheId, budgets),
      globalBudget: budgets.globalMaxPerWave,
      wroteOffers: report.wroteOffers,
      allowlistSize: sel?.allowlistSize ?? report.sticky?.allowlistSize ?? null,
      stickySelected: m.stickyCandidates,
      stickyApiAttempted: m.stickyApiAttempted,
      stickyApiSuccess: m.stickyApiSuccess,
      stickyEvidenceRich: m.stickyEvidenceRich,
      stickyVerified: m.stickyVerified,
      stickyHistoryReady: m.stickyHistoryReady,
      stickyPriceDrop: m.stickyPriceDrop,
      stickyHistoricalLow: m.stickyHistoricalLow,
      stickyApprovalReady: m.stickyApprovalReady,
      cooldownSkipped: report.sticky?.cooldownSkipped ?? 0,
      budgetLimited: report.sticky?.budgetLimited ?? 0,
      attributionReason: sel?.attributionReason ?? null,
      freshDiscovered: m.freshCandidates,
      freshVerified: m.freshVerified,
      freshApprovalReady: m.freshApprovalReady,
      bottleneck: s.stickyVsFresh.bottleneck,
      note: report.note,
    });
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        wroteOffers: false,
        nowShiftHours: shiftHours,
        simulatedNow: now.toISOString(),
        budgets: {
          globalMaxPerWave: budgets.globalMaxPerWave,
          nicheMaxPerWave: budgets.nicheMaxPerWave,
        },
        rows,
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
