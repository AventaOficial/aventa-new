import { getOfferBatch, listOfferBatchEvents, listOfferBatchItems, syncItemsWithOffers } from '@/lib/offers/batch';
import { isUuid, jsonError, jsonOk, requireBatchAuth } from '@/lib/offers/batch/http';

export async function GET(
  request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  const auth = await requireBatchAuth(request);
  if ('error' in auth) return auth.error;
  const { batchId } = await context.params;
  if (!isUuid(batchId)) return jsonError('Lote no válido.', 400);
  const batch = await getOfferBatch(auth.supabase, batchId);
  if (!batch) return jsonError('Lote no encontrado.', 404);
  const rawItems = await listOfferBatchItems(auth.supabase, batchId);
  const synced = await syncItemsWithOffers(auth.supabase, batchId, rawItems);
  const events = await listOfferBatchEvents(auth.supabase, batchId, 80);
  const latest = synced.changed ? await getOfferBatch(auth.supabase, batchId) : batch;
  return jsonOk({ ok: true, batch: latest ?? batch, items: synced.items, events });
}
