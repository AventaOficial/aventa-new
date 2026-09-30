import { processOfferBatchChunk } from '@/lib/offers/batch';
import { isUuid, jsonError, jsonOk, requireBatchAuth } from '@/lib/offers/batch/http';

export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  const auth = await requireBatchAuth(request);
  if ('error' in auth) return auth.error;
  const { batchId } = await context.params;
  if (!isUuid(batchId)) return jsonError('Lote no válido.', 400);
  const body = await request.json().catch(() => ({}));
  const itemIds = Array.isArray(body?.itemIds)
    ? body.itemIds.filter((id: unknown): id is string => typeof id === 'string' && isUuid(id))
    : undefined;
  const chunk = await processOfferBatchChunk({
    supabase: auth.supabase,
    batchId,
    actorId: auth.user.id,
    itemIds,
  });
  return jsonOk({ ok: true, ...chunk });
}
