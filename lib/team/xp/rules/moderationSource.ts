import type { SupabaseClient } from '@supabase/supabase-js';
import type { ModerationOfferDecidedEvent } from './types';

type BatchLink = { id: string; submittedBy: string };

/** Ítem de lote que creó la oferta y quién envió ese lote. */
export async function loadBatchLinks(
  supabase: SupabaseClient,
  offerIds: readonly string[],
): Promise<Map<string, BatchLink>> {
  const links = new Map<string, BatchLink>();
  if (offerIds.length === 0) return links;
  const { data: items, error } = await supabase
    .from('offer_batch_items')
    .select('id, batch_id, offer_id')
    .in('offer_id', [...offerIds]);
  if (error || !items) return links;

  const rows = items.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const id = 'id' in row && typeof row.id === 'string' ? row.id : null;
    const batchId = 'batch_id' in row && typeof row.batch_id === 'string' ? row.batch_id : null;
    const offerId = 'offer_id' in row && typeof row.offer_id === 'string' ? row.offer_id : null;
    return id && batchId && offerId ? [{ id, batchId, offerId }] : [];
  });
  if (rows.length === 0) return links;

  const { data: batches, error: batchError } = await supabase
    .from('offer_batches')
    .select('id, created_by')
    .in('id', [...new Set(rows.map((row) => row.batchId))]);
  if (batchError || !batches) return links;

  const creators = new Map<string, string>();
  for (const batch of batches) {
    if (!batch || typeof batch !== 'object') continue;
    const id = 'id' in batch && typeof batch.id === 'string' ? batch.id : null;
    const createdBy = 'created_by' in batch && typeof batch.created_by === 'string' ? batch.created_by : null;
    if (id && createdBy) creators.set(id, createdBy);
  }
  for (const row of rows) {
    const submittedBy = creators.get(row.batchId);
    if (submittedBy) links.set(row.offerId, { id: row.id, submittedBy });
  }
  return links;
}

/**
 * Construye el evento desde filas persistidas. El actor es el usuario autenticado
 * que la ruta ya validó; el body solo aporta la decisión que ya se guardó.
 */
export async function moderationDecisionEvent(
  supabase: SupabaseClient,
  input: {
    logId: string;
    actorUserId: string;
    offerId: string;
    decision: 'approved' | 'rejected';
    previousStatus: string;
    offerAuthorId: string | null;
    bulk: boolean;
  },
): Promise<ModerationOfferDecidedEvent> {
  const links = input.decision === 'approved' ? await loadBatchLinks(supabase, [input.offerId]) : new Map<string, BatchLink>();
  return {
    type: 'moderation.offer_decided',
    eventRef: `moderation_logs:${input.logId}`,
    actorKind: 'human',
    actorUserId: input.actorUserId,
    offerId: input.offerId,
    decision: input.decision,
    previousStatus: input.previousStatus,
    offerAuthorId: input.offerAuthorId,
    bulk: input.bulk,
    batchItem: links.get(input.offerId) ?? null,
  };
}
