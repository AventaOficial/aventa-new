import {
  approveOfferBatchItem,
  changeOfferBatchItemUrl,
  editOfferBatchItem,
  getOfferBatchItem,
  recountBatch,
  rejectOfferBatchItem,
  reprocessOfferBatchItem,
} from '@/lib/offers/batch';
import { isUuid, jsonError, jsonOk, requireBatchAuth } from '@/lib/offers/batch/http';

export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string; itemId: string }> },
) {
  const auth = await requireBatchAuth(request);
  if ('error' in auth) return auth.error;
  const { batchId, itemId } = await context.params;
  if (!isUuid(batchId) || !isUuid(itemId)) return jsonError('Ítem no válido.', 400);
  const item = await getOfferBatchItem(auth.supabase, batchId, itemId);
  if (!item) return jsonError('Ítem no encontrado.', 404);

  const body = await request.json().catch(() => ({}));
  const action = typeof body?.action === 'string' ? body.action : '';
  let result;
  if (action === 'approve') {
    result = await approveOfferBatchItem({ supabase: auth.supabase, item, actorId: auth.user.id });
  } else if (action === 'reject') {
    result = await rejectOfferBatchItem({
      supabase: auth.supabase,
      item,
      actorId: auth.user.id,
      reason: typeof body?.reason === 'string' ? body.reason : null,
    });
  } else if (action === 'reprocess') {
    result = await reprocessOfferBatchItem({ supabase: auth.supabase, item, actorId: auth.user.id });
  } else if (action === 'edit') {
    result = await editOfferBatchItem({
      supabase: auth.supabase,
      item,
      actorId: auth.user.id,
      fields: {
        title: body?.title,
        store: body?.store,
        price: body?.price,
        original_price: body?.original_price,
        images: body?.images,
        category: body?.category,
        hint_note: body?.hint_note,
      },
    });
  } else if (action === 'change_url') {
    result = await changeOfferBatchItemUrl({
      supabase: auth.supabase,
      item,
      actorId: auth.user.id,
      newUrl: typeof body?.url === 'string' ? body.url : '',
    });
  } else {
    return jsonError('Acción no válida.', 400);
  }

  await recountBatch(auth.supabase, batchId);
  if (!result.ok) {
    return jsonError(result.message, result.httpStatus, { code: result.code, item: result.item ?? item });
  }
  return jsonOk({ ok: true, item: result.item, code: result.code ?? null, message: result.message ?? null });
}
