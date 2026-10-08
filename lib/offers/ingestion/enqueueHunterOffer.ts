import type { SupabaseClient } from '@supabase/supabase-js';
import { inferStoreFromHostname } from '@/lib/inferStoreFromHostname';
import type { ValidCandidate } from '@/lib/mcp/candidates';
import { appendBatchEvent, recountBatch } from '@/lib/offers/batch/service';
import { ingestOfferObservation } from '@/lib/offers/ingestion/ingestOfferObservation';
import {
  machineOfferReadyForModeration,
  prepareMachineCandidateOffer,
} from '@/lib/offers/ingestion/prepareMachineCandidateOffer';

/**
 * El lote queda como registro de la importación.
 * La oferta pending solo nace si el extractor ya dejó título, precio e imagen.
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
  const prepared = await prepareMachineCandidateOffer(candidate.url);
  if (!prepared.product) {
    const now = new Date().toISOString();
    await supabase
      .from('offer_batch_items')
      .update({
        status: 'ERROR',
        error_code: 'NOT_PRODUCT_URL',
        warnings: prepared.imageFailure ? [prepared.imageFailure] : [],
        evidence: {
          page_kind: prepared.pageKind,
          image_failure: prepared.imageFailure,
          enrichment: 'skipped_non_product',
        },
        updated_at: now,
      })
      .eq('batch_id', batchId)
      .eq('identity_key', candidate.identityKey)
      .eq('status', 'INGESTED');
    await appendBatchEvent(supabase, {
      batchId,
      actorId: createdBy,
      action: 'enrichment_rejected',
      toStatus: 'ERROR',
      payload: { page_kind: prepared.pageKind, image_failure: prepared.imageFailure },
    });
    await recountBatch(supabase, batchId);
    return { offerId: null };
  }

  if (!machineOfferReadyForModeration(prepared)) {
    const now = new Date().toISOString();
    await supabase
      .from('offer_batch_items')
      .update({
        status: 'NEEDS_REVIEW',
        error_code: prepared.imageFailure ?? 'EXTRACTION_FAILED',
        warnings: [prepared.imageFailure ?? 'NO_IMAGES'],
        title: prepared.title,
        store: prepared.store || store,
        price: prepared.price,
        original_price: prepared.originalPrice,
        images: prepared.imageUrl ? [prepared.imageUrl, ...prepared.imageUrls] : [],
        evidence: {
          page_kind: prepared.pageKind,
          image_failure: prepared.imageFailure,
          enrichment: 'withheld_until_complete',
        },
        updated_at: now,
      })
      .eq('batch_id', batchId)
      .eq('identity_key', candidate.identityKey)
      .eq('status', 'INGESTED');
    await appendBatchEvent(supabase, {
      batchId,
      actorId: createdBy,
      action: 'enrichment_withheld',
      toStatus: 'NEEDS_REVIEW',
      payload: { image_failure: prepared.imageFailure, page_kind: prepared.pageKind },
    });
    await recountBatch(supabase, batchId);
    return { offerId: null };
  }

  const price = prepared.price ?? candidate.price;
  const originalPrice = prepared.originalPrice ?? candidate.originalPrice;
  const result = await ingestOfferObservation(supabase, {
    createdBy,
    source: 'mcp:hunter',
    onDuplicate: 'reject',
    forceLoteTag: false,
    recordSubmissionCount: false,
    offerExtras: {
      bot_meta: {
        enrichment: {
          page_kind: prepared.pageKind,
          retailer: prepared.retailer,
          currency: prepared.currency,
          image_failure: prepared.imageFailure,
          fetched: prepared.fetched,
        },
      },
    },
    body: {
      title: prepared.title || candidate.title,
      store: prepared.store || store,
      hasDiscount: originalPrice != null,
      price,
      original_price: originalPrice,
      ...(prepared.imageUrl ? { image_url: prepared.imageUrl, image_urls: prepared.imageUrls } : {}),
      ...(prepared.category ? { category: prepared.category } : {}),
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
      title: prepared.title || candidate.title,
      price,
      original_price: originalPrice,
      images: prepared.imageUrl ? [prepared.imageUrl, ...prepared.imageUrls] : [],
      warnings: prepared.imageFailure ? [prepared.imageFailure] : [],
      approved_at: now,
      updated_at: now,
      error_code: prepared.imageFailure,
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
