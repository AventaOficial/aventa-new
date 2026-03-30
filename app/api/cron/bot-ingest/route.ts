import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { runIngestCycle } from '@/lib/bots/ingest';

/**
 * GET: ejecuta un ciclo de ingesta de ofertas (bot).
 * Protegido con CRON_SECRET (Authorization: Bearer, x-cron-secret o ?secret=).
 *
 * Configuración: ver .env.example (BOT_INGEST_*).
 */
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  try {
    const report = await runIngestCycle();
    return NextResponse.json(report, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[bot-ingest]', message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
