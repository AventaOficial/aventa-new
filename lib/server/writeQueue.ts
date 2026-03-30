import { createServerClient } from '@/lib/supabase/server';

type EventType = 'view' | 'outbound' | 'share' | 'cazar_cta';

type EventPayload = {
  offer_id: string;
  user_id: string | null;
  event_type: EventType;
};

type QueueStatus = 'pending' | 'processing' | 'done' | 'failed';

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

export async function flushWriteQueue(batchSize = 100): Promise<{
  processed: number;
  failed: number;
  remainingPending: number;
}> {
  const supabase = createServerClient();
  const size = Math.max(1, Math.min(500, batchSize));

  const { data: pendingRows, error: readError } = await supabase
    .from('write_jobs_queue')
    .select('id, job_type, payload, attempts')
    .eq('status', 'pending')
    .order('id', { ascending: true })
    .limit(size);

  if (readError) {
    throw new Error(readError.message);
  }

  const rows = (pendingRows ?? []) as Array<{
    id: number;
    job_type: string;
    payload: EventPayload;
    attempts: number;
  }>;

  if (rows.length === 0) {
    const { count } = await supabase
      .from('write_jobs_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    return { processed: 0, failed: 0, remainingPending: count ?? 0 };
  }

  const ids = rows.map((r) => r.id);
  await supabase
    .from('write_jobs_queue')
    .update({ status: 'processing' satisfies QueueStatus, locked_at: new Date().toISOString() })
    .in('id', ids)
    .eq('status', 'pending');

  let processed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      if (row.job_type === 'offer_event') {
        const ok = await insertEventDirect(row.payload);
        if (!ok) {
          failed++;
          await supabase
            .from('write_jobs_queue')
            .update({
              status: 'failed' satisfies QueueStatus,
              attempts: (row.attempts ?? 0) + 1,
              error: 'offer_events insert failed',
            })
            .eq('id', row.id);
          continue;
        }
      }

      processed++;
      await supabase
        .from('write_jobs_queue')
        .update({
          status: 'done' satisfies QueueStatus,
          processed_at: new Date().toISOString(),
          attempts: (row.attempts ?? 0) + 1,
          error: null,
        })
        .eq('id', row.id);
    } catch (error) {
      failed++;
      await supabase
        .from('write_jobs_queue')
        .update({
          status: 'failed' satisfies QueueStatus,
          attempts: (row.attempts ?? 0) + 1,
          error: error instanceof Error ? error.message : String(error),
        })
        .eq('id', row.id);
    }
  }

  const { count: remaining } = await supabase
    .from('write_jobs_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  return { processed, failed, remainingPending: remaining ?? 0 };
}

export async function getWriteQueueBacklog(): Promise<{
  pending: number;
  failed: number;
}> {
  const supabase = createServerClient();
  const [pendingRes, failedRes] = await Promise.all([
    supabase.from('write_jobs_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('write_jobs_queue').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
  ]);
  return {
    pending: pendingRes.count ?? 0,
    failed: failedRes.count ?? 0,
  };
}

