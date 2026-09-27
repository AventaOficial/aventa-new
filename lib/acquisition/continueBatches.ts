import type { SupabaseClient } from '@supabase/supabase-js';
import { processOfferBatchChunk, type ProcessChunkResult } from '@/lib/offers/batch/service';
import {
  ACQUISITION_CONTINUE_DEADLINE_MS,
  ACQUISITION_CONTINUE_LOOKAHEAD,
  ACQUISITION_CONTINUE_MAX_CHUNKS,
} from './contract';

export type AcquisitionContinueStop = 'idle' | 'budget' | 'deadline';

export type AcquisitionContinueReport = {
  ok: boolean;
  error: string | null;
  batchesFound: number;
  batchesVisited: number;
  deferredBatches: number;
  chunks: number;
  claimed: number;
  processed: number;
  remaining: number;
  ready: number;
  needsReview: number;
  errored: number;
  chunkFailures: number;
  reclaimed: number;
  elapsedMs: number;
  stoppedBecause: AcquisitionContinueStop;
};

/**
 * Una vuelta de cron. Un chunk por lote antes de repetir el mismo lote.
 * El claim y el lease siguen dentro de processOfferBatchChunk.
 */
export async function continuePendingBatches(params: {
  listPendingBatchIds: () => Promise<string[]>;
  processChunk: (batchId: string) => Promise<ProcessChunkResult>;
  maxChunks?: number;
  deadlineMs?: number;
  now?: () => number;
}): Promise<AcquisitionContinueReport> {
  const started = (params.now ?? Date.now)();
  const now = params.now ?? Date.now;
  const maxChunks = Math.max(1, params.maxChunks ?? ACQUISITION_CONTINUE_MAX_CHUNKS);
  const deadlineMs = params.deadlineMs ?? ACQUISITION_CONTINUE_DEADLINE_MS;
  const found = await params.listPendingBatchIds();
  const queue = [...found];
  const remainingByBatch = new Map<string, number>();
  const visited = new Set<string>();
  const report = blank(found.length);

  while (queue.length > 0) {
    if (report.chunks >= maxChunks) {
      report.stoppedBecause = 'budget';
      break;
    }
    if (now() - started >= deadlineMs) {
      report.stoppedBecause = 'deadline';
      break;
    }
    const batchId = queue.shift();
    if (!batchId) break;
    visited.add(batchId);
    let chunk: ProcessChunkResult;
    try {
      chunk = await params.processChunk(batchId);
    } catch (error) {
      console.error(
        '[acquisition-continue] chunk failed:',
        error instanceof Error ? error.message.slice(0, 160) : 'chunk_failed',
      );
      report.chunkFailures += 1;
      continue;
    }
    report.chunks += 1;
    report.claimed += chunk.claimed;
    report.processed += chunk.processed;
    report.reclaimed += chunk.reclaimed;
    remainingByBatch.set(batchId, chunk.remaining);
    for (const item of chunk.items) {
      if (item.status === 'READY') report.ready += 1;
      else if (item.status === 'NEEDS_REVIEW') report.needsReview += 1;
      else if (item.status === 'ERROR') report.errored += 1;
    }
    if ((chunk.claimed > 0 || chunk.reclaimed > 0) && chunk.remaining > 0) {
      queue.push(batchId);
    }
  }

  report.batchesVisited = visited.size;
  report.remaining = [...remainingByBatch.values()].reduce((sum, n) => sum + n, 0);
  report.deferredBatches = queue.length;
  report.elapsedMs = Math.max(0, now() - started);
  return report;
}

export async function listPendingAcquisitionBatchIds(
  supabase: SupabaseClient,
  now = new Date(),
): Promise<string[]> {
  const nowIso = now.toISOString();
  const [ingested, stuck] = await Promise.all([
    supabase
      .from('offer_batch_items')
      .select('batch_id, created_at')
      .eq('status', 'INGESTED')
      .order('created_at', { ascending: true })
      .limit(ACQUISITION_CONTINUE_LOOKAHEAD),
    supabase
      .from('offer_batch_items')
      .select('batch_id, created_at')
      .eq('status', 'PROCESSING')
      .lt('lease_expires_at', nowIso)
      .order('created_at', { ascending: true })
      .limit(100),
  ]);
  if (ingested.error) throw new Error(ingested.error.message);
  if (stuck.error) throw new Error(stuck.error.message);
  const rows = [...(ingested.data ?? []), ...(stuck.data ?? [])] as Array<{
    batch_id?: string;
    created_at?: string;
  }>;
  rows.sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = row.batch_id ?? '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export async function runAcquisitionContinuation(
  supabase: SupabaseClient,
): Promise<AcquisitionContinueReport> {
  try {
    return await continuePendingBatches({
      listPendingBatchIds: () => listPendingAcquisitionBatchIds(supabase),
      processChunk: (batchId) => processOfferBatchChunk({ supabase, batchId, actorId: null }),
    });
  } catch (error) {
    const report = blank(0);
    report.ok = false;
    report.error = error instanceof Error ? error.message.slice(0, 160) : 'continuation_failed';
    report.stoppedBecause = 'idle';
    return report;
  }
}

function blank(batchesFound: number): AcquisitionContinueReport {
  return {
    ok: true,
    error: null,
    batchesFound,
    batchesVisited: 0,
    deferredBatches: 0,
    chunks: 0,
    claimed: 0,
    processed: 0,
    remaining: 0,
    ready: 0,
    needsReview: 0,
    errored: 0,
    chunkFailures: 0,
    reclaimed: 0,
    elapsedMs: 0,
    stoppedBecause: 'idle',
  };
}
