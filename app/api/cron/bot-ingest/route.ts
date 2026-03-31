import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { runIngestCycle } from '@/lib/bots/ingest';

/** Boost matutino puede superar el default de 10s en Vercel; ajustar según plan. */
export const maxDuration = 300;

/**
 * GET: ciclo de ingesta v3 (score, filtros ML/Amazon, auto-aprobación, tope diario).
 * Protegido con CRON_SECRET (Authorization: Bearer, x-cron-secret o ?secret=).
 *
 * Programación: en Hobby no va en vercel.json; Pro o cron externo (cada ~15 min) o manual. Ver .env.example.
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
