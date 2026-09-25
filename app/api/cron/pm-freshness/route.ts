import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { runPriceMemoryFreshnessCycle } from '@/lib/hunter/priceMemory';
import { readSupplyFreshnessStatus } from '@/lib/hunter/supply/supplyFreshnessStatus';

/**
 * Day 5 — Dedicated Price Memory freshness cron (observe-only).
 * Does NOT mint offers. Does NOT enable money paths.
 * Auth: CRON_SECRET.
 */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  after(async () => {
    try {
      const report = await runPriceMemoryFreshnessCycle({
        maxTargets: 16,
        persist: true,
      });
      const status = await readSupplyFreshnessStatus();
      console.log(
        '[pm-freshness:after]',
        JSON.stringify({
          cycle_id: report.cycle_id,
          observeOk: report.observeOk,
          snapshotsPersisted: report.snapshotsPersisted,
          losses: report.losses,
          largestLoss: report.largestLoss,
          diagnosis: report.diagnosis,
          supplyStatus: status,
        }),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[pm-freshness:after]', message);
    }
  });

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      mode: 'pm_freshness',
      note: 'Price Memory observe-only cycle scheduled. Logs [pm-freshness:after].',
    },
    { status: 202, headers: { 'Cache-Control': 'no-store' } },
  );
}
