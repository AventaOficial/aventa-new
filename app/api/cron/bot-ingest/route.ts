import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { runIngestCycleForProfile } from '@/lib/bots/ingest/runIngestCycle';
import { runContinuousDiscoveryCycle } from '@/lib/hunter/discovery';

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
 * `?mode=continuous` → Day 3 continuous discovery authority (dry-run; no mint from cron).
 * Default → legacy runIngestCycleForProfile.
 *
 * Respuesta **202**: el trabajo sigue en segundo plano. El reporte completo va a logs de Vercel / panel Trabajo (POST run-now sigue devolviendo 200 con JSON).
 *
 * Programación: en Hobby no va en vercel.json; Pro o cron externo (cada ~15 min) o manual. Ver .env.example.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  const profile = request.nextUrl.searchParams.get('profile') === 'mega' ? 'mega' : 'standard';
  const continuous = request.nextUrl.searchParams.get('mode') === 'continuous';

  after(async () => {
    try {
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
        })
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
      mode: continuous ? 'continuous' : 'standard',
      note: continuous
        ? 'Continuous discovery (dry-run) programado en segundo plano. Revisa logs [bot-ingest:continuous:after].'
        : 'Ingesta programada en segundo plano (evita timeout del proveedor de cron). Revisa logs de Vercel o Admin → Trabajo.',
    },
    {
      status: 202,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
