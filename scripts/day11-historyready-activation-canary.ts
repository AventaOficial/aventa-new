/**
 * Day 11 — deterministic historyReady activation canary (no network required for core asserts).
 *
 *   npx tsx scripts/day11-historyready-activation-canary.ts
 *
 * Optional staging census (requires env):
 *   npx tsx --env-file=.env.local scripts/day11-historyready-activation-canary.ts --with-census
 */

import { ML_PRICE_MIN_HISTORY_DAYS } from '../lib/bots/ingest/mlPriceEngine';
import {
  buildHistoryReadyActivationFromTraces,
  emptyHistoryReadyCensus,
  isApproxActivatedToday,
  isHistoryReadyFromDistinctDays,
  loadHistoryReadyCensus,
  DAY10_PRODUCTION_BASELINE,
} from '../lib/hunter/discovery/historyReadyActivation';
import type { VerifiedYieldCandidateTrace } from '../lib/hunter/discovery/verifiedYieldTerminal';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(ML_PRICE_MIN_HISTORY_DAYS === 4, 'history days must remain 4');
  assert(isHistoryReadyFromDistinctDays(3) === false, '3 days not ready');
  assert(isHistoryReadyFromDistinctDays(4) === true, '4 days ready');
  assert(
    isApproxActivatedToday({ distinctDaysBeforeToday: 3, observedToday: true }),
    'activation rule',
  );

  const traces: VerifiedYieldCandidateTrace[] = [
    {
      url: 'https://example.com/a',
      sourceId: 'sticky_history_ready',
      productId: 'A',
      daysUntilReady: 0,
      priorDays: 4,
      historyReady: true,
      dqeDecision: 'VERIFIED_DEAL',
      s61Decision: 'VERIFIED_OPPORTUNITY',
      reasonCodes: [],
      primaryTerminalReason: 'DRY_RUN_WOULD_INSERT',
    },
    {
      url: 'https://example.com/b',
      sourceId: 'sticky_history_ready',
      productId: 'B',
      daysUntilReady: 0,
      priorDays: 5,
      historyReady: true,
      dqeDecision: 'VERIFIED_DEAL',
      s61Decision: null,
      reasonCodes: ['PROVENANCE'],
      primaryTerminalReason: 'PROVENANCE_FAILURE',
    },
  ];

  const built = buildHistoryReadyActivationFromTraces(
    traces,
    emptyHistoryReadyCensus(),
    { activatedProductIds: new Set(['A']) },
  );
  assert(built.evaluated.history_ready_candidates === 2, 'hr candidates');
  assert(built.evaluated.s61_pass === 1, 's61 pass');
  assert(built.rates.historyReady_to_s61_yield === 0.5, 'yield');
  assert(built.day10_baseline.s61_pass === DAY10_PRODUCTION_BASELINE.s61_pass, 'baseline');

  const out: Record<string, unknown> = {
    ok: true,
    ML_PRICE_MIN_HISTORY_DAYS,
    synthetic_historyReady_to_s61_yield: built.rates.historyReady_to_s61_yield,
    day10_baseline: DAY10_PRODUCTION_BASELINE,
  };

  if (process.argv.includes('--with-census')) {
    process.env.AVENTA_SUPABASE_TARGET =
      process.env.AVENTA_SUPABASE_TARGET || 'staging';
    delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    const census = await loadHistoryReadyCensus();
    out.census = census;
    out.mint_safe = process.env.BOT_INGEST_MACHINE_PENDING_WRITES !== 'true';
  }

  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
