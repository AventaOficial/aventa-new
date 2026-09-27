import type { SupabaseClient } from '@supabase/supabase-js';
import { ACQUISITION_PROCESS_MAX_CHUNKS } from './contract';
import { bridgeHunterCandidatesToBatch, type BridgeHunterResult, type HunterBridgeSkip } from '@/lib/offers/batch/hunterBridge';
import { processOfferBatchChunk, type ProcessChunkResult } from '@/lib/offers/batch/service';

export type AcquisitionAdvance = {
  ok: boolean;
  error: string | null;
  batchId: string | null;
  forwarded: number;
  skipped: HunterBridgeSkip[];
  processed: number;
  remaining: number;
  reclaimed: number;
  ready: number;
  needsReview: number;
  errored: number;
  chunks: number;
};

/**
 * Pasa los candidatos de un envío al lote y procesa un número acotado de chunks.
 * No publica. El índice de identidad abierta sigue decidiendo los duplicados.
 */
export async function advanceAcquisitionSubmission(params: {
  supabase: SupabaseClient;
  createdBy: string;
  runId: string;
  maxChunks?: number;
  bridge?: typeof bridgeHunterCandidatesToBatch;
  processChunk?: typeof processOfferBatchChunk;
}): Promise<AcquisitionAdvance> {
  const bridge = params.bridge ?? bridgeHunterCandidatesToBatch;
  const processChunk = params.processChunk ?? processOfferBatchChunk;
  const maxChunks = Math.max(1, Math.min(params.maxChunks ?? ACQUISITION_PROCESS_MAX_CHUNKS, ACQUISITION_PROCESS_MAX_CHUNKS));
  const bridged = await bridge({
    supabase: params.supabase,
    createdBy: params.createdBy,
    name: 'Adquisición',
    runId: params.runId,
  });
  if (!bridged.ok) {
    return emptyAdvance(bridged.error);
  }
  await noteBridgeOutcome(params.supabase, params.runId, bridged);

  let batchId = bridged.batch?.id ?? null;
  if (!batchId) {
    const { data, error } = await params.supabase
      .from('offer_batch_items')
      .select('batch_id')
      .filter('evidence->hunter->>run_id', 'eq', params.runId)
      .in('status', ['INGESTED', 'PROCESSING'])
      .limit(1);
    if (error) console.error('[acquisition] open batch lookup failed:', error.message);
    batchId = (data?.[0] as { batch_id?: string } | undefined)?.batch_id ?? null;
  }
  if (!batchId) {
    return {
      ...emptyAdvance(null),
      ok: true,
      forwarded: bridged.inserted,
      skipped: bridged.skipped,
    };
  }

  let processed = 0;
  let remaining = 0;
  let reclaimed = 0;
  let ready = 0;
  let needsReview = 0;
  let errored = 0;
  let chunks = 0;
  for (let i = 0; i < maxChunks; i += 1) {
    let chunk: ProcessChunkResult;
    try {
      chunk = await processChunk({
        supabase: params.supabase,
        batchId,
        actorId: params.createdBy,
      });
    } catch (error) {
      console.error('[acquisition] chunk failed:', error instanceof Error ? error.message : error);
      return {
        ok: false,
        error: 'La extracción se detuvo. Los candidatos y el lote siguen guardados.',
        batchId,
        forwarded: bridged.inserted,
        skipped: bridged.skipped,
        processed,
        remaining,
        reclaimed,
        ready,
        needsReview,
        errored,
        chunks,
      };
    }
    chunks += 1;
    processed += chunk.processed;
    remaining = chunk.remaining;
    reclaimed += chunk.reclaimed;
    for (const item of chunk.items) {
      if (item.status === 'READY') ready += 1;
      else if (item.status === 'NEEDS_REVIEW') needsReview += 1;
      else if (item.status === 'ERROR') errored += 1;
    }
    if (chunk.remaining === 0) break;
    if (chunk.claimed === 0 && chunk.reclaimed === 0) break;
  }

  return {
    ok: true,
    error: null,
    batchId,
    forwarded: bridged.inserted,
    skipped: bridged.skipped,
    processed,
    remaining,
    reclaimed,
    ready,
    needsReview,
    errored,
    chunks,
  };
}

function emptyAdvance(error: string | null): AcquisitionAdvance {
  return {
    ok: false,
    error,
    batchId: null,
    forwarded: 0,
    skipped: [],
    processed: 0,
    remaining: 0,
    reclaimed: 0,
    ready: 0,
    needsReview: 0,
    errored: 0,
    chunks: 0,
  };
}

async function noteBridgeOutcome(supabase: SupabaseClient, runId: string, bridged: Extract<BridgeHunterResult, { ok: true }>) {
  const at = new Date().toISOString();
  const notes = [
    ...bridged.accepted
      .filter((item) => item.lineage.runId === runId)
      .map((item) => ({ candidateKey: item.lineage.candidateKey, reason: 'FORWARDED_TO_BATCH' })),
    ...bridged.skipped
      .filter((item) => item.runId === runId)
      .map((item) => ({ candidateKey: item.candidateKey, reason: item.reason })),
  ];
  for (const note of notes) {
    const { error } = await supabase
      .from('hunter_offer_candidates')
      .update({ reason_detail: note.reason, last_seen_at: at })
      .eq('run_id', runId)
      .eq('candidate_key', note.candidateKey);
    if (error) console.error('[acquisition] bridge note failed:', error.message);
  }
}
