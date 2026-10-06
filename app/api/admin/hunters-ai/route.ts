import { HUNTER_SORTS, HUNTER_QUEUE_STATUSES, type HunterQueueStatus, type HunterSort } from '@/lib/huntersAi/contract';
import { approveHunterCandidate, editHunterCandidate, rejectHunterCandidate, rejectHunterCandidates } from '@/lib/huntersAi/decide';
import { loadHunterQueue } from '@/lib/huntersAi/queue';
import { isUuid, jsonError, jsonOk, requireBatchAuth } from '@/lib/offers/batch/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function asStatus(value: string | null): HunterQueueStatus | 'ALL' {
  if (value === 'ALL') return 'ALL';
  if (value && (HUNTER_QUEUE_STATUSES as readonly string[]).includes(value)) return value as HunterQueueStatus;
  return 'PENDING';
}

function asSort(value: string | null): HunterSort {
  if (value && (HUNTER_SORTS as readonly string[]).includes(value)) return value as HunterSort;
  return 'score';
}

export async function GET(request: Request) {
  const auth = await requireBatchAuth(request);
  if ('error' in auth) return auth.error;
  const url = new URL(request.url);
  const page = Number(url.searchParams.get('page') ?? '1');
  try {
    const body = await loadHunterQueue(auth.supabase, {
      status: asStatus(url.searchParams.get('status')),
      category: url.searchParams.get('category'),
      retailer: url.searchParams.get('retailer'),
      hunter: url.searchParams.get('hunter'),
      runId: url.searchParams.get('run'),
      sort: asSort(url.searchParams.get('sort')),
      page: Number.isFinite(page) ? page : 1,
    });
    return jsonOk(body);
  } catch (err) {
    console.error('[hunters-ai] list failed');
    return jsonError(err instanceof Error ? err.message : 'No se pudo leer la cola.', 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireBatchAuth(request);
  if ('error' in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const action = typeof body?.action === 'string' ? body.action : '';

  if (action === 'reject_many') {
    const items = Array.isArray(body?.items)
      ? body.items
          .filter((row: unknown) => row && typeof row === 'object')
          .map((row: { batchId?: unknown; itemId?: unknown }) => ({
            batchId: typeof row.batchId === 'string' ? row.batchId : '',
            itemId: typeof row.itemId === 'string' ? row.itemId : '',
          }))
          .filter((row: { batchId: string; itemId: string }) => isUuid(row.batchId) && isUuid(row.itemId))
      : [];
    if (items.length === 0) return jsonError('Selecciona candidatos.', 400);
    if (typeof body?.reasonId !== 'string' || !body.reasonId) return jsonError('El rechazo necesita una razón.', 400);
    const result = await rejectHunterCandidates({
      supabase: auth.supabase,
      actorId: auth.user.id,
      items,
      reasonId: body.reasonId,
      note: typeof body?.note === 'string' ? body.note : null,
    });
    return jsonOk(result);
  }

  const batchId = typeof body?.batchId === 'string' ? body.batchId : '';
  const itemId = typeof body?.itemId === 'string' ? body.itemId : '';
  if (!isUuid(batchId) || !isUuid(itemId)) return jsonError('Candidato no válido.', 400);

  if (action === 'approve') {
    const result = await approveHunterCandidate({ supabase: auth.supabase, batchId, itemId, actorId: auth.user.id });
    if (!result.ok) return jsonError(result.message, result.httpStatus, { code: result.code });
    return jsonOk({ ok: true, itemId, offerId: result.item.offer_id ?? null });
  }
  if (action === 'reject') {
    if (typeof body?.reasonId !== 'string' || !body.reasonId) return jsonError('El rechazo necesita una razón.', 400);
    const result = await rejectHunterCandidate({
      supabase: auth.supabase,
      batchId,
      itemId,
      actorId: auth.user.id,
      reasonId: body.reasonId,
      note: typeof body?.note === 'string' ? body.note : null,
    });
    if (!result.ok) return jsonError(result.message, result.httpStatus, { code: result.code });
    return jsonOk({ ok: true, itemId });
  }
  if (action === 'edit') {
    const result = await editHunterCandidate({
      supabase: auth.supabase,
      batchId,
      itemId,
      actorId: auth.user.id,
      title: body?.title,
      category: body?.category,
      description: body?.description,
      whyGoodDeal: body?.whyGoodDeal,
    });
    if (!result.ok) return jsonError(result.message, result.httpStatus, { code: result.code });
    return jsonOk({ ok: true, itemId });
  }
  return jsonError('Acción no válida.', 400);
}
