import { recountBatch, runBulkBatchAction, type BulkAction } from '@/lib/offers/batch';
import { isUuid, jsonError, jsonOk, requireBatchAuth } from '@/lib/offers/batch/http';

export const maxDuration = 120;

const ACTIONS = new Set<BulkAction>(['approve', 'reject', 'reprocess']);

export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  const auth = await requireBatchAuth(request);
  if ('error' in auth) return auth.error;
  const { batchId } = await context.params;
  if (!isUuid(batchId)) return jsonError('Lote no válido.', 400);
  const body = await request.json().catch(() => ({}));
  const action = body?.action as BulkAction;
  if (!ACTIONS.has(action)) return jsonError('Acción masiva no válida.', 400);
  const itemIds = Array.isArray(body?.itemIds)
    ? body.itemIds.filter((id: unknown): id is string => typeof id === 'string' && isUuid(id))
    : [];
  if (itemIds.length === 0) return jsonError('Selecciona al menos un ítem.', 400);
  const reason = typeof body?.reason === 'string' ? body.reason : null;
  const summary = await runBulkBatchAction({
    supabase: auth.supabase,
    batchId,
    actorId: auth.user.id,
    action,
    itemIds,
    reason,
  });
  const batch = await recountBatch(auth.supabase, batchId);
  return jsonOk({ ok: true, summary, batch });
}
