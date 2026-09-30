import type { SupabaseClient } from '@supabase/supabase-js';
import { findDuplicateOfferByUrl } from '@/lib/offers/findDuplicateOffer';
import { offerBatchIdentityKey } from '@/lib/offers/batchPaste';
import { OFFER_BATCH_MAX_ITEMS, OPEN_ACQUISITION_ITEM_STATUSES } from '@/lib/offers/batch/contract';
import { readAcquisitionAttribution } from '@/lib/acquisition/attribution';
import { createOfferBatch, type OfferBatchItemLineage, type OfferBatchRow } from '@/lib/offers/batch/service';

/**
 * Puente Hunter → lote de moderación.
 * Lee candidatos y llama a createOfferBatch. No publica ofertas.
 */

export const HUNTER_BRIDGE_ELIGIBLE_DECISIONS = ['WOULD_INSERT', 'NEEDS_REVIEW'] as const;

const HUNTER_BRIDGE_FETCH_CAP = 200;

export type HunterBridgeCandidate = {
  run_id: string;
  candidate_key: string;
  decision: string | null;
  inserted_offer_id: string | null;
  source_url: string | null;
  canonical_url: string | null;
  affiliate_url: string | null;
  product_fingerprint: string | null;
  evidence?: unknown;
};

export type HunterBridgeSkipReason =
  | 'not_eligible'
  | 'already_inserted_offer'
  | 'no_source_url'
  | 'already_sent'
  | 'open_identity'
  | 'existing_offer'
  | 'duplicate_lookup_failed'
  | 'over_batch_cap';

export type HunterBridgeSkip = {
  runId: string;
  candidateKey: string;
  reason: HunterBridgeSkipReason;
};

export type HunterBridgeAcceptance = {
  url: string;
  identityKey: string;
  lineage: OfferBatchItemLineage;
};

export type OpenBatchIdentity = {
  identityKey: string;
  status: string;
  evidence: unknown;
};

export function hunterLineageFromEvidence(evidence: unknown): { runId: string; candidateKey: string } | null {
  const root = typeof evidence === 'string' ? safeJson(evidence) : evidence;
  if (!root || typeof root !== 'object') return null;
  const hunter = (root as { hunter?: unknown }).hunter;
  if (!hunter || typeof hunter !== 'object') return null;
  const runId = (hunter as { run_id?: unknown }).run_id;
  const candidateKey = (hunter as { candidate_key?: unknown }).candidate_key;
  if (typeof runId !== 'string' || !runId || typeof candidateKey !== 'string' || !candidateKey) return null;
  return { runId, candidateKey };
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function httpsSource(value: string | null): string | null {
  const href = String(value ?? '').trim();
  if (!href.startsWith('https://')) return null;
  try {
    const u = new URL(href);
    if (u.protocol !== 'https:' || !u.hostname.includes('.')) return null;
    return href;
  } catch {
    return null;
  }
}

/**
 * Selección pura. La idempotencia concurrente NO está aquí:
 * el esquema no tiene índice único de (run_id, candidate_key) ni de identidad entre lotes.
 */
export function planHunterCandidateBridge(input: {
  candidates: HunterBridgeCandidate[];
  openItems: OpenBatchIdentity[];
}): { accepted: HunterBridgeAcceptance[]; skipped: HunterBridgeSkip[] } {
  const sent = new Set<string>();
  const openKeys = new Set<string>();
  for (const item of input.openItems) {
    if (!OPEN_ACQUISITION_ITEM_STATUSES.includes(item.status as (typeof OPEN_ACQUISITION_ITEM_STATUSES)[number])) continue;
    if (item.identityKey) openKeys.add(item.identityKey);
    const lineage = hunterLineageFromEvidence(item.evidence);
    if (lineage) sent.add(`${lineage.runId}\0${lineage.candidateKey}`);
  }

  const accepted: HunterBridgeAcceptance[] = [];
  const skipped: HunterBridgeSkip[] = [];
  const seenPairs = new Set<string>();
  const seenKeys = new Set<string>();

  for (const candidate of input.candidates) {
    const runId = String(candidate.run_id ?? '');
    const candidateKey = String(candidate.candidate_key ?? '');
    const decision = candidate.decision ?? '';
    if (!HUNTER_BRIDGE_ELIGIBLE_DECISIONS.includes(decision as (typeof HUNTER_BRIDGE_ELIGIBLE_DECISIONS)[number])) {
      skipped.push({ runId, candidateKey, reason: 'not_eligible' });
      continue;
    }
    if (candidate.inserted_offer_id) {
      skipped.push({ runId, candidateKey, reason: 'already_inserted_offer' });
      continue;
    }
    const url = httpsSource(candidate.source_url);
    if (!url) {
      skipped.push({ runId, candidateKey, reason: 'no_source_url' });
      continue;
    }
    const pair = `${runId}\0${candidateKey}`;
    if (sent.has(pair) || seenPairs.has(pair)) {
      skipped.push({ runId, candidateKey, reason: 'already_sent' });
      continue;
    }
    const identityKey = offerBatchIdentityKey(url);
    if (openKeys.has(identityKey) || seenKeys.has(identityKey)) {
      skipped.push({ runId, candidateKey, reason: 'open_identity' });
      continue;
    }
    if (accepted.length >= OFFER_BATCH_MAX_ITEMS) {
      skipped.push({ runId, candidateKey, reason: 'over_batch_cap' });
      continue;
    }
    seenPairs.add(pair);
    seenKeys.add(identityKey);
    accepted.push({
      url,
      identityKey,
      lineage: {
        runId,
        candidateKey,
        sourceUrl: url,
        productFingerprint: candidate.product_fingerprint,
        canonicalUrl: candidate.canonical_url,
        affiliateUrl: candidate.affiliate_url,
        acquisition: readAcquisitionAttribution(candidate.evidence),
      },
    });
  }

  return { accepted, skipped };
}

export type BridgeHunterResult =
  | {
      ok: true;
      batch: OfferBatchRow | null;
      inserted: number;
      skipped: HunterBridgeSkip[];
      accepted: HunterBridgeAcceptance[];
    }
  | { ok: false; error: string; httpStatus: 500 };

export async function bridgeHunterCandidatesToBatch(params: {
  supabase: SupabaseClient;
  createdBy: string;
  name?: string | null;
  /** Si viene, solo avanza ese envío. Sin él, el puente sigue leyendo el ledger elegible. */
  runId?: string | null;
}): Promise<BridgeHunterResult> {
  const { supabase, createdBy } = params;
  let candidateQuery = supabase
    .from('hunter_offer_candidates')
    .select('run_id, candidate_key, decision, inserted_offer_id, source_url, canonical_url, affiliate_url, product_fingerprint, evidence')
    .in('decision', [...HUNTER_BRIDGE_ELIGIBLE_DECISIONS])
    .is('inserted_offer_id', null)
    .order('last_seen_at', { ascending: false })
    .limit(HUNTER_BRIDGE_FETCH_CAP);
  if (params.runId) candidateQuery = candidateQuery.eq('run_id', params.runId);
  const { data: candidateRows, error: candidateError } = await candidateQuery;

  if (candidateError) {
    console.error('[hunter-batch] candidates failed:', candidateError.message);
    return { ok: false, httpStatus: 500, error: 'No se pudieron leer los candidatos del Hunter.' };
  }

  const { data: batchRows, error: batchError } = await supabase
    .from('offer_batches')
    .select('id')
    .neq('status', 'archived');
  if (batchError) {
    console.error('[hunter-batch] open batches failed:', batchError.message);
    return { ok: false, httpStatus: 500, error: 'No se pudieron comprobar los lotes abiertos.' };
  }

  const batchIds = ((batchRows ?? []) as Array<{ id: string }>).map((row) => row.id).filter(Boolean);
  const openItems: OpenBatchIdentity[] = [];
  for (let i = 0; i < batchIds.length; i += 50) {
    const slice = batchIds.slice(i, i + 50);
    const { data: items, error: itemsError } = await supabase
      .from('offer_batch_items')
      .select('identity_key, evidence, status')
      .in('batch_id', slice)
      .in('status', [...OPEN_ACQUISITION_ITEM_STATUSES]);
    if (itemsError) {
      console.error('[hunter-batch] open items failed:', itemsError.message);
      return { ok: false, httpStatus: 500, error: 'No se pudieron comprobar los ítems abiertos.' };
    }
    for (const item of (items ?? []) as Array<{ identity_key: string; evidence: unknown; status: string }>) {
      openItems.push({
        identityKey: item.identity_key,
        status: item.status,
        evidence: item.evidence,
      });
    }
  }

  const plan = planHunterCandidateBridge({
    candidates: (candidateRows ?? []) as HunterBridgeCandidate[],
    openItems,
  });

  const accepted: HunterBridgeAcceptance[] = [];
  const skipped = [...plan.skipped];
  for (const item of plan.accepted) {
    let duplicate: { id: string } | null = null;
    try {
      duplicate = await findDuplicateOfferByUrl(supabase, item.url);
    } catch (error) {
      console.error('[hunter-batch] duplicate lookup failed:', error instanceof Error ? error.message : error);
      skipped.push({
        runId: item.lineage.runId,
        candidateKey: item.lineage.candidateKey,
        reason: 'duplicate_lookup_failed',
      });
      continue;
    }
    if (duplicate) {
      skipped.push({
        runId: item.lineage.runId,
        candidateKey: item.lineage.candidateKey,
        reason: 'existing_offer',
      });
      continue;
    }
    accepted.push(item);
  }

  if (accepted.length === 0) {
    return { ok: true, batch: null, inserted: 0, skipped, accepted };
  }

  const lineageByIdentityKey: Record<string, OfferBatchItemLineage> = {};
  for (const item of accepted) lineageByIdentityKey[item.identityKey] = item.lineage;

  const created = await createOfferBatch({
    supabase,
    createdBy,
    name: params.name ?? 'Candidatos del Hunter',
    text: accepted.map((item) => item.url).join('\n'),
    lineageByIdentityKey,
  });
  if (!created.ok) {
    return { ok: false, httpStatus: 500, error: created.error };
  }
  const conflicted = new Set(created.conflictIdentityKeys);
  const kept: HunterBridgeAcceptance[] = [];
  for (const item of accepted) {
    if (!conflicted.has(item.identityKey)) {
      kept.push(item);
      continue;
    }
    skipped.push({
      runId: item.lineage.runId,
      candidateKey: item.lineage.candidateKey,
      reason: 'open_identity',
    });
  }
  if (!created.batch || created.inserted === 0) {
    return { ok: true, batch: null, inserted: 0, skipped, accepted: kept };
  }
  return {
    ok: true,
    batch: created.batch,
    inserted: created.inserted,
    skipped,
    accepted: kept,
  };
}
