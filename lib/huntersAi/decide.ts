import type { SupabaseClient } from '@supabase/supabase-js';
import { canApproveFrom, canReprocessFrom } from '@/lib/offers/batch/contract';
import {
  approveOfferBatchItem,
  editOfferBatchItem,
  getOfferBatchItem,
  recountBatch,
  rejectOfferBatchItem,
  reprocessOfferBatchItem,
  type ItemActionResult,
} from '@/lib/offers/batch/service';
import { rejectionLabel, type RejectionReasonId } from '@/lib/huntersAi/contract';

/**
 * Decisiones editoriales. Publicar usa approveOfferBatchItem (writer existente).
 * MCP no aprueba. Esta capa no escribe economía.
 */

export type DecideResult = ItemActionResult;

async function loadItem(supabase: SupabaseClient, batchId: string, itemId: string) {
  const item = await getOfferBatchItem(supabase, batchId, itemId);
  if (!item) return null;
  const { data } = await supabase.from('offer_batches').select('machine_client_id').eq('id', batchId).maybeSingle();
  const machine = (data as { machine_client_id?: string | null } | null)?.machine_client_id;
  if (!machine) return null;
  return item;
}

export async function approveHunterCandidate(params: {
  supabase: SupabaseClient;
  batchId: string;
  itemId: string;
  actorId: string;
}): Promise<DecideResult> {
  const { supabase, batchId, itemId, actorId } = params;
  let item = await loadItem(supabase, batchId, itemId);
  if (!item) return { ok: false, httpStatus: 404, code: 'NOT_FOUND', message: 'Candidato no encontrado.' };
  if (item.duplicate_status === 'duplicate' && item.duplicate_offer_id) {
    return {
      ok: false,
      httpStatus: 409,
      code: 'DUPLICATE_OFFER',
      message: 'Este producto ya está en Aventa. No se crea otra oferta.',
      item,
    };
  }
  if (!canApproveFrom(item.status) && canReprocessFrom(item.status, Boolean(item.offer_id))) {
    const processed = await reprocessOfferBatchItem({ supabase, item, actorId });
    if (!processed.ok || !processed.item) return processed;
    item = processed.item;
  }
  const approved = await approveOfferBatchItem({ supabase, item, actorId });
  await recountBatch(supabase, batchId);
  return approved;
}

export async function rejectHunterCandidate(params: {
  supabase: SupabaseClient;
  batchId: string;
  itemId: string;
  actorId: string;
  reasonId: RejectionReasonId | string;
  note?: string | null;
}): Promise<DecideResult> {
  const item = await loadItem(params.supabase, params.batchId, params.itemId);
  if (!item) return { ok: false, httpStatus: 404, code: 'NOT_FOUND', message: 'Candidato no encontrado.' };
  const label = rejectionLabel(params.reasonId) ?? 'Otra';
  const note = typeof params.note === 'string' ? params.note.trim().slice(0, 240) : '';
  const reason = note ? `${label}: ${note}` : label;
  const rejected = await rejectOfferBatchItem({
    supabase: params.supabase,
    item,
    actorId: params.actorId,
    reason,
  });
  await recountBatch(params.supabase, params.batchId);
  return rejected;
}

export async function rejectHunterCandidates(params: {
  supabase: SupabaseClient;
  actorId: string;
  items: Array<{ batchId: string; itemId: string }>;
  reasonId: string;
  note?: string | null;
}): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (const target of params.items.slice(0, 50)) {
    const result = await rejectHunterCandidate({
      supabase: params.supabase,
      actorId: params.actorId,
      batchId: target.batchId,
      itemId: target.itemId,
      reasonId: params.reasonId,
      note: params.note,
    });
    if (result.ok) ok += 1;
    else failed += 1;
  }
  return { ok, failed };
}

export async function editHunterCandidate(params: {
  supabase: SupabaseClient;
  batchId: string;
  itemId: string;
  actorId: string;
  title?: string | null;
  category?: string | null;
  description?: string | null;
  whyGoodDeal?: string | null;
}): Promise<DecideResult> {
  const item = await loadItem(params.supabase, params.batchId, params.itemId);
  if (!item) return { ok: false, httpStatus: 404, code: 'NOT_FOUND', message: 'Candidato no encontrado.' };
  const edited = await editOfferBatchItem({
    supabase: params.supabase,
    item,
    actorId: params.actorId,
    fields: {
      title: params.title,
      category: params.category,
      editorial_description: params.description,
      why_good_deal: params.whyGoodDeal,
    },
  });
  if (edited.ok) await recountBatch(params.supabase, params.batchId);
  return edited;
}
