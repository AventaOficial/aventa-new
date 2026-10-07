import type { SupabaseClient } from '@supabase/supabase-js';
import { inferStoreFromHostname } from '@/lib/inferStoreFromHostname';
import type { ValidCandidate } from '@/lib/mcp/candidates';
import { appendBatchEvent, recountBatch } from '@/lib/offers/batch/service';
import { ingestOfferObservation } from '@/lib/offers/ingestion/ingestOfferObservation';

/**
 * El lote queda como registro de la importación.
 * La oferta nace pending y entra a la cola de moderación en el mismo envío.
 * Un producto que ya existe no se reescribe ni se duplica.
 */
export async function enqueueHunterOffer(
  supabase: SupabaseClient,
  params: {
    batchId: string;
    createdBy: string;
    machineClientId: string;
    candidate: ValidCandidate;
  },
): Promise<{ offerId: string | null }> {
  const { batchId, createdBy, machineClientId, candidate } = params;
  let store = 'Tienda';
  try {
    store = inferStoreFromHostname(new URL(candidate.url).hostname) ?? store;
  } catch {
    /* keep */
  }
  const description = (candidate.note?.trim() || candidate.title).slice(0, 4000);
  const result = await ingestOfferObservation(supabase, {
    createdBy,
    source: 'mcp:hunter',
    onDuplicate: 'reject',
    forceLoteTag: false,
    recordSubmissionCount: false,
    body: {
      title: candidate.title,
      store,
      hasDiscount: candidate.originalPrice != null,
      price: candidate.price,
      original_price: candidate.originalPrice,
      offer_url: candidate.url,
      description,
    },
  });

  if (!result.ok) {
    if (result.httpStatus >= 500) console.error('[mcp] hunter offer not queued:', result.httpStatus);
    return { offerId: null };
  }

  const now = new Date().toISOString();
  await supabase
    .from('offer_batch_items')
    .update({
      status: 'APPROVED',
      offer_id: result.offerId,
      store,
      title: candidate.title,
      price: candidate.price,
      original_price: candidate.originalPrice,
      approved_at: now,
      updated_at: now,
      error_code: null,
    })
    .eq('batch_id', batchId)
    .eq('identity_key', candidate.identityKey)
    .eq('status', 'INGESTED');

  await appendBatchEvent(supabase, {
    batchId,
    actorId: createdBy,
    action: 'queued_for_moderation',
    toStatus: 'APPROVED',
    payload: {
      offer_id: result.offerId,
      machine_client_id: machineClientId,
      record_only: true,
    },
  });
  await recountBatch(supabase, batchId);
  return { offerId: result.offerId };
}
