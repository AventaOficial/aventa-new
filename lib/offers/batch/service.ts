import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { extractOfferFromUrl } from '@/lib/offers/offerExtraction/extractOfferFromUrl';
import { validatePublicOfferUrl } from '@/lib/server/validatePublicOfferUrl';
import { findDuplicateOfferByUrl } from '@/lib/offers/findDuplicateOffer';
import { createCommunityOfferPending } from '@/lib/offers/createCommunityOffer';
import { OFFER_DESCRIPTION_MAX, OFFER_MAX_IMAGES } from '@/lib/contracts/offers';
import { inferStoreFromHostname } from '@/lib/inferStoreFromHostname';
import {
  batchAffiliatePlan,
  offerBatchIdentityKey,
  parsePastedOfferDump,
} from '@/lib/offers/batchPaste';
import {
  OFFER_BATCH_LEASE_MS,
  OFFER_BATCH_MAX_ITEMS,
  OFFER_BATCH_PROCESS_CHUNK,
  canApproveFrom,
  canEditFrom,
  canRejectFrom,
  canReprocessFrom,
  canTransition,
  countBatchItems,
  deriveBatchStatus,
  evaluateBatchExtraction,
  summarizeBulk,
  type BatchCounters,
  type BatchItemStatus,
  type BatchStatus,
  type BulkItemResult,
  type BulkSummary,
} from './contract';

/* ---------------------------------------------------------------------------
 * Tipos de fila
 * ------------------------------------------------------------------------- */

export type OfferBatchRow = {
  id: string;
  name: string | null;
  status: BatchStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  source_text_hash: string | null;
  meta: Record<string, unknown>;
} & BatchCounters;

export type OfferBatchItemRow = {
  id: string;
  batch_id: string;
  position: number;
  status: BatchItemStatus;
  identity_key: string;
  source_url: string;
  normalized_url: string | null;
  canonical_url: string | null;
  retailer: string | null;
  store: string | null;
  title: string | null;
  images: string[];
  price: number | null;
  original_price: number | null;
  discount_percent: number | null;
  category: string | null;
  hint_title: string | null;
  hint_price: number | null;
  hint_original_price: number | null;
  hint_note: string | null;
  extraction_status: 'success' | 'partial' | 'failed' | null;
  validation_status: 'ok' | 'invalid_url' | 'blocked_host' | 'missing_fields' | null;
  duplicate_status: 'none' | 'duplicate' | 'in_batch' | null;
  duplicate_offer_id: string | null;
  quality_status: string | null;
  error_code: string | null;
  warnings: string[];
  evidence: Record<string, unknown>;
  attempts: number;
  lease_expires_at: string | null;
  offer_id: string | null;
  rejection_reason: string | null;
  processed_at: string | null;
  approved_at: string | null;
  published_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OfferBatchEventRow = {
  id: number;
  batch_id: string;
  item_id: string | null;
  actor_id: string | null;
  action: string;
  from_status: string | null;
  to_status: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

const ITEM_COLUMNS = '*';

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toStrArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
}

export function normalizeItemRow(raw: Record<string, unknown>): OfferBatchItemRow {
  return {
    ...(raw as OfferBatchItemRow),
    images: toStrArray(raw.images),
    warnings: toStrArray(raw.warnings),
    evidence: (raw.evidence && typeof raw.evidence === 'object' ? raw.evidence : {}) as Record<string, unknown>,
    price: toNum(raw.price),
    original_price: toNum(raw.original_price),
    discount_percent: toNum(raw.discount_percent),
    hint_price: toNum(raw.hint_price),
    hint_original_price: toNum(raw.hint_original_price),
    attempts: toNum(raw.attempts) ?? 0,
    position: toNum(raw.position) ?? 0,
  };
}

function normalizeBatchRow(raw: Record<string, unknown>): OfferBatchRow {
  const r = raw as OfferBatchRow;
  return {
    ...r,
    meta: (raw.meta && typeof raw.meta === 'object' ? raw.meta : {}) as Record<string, unknown>,
    total_items: toNum(raw.total_items) ?? 0,
    pending_items: toNum(raw.pending_items) ?? 0,
    ready_items: toNum(raw.ready_items) ?? 0,
    review_items: toNum(raw.review_items) ?? 0,
    error_items: toNum(raw.error_items) ?? 0,
    approved_items: toNum(raw.approved_items) ?? 0,
    published_items: toNum(raw.published_items) ?? 0,
    rejected_items: toNum(raw.rejected_items) ?? 0,
    duplicate_items: toNum(raw.duplicate_items) ?? 0,
  };
}

/* ---------------------------------------------------------------------------
 * Auditoría
 * ------------------------------------------------------------------------- */

export async function appendBatchEvent(
  supabase: SupabaseClient,
  event: {
    batchId: string;
    itemId?: string | null;
    actorId?: string | null;
    action: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from('offer_batch_item_events').insert({
    batch_id: event.batchId,
    item_id: event.itemId ?? null,
    actor_id: event.actorId ?? null,
    action: event.action,
    from_status: event.fromStatus ?? null,
    to_status: event.toStatus ?? null,
    payload: event.payload ?? {},
  });
  if (error) console.error('[offer-batch] event insert failed:', error.message);
}

/* ---------------------------------------------------------------------------
 * Contadores
 * ------------------------------------------------------------------------- */

export async function recountBatch(supabase: SupabaseClient, batchId: string): Promise<OfferBatchRow | null> {
  const { data: items } = await supabase
    .from('offer_batch_items')
    .select('status, duplicate_status')
    .eq('batch_id', batchId);
  const { data: batch } = await supabase.from('offer_batches').select('*').eq('id', batchId).maybeSingle();
  if (!batch) return null;
  const current = normalizeBatchRow(batch as Record<string, unknown>);
  const counters = countBatchItems(
    ((items ?? []) as Array<{ status: BatchItemStatus; duplicate_status: string | null }>),
  );
  const status = deriveBatchStatus(counters, current.status);
  const patch: Record<string, unknown> = {
    ...counters,
    status,
    updated_at: new Date().toISOString(),
  };
  if (counters.pending_items === 0 && counters.total_items > 0 && current.processing_started_at && !current.processing_completed_at) {
    patch.processing_completed_at = new Date().toISOString();
  }
  if (counters.pending_items > 0 && current.processing_completed_at) {
    patch.processing_completed_at = null;
  }
  const { data: updated } = await supabase
    .from('offer_batches')
    .update(patch)
    .eq('id', batchId)
    .select('*')
    .maybeSingle();
  return updated ? normalizeBatchRow(updated as Record<string, unknown>) : { ...current, ...counters, status };
}

/* ---------------------------------------------------------------------------
 * Crear lote
 * ------------------------------------------------------------------------- */

const URL_RE = /https?:\/\/[^\s<>"'`)\]\}]+/gi;

export type BatchUrlCandidate = {
  url: string;
  identityKey: string;
};

/**
 * Extrae URLs https de un texto, deduplicadas por identidad (ASIN / item ML / host+path).
 * Igual criterio que `extractOfferUrlsFromText`, pero con tope de lote y reporte de repetidos.
 */
export function extractBatchUrls(text: string, max = OFFER_BATCH_MAX_ITEMS): {
  urls: BatchUrlCandidate[];
  duplicatesInText: number;
  truncated: number;
} {
  const seen = new Set<string>();
  const out: BatchUrlCandidate[] = [];
  let duplicatesInText = 0;
  let truncated = 0;
  const matches = String(text ?? '').match(URL_RE) ?? [];
  for (const raw of matches) {
    const href = raw.trim().replace(/[.,;:!?)]+$/g, '').replace(/^http:/i, 'https:');
    if (!href.startsWith('https://')) continue;
    try {
      const u = new URL(href);
      if (u.protocol !== 'https:' || !u.hostname.includes('.')) continue;
    } catch {
      continue;
    }
    const key = offerBatchIdentityKey(href);
    if (seen.has(key)) {
      duplicatesInText++;
      continue;
    }
    if (out.length >= max) {
      truncated++;
      continue;
    }
    seen.add(key);
    out.push({ url: href, identityKey: key });
  }
  return { urls: out, duplicatesInText, truncated };
}

export type CreateBatchResult =
  | {
      ok: true;
      batch: OfferBatchRow | null;
      inserted: number;
      duplicatesInText: number;
      truncated: number;
      /** Ítems que el índice de identidad abierta rechazó. */
      openConflicts: number;
      conflictIdentityKeys: string[];
    }
  | { ok: false; error: string; httpStatus: 400 | 409 | 500; code?: 'IDEMPOTENCY_KEY_TAKEN' };

/** Pistas estructuradas por identidad (MCP). Sustituyen al parseo del texto pegado. */
export type OfferBatchStructuredHint = {
  title: string | null;
  price: number | null;
  originalPrice: number | null;
  note: string | null;
};

/**
 * Lote propuesto por un cliente máquina MCP.
 * Con 0 ítems insertados el lote se conserva archivado para que la idempotencia responda igual.
 */
export type OfferBatchMachineOrigin = {
  machineClientId: string;
  idempotencyKey: string;
  payloadHash: string;
  runId: string | null;
  meta?: Record<string, unknown>;
};

function isUniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  return /duplicate key value violates unique constraint/i.test(error.message ?? '');
}

/** Linaje de un candidato Hunter. No sustituye a `decision`. */
export type OfferBatchItemLineage = {
  runId: string;
  candidateKey: string;
  sourceUrl: string;
  productFingerprint?: string | null;
  canonicalUrl?: string | null;
  affiliateUrl?: string | null;
  /** Atribución de Acquisition Network. No sustituye run_id ni candidate_key. */
  acquisition?: {
    sourceKey: string;
    sourceType: string;
    scoutId: string | null;
    scoutName?: string | null;
    actorUserId?: string | null;
    submissionId: string;
    externalRunId: string | null;
    originalUrl: string;
    discoveredAt: string;
  } | null;
};

export async function createOfferBatch(params: {
  supabase: SupabaseClient;
  createdBy: string;
  name?: string | null;
  text: string;
  /** Identidad de producto → linaje. El pegado manual no lo envía. */
  lineageByIdentityKey?: Readonly<Record<string, OfferBatchItemLineage>>;
  /** URLs ya validadas (MCP). Si viene, no se extrae nada del texto. */
  urls?: readonly BatchUrlCandidate[];
  structuredHintsByIdentityKey?: Readonly<Record<string, OfferBatchStructuredHint>>;
  machineOrigin?: OfferBatchMachineOrigin;
}): Promise<CreateBatchResult> {
  const { supabase, createdBy, machineOrigin } = params;
  const text = String(params.text ?? '');
  const extracted = params.urls
    ? { urls: [...params.urls], duplicatesInText: 0, truncated: 0 }
    : extractBatchUrls(text);
  const { urls, duplicatesInText, truncated } = extracted;
  if (urls.length === 0 && !machineOrigin) {
    return { ok: false, httpStatus: 400, error: 'No encontré enlaces https en el texto.' };
  }

  const hints = params.urls ? [] : parsePastedOfferDump(text);
  const hintByKey = new Map(hints.map((h) => [offerBatchIdentityKey(h.url), h]));
  const name = typeof params.name === 'string' && params.name.trim() ? params.name.trim().slice(0, 120) : null;
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 32);

  const { data: batchRow, error: batchError } = await supabase
    .from('offer_batches')
    .insert({
      name,
      status: 'draft',
      created_by: createdBy,
      source_text_hash: hash,
      total_items: urls.length,
      pending_items: urls.length,
      meta: {
        duplicates_in_text: duplicatesInText,
        truncated,
        source_chars: text.length,
        ...(machineOrigin ? { mcp: machineOrigin.meta ?? {} } : {}),
      },
      ...(machineOrigin
        ? {
            machine_client_id: machineOrigin.machineClientId,
            mcp_idempotency_key: machineOrigin.idempotencyKey,
            mcp_payload_hash: machineOrigin.payloadHash,
            mcp_run_id: machineOrigin.runId,
          }
        : {}),
    })
    .select('*')
    .single();
  if (batchError || !batchRow) {
    if (machineOrigin && isUniqueViolation(batchError)) {
      return { ok: false, httpStatus: 409, code: 'IDEMPOTENCY_KEY_TAKEN', error: 'La llave de idempotencia ya existe.' };
    }
    console.error('[offer-batch] create batch failed:', batchError?.message);
    return { ok: false, httpStatus: 500, error: 'No se pudo crear el lote.' };
  }
  const batchId = (batchRow as { id: string }).id;

  const rows = urls.map((u, i) => {
    const structured = params.structuredHintsByIdentityKey?.[u.identityKey];
    const hint = hintByKey.get(u.identityKey);
    const lineage = params.lineageByIdentityKey?.[u.identityKey];
    return {
      batch_id: batchId,
      position: i + 1,
      status: 'INGESTED',
      identity_key: u.identityKey,
      source_url: u.url,
      hint_title: structured ? structured.title : hint?.title ?? null,
      hint_price: structured ? structured.price : hint?.price ?? null,
      hint_original_price: structured ? structured.originalPrice : hint?.originalPrice ?? null,
      hint_note: structured ? structured.note : hint?.why ?? null,
      store: structured ? null : hint?.store ?? null,
      ...(lineage
        ? {
            evidence: {
              hunter: {
                run_id: lineage.runId,
                candidate_key: lineage.candidateKey,
                source_url: lineage.sourceUrl,
                product_fingerprint: lineage.productFingerprint ?? null,
                canonical_url: lineage.canonicalUrl ?? null,
                affiliate_url: lineage.affiliateUrl ?? null,
                ...(lineage.acquisition
                  ? {
                      acquisition: {
                        source_key: lineage.acquisition.sourceKey,
                        source_type: lineage.acquisition.sourceType,
                        scout_id: lineage.acquisition.scoutId,
                        scout_name: lineage.acquisition.scoutName ?? null,
                        actor_user_id: lineage.acquisition.actorUserId ?? null,
                        submission_id: lineage.acquisition.submissionId,
                        external_run_id: lineage.acquisition.externalRunId,
                        original_url: lineage.acquisition.originalUrl,
                        discovered_at: lineage.acquisition.discoveredAt,
                      },
                    }
                  : {}),
              },
            },
          }
        : {}),
    };
  });
  // Una fila por INSERT. El índice parcial offer_batch_items_open_identity_uidx
  // rechaza la segunda identidad abierta aunque el otro request ya haya pasado el SELECT.
  let inserted = 0;
  const conflictIdentityKeys: string[] = [];
  for (const row of rows) {
    const { error: itemError } = await supabase.from('offer_batch_items').insert(row);
    if (!itemError) {
      inserted++;
      continue;
    }
    if (isUniqueViolation(itemError)) {
      conflictIdentityKeys.push(row.identity_key);
      continue;
    }
    console.error('[offer-batch] insert items failed:', itemError.message);
    if (inserted === 0) {
      await supabase.from('offer_batches').delete().eq('id', batchId);
      return { ok: false, httpStatus: 500, error: 'No se pudieron guardar los enlaces del lote.' };
    }
    break;
  }

  if (inserted === 0 && machineOrigin) {
    const { data: archived } = await supabase
      .from('offer_batches')
      .update({ status: 'archived', total_items: 0, pending_items: 0, updated_at: new Date().toISOString() })
      .eq('id', batchId)
      .select('*')
      .maybeSingle();
    await appendBatchEvent(supabase, {
      batchId,
      actorId: createdBy,
      action: 'batch_created',
      payload: { items: 0, open_conflicts: conflictIdentityKeys.length, origin: 'machine', machine_client_id: machineOrigin.machineClientId },
    });
    return {
      ok: true,
      batch: normalizeBatchRow((archived ?? batchRow) as Record<string, unknown>),
      inserted: 0,
      duplicatesInText,
      truncated,
      openConflicts: conflictIdentityKeys.length,
      conflictIdentityKeys,
    };
  }

  if (inserted === 0) {
    await supabase.from('offer_batches').delete().eq('id', batchId);
    return {
      ok: true,
      batch: null,
      inserted: 0,
      duplicatesInText,
      truncated,
      openConflicts: conflictIdentityKeys.length,
      conflictIdentityKeys,
    };
  }

  await appendBatchEvent(supabase, {
    batchId,
    actorId: createdBy,
    action: 'batch_created',
    payload: {
      items: inserted,
      duplicates_in_text: duplicatesInText,
      truncated,
      open_conflicts: conflictIdentityKeys.length,
      name,
      ...(machineOrigin ? { origin: 'machine', machine_client_id: machineOrigin.machineClientId } : {}),
    },
  });

  const batch = (await recountBatch(supabase, batchId)) ?? normalizeBatchRow(batchRow as Record<string, unknown>);
  return {
    ok: true,
    batch,
    inserted,
    duplicatesInText,
    truncated,
    openConflicts: conflictIdentityKeys.length,
    conflictIdentityKeys,
  };
}

/* ---------------------------------------------------------------------------
 * Lectura
 * ------------------------------------------------------------------------- */

export async function listOfferBatches(supabase: SupabaseClient, limit = 30): Promise<OfferBatchRow[]> {
  const { data, error } = await supabase
    .from('offer_batches')
    .select('*')
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(100, limit)));
  if (error) {
    console.error('[offer-batch] list failed:', error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeBatchRow);
}

export async function getOfferBatch(supabase: SupabaseClient, batchId: string): Promise<OfferBatchRow | null> {
  const { data } = await supabase.from('offer_batches').select('*').eq('id', batchId).maybeSingle();
  return data ? normalizeBatchRow(data as Record<string, unknown>) : null;
}

export async function listOfferBatchItems(supabase: SupabaseClient, batchId: string): Promise<OfferBatchItemRow[]> {
  const { data, error } = await supabase
    .from('offer_batch_items')
    .select(ITEM_COLUMNS)
    .eq('batch_id', batchId)
    .order('position', { ascending: true });
  if (error) {
    console.error('[offer-batch] list items failed:', error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeItemRow);
}

export async function getOfferBatchItem(
  supabase: SupabaseClient,
  batchId: string,
  itemId: string,
): Promise<OfferBatchItemRow | null> {
  const { data } = await supabase
    .from('offer_batch_items')
    .select(ITEM_COLUMNS)
    .eq('batch_id', batchId)
    .eq('id', itemId)
    .maybeSingle();
  return data ? normalizeItemRow(data as Record<string, unknown>) : null;
}

export async function listOfferBatchEvents(
  supabase: SupabaseClient,
  batchId: string,
  limit = 200,
): Promise<OfferBatchEventRow[]> {
  const { data } = await supabase
    .from('offer_batch_item_events')
    .select('*')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as OfferBatchEventRow[];
}

/**
 * PUBLISHED / REJECTED se derivan del estado real de `offers` (fuente de verdad).
 * La publicación siempre ocurre vía /api/admin/moderate-offer; aquí sólo reflejamos.
 */
export async function syncItemsWithOffers(
  supabase: SupabaseClient,
  batchId: string,
  items: OfferBatchItemRow[],
): Promise<{ items: OfferBatchItemRow[]; changed: number }> {
  const linked = items.filter((it) => it.offer_id && it.status === 'APPROVED');
  if (linked.length === 0) return { items, changed: 0 };
  const { data: offers } = await supabase
    .from('offers')
    .select('id, status, rejection_reason, deleted_at')
    .in('id', linked.map((it) => it.offer_id as string));
  const byId = new Map(
    ((offers ?? []) as Array<{ id: string; status: string | null; rejection_reason: string | null; deleted_at: string | null }>).map(
      (o) => [o.id, o],
    ),
  );
  let changed = 0;
  const now = new Date().toISOString();
  const next = await Promise.all(
    items.map(async (it) => {
      if (!it.offer_id || it.status !== 'APPROVED') return it;
      const offer = byId.get(it.offer_id);
      if (!offer) return it;
      let to: BatchItemStatus | null = null;
      const patch: Record<string, unknown> = { updated_at: now };
      if ((offer.status === 'approved' || offer.status === 'published') && !offer.deleted_at) {
        to = 'PUBLISHED';
        patch.published_at = now;
      } else if (offer.status === 'rejected') {
        to = 'REJECTED';
        patch.rejected_at = now;
        patch.rejection_reason = offer.rejection_reason ?? 'Rechazada en moderación';
      }
      if (!to || !canTransition(it.status, to)) return it;
      patch.status = to;
      const { data: updated } = await supabase
        .from('offer_batch_items')
        .update(patch)
        .eq('id', it.id)
        .eq('status', 'APPROVED')
        .select(ITEM_COLUMNS)
        .maybeSingle();
      if (!updated) return it;
      changed++;
      await appendBatchEvent(supabase, {
        batchId,
        itemId: it.id,
        action: to === 'PUBLISHED' ? 'sync_published' : 'sync_rejected',
        fromStatus: it.status,
        toStatus: to,
        payload: { offer_id: it.offer_id, offer_status: offer.status },
      });
      return normalizeItemRow(updated as Record<string, unknown>);
    }),
  );
  if (changed > 0) await recountBatch(supabase, batchId);
  return { items: next, changed };
}

/* ---------------------------------------------------------------------------
 * Procesamiento
 * ------------------------------------------------------------------------- */

type ExtractionAttempt = Awaited<ReturnType<typeof extractOfferFromUrl>>;

function isTransientFailure(outcome: ExtractionAttempt): boolean {
  if (outcome.body.extraction_status !== 'failed') return false;
  if (outcome.adapter.blockedByHostPolicy) return false;
  if (outcome.body.reason === 'invalid_url') return false;
  const d = outcome.body.diagnostics;
  if (!d) return true;
  return !d.htmlFetched && !d.mlApiHit;
}

/**
 * Procesa UN ítem: validar → extraer (extracción compartida) → dedupe → evaluar → persistir.
 * Idempotente: sólo actúa si la fila sigue en PROCESSING (lease del llamador).
 */
export async function processBatchItem(
  supabase: SupabaseClient,
  item: OfferBatchItemRow,
  actorId: string | null,
): Promise<OfferBatchItemRow> {
  const startedAt = Date.now();
  const attempts = (item.attempts ?? 0) + 1;

  const urlCheck = validatePublicOfferUrl(item.source_url);
  let outcome: ExtractionAttempt | null = null;
  let invalidUrl = !urlCheck.ok;
  if (urlCheck.ok) {
    outcome = await extractOfferFromUrl(urlCheck.href);
    if (isTransientFailure(outcome)) {
      // Un reintento inmediato cubre timeouts puntuales de la tienda.
      outcome = await extractOfferFromUrl(urlCheck.href);
    }
    if (outcome.body.reason === 'invalid_url' && !outcome.adapter.blockedByHostPolicy) invalidUrl = true;
  }

  const core = outcome?.core ?? null;
  const body = outcome?.body ?? null;
  const adapter = outcome?.adapter ?? null;
  const normalizedUrl = core?.normalizedUrl ?? adapter?.normalizedUrl ?? (urlCheck.ok ? urlCheck.href : null);
  const canonicalUrl = core?.canonicalUrl ?? adapter?.canonicalUrl ?? null;
  const dedupeUrl = canonicalUrl ?? normalizedUrl;

  let duplicate: { offerId: string; status: string | null; kind: string } | null = null;
  let duplicateLookupFailed = false;
  if (dedupeUrl && !invalidUrl && !adapter?.blockedByHostPolicy) {
    try {
      const dup = await findDuplicateOfferByUrl(supabase, dedupeUrl);
      if (dup) duplicate = { offerId: dup.id, status: dup.status, kind: dup.kind };
    } catch (err) {
      duplicateLookupFailed = true;
      console.error('[offer-batch] duplicate lookup failed:', err);
    }
  }

  const images = (core?.media.images ?? body?.images ?? []).slice(0, OFFER_MAX_IMAGES);
  const title = core?.product.title ?? body?.title ?? null;
  const price = core?.pricing.currentPrice ?? body?.suggested_discount_price ?? null;
  const originalPrice = core?.pricing.originalPrice ?? body?.suggested_original_price ?? null;
  const offerUrlForAffiliate = canonicalUrl ?? normalizedUrl ?? item.source_url;
  const outboundUrl = core?.outboundUrl || offerUrlForAffiliate;

  const evaluation = evaluateBatchExtraction({
    extractionStatus: body?.extraction_status ?? 'failed',
    title,
    images,
    price,
    originalPrice,
    provider: core?.provider ?? adapter?.provider ?? 'unknown',
    identityConfidence: body?.diagnostics?.offerResolvedConfidence ?? 'low',
    hasIdentity: Boolean(core?.identity.productIdentity || core?.identity.productFingerprint || adapter?.productIdentity || adapter?.productFingerprint),
    blockedByHostPolicy: Boolean(adapter?.blockedByHostPolicy),
    invalidUrl,
    hintPrice: item.hint_price,
    hintOriginalPrice: item.hint_original_price,
    duplicate: duplicate ? { offerId: duplicate.offerId, status: duplicate.status } : null,
    storeHasAffiliate: batchAffiliatePlan(offerUrlForAffiliate) === 'auto_tag',
  });

  let store = body?.store ?? item.store ?? null;
  if (!store && normalizedUrl) {
    try {
      store = inferStoreFromHostname(new URL(normalizedUrl).hostname) ?? null;
    } catch {
      /* keep */
    }
  }

  const persistedStatus = duplicateLookupFailed && evaluation.status === 'READY' ? 'NEEDS_REVIEW' : evaluation.status;
  const persistedWarnings = duplicateLookupFailed
    ? [...evaluation.warnings, 'DUPLICATE_LOOKUP_FAILED']
    : evaluation.warnings;

  const now = new Date().toISOString();
  const evidence = {
    ...(item.evidence ?? {}),
    last_run: {
      at: now,
      duration_ms: Date.now() - startedAt,
      attempt: attempts,
      actor_id: actorId,
    },
    extraction: body
      ? {
          status: body.extraction_status,
          reason: body.reason,
          missing: body.missing,
          error: body.error ?? null,
          diagnostics: outcome?.core.diagnostics ?? body.diagnostics ?? null,
          warnings: outcome?.core.extraction.warnings ?? [],
          seller: outcome?.core.merchant.seller ?? null,
          availability: outcome?.core.availability.status ?? null,
          image_count: images.length,
          image_note: adapter?.imageNote ?? null,
          price_source: core?.pricing.priceSource ?? adapter?.priceSource ?? 'none',
          original_price_source: core?.pricing.originalPriceSource ?? adapter?.originalPriceSource ?? 'none',
        }
      : { status: 'failed', reason: 'invalid_url' },
    identity: adapter
      ? {
          provider: core?.provider ?? adapter.provider,
          product_identity: core?.identity.productIdentity ?? adapter.productIdentity,
          product_fingerprint: core?.identity.productFingerprint ?? adapter.productFingerprint,
          confidence: body?.diagnostics?.offerResolvedConfidence ?? null,
        }
      : null,
    duplicate,
    url_validation: urlCheck.ok ? 'ok' : urlCheck.error,
    outbound_url: outboundUrl && outboundUrl !== offerUrlForAffiliate ? outboundUrl : offerUrlForAffiliate,
    canonical_url: canonicalUrl,
    normalized_url: normalizedUrl,
  };

  const patch: Record<string, unknown> = {
    status: persistedStatus,
    normalized_url: normalizedUrl,
    canonical_url: canonicalUrl,
    retailer: core?.provider ?? adapter?.provider ?? null,
    store,
    title,
    images,
    price,
    original_price: evaluation.originalPrice,
    discount_percent: evaluation.discountPercent,
    category: body?.suggested_category ?? null,
    extraction_status: body?.extraction_status ?? 'failed',
    validation_status: evaluation.validationStatus,
    duplicate_status: evaluation.duplicateStatus,
    duplicate_offer_id: duplicate?.offerId ?? null,
    quality_status: persistedStatus === 'READY' ? 'ready' : persistedStatus === 'ERROR' ? 'error' : 'review',
    error_code: evaluation.errorCode,
    warnings: persistedWarnings,
    evidence,
    attempts,
    lease_expires_at: null,
    processed_at: now,
    updated_at: now,
  };

  const { data: updated, error } = await supabase
    .from('offer_batch_items')
    .update(patch)
    .eq('id', item.id)
    .eq('status', 'PROCESSING')
    .select(ITEM_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error('[offer-batch] item update failed:', error.message);
    await supabase
      .from('offer_batch_items')
      .update({ status: 'ERROR', error_code: 'UNKNOWN', lease_expires_at: null, attempts, updated_at: now })
      .eq('id', item.id)
      .eq('status', 'PROCESSING');
  }

  await appendBatchEvent(supabase, {
    batchId: item.batch_id,
    itemId: item.id,
    actorId,
    action: 'processed',
    fromStatus: 'PROCESSING',
    toStatus: persistedStatus,
    payload: {
      attempt: attempts,
      error_code: evaluation.errorCode,
      warnings: persistedWarnings,
      duplicate_offer_id: duplicate?.offerId ?? null,
      canonical_url: canonicalUrl,
    },
  });

  return updated ? normalizeItemRow(updated as Record<string, unknown>) : { ...item, ...(patch as Partial<OfferBatchItemRow>) } as OfferBatchItemRow;
}

export type ProcessChunkResult = {
  claimed: number;
  processed: number;
  remaining: number;
  reclaimed: number;
  batch: OfferBatchRow | null;
  items: OfferBatchItemRow[];
};

/**
 * Reclama hasta `limit` ítems INGESTED con lease y los procesa en secuencia.
 * Seguro ante concurrencia: sólo procesa filas que el UPDATE condicional reclamó.
 */
export async function processOfferBatchChunk(params: {
  supabase: SupabaseClient;
  batchId: string;
  actorId: string | null;
  limit?: number;
  itemIds?: string[];
}): Promise<ProcessChunkResult> {
  const { supabase, batchId, actorId } = params;
  const limit = Math.max(1, Math.min(OFFER_BATCH_PROCESS_CHUNK, params.limit ?? OFFER_BATCH_PROCESS_CHUNK));
  const nowIso = new Date().toISOString();

  // Lease vencido → vuelve a INGESTED (crash del servidor / timeout).
  const { data: reclaimedRows } = await supabase
    .from('offer_batch_items')
    .update({ status: 'INGESTED', lease_expires_at: null, updated_at: nowIso })
    .eq('batch_id', batchId)
    .eq('status', 'PROCESSING')
    .lt('lease_expires_at', nowIso)
    .select('id');
  const reclaimed = reclaimedRows?.length ?? 0;

  let query = supabase
    .from('offer_batch_items')
    .select('id')
    .eq('batch_id', batchId)
    .eq('status', 'INGESTED')
    .order('position', { ascending: true })
    .limit(limit);
  if (params.itemIds && params.itemIds.length > 0) query = query.in('id', params.itemIds);
  const { data: candidates } = await query;
  const ids = ((candidates ?? []) as Array<{ id: string }>).map((r) => r.id);

  let claimedItems: OfferBatchItemRow[] = [];
  if (ids.length > 0) {
    const lease = new Date(Date.now() + OFFER_BATCH_LEASE_MS).toISOString();
    const { data: claimed } = await supabase
      .from('offer_batch_items')
      .update({ status: 'PROCESSING', lease_expires_at: lease, updated_at: nowIso })
      .in('id', ids)
      .eq('status', 'INGESTED')
      .select(ITEM_COLUMNS);
    claimedItems = ((claimed ?? []) as Record<string, unknown>[]).map(normalizeItemRow);
  }

  if (claimedItems.length > 0) {
    await supabase
      .from('offer_batches')
      .update({ status: 'processing', processing_started_at: nowIso, updated_at: nowIso })
      .eq('id', batchId)
      .is('processing_started_at', null);
  }

  const processed: OfferBatchItemRow[] = [];
  for (const item of claimedItems) {
    processed.push(await processBatchItem(supabase, item, actorId));
  }

  const { count } = await supabase
    .from('offer_batch_items')
    .select('id', { count: 'exact', head: true })
    .eq('batch_id', batchId)
    .in('status', ['INGESTED', 'PROCESSING']);

  const batch = await recountBatch(supabase, batchId);
  return {
    claimed: claimedItems.length,
    processed: processed.length,
    remaining: count ?? 0,
    reclaimed,
    batch,
    items: processed,
  };
}

/* ---------------------------------------------------------------------------
 * Acciones por ítem
 * ------------------------------------------------------------------------- */

export type ItemActionResult =
  | { ok: true; item: OfferBatchItemRow; code?: string | null; message?: string | null }
  | { ok: false; httpStatus: 400 | 404 | 409 | 500; code: string; message: string; item?: OfferBatchItemRow };

/** URL de salida persistida en evidencia. Null si no hay https válido. */
export function persistedBatchOutbound(item: OfferBatchItemRow): string | null {
  const value = item.evidence?.outbound_url;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^https:\/\//i.test(trimmed) ? trimmed : null;
}

export function buildOfferBodyFromItem(item: OfferBatchItemRow): Record<string, unknown> {
  const images = item.images.slice(0, OFFER_MAX_IMAGES);
  const editorial =
    item.evidence?.editorial && typeof item.evidence.editorial === 'object'
      ? (item.evidence.editorial as { description?: unknown; why_good_deal?: unknown })
      : null;
  const editedDescription = typeof editorial?.description === 'string' ? editorial.description.trim() : '';
  const why = typeof editorial?.why_good_deal === 'string' ? editorial.why_good_deal.trim() : '';
  const base = editedDescription || item.hint_note?.trim() || '';
  const description = (why ? `${base}${base ? '\n\n' : ''}${why}` : base).slice(0, OFFER_DESCRIPTION_MAX);
  const persisted = persistedBatchOutbound(item);
  return {
    title: item.title ?? '',
    store: item.store ?? '',
    hasDiscount: item.original_price != null,
    price: item.price,
    original_price: item.original_price,
    image_url: images[0] ?? null,
    image_urls: images.slice(1),
    offer_url: persisted ?? item.canonical_url ?? item.normalized_url ?? item.source_url,
    ...(description ? { description: description.slice(0, OFFER_DESCRIPTION_MAX) } : {}),
    category: item.category,
    tags: ['lote'],
  };
}

type BatchItemAuthor =
  | { ok: true; createdBy: string; machineClientId: string | null }
  | { ok: false };

/**
 * Autor de la oferta que nace de un ítem.
 * Lote humano: quien aprueba. Lote MCP: machine_clients.author_profile_id, nunca el moderador.
 * Si el lote es MCP y el autor bot no se puede leer, falla cerrado (no cae al moderador).
 */
export async function resolveBatchItemAuthor(
  supabase: SupabaseClient,
  batchId: string,
  actorId: string,
): Promise<BatchItemAuthor> {
  const { data: batch, error } = await supabase
    .from('offer_batches')
    .select('machine_client_id')
    .eq('id', batchId)
    .maybeSingle();
  if (error) {
    // Antes de la migración MCP la columna no existe: ningún lote es de origen máquina.
    if (/machine_client_id/i.test(error.message ?? '') || error.code === '42703' || error.code === 'PGRST204') {
      return { ok: true, createdBy: actorId, machineClientId: null };
    }
    return { ok: false };
  }
  const machineClientId = (batch as { machine_client_id?: string | null } | null)?.machine_client_id ?? null;
  if (!machineClientId) return { ok: true, createdBy: actorId, machineClientId: null };
  const { data: client, error: clientError } = await supabase
    .from('machine_clients')
    .select('author_profile_id')
    .eq('id', machineClientId)
    .maybeSingle();
  const authorId = (client as { author_profile_id?: string | null } | null)?.author_profile_id ?? null;
  if (clientError || !authorId) return { ok: false };
  return { ok: true, createdBy: authorId, machineClientId };
}

/**
 * Aprobar = crear la oferta `pending` con el writer de comunidad existente.
 * Idempotente: si ya tiene offer_id devuelve ok sin crear otra.
 */
export async function approveOfferBatchItem(params: {
  supabase: SupabaseClient;
  item: OfferBatchItemRow;
  actorId: string;
}): Promise<ItemActionResult> {
  const { supabase, item, actorId } = params;
  if (item.offer_id && (item.status === 'APPROVED' || item.status === 'PUBLISHED')) {
    return { ok: true, item, code: 'IDEMPOTENT', message: 'Ya estaba aprobado.' };
  }
  if (!canApproveFrom(item.status)) {
    return {
      ok: false,
      httpStatus: 409,
      code: 'INVALID_TRANSITION',
      message: `No se puede aprobar un ítem en estado ${item.status}.`,
      item,
    };
  }
  if (!item.title || item.price == null || !(item.price > 0) || item.images.length === 0) {
    return {
      ok: false,
      httpStatus: 400,
      code: 'MISSING_REQUIRED_FIELDS',
      message: 'Faltan título, precio o foto. Edita el ítem antes de aprobar.',
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

  const author = await resolveBatchItemAuthor(supabase, item.batch_id, actorId);
  if (!author.ok) {
    await appendBatchEvent(supabase, {
      batchId: item.batch_id,
      itemId: item.id,
      actorId,
      action: 'approve_failed',
      fromStatus: item.status,
      toStatus: item.status,
      payload: { code: 'MACHINE_AUTHOR_UNAVAILABLE' },
    });
    return {
      ok: false,
      httpStatus: 409,
      code: 'MACHINE_AUTHOR_UNAVAILABLE',
      message: 'No se pudo resolver el autor bot de este lote. No se crea la oferta.',
      item,
    };
  }

  const result = await createCommunityOfferPending({
    supabase,
    createdBy: author.createdBy,
    sourceDetail: author.machineClientId ? 'mcp:batch' : 'community:batch',
    body: buildOfferBodyFromItem(item),
    ...(author.machineClientId ? { recordSubmissionCount: false } : {}),
  });

  const now = new Date().toISOString();
  if (!result.ok) {
    const code =
      result.httpStatus === 409 ? 'WRITER_DUPLICATE' : result.httpStatus === 400 ? 'WRITER_REJECTED' : 'WRITER_FAILED';
    const patch: Record<string, unknown> = {
      status: 'NEEDS_REVIEW',
      error_code: code,
      updated_at: now,
      evidence: {
        ...item.evidence,
        writer: { at: now, http_status: result.httpStatus, error: result.error, issues: result.issues ?? null },
      },
    };
    if (result.httpStatus === 409) {
      patch.duplicate_status = 'duplicate';
      patch.duplicate_offer_id = result.duplicate_offer_id ?? null;
    }
    if (result.httpStatus !== 500 && canTransition(item.status, 'NEEDS_REVIEW')) {
      await supabase.from('offer_batch_items').update(patch).eq('id', item.id).eq('status', item.status);
    }
    await appendBatchEvent(supabase, {
      batchId: item.batch_id,
      itemId: item.id,
      actorId,
      action: 'approve_failed',
      fromStatus: item.status,
      toStatus: result.httpStatus === 500 ? item.status : 'NEEDS_REVIEW',
      payload: { code, error: result.error, issues: result.issues ?? null, duplicate_offer_id: result.duplicate_offer_id ?? null },
    });
    const refreshed = await getOfferBatchItem(supabase, item.batch_id, item.id);
    return {
      ok: false,
      httpStatus: result.httpStatus,
      code,
      message: result.error,
      item: refreshed ?? item,
    };
  }

  const { data: updated } = await supabase
    .from('offer_batch_items')
    .update({
      status: 'APPROVED',
      offer_id: result.id,
      approved_at: now,
      updated_at: now,
      error_code: null,
    })
    .eq('id', item.id)
    .eq('status', item.status)
    .select(ITEM_COLUMNS)
    .maybeSingle();

  await appendBatchEvent(supabase, {
    batchId: item.batch_id,
    itemId: item.id,
    actorId,
    action: 'approved',
    fromStatus: item.status,
    toStatus: 'APPROVED',
    payload: {
      offer_id: result.id,
      offer_url: item.canonical_url ?? item.normalized_url ?? item.source_url,
      ...(author.machineClientId ? { author: 'machine', machine_client_id: author.machineClientId } : {}),
    },
  });

  return {
    ok: true,
    item: updated ? normalizeItemRow(updated as Record<string, unknown>) : { ...item, status: 'APPROVED', offer_id: result.id },
  };
}

export async function rejectOfferBatchItem(params: {
  supabase: SupabaseClient;
  item: OfferBatchItemRow;
  actorId: string;
  reason?: string | null;
}): Promise<ItemActionResult> {
  const { supabase, item, actorId } = params;
  if (item.status === 'REJECTED') return { ok: true, item, code: 'IDEMPOTENT' };
  if (!canRejectFrom(item.status)) {
    return {
      ok: false,
      httpStatus: 409,
      code: 'INVALID_TRANSITION',
      message:
        item.status === 'APPROVED'
          ? 'Este ítem ya tiene oferta pendiente. Recházala desde la cola de moderación.'
          : `No se puede rechazar un ítem en estado ${item.status}.`,
      item,
    };
  }
  const reason = typeof params.reason === 'string' && params.reason.trim() ? params.reason.trim().slice(0, 300) : 'Rechazado por operador';
  const now = new Date().toISOString();
  const { data: updated } = await supabase
    .from('offer_batch_items')
    .update({ status: 'REJECTED', rejection_reason: reason, rejected_at: now, lease_expires_at: null, updated_at: now })
    .eq('id', item.id)
    .eq('status', item.status)
    .select(ITEM_COLUMNS)
    .maybeSingle();
  await appendBatchEvent(supabase, {
    batchId: item.batch_id,
    itemId: item.id,
    actorId,
    action: 'rejected',
    fromStatus: item.status,
    toStatus: 'REJECTED',
    payload: { reason },
  });
  return { ok: true, item: updated ? normalizeItemRow(updated as Record<string, unknown>) : { ...item, status: 'REJECTED', rejection_reason: reason } };
}

/** Reprocesar: vuelve a INGESTED y procesa de inmediato (un solo ítem). */
export async function reprocessOfferBatchItem(params: {
  supabase: SupabaseClient;
  item: OfferBatchItemRow;
  actorId: string;
  inline?: boolean;
}): Promise<ItemActionResult> {
  const { supabase, item, actorId } = params;
  if (!canReprocessFrom(item.status, Boolean(item.offer_id))) {
    return {
      ok: false,
      httpStatus: 409,
      code: 'INVALID_TRANSITION',
      message: item.offer_id
        ? 'Este ítem ya tiene oferta creada; no se reprocesa.'
        : `No se puede reprocesar un ítem en estado ${item.status}.`,
      item,
    };
  }
  const now = new Date().toISOString();
  const { data: requeued } = await supabase
    .from('offer_batch_items')
    .update({ status: 'INGESTED', lease_expires_at: null, error_code: null, rejection_reason: null, rejected_at: null, updated_at: now })
    .eq('id', item.id)
    .eq('status', item.status)
    .select(ITEM_COLUMNS)
    .maybeSingle();
  if (!requeued) {
    return { ok: false, httpStatus: 409, code: 'CONCURRENT_UPDATE', message: 'El ítem cambió mientras se reprocesaba. Recarga.', item };
  }
  await appendBatchEvent(supabase, {
    batchId: item.batch_id,
    itemId: item.id,
    actorId,
    action: 'reprocess_requested',
    fromStatus: item.status,
    toStatus: 'INGESTED',
  });
  if (params.inline === false) {
    return { ok: true, item: normalizeItemRow(requeued as Record<string, unknown>) };
  }
  const chunk = await processOfferBatchChunk({ supabase, batchId: item.batch_id, actorId, limit: 1, itemIds: [item.id] });
  const done = chunk.items[0] ?? (await getOfferBatchItem(supabase, item.batch_id, item.id));
  return { ok: true, item: done ?? normalizeItemRow(requeued as Record<string, unknown>) };
}

export type EditItemFields = {
  title?: string | null;
  store?: string | null;
  price?: number | null;
  original_price?: number | null;
  images?: string[];
  category?: string | null;
  hint_note?: string | null;
  /** Texto editorial del moderador. No sustituye precios ni evidencia de tienda. */
  editorial_description?: string | null;
  why_good_deal?: string | null;
};

function cleanImageUrls(list: unknown): string[] | null {
  if (!Array.isArray(list)) return null;
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const u = raw.trim();
    if (!u) continue;
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== 'https:') continue;
    } catch {
      continue;
    }
    if (!out.includes(u)) out.push(u);
    if (out.length >= OFFER_MAX_IMAGES) break;
  }
  return out;
}

/**
 * Edición manual. Recalcula la evaluación con los datos editados y marca MANUAL_EDIT.
 * Nunca acepta un precio anterior <= precio actual.
 */
export async function editOfferBatchItem(params: {
  supabase: SupabaseClient;
  item: OfferBatchItemRow;
  actorId: string;
  fields: EditItemFields;
}): Promise<ItemActionResult> {
  const { supabase, item, actorId, fields } = params;
  if (!canEditFrom(item.status)) {
    return { ok: false, httpStatus: 409, code: 'INVALID_TRANSITION', message: `No se puede editar un ítem en estado ${item.status}.`, item };
  }

  const next: Partial<OfferBatchItemRow> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const setField = <K extends keyof OfferBatchItemRow>(key: K, value: OfferBatchItemRow[K]) => {
    if (JSON.stringify(item[key]) === JSON.stringify(value)) return;
    next[key] = value;
    changes[key as string] = { from: item[key], to: value };
  };

  if (fields.title !== undefined) {
    const t = typeof fields.title === 'string' ? fields.title.trim().slice(0, 500) : '';
    setField('title', t || null);
  }
  if (fields.store !== undefined) {
    const s = typeof fields.store === 'string' ? fields.store.trim().slice(0, 200) : '';
    setField('store', s || null);
  }
  if (fields.price !== undefined) {
    const p = toNum(fields.price);
    if (p != null && p < 0) return { ok: false, httpStatus: 400, code: 'INVALID_PRICE', message: 'El precio no puede ser negativo.', item };
    setField('price', p != null && p > 0 ? p : null);
  }
  if (fields.original_price !== undefined) {
    const o = toNum(fields.original_price);
    if (o != null && o < 0) return { ok: false, httpStatus: 400, code: 'INVALID_PRICE', message: 'El precio anterior no puede ser negativo.', item };
    setField('original_price', o != null && o > 0 ? o : null);
  }
  if (fields.images !== undefined) {
    const imgs = cleanImageUrls(fields.images);
    if (imgs) setField('images', imgs);
  }
  if (fields.category !== undefined) {
    const c = typeof fields.category === 'string' ? fields.category.trim().slice(0, 80) : '';
    setField('category', c || null);
  }
  if (fields.hint_note !== undefined) {
    const n = typeof fields.hint_note === 'string' ? fields.hint_note.trim().slice(0, OFFER_DESCRIPTION_MAX) : '';
    setField('hint_note', n || null);
  }

  const prevEditorial =
    item.evidence.editorial && typeof item.evidence.editorial === 'object'
      ? (item.evidence.editorial as Record<string, unknown>)
      : {};
  let editorialNext: Record<string, unknown> | null = null;
  if (fields.editorial_description !== undefined || fields.why_good_deal !== undefined) {
    editorialNext = { ...prevEditorial };
    if (fields.editorial_description !== undefined) {
      const d = typeof fields.editorial_description === 'string' ? fields.editorial_description.trim().slice(0, 2000) : '';
      editorialNext.description = d || null;
    }
    if (fields.why_good_deal !== undefined) {
      const w = typeof fields.why_good_deal === 'string' ? fields.why_good_deal.trim().slice(0, 600) : '';
      editorialNext.why_good_deal = w || null;
    }
    editorialNext.needs_edit = true;
    changes.editorial = { from: prevEditorial, to: editorialNext };
  }

  if (Object.keys(changes).length === 0) return { ok: true, item, code: 'NO_CHANGES' };

  if (Object.keys(next).length === 0 && editorialNext) {
    const now = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from('offer_batch_items')
      .update({
        updated_at: now,
        evidence: {
          ...item.evidence,
          editorial: editorialNext,
          manual_edits: [
            ...((item.evidence.manual_edits as unknown[] | undefined) ?? []).slice(-9),
            { at: now, actor_id: actorId, changes },
          ],
        },
      })
      .eq('id', item.id)
      .eq('status', item.status)
      .select(ITEM_COLUMNS)
      .maybeSingle();
    if (error) return { ok: false, httpStatus: 500, code: 'UPDATE_FAILED', message: 'No se pudo guardar la edición.', item };
    if (!updated) return { ok: false, httpStatus: 409, code: 'CONCURRENT_UPDATE', message: 'El ítem cambió mientras editabas. Recarga.', item };
    await appendBatchEvent(supabase, {
      batchId: item.batch_id,
      itemId: item.id,
      actorId,
      action: 'edited',
      fromStatus: item.status,
      toStatus: item.status,
      payload: { changes },
    });
    return { ok: true, item: normalizeItemRow(updated as Record<string, unknown>) };
  }

  const merged = { ...item, ...next } as OfferBatchItemRow;
  const finalPrice = merged.price;
  let finalOriginal = merged.original_price;
  if (finalOriginal != null && finalPrice != null && finalOriginal <= finalPrice) {
    return {
      ok: false,
      httpStatus: 400,
      code: 'ORIGINAL_NOT_GREATER',
      message: 'El precio anterior debe ser mayor que el precio actual.',
      item,
    };
  }
  if (finalPrice == null) finalOriginal = null;

  const evaluation = evaluateBatchExtraction({
    extractionStatus: merged.title && merged.images.length > 0 ? 'partial' : (merged.extraction_status ?? 'partial'),
    title: merged.title,
    images: merged.images,
    price: finalPrice,
    originalPrice: finalOriginal,
    provider: merged.retailer ?? 'unknown',
    identityConfidence: String((merged.evidence?.identity as { confidence?: string } | null)?.confidence ?? 'medium'),
    hasIdentity: Boolean((merged.evidence?.identity as { product_identity?: string | null } | null)?.product_identity),
    blockedByHostPolicy: false,
    invalidUrl: false,
    hintPrice: null,
    hintOriginalPrice: null,
    duplicate: merged.duplicate_status === 'duplicate' && merged.duplicate_offer_id ? { offerId: merged.duplicate_offer_id, status: null } : null,
    storeHasAffiliate: batchAffiliatePlan(merged.canonical_url ?? merged.normalized_url ?? merged.source_url) === 'auto_tag',
  });
  const warnings = Array.from(new Set([...evaluation.warnings, 'MANUAL_EDIT']));
  const targetStatus: BatchItemStatus = evaluation.status === 'ERROR' ? 'NEEDS_REVIEW' : evaluation.status;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    ...next,
    original_price: finalOriginal,
    discount_percent: evaluation.discountPercent,
    status: canTransition(item.status, targetStatus) ? targetStatus : item.status,
    validation_status: evaluation.validationStatus,
    error_code: evaluation.errorCode,
    warnings,
    quality_status: targetStatus === 'READY' ? 'ready' : 'review',
    updated_at: now,
    evidence: {
      ...item.evidence,
      ...(editorialNext ? { editorial: editorialNext } : {}),
      manual_edits: [
        ...((item.evidence?.manual_edits as unknown[] | undefined) ?? []).slice(-9),
        { at: now, actor_id: actorId, changes },
      ],
    },
  };
  const { data: updated, error } = await supabase
    .from('offer_batch_items')
    .update(patch)
    .eq('id', item.id)
    .eq('status', item.status)
    .select(ITEM_COLUMNS)
    .maybeSingle();
  if (error) {
    return { ok: false, httpStatus: 500, code: 'UPDATE_FAILED', message: 'No se pudo guardar la edición.', item };
  }
  if (!updated) {
    return { ok: false, httpStatus: 409, code: 'CONCURRENT_UPDATE', message: 'El ítem cambió mientras editabas. Recarga.', item };
  }
  await appendBatchEvent(supabase, {
    batchId: item.batch_id,
    itemId: item.id,
    actorId,
    action: 'edited',
    fromStatus: item.status,
    toStatus: patch.status as string,
    payload: { changes },
  });
  return { ok: true, item: normalizeItemRow(updated as Record<string, unknown>) };
}

/**
 * Cambiar URL: valida, verifica que no repita otra del lote, resetea la extracción,
 * audita (URL vieja/nueva/usuario) y reprocesa en línea.
 */
export async function changeOfferBatchItemUrl(params: {
  supabase: SupabaseClient;
  item: OfferBatchItemRow;
  actorId: string;
  newUrl: string;
}): Promise<ItemActionResult> {
  const { supabase, item, actorId } = params;
  if (item.offer_id) {
    return { ok: false, httpStatus: 409, code: 'INVALID_TRANSITION', message: 'Este ítem ya tiene oferta creada; edita la URL desde la cola.', item };
  }
  if (!canReprocessFrom(item.status, false)) {
    return { ok: false, httpStatus: 409, code: 'INVALID_TRANSITION', message: `No se puede cambiar la URL en estado ${item.status}.`, item };
  }
  const check = validatePublicOfferUrl(params.newUrl);
  if (!check.ok) {
    return { ok: false, httpStatus: 400, code: 'INVALID_URL', message: check.error, item };
  }
  const newUrl = check.href;
  const newKey = offerBatchIdentityKey(newUrl);
  if (newKey !== item.identity_key) {
    const { data: clash } = await supabase
      .from('offer_batch_items')
      .select('id')
      .eq('batch_id', item.batch_id)
      .eq('identity_key', newKey)
      .neq('id', item.id)
      .maybeSingle();
    if (clash) {
      return { ok: false, httpStatus: 409, code: 'DUPLICATE_IN_BATCH', message: 'Esa URL ya está en este lote.', item };
    }
  }
  const now = new Date().toISOString();
  const { data: reset, error } = await supabase
    .from('offer_batch_items')
    .update({
      status: 'INGESTED',
      source_url: newUrl,
      identity_key: newKey,
      normalized_url: null,
      canonical_url: null,
      retailer: null,
      title: null,
      images: [],
      price: null,
      original_price: null,
      discount_percent: null,
      category: null,
      extraction_status: null,
      validation_status: null,
      duplicate_status: null,
      duplicate_offer_id: null,
      quality_status: null,
      error_code: null,
      warnings: ['URL_CHANGED'],
      lease_expires_at: null,
      rejection_reason: null,
      rejected_at: null,
      updated_at: now,
      evidence: {
        ...item.evidence,
        url_changes: [
          ...((item.evidence?.url_changes as unknown[] | undefined) ?? []).slice(-9),
          { at: now, actor_id: actorId, from: item.source_url, to: newUrl },
        ],
      },
    })
    .eq('id', item.id)
    .eq('status', item.status)
    .select(ITEM_COLUMNS)
    .maybeSingle();
  if (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        httpStatus: 409,
        code: 'DUPLICATE_IN_BATCH',
        message: 'Esa oferta ya está en un lote abierto.',
        item,
      };
    }
    return { ok: false, httpStatus: 500, code: 'UPDATE_FAILED', message: 'No se pudo cambiar la URL.', item };
  }
  if (!reset) {
    return { ok: false, httpStatus: 409, code: 'CONCURRENT_UPDATE', message: 'El ítem cambió mientras editabas. Recarga.', item };
  }
  await appendBatchEvent(supabase, {
    batchId: item.batch_id,
    itemId: item.id,
    actorId,
    action: 'url_changed',
    fromStatus: item.status,
    toStatus: 'INGESTED',
    payload: { old_url: item.source_url, new_url: newUrl },
  });
  const chunk = await processOfferBatchChunk({ supabase, batchId: item.batch_id, actorId, limit: 1, itemIds: [item.id] });
  const done = chunk.items[0] ?? (await getOfferBatchItem(supabase, item.batch_id, item.id));
  const finalItem = done ?? normalizeItemRow(reset as Record<string, unknown>);
  // URL_CHANGED se conserva como aviso informativo tras el reproceso.
  if (!finalItem.warnings.includes('URL_CHANGED')) {
    const { data: tagged } = await supabase
      .from('offer_batch_items')
      .update({ warnings: [...finalItem.warnings, 'URL_CHANGED'] })
      .eq('id', item.id)
      .select(ITEM_COLUMNS)
      .maybeSingle();
    if (tagged) return { ok: true, item: normalizeItemRow(tagged as Record<string, unknown>) };
  }
  return { ok: true, item: finalItem };
}

/* ---------------------------------------------------------------------------
 * Acciones masivas
 * ------------------------------------------------------------------------- */

export type BulkAction = 'approve' | 'reject' | 'reprocess';

export async function runBulkBatchAction(params: {
  supabase: SupabaseClient;
  batchId: string;
  actorId: string;
  action: BulkAction;
  itemIds: string[];
  reason?: string | null;
}): Promise<BulkSummary> {
  const { supabase, batchId, actorId, action } = params;
  const ids = Array.from(new Set(params.itemIds.filter((id) => typeof id === 'string' && id.length > 0))).slice(0, OFFER_BATCH_MAX_ITEMS);
  const results: BulkItemResult[] = [];
  if (ids.length === 0) return summarizeBulk(results);

  const { data } = await supabase.from('offer_batch_items').select(ITEM_COLUMNS).eq('batch_id', batchId).in('id', ids);
  const items = ((data ?? []) as Record<string, unknown>[]).map(normalizeItemRow);
  const byId = new Map(items.map((it) => [it.id, it]));

  await appendBatchEvent(supabase, {
    batchId,
    actorId,
    action: `bulk_${action}_started`,
    payload: { item_ids: ids, reason: params.reason ?? null },
  });

  for (const id of ids) {
    const item = byId.get(id);
    if (!item) {
      results.push({ itemId: id, ok: false, status: null, code: 'NOT_FOUND', message: 'Ítem no encontrado en este lote.' });
      continue;
    }
    let r: ItemActionResult;
    try {
      if (action === 'approve') r = await approveOfferBatchItem({ supabase, item, actorId });
      else if (action === 'reject') r = await rejectOfferBatchItem({ supabase, item, actorId, reason: params.reason });
      else r = await reprocessOfferBatchItem({ supabase, item, actorId });
    } catch (err) {
      r = { ok: false, httpStatus: 500, code: 'UNKNOWN', message: err instanceof Error ? err.message : 'Error inesperado', item };
    }
    results.push(
      r.ok
        ? { itemId: id, ok: true, status: r.item.status, code: r.code ?? null, message: r.message ?? null, offerId: r.item.offer_id }
        : { itemId: id, ok: false, status: r.item?.status ?? item.status, code: r.code, message: r.message },
    );
  }

  const summary = summarizeBulk(results);
  await appendBatchEvent(supabase, {
    batchId,
    actorId,
    action: `bulk_${action}_finished`,
    payload: { processed: summary.processed, succeeded: summary.succeeded, failed: summary.failed },
  });
  await recountBatch(supabase, batchId);
  return summary;
}
