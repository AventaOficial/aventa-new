import { bridgeHunterCandidatesToBatch, processOfferBatchChunk } from '@/lib/offers/batch';
import { jsonError, jsonOk, requireBatchAuth } from '@/lib/offers/batch/http';

export const maxDuration = 60;

/** Staff autenticado envía un run explícito a un lote. Sin runId no lee el ledger histórico. No publica. */
export async function POST(request: Request) {
  const auth = await requireBatchAuth(request);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === 'string' ? body.name : null;
  const runId = typeof body?.runId === 'string' ? body.runId.trim() : '';
  if (!runId) return jsonError('Indica el run que quieres procesar.', 400);
  const result = await bridgeHunterCandidatesToBatch({
    supabase: auth.supabase,
    createdBy: auth.user.id,
    name,
    runId,
  });
  if (!result.ok) return jsonError(result.error, result.httpStatus);
  if (!result.batch) {
    return jsonOk({
      ok: true,
      batch: null,
      inserted: 0,
      skipped: result.skipped,
    });
  }

  const processed = await processOfferBatchChunk({
    supabase: auth.supabase,
    batchId: result.batch.id,
    actorId: auth.user.id,
  });

  return jsonOk({
    ok: true,
    batch: processed.batch ?? result.batch,
    inserted: result.inserted,
    skipped: result.skipped,
    processed: {
      claimed: processed.claimed,
      processed: processed.processed,
      remaining: processed.remaining,
    },
  });
}
