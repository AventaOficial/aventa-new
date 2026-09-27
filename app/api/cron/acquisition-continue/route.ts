import { NextRequest, NextResponse } from 'next/server';
import { runAcquisitionContinuation } from '@/lib/acquisition/continueBatches';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { createServerClient } from '@/lib/supabase/server';

export const maxDuration = 60;

/**
 * Continúa lotes con ítems INGESTED. Un presupuesto corto por ejecución.
 * Vercel llama con CRON_SECRET. No es un endpoint público.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const report = await runAcquisitionContinuation(createServerClient());
  console.info(
    '[acquisition-continue]',
    JSON.stringify({
      ok: report.ok,
      batchesFound: report.batchesFound,
      batchesVisited: report.batchesVisited,
      deferredBatches: report.deferredBatches,
      chunks: report.chunks,
      claimed: report.claimed,
      processed: report.processed,
      remaining: report.remaining,
      ready: report.ready,
      needsReview: report.needsReview,
      errored: report.errored,
      chunkFailures: report.chunkFailures,
      reclaimed: report.reclaimed,
      elapsedMs: report.elapsedMs,
      stoppedBecause: report.stoppedBecause,
    }),
  );
  return NextResponse.json(report, { status: report.ok ? 200 : 500 });
}
