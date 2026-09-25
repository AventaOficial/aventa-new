import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { runIngestCycleForProfile } from '@/lib/bots/ingest/runIngestCycle';
import { runContinuousDiscoveryCycle } from '@/lib/hunter/discovery';
import { runPriceMemoryFreshnessCycle } from '@/lib/hunter/priceMemory';

/**
 * La ingesta puede tardar minutos (ML, sleeps). Cron externo (p. ej. cron-job.org) suele cortar a ~30s.
 * Respondemos enseguida y ejecutamos con `after()` hasta maxDuration en Vercel.
 */
export const maxDuration = 300;

/**
 * GET: ciclo de ingesta — S9.1 discovery/eval only (no offer mint).
 * Live machine writes: S9 → withMachinePendingWritesEnabled → S7.
 * Protegido con CRON_SECRET (Authorization: Bearer o x-cron-secret).
 *
 * Modes:
 * - default → runIngestCycleForProfile
 * - `?mode=continuous` → Day 3 continuous discovery (dry-run; no mint)
 * - `?mode=pm_freshness` → Day 4 Price Memory observe-only (no offer mint)
 */
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  const profile = request.nextUrl.searchParams.get('profile') === 'mega' ? 'mega' : 'standard';
  const modeParam = (request.nextUrl.searchParams.get('mode') ?? '').trim().toLowerCase();
  const continuous = modeParam === 'continuous';
  const pmFreshness = modeParam === 'pm_freshness' || modeParam === 'price_memory';

  after(async () => {
    try {
      if (pmFreshness) {
        const report = await runPriceMemoryFreshnessCycle({
          maxTargets: 12,
          persist: true,
        });
        console.log(
          '[bot-ingest:pm_freshness:after]',
          JSON.stringify({
            cycle_id: report.cycle_id,
            observeOk: report.observeOk,
            snapshotsPersisted: report.snapshotsPersisted,
            losses: report.losses,
            largestLoss: report.largestLoss,
            diagnosis: report.diagnosis,
            censusAfter: report.censusAfter,
          }),
        );
        return;
      }

      if (continuous) {
        const report = await runContinuousDiscoveryCycle({
          dryRun: true,
          allowStagingMint: false,
          excludeEnvUrls: true,
          includeStickyNearReady: true,
        });
        console.log(
          '[bot-ingest:continuous:after]',
          JSON.stringify({
            cycle_id: report.cycle_id,
            dryRun: report.dryRun,
            funnel: report.funnel,
            sources: report.sources,
            automation_rate: report.automation.automation_rate,
            terminal_rate: report.automation.terminal_rate,
            operator_verdict: report.operator_verdict,
          }),
        );
        return;
      }

      const report = await runIngestCycleForProfile(profile);
      console.log(
        '[bot-ingest:after]',
        JSON.stringify({
          profile: report.profile,
          ok: report.ok,
          runMode: report.runMode,
          inserted: report.summary.inserted,
          skipped: report.summary.skipped,
          duplicate: report.summary.duplicate,
          errors: report.summary.errors,
          skipReasonCounts: report.summary.skipReasonCounts ?? null,
          sourceStats: report.summary.sourceStats ?? null,
        }),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[bot-ingest:after]', message);
    }
  });

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      mode: pmFreshness ? 'pm_freshness' : continuous ? 'continuous' : 'standard',
      note: pmFreshness
        ? 'Price Memory freshness (observe-only) en segundo plano. Logs [bot-ingest:pm_freshness:after].'
        : continuous
          ? 'Continuous discovery (dry-run) programado en segundo plano. Revisa logs [bot-ingest:continuous:after].'
          : 'Ingesta programada en segundo plano (evita timeout del proveedor de cron). Revisa logs de Vercel o Admin → Trabajo.',
    },
    {
      status: 202,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
