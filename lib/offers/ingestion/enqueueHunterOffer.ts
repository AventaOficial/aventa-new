import type { SupabaseClient } from '@supabase/supabase-js';
import { inferStoreFromHostname } from '@/lib/inferStoreFromHostname';
import type { ValidCandidate } from '@/lib/mcp/candidates';
import { appendBatchEvent, recountBatch } from '@/lib/offers/batch/service';
import { ingestOfferObservation } from '@/lib/offers/ingestion/ingestOfferObservation';
import {
  machineOfferReadyForModeration,
  prepareMachineCandidateOffer,
  type PreparedMachineCandidate,
} from '@/lib/offers/ingestion/prepareMachineCandidateOffer';
import {
  evaluateMachineCandidateAdmission,
  MACHINE_CANDIDATE_POLICY_VERSION,
} from '@/lib/offers/ingestion/machineCandidatePolicy';
import { isSuppressedByNegativeMemory } from '@/lib/discovery/negativeMemory';
import { isLowQualityTitle } from '@/lib/bots/ingest/isLowQualityTitle';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { reviewHunterComment, type HunterCommentReviewResult } from '@/lib/offers/hunterCommentReview';
import { compareWithListPrice } from '@/lib/offers/listPriceComparison';
import { buildBotOfferDescription } from '@/lib/bots/ingest/buildBotOfferDescription';
import { OFFER_DESCRIPTION_MAX } from '@/lib/contracts/offers';

/** `moderator_comment` admite 500; el prefijo cabe con la nota MCP completa (280). */
const MCP_INTERNAL_NOTE_MAX = 470;
export const MCP_INTERNAL_NOTE_PREFIX = 'Nota interna del bot: ';

export type EnqueueHunterOfferDeps = {
  prepare?: (url: string) => Promise<PreparedMachineCandidate>;
  negativeMemory?: typeof isSuppressedByNegativeMemory;
  ingest?: typeof ingestOfferObservation;
  lowQualityTitle?: (title: string) => boolean;
};

async function settleItem(
  supabase: SupabaseClient,
  params: {
    batchId: string;
    identityKey: string;
    actorId: string;
    update: Record<string, unknown>;
    action: string;
    toStatus: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await supabase
    .from('offer_batch_items')
    .update({ ...params.update, updated_at: new Date().toISOString() })
    .eq('batch_id', params.batchId)
    .eq('identity_key', params.identityKey)
    .eq('status', 'INGESTED');
  await appendBatchEvent(supabase, {
    batchId: params.batchId,
    actorId: params.actorId,
    action: params.action,
    toStatus: params.toStatus,
    payload: params.payload,
  });
  await recountBatch(supabase, params.batchId);
}

/**
 * El lote queda como registro de la importación.
 * La oferta pending solo nace si el producto no está suprimido por memoria negativa, el
 * extractor dejó título, precio e imagen, y pasa `evaluateMachineCandidateAdmission`.
 * El precio de lista solo viene de la página; el que declara el bot queda como pista.
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
  deps: EnqueueHunterOfferDeps = {},
): Promise<{ offerId: string | null }> {
  const { batchId, createdBy, machineClientId, candidate } = params;
  const base = { batchId, identityKey: candidate.identityKey, actorId: createdBy };

  const nm = await (deps.negativeMemory ?? isSuppressedByNegativeMemory)({ supabase, url: candidate.url });
  if (nm.suppressed) {
    const now = new Date().toISOString();
    // REJECTED es terminal; ERROR se podría reprocesar como si fuera un fallo transitorio.
    await settleItem(supabase, {
      ...base,
      update: {
        status: 'REJECTED',
        error_code: 'NEGATIVE_MEMORY',
        rejection_reason: `negative_memory:${nm.reason ?? 'SUPPRESS'}`.slice(0, 300),
        rejected_at: now,
        evidence: { negative_memory: { reason: nm.reason, fingerprint: nm.fingerprint } },
      },
      action: 'negative_memory_suppressed',
      toStatus: 'REJECTED',
      payload: { reason: nm.reason, fingerprint: nm.fingerprint, machine_client_id: machineClientId },
    });
    return { offerId: null };
  }

  let store = 'Tienda';
  try {
    store = inferStoreFromHostname(new URL(candidate.url).hostname) ?? store;
  } catch {
    /* keep */
  }
  // `note` es contexto para el equipo (evidencia, dudas de precio). Nunca va a la descripción pública.
  const internalNote = candidate.note?.trim() ? candidate.note.trim().slice(0, MCP_INTERNAL_NOTE_MAX) : null;
  const prepared = await (deps.prepare ?? prepareMachineCandidateOffer)(candidate.url);
  if (!prepared.product) {
    await settleItem(supabase, {
      ...base,
      update: {
        status: 'ERROR',
        error_code: 'NOT_PRODUCT_URL',
        warnings: prepared.imageFailure ? [prepared.imageFailure] : [],
        evidence: {
          page_kind: prepared.pageKind,
          image_failure: prepared.imageFailure,
          enrichment: 'skipped_non_product',
        },
      },
      action: 'enrichment_rejected',
      toStatus: 'ERROR',
      payload: { page_kind: prepared.pageKind, image_failure: prepared.imageFailure },
    });
    return { offerId: null };
  }

  const extracted = {
    title: prepared.title,
    store: prepared.store || store,
    price: prepared.price,
    original_price: prepared.originalPrice,
    images: prepared.imageUrl ? [prepared.imageUrl, ...prepared.imageUrls] : [],
  };

  if (!machineOfferReadyForModeration(prepared)) {
    await settleItem(supabase, {
      ...base,
      update: {
        status: 'NEEDS_REVIEW',
        error_code: prepared.imageFailure ?? 'EXTRACTION_FAILED',
        warnings: [prepared.imageFailure ?? 'NO_IMAGES'],
        ...extracted,
        evidence: {
          page_kind: prepared.pageKind,
          image_failure: prepared.imageFailure,
          enrichment: 'withheld_until_complete',
        },
      },
      action: 'enrichment_withheld',
      toStatus: 'NEEDS_REVIEW',
      payload: { image_failure: prepared.imageFailure, page_kind: prepared.pageKind },
    });
    return { offerId: null };
  }

  const admission = evaluateMachineCandidateAdmission({
    url: candidate.url,
    prepared,
    botDeclared: { price: candidate.price, originalPrice: candidate.originalPrice },
    isLowQualityTitle: deps.lowQualityTitle ?? ((title) => isLowQualityTitle(title, loadBotIngestConfig())),
  });
  if (admission.outcome !== 'admit') {
    const rejected = admission.outcome === 'reject';
    const now = new Date().toISOString();
    await settleItem(supabase, {
      ...base,
      update: {
        status: rejected ? 'REJECTED' : 'NEEDS_REVIEW',
        error_code: admission.code,
        ...(rejected ? { rejection_reason: `quality:${admission.code}`, rejected_at: now } : {}),
        ...extracted,
        evidence: { page_kind: prepared.pageKind, policy: MACHINE_CANDIDATE_POLICY_VERSION, admission: admission.code },
      },
      action: rejected ? 'quality_rejected' : 'quality_withheld',
      toStatus: rejected ? 'REJECTED' : 'NEEDS_REVIEW',
      payload: { code: admission.code, policy: MACHINE_CANDIDATE_POLICY_VERSION },
    });
    return { offerId: null };
  }

  const { price, originalPrice } = admission;
  const title = prepared.title || candidate.title;
  const hunterComment: HunterCommentReviewResult = candidate.hunterCommentInvalid
    ? { comment: null, review: { status: 'dropped', reason: 'INVALID_FORMAT' } }
    : reviewHunterComment(candidate.hunterComment, {
        title,
        comparison: compareWithListPrice(price, originalPrice),
      });
  const description = buildBotOfferDescription(
    {
      canonicalUrl: candidate.url,
      title,
      store: prepared.store || store,
      imageUrl: prepared.imageUrl ?? '',
      discountPrice: price,
      originalPrice,
      discountPercent: null,
    },
    prepared.category ?? null,
  ).slice(0, OFFER_DESCRIPTION_MAX);
  const result = await (deps.ingest ?? ingestOfferObservation)(supabase, {
    createdBy,
    source: 'mcp:hunter',
    onDuplicate: 'reject',
    forceLoteTag: false,
    recordSubmissionCount: false,
    offerExtras: {
      ...(internalNote ? { moderator_comment: `${MCP_INTERNAL_NOTE_PREFIX}${internalNote}` } : {}),
      bot_meta: {
        ...(internalNote ? { internal_note: internalNote } : {}),
        enrichment: {
          page_kind: prepared.pageKind,
          retailer: prepared.retailer,
          currency: prepared.currency,
          image_failure: prepared.imageFailure,
          fetched: prepared.fetched,
        },
        price_policy: {
          version: MACHINE_CANDIDATE_POLICY_VERSION,
          kind: admission.kind,
          price_source: admission.priceSource,
          original_price_provenance: admission.originalPriceProvenance,
          reference_dropped: admission.referenceDropped,
          bot_declared: admission.botDeclared,
          negative_memory: nm.reason,
          identity: admission.identity,
        },
        ...(hunterComment.review.status !== 'absent'
          ? {
              hunter_comment: {
                status: hunterComment.review.status,
                reason: hunterComment.review.reason,
                submitted: candidate.hunterComment,
              },
            }
          : {}),
      },
    },
    body: {
      title,
      store: prepared.store || store,
      hasDiscount: originalPrice != null,
      price,
      original_price: originalPrice,
      ...(prepared.imageUrl ? { image_url: prepared.imageUrl, image_urls: prepared.imageUrls } : {}),
      ...(prepared.category ? { category: prepared.category } : {}),
      offer_url: candidate.url,
      description,
      ...(hunterComment.comment ? { hunter_comment: hunterComment.comment } : {}),
    },
  });

  if (!result.ok) {
    if (result.httpStatus >= 500) console.error('[mcp] hunter offer not queued:', result.httpStatus);
    const now = new Date().toISOString();
    const duplicate = result.httpStatus === 409;
    const status = duplicate ? 'REJECTED' : result.httpStatus === 400 ? 'NEEDS_REVIEW' : 'ERROR';
    const code = duplicate ? 'DUPLICATE_OFFER' : result.httpStatus === 400 ? 'WRITER_REJECTED' : 'WRITER_FAILED';
    await settleItem(supabase, {
      ...base,
      update: {
        status,
        error_code: code,
        ...extracted,
        ...(duplicate
          ? {
              duplicate_status: 'duplicate',
              duplicate_offer_id: result.duplicate_offer_id ?? null,
              rejection_reason: `duplicate:${result.duplicate_status ?? 'unknown'}`,
              rejected_at: now,
            }
          : {}),
        evidence: {
          page_kind: prepared.pageKind,
          policy: MACHINE_CANDIDATE_POLICY_VERSION,
          writer: { http_status: result.httpStatus, issues: result.issues ?? null },
        },
      },
      action: duplicate ? 'duplicate_linked' : 'writer_failed',
      toStatus: status,
      payload: {
        code,
        http_status: result.httpStatus,
        duplicate_offer_id: duplicate ? (result.duplicate_offer_id ?? null) : null,
        machine_client_id: machineClientId,
      },
    });
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
      images: extracted.images,
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
      price_kind: admission.kind,
    },
  });
  await recountBatch(supabase, batchId);
  return { offerId: result.offerId };
}
