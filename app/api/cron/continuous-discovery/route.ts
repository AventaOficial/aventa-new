import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { runContinuousDiscoveryCycle } from '@/lib/hunter/discovery';
import {
  scheduledContinuousCycleId,
  SCHEDULED_CONTINUOUS_DEADLINE_MS,
  SCHEDULED_CONTINUOUS_MAX_PRIORITIZED,
} from '@/lib/hunter/discovery/continuousCronContract';

export const maxDuration = 300;

/**
 * Daily Continuous Discovery (Hobby: once per day; 17:00 UTC).
 * Auth: existing requireCronSecret (Vercel Cron sends Bearer CRON_SECRET).
 * cronSafe fail-closes mint. Does not enable machine writes.
 * Budget capped so soft deadline + snapshot persist beat the 300s hard kill.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  after(async () => {
    try {
      const report = await runContinuousDiscoveryCycle({
        cronSafe: true,
        dryRun: true,
        allowStagingMint: false,
        excludeEnvUrls: true,
        includeStickyNearReady: true,
        cycleId: scheduledContinuousCycleId(new Date()),
        persistTruth: true,
        maxPrioritized: SCHEDULED_CONTINUOUS_MAX_PRIORITIZED,
        deadlineMs: SCHEDULED_CONTINUOUS_DEADLINE_MS,
      });
      console.log(
        '[continuous-discovery:after]',
        JSON.stringify({
          cycle_id: report.cycle_id,
          dryRun: report.dryRun,
          mintAttempted: report.mintAttempted,
          discovered: report.verifiedYield.discovered,
          identity_valid: report.verifiedYield.identity_valid,
          pm_ready: report.verifiedYield.pm_ready,
          dqe_verified: report.verifiedYield.dqe_verified,
          dqe_potential: report.verifiedYield.dqe_potential,
          s61_pass: report.verifiedYield.s61_pass,
          s61_blocked: report.verifiedYield.s61_blocked,
          rates: report.verifiedYield.rates,
          terminal_reason_counts: report.verifiedYield.terminal_reason_counts,
          blocked_quality: report.automation.blocked_quality,
          blocked_external: report.automation.blocked_external,
          automation_rate: report.automation.automation_rate,
          truthPersist: report.truthPersist ?? null,
        }),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[continuous-discovery:after]', message);
    }
  });

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      mode: 'continuous',
      note: 'Continuous discovery cronSafe (dry-run, no mint). Snapshot en discovery_cycle_snapshots.',
    },
    { status: 202, headers: { 'Cache-Control': 'no-store' } },
  );
}
