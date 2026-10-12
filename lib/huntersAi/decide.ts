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
import { HUNTER_BULK_MAX, rejectionLabel, type RejectionReasonId } from '@/lib/huntersAi/contract';

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
  // REJECTED es terminal (moderador, memoria negativa o quality gate). Reprocesarlo aquí
  // reabriría un candidato que un control ya cerró.
  if (item.status === 'REJECTED') {
    return {
      ok: false,
      httpStatus: 409,
      code: 'REJECTED_TERMINAL',
      message: 'Este candidato ya fue rechazado y no se puede aprobar.',
      item,
    };
  }
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

export type BulkTarget = { batchId: string; itemId: string };

/** ok: decisión aplicada · idempotent: ya estaba así · conflict: otra decisión o un duplicado lo impide · needs_review: sigue bloqueado para revisión. */
export type BulkItemOutcome = 'ok' | 'idempotent' | 'conflict' | 'needs_review' | 'error';

export type BulkItemResult = BulkTarget & {
  outcome: BulkItemOutcome;
  code: string | null;
  message: string | null;
  offerId: string | null;
};

export type BulkDecisionResult = { ok: number; failed: number; results: BulkItemResult[] };

export function classifyDecision(result: DecideResult): BulkItemOutcome {
  if (result.ok) return result.code === 'IDEMPOTENT' ? 'idempotent' : 'ok';
  if (result.httpStatus === 409) return 'conflict';
  if (result.item?.status === 'NEEDS_REVIEW' || result.code === 'MISSING_REQUIRED_FIELDS') return 'needs_review';
  return 'error';
}

/** Cada ítem una sola vez, en el orden recibido, hasta HUNTER_BULK_MAX. */
export function uniqueTargets(items: BulkTarget[]): BulkTarget[] {
  const seen = new Set<string>();
  const out: BulkTarget[] = [];
  for (const t of items) {
    if (seen.has(t.itemId)) continue;
    seen.add(t.itemId);
    out.push(t);
    if (out.length >= HUNTER_BULK_MAX) break;
  }
  return out;
}

async function runBulk(
  items: BulkTarget[],
  decide: (target: BulkTarget) => Promise<DecideResult>,
): Promise<BulkDecisionResult> {
  const results: BulkItemResult[] = [];
  for (const target of uniqueTargets(items)) {
    let result: DecideResult;
    try {
      result = await decide(target);
    } catch (e) {
      result = { ok: false, httpStatus: 500, code: 'UNEXPECTED', message: e instanceof Error ? e.message : 'Error' };
    }
    results.push({
      ...target,
      outcome: classifyDecision(result),
      code: result.code ?? null,
      message: result.message ?? null,
      offerId: result.item?.offer_id ?? null,
    });
  }
  const ok = results.filter((r) => r.outcome === 'ok' || r.outcome === 'idempotent').length;
  return { ok, failed: results.length - ok, results };
}

export async function rejectHunterCandidates(params: {
  supabase: SupabaseClient;
  actorId: string;
  items: BulkTarget[];
  reasonId: string;
  note?: string | null;
}): Promise<BulkDecisionResult> {
  return runBulk(params.items, (target) =>
    rejectHunterCandidate({
      supabase: params.supabase,
      actorId: params.actorId,
      batchId: target.batchId,
      itemId: target.itemId,
      reasonId: params.reasonId,
      note: params.note,
    }),
  );
}

/**
 * Cada aprobación pasa por `approveHunterCandidate`: crea como mucho una oferta `pending`.
 * Publicar sigue siendo una decisión aparte en la cola de moderación.
 */
export async function approveHunterCandidates(params: {
  supabase: SupabaseClient;
  actorId: string;
  items: BulkTarget[];
}): Promise<BulkDecisionResult> {
  return runBulk(params.items, (target) =>
    approveHunterCandidate({
      supabase: params.supabase,
      actorId: params.actorId,
      batchId: target.batchId,
      itemId: target.itemId,
    }),
  );
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
