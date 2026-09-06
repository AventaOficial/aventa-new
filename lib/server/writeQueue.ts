import { createServerClient } from '@/lib/supabase/server';

type EventType = 'view' | 'outbound' | 'share' | 'cazar_cta';

type EventPayload = {
  offer_id: string;
  user_id: string | null;
  event_type: EventType;
};

export type QueueStatus = 'pending' | 'processing' | 'done' | 'failed';

type WriteJobRow = {
  id: number;
  job_type: string;
  payload: EventPayload;
  attempts: number;
};

/** Intentos máximos antes de poison/dead-letter (failed permanente). */
export const WRITE_JOB_MAX_ATTEMPTS = 5;

/** Jobs en processing más viejos que esto se reclaman a pending (crash recovery). */
export const WRITE_JOB_STALE_PROCESSING_MS = 15 * 60 * 1000;

/** Solo jobs que el UPDATE reclamó (status seguía pending). Evita doble procesamiento. */
export function claimedJobRows<T extends { id: number }>(
  requested: T[],
  claimed: Array<{ id: number }> | null | undefined,
): T[] {
  const claimedIds = new Set((claimed ?? []).map((row) => row.id));
  return requested.filter((row) => claimedIds.has(row.id));
}

/**
 * Tras un fallo de procesamiento: reintentar (pending) o dead-letter (failed).
 * Nunca deja un job en processing. No reabre jobs que ya estaban en failed.
 */
export function resolveFailureStatus(attemptsAfter: number, maxAttempts = WRITE_JOB_MAX_ATTEMPTS): {
  status: Extract<QueueStatus, 'pending' | 'failed'>;
  permanent: boolean;
} {
  if (attemptsAfter >= maxAttempts) {
    return { status: 'failed', permanent: true };
  }
  return { status: 'pending', permanent: false };
}

export function isStaleProcessingLock(
  lockedAt: string | null | undefined,
  nowMs: number,
  staleMs = WRITE_JOB_STALE_PROCESSING_MS,
): boolean {
  if (!lockedAt) return true;
  const t = Date.parse(lockedAt);
  if (!Number.isFinite(t)) return true;
  return nowMs - t >= staleMs;
}

function getWriteMode(): 'direct' | 'adaptive' | 'queue' {
  const mode = (process.env.EVENT_WRITE_MODE ?? 'adaptive').trim().toLowerCase();
  if (mode === 'direct' || mode === 'queue') return mode;
  return 'adaptive';
}

async function insertEventDirect(payload: EventPayload): Promise<boolean> {
  const supabase = createServerClient();
  const { error } = await supabase.from('offer_events').insert(payload);
  if (!error) return true;
  console.error('[writeQueue] direct insert failed:', error.message);
  return false;
}

export async function enqueueOfferEvent(payload: EventPayload): Promise<boolean> {
  const supabase = createServerClient();
  const { error } = await supabase.from('write_jobs_queue').insert({
    job_type: 'offer_event',
    payload,
    status: 'pending',
    attempts: 0,
  });
  if (!error) return true;
  console.error('[writeQueue] enqueue failed:', error.message);
  return false;
}

export async function recordOfferEvent(payload: EventPayload): Promise<void> {
  const mode = getWriteMode();

  if (mode === 'direct') {
    await insertEventDirect(payload);
    return;
  }

  if (mode === 'queue') {
    await enqueueOfferEvent(payload);
    return;
  }

  // adaptive: intento directo y, si falla, encolo.
  const ok = await insertEventDirect(payload);
  if (!ok) {
    await enqueueOfferEvent(payload);
  }
}

/** Reclama jobs stuck en processing (worker crash) → pending. No toca failed históricos. */
export async function reclaimStaleProcessingJobs(
  now = new Date(),
  staleMs = WRITE_JOB_STALE_PROCESSING_MS,
): Promise<number> {
  const supabase = createServerClient();
  const cutoff = new Date(now.getTime() - staleMs).toISOString();
  const { data, error } = await supabase
    .from('write_jobs_queue')
    .update({
      status: 'pending' satisfies QueueStatus,
      locked_at: null,
      error: 'reclaimed: stale processing lease',
    })
    .eq('status', 'processing')
    .or(`locked_at.is.null,locked_at.lt."${cutoff}"`)
    .select('id');

  if (error) {
    console.error('[writeQueue] reclaim stale failed:', error.message);
    return 0;
  }
  return data?.length ?? 0;
}

export async function flushWriteQueue(batchSize = 100): Promise<{
  processed: number;
  failed: number;
  retried: number;
  reclaimed: number;
  remainingPending: number;
}> {
  const supabase = createServerClient();
  const size = Math.max(1, Math.min(500, batchSize));
  const reclaimed = await reclaimStaleProcessingJobs();

  const { data: pendingRows, error: readError } = await supabase
    .from('write_jobs_queue')
    .select('id, job_type, payload, attempts')
    .eq('status', 'pending')
    .order('id', { ascending: true })
    .limit(size);

  if (readError) {
    throw new Error(readError.message);
  }

  const rows = (pendingRows ?? []) as WriteJobRow[];

  if (rows.length === 0) {
    const { count } = await supabase
      .from('write_jobs_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    return { processed: 0, failed: 0, retried: 0, reclaimed, remainingPending: count ?? 0 };
  }

  const ids = rows.map((r) => r.id);
  const { data: claimedRows, error: claimError } = await supabase
    .from('write_jobs_queue')
    .update({ status: 'processing' satisfies QueueStatus, locked_at: new Date().toISOString() })
    .in('id', ids)
    .eq('status', 'pending')
    .select('id, job_type, payload, attempts');

  if (claimError) {
    throw new Error(claimError.message);
  }

  const claimed = claimedJobRows(rows, claimedRows);
  let processed = 0;
  let failed = 0;
  let retried = 0;

  for (const row of claimed) {
    const attemptsAfter = (row.attempts ?? 0) + 1;
    try {
      if (row.job_type !== 'offer_event') {
        failed++;
        await supabase
          .from('write_jobs_queue')
          .update({
            status: 'failed' satisfies QueueStatus,
            attempts: attemptsAfter,
            error: `unknown job_type: ${row.job_type}`,
            locked_at: null,
          })
          .eq('id', row.id)
          .eq('status', 'processing');
        continue;
      }

      const ok = await insertEventDirect(row.payload);
      if (!ok) {
        const outcome = resolveFailureStatus(attemptsAfter);
        if (outcome.permanent) failed++;
        else retried++;
        await supabase
          .from('write_jobs_queue')
          .update({
            status: outcome.status,
            attempts: attemptsAfter,
            error: outcome.permanent
              ? `offer_events insert failed (max attempts ${WRITE_JOB_MAX_ATTEMPTS})`
              : 'offer_events insert failed; will retry',
            locked_at: null,
          })
          .eq('id', row.id)
          .eq('status', 'processing');
        continue;
      }

      processed++;
      await supabase
        .from('write_jobs_queue')
        .update({
          status: 'done' satisfies QueueStatus,
          processed_at: new Date().toISOString(),
          attempts: attemptsAfter,
          error: null,
          locked_at: null,
        })
        .eq('id', row.id)
        .eq('status', 'processing');
    } catch (error) {
      const outcome = resolveFailureStatus(attemptsAfter);
      if (outcome.permanent) failed++;
      else retried++;
      await supabase
        .from('write_jobs_queue')
        .update({
          status: outcome.status,
          attempts: attemptsAfter,
          error: error instanceof Error ? error.message : String(error),
          locked_at: null,
        })
        .eq('id', row.id)
        .eq('status', 'processing');
    }
  }

  const { count: remaining } = await supabase
    .from('write_jobs_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  return { processed, failed, retried, reclaimed, remainingPending: remaining ?? 0 };
}

export async function getWriteQueueBacklog(): Promise<{
  pending: number;
  failed: number;
  processing: number;
}> {
  const supabase = createServerClient();
  const [pendingRes, failedRes, processingRes] = await Promise.all([
    supabase.from('write_jobs_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('write_jobs_queue').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    supabase.from('write_jobs_queue').select('id', { count: 'exact', head: true }).eq('status', 'processing'),
  ]);
  return {
    pending: pendingRes.count ?? 0,
    failed: failedRes.count ?? 0,
    processing: processingRes.count ?? 0,
  };
}
