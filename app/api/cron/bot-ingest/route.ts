import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { runIngestCycle } from '@/lib/bots/ingest';

/**
 * La ingesta puede tardar minutos (ML, sleeps). Cron externo (p. ej. cron-job.org) suele cortar a ~30s.
 * Respondemos enseguida y ejecutamos con `after()` hasta maxDuration en Vercel.
 */
export const maxDuration = 300;

/**
 * GET: ciclo de ingesta v3 (score, filtros ML/Amazon, auto-aprobación, tope diario).
 * Protegido con CRON_SECRET (Authorization: Bearer, x-cron-secret o ?secret=).
 *
 * Respuesta **202**: el trabajo sigue en segundo plano. El reporte completo va a logs de Vercel / panel Trabajo (POST run-now sigue devolviendo 200 con JSON).
 *
 * Programación: en Hobby no va en vercel.json; Pro o cron externo (cada ~15 min) o manual. Ver .env.example.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  after(async () => {
    try {
      const report = await runIngestCycle();
      console.log(
        '[bot-ingest:after]',
        JSON.stringify({
          ok: report.ok,
          runMode: report.runMode,
          inserted: report.summary.inserted,
          skipped: report.summary.skipped,
          duplicate: report.summary.duplicate,
          errors: report.summary.errors,
          skipReasonCounts: report.summary.skipReasonCounts ?? null,
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
      note:
        'Ingesta programada en segundo plano (evita timeout del proveedor de cron). Revisa logs de Vercel o Admin → Trabajo.',
    },
    {
      status: 202,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
