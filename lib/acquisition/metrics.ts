import type { SupabaseClient } from '@supabase/supabase-js';
import { readAcquisitionAttribution } from './attribution';

export type AcquisitionMetricRow = {
  sourceKey: string;
  scoutId: string | null;
  submissionId: string;
  day: string;
  candidatesFound: number;
  candidatesAccepted: number;
  candidatesDuplicate: number;
  candidatesRejected: number;
  extractionReady: number;
  extractionNeedsReview: number;
  extractionError: number;
  approved: number;
  /** Ítem APPROVED: la oferta se creó pending. Es el mismo momento que approved. */
  pending: number;
  published: number;
  forwardedToBatch: number;
  candidateToBatchMs: number | null;
  batchToExtractionMs: number | null;
  extractionToPendingMs: number | null;
};

type CandidateInput = {
  run_id?: string | null;
  candidate_key?: string | null;
  decision?: string | null;
  discovered_at?: string | null;
  evidence?: unknown;
};

type ItemInput = {
  status?: string | null;
  evidence?: unknown;
  created_at?: string | null;
  processed_at?: string | null;
  approved_at?: string | null;
};

type Clock = { sum: number; n: number };

function elapsed(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return end - start;
}

function average(clock: Clock): number | null {
  if (clock.n === 0) return null;
  return Math.round(clock.sum / clock.n);
}

function dayOf(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return 'unknown';
  return new Date(time).toISOString().slice(0, 10);
}

function blank(sourceKey: string, scoutId: string | null, submissionId: string, day: string): AcquisitionMetricRow {
  return {
    sourceKey,
    scoutId,
    submissionId,
    day,
    candidatesFound: 0,
    candidatesAccepted: 0,
    candidatesDuplicate: 0,
    candidatesRejected: 0,
    extractionReady: 0,
    extractionNeedsReview: 0,
    extractionError: 0,
    approved: 0,
    pending: 0,
    published: 0,
    forwardedToBatch: 0,
    candidateToBatchMs: null,
    batchToExtractionMs: null,
    extractionToPendingMs: null,
  };
}

/**
 * Conteos derivados de filas persistidas. No es un score.
 * El estado actual del ítem es el que cuenta: publicado no suma también como aprobado.
 */
export function summarizeAcquisition(input: {
  candidates: CandidateInput[];
  items?: ItemInput[];
}): AcquisitionMetricRow[] {
  const buckets = new Map<string, AcquisitionMetricRow>();
  const clocks = new Map<string, { toBatch: Clock; toExtraction: Clock; toPending: Clock }>();
  const byCandidate = new Map<string, { bucket: string; discoveredAt: string }>();

  for (const candidate of input.candidates) {
    const attribution = readAcquisitionAttribution(candidate.evidence);
    if (!attribution) continue;
    const day = dayOf(candidate.discovered_at || attribution.discoveredAt);
    const key = `${attribution.sourceKey}\0${attribution.scoutId ?? ''}\0${attribution.submissionId}\0${day}`;
    const row = buckets.get(key) ?? blank(attribution.sourceKey, attribution.scoutId, attribution.submissionId, day);
    row.candidatesFound += 1;
    const decision = candidate.decision ?? '';
    if (decision === 'NEEDS_REVIEW' || decision === 'WOULD_INSERT') row.candidatesAccepted += 1;
    else if (decision === 'DUPLICATE') row.candidatesDuplicate += 1;
    else if (decision.startsWith('REJECTED_')) row.candidatesRejected += 1;
    buckets.set(key, row);
    clocks.set(key, clocks.get(key) ?? { toBatch: { sum: 0, n: 0 }, toExtraction: { sum: 0, n: 0 }, toPending: { sum: 0, n: 0 } });
    if (candidate.run_id && candidate.candidate_key) {
      byCandidate.set(`${candidate.run_id}\0${candidate.candidate_key}`, {
        bucket: key,
        discoveredAt: candidate.discovered_at || attribution.discoveredAt,
      });
    }
  }

  for (const item of input.items ?? []) {
    const root = item.evidence && typeof item.evidence === 'object' ? (item.evidence as { hunter?: unknown }).hunter : null;
    const hunter = root && typeof root === 'object' ? (root as { run_id?: unknown; candidate_key?: unknown }) : null;
    const runId = typeof hunter?.run_id === 'string' ? hunter.run_id : '';
    const candidateKey = typeof hunter?.candidate_key === 'string' ? hunter.candidate_key : '';
    const bucketKey = byCandidate.get(`${runId}\0${candidateKey}`);
    if (!bucketKey) continue;
    const row = buckets.get(bucketKey.bucket);
    const clock = clocks.get(bucketKey.bucket);
    if (!row || !clock) continue;
    row.forwardedToBatch += 1;
    const toBatch = elapsed(bucketKey.discoveredAt, item.created_at);
    const toExtraction = elapsed(item.created_at, item.processed_at);
    const toPending = elapsed(item.processed_at, item.approved_at);
    if (toBatch != null) {
      clock.toBatch.sum += toBatch;
      clock.toBatch.n += 1;
    }
    if (toExtraction != null) {
      clock.toExtraction.sum += toExtraction;
      clock.toExtraction.n += 1;
    }
    if (toPending != null) {
      clock.toPending.sum += toPending;
      clock.toPending.n += 1;
    }
    if (item.status === 'READY') row.extractionReady += 1;
    else if (item.status === 'NEEDS_REVIEW') row.extractionNeedsReview += 1;
    else if (item.status === 'ERROR') row.extractionError += 1;
    else if (item.status === 'APPROVED') {
      row.approved += 1;
      row.pending += 1;
    } else if (item.status === 'PUBLISHED') row.published += 1;
  }

  for (const [key, row] of buckets) {
    const clock = clocks.get(key);
    if (!clock) continue;
    row.candidateToBatchMs = average(clock.toBatch);
    row.batchToExtractionMs = average(clock.toExtraction);
    row.extractionToPendingMs = average(clock.toPending);
  }

  return [...buckets.values()];
}

export async function loadAcquisitionMetrics(
  supabase: SupabaseClient,
  opts?: { sourceKey?: string | null },
): Promise<AcquisitionMetricRow[]> {
  const since = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  let candidatesQuery = supabase
    .from('hunter_offer_candidates')
    .select('run_id, candidate_key, decision, discovered_at, evidence')
    .gte('discovered_at', since)
    .limit(2000);
  let itemsQuery = supabase
    .from('offer_batch_items')
    .select('status, evidence, created_at, processed_at, approved_at')
    .gte('created_at', since)
    .limit(2000);
  if (opts?.sourceKey) {
    candidatesQuery = candidatesQuery.filter('evidence->acquisition->>source_key', 'eq', opts.sourceKey);
    itemsQuery = itemsQuery.filter('evidence->hunter->acquisition->>source_key', 'eq', opts.sourceKey);
  } else {
    candidatesQuery = candidatesQuery.filter('evidence->acquisition->>source_key', 'neq', '');
  }
  const [candidates, items] = await Promise.all([candidatesQuery, itemsQuery]);
  if (candidates.error) {
    console.error('[acquisition] metrics candidates failed:', candidates.error.message);
    return [];
  }
  if (items.error) {
    console.error('[acquisition] metrics items failed:', items.error.message);
  }
  return summarizeAcquisition({
    candidates: (candidates.data ?? []) as CandidateInput[],
    items: items.error ? [] : ((items.data ?? []) as ItemInput[]),
  });
}
