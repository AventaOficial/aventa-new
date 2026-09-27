import { createOfferBatch, listOfferBatches } from '@/lib/offers/batch';
import { jsonError, jsonOk, requireBatchAuth } from '@/lib/offers/batch/http';

export const maxDuration = 30;

export async function GET(request: Request) {
  const auth = await requireBatchAuth(request);
  if ('error' in auth) return auth.error;
  const batches = await listOfferBatches(auth.supabase, 40);
  return jsonOk({ ok: true, batches });
}

export async function POST(request: Request) {
  const auth = await requireBatchAuth(request);
  if ('error' in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const text = typeof body?.text === 'string' ? body.text : '';
  const name = typeof body?.name === 'string' ? body.name : null;
  const result = await createOfferBatch({
    supabase: auth.supabase,
    createdBy: auth.user.id,
    name,
    text,
  });
  if (!result.ok) return jsonError(result.error, result.httpStatus);
  if (!result.batch) {
    return jsonError('Esas ofertas ya están en un lote abierto.', 409);
  }
  return jsonOk({
    ok: true,
    batch: result.batch,
    inserted: result.inserted,
    duplicatesInText: result.duplicatesInText,
    truncated: result.truncated,
    openConflicts: result.openConflicts,
  });
}
