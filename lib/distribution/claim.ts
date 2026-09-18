import type { SupabaseClient } from '@supabase/supabase-js';
import { appendDistributionEvent } from './events';

export const DISTRIBUTION_MAX_ATTEMPTS = 5;

export type ClaimedPublication = {
  id: string;
  offer_id: string;
  destination_id: string;
  status: string;
  provider: string;
  attempt_count: number;
  external_destination_key: string | null;
  tracking_campaign_key: string | null;
  idempotency_key: string;
  external_message_id: string | null;
};

/**
 * Atomic CAS claim: only transitions pending|retryable → publishing.
 * Safe under concurrent workers (losing updater gets null).
 */
export async function claimDistributionPublication(
  supabase: SupabaseClient,
  publicationId: string,
  nowIso: string = new Date().toISOString(),
): Promise<ClaimedPublication | null> {
  const { data, error } = await supabase
    .from('distribution_publications')
    .update({
      status: 'publishing',
      updated_at: nowIso,
      // attempt_count incremented via read-modify — see claimNext
    })
    .eq('id', publicationId)
    .in('status', ['pending', 'retryable'])
    .select(
      'id, offer_id, destination_id, status, provider, attempt_count, external_destination_key, tracking_campaign_key, idempotency_key, external_message_id',
    )
    .maybeSingle();

  if (error || !data) return null;
  return data as ClaimedPublication;
}

/**
 * Pick due rows then CAS-claim each. Losing races are skipped.
 */
export async function claimNextDistributionPublications(
  supabase: SupabaseClient,
  options?: { limit?: number; nowMs?: number },
): Promise<ClaimedPublication[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 10, 50));
  const nowIso = new Date(options?.nowMs ?? Date.now()).toISOString();

  const { data: candidates, error } = await supabase
    .from('distribution_publications')
    .select(
      'id, offer_id, destination_id, status, provider, attempt_count, external_destination_key, tracking_campaign_key, idempotency_key, external_message_id, next_attempt_at',
    )
    .in('status', ['pending', 'retryable'])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error || !candidates?.length) return [];

  const claimed: ClaimedPublication[] = [];
  for (const row of candidates) {
    const nextAttempts = Number(row.attempt_count ?? 0) + 1;
    const { data, error: upErr } = await supabase
      .from('distribution_publications')
      .update({
        status: 'publishing',
        attempt_count: nextAttempts,
        updated_at: nowIso,
      })
      .eq('id', row.id)
      .in('status', ['pending', 'retryable'])
      .select(
        'id, offer_id, destination_id, status, provider, attempt_count, external_destination_key, tracking_campaign_key, idempotency_key, external_message_id',
      )
      .maybeSingle();

    if (upErr || !data) continue;

    const pub = data as ClaimedPublication;
    claimed.push(pub);
    await appendDistributionEvent(supabase, {
      publicationId: pub.id,
      eventType: 'publication_attempted',
      meta: { phase: 'claim', attempt_count: pub.attempt_count },
    });
  }

  return claimed;
}

/** Exponential backoff minutes: 1, 5, 15, 60, 360 */
export function distributionBackoffMinutes(attemptCount: number): number {
  const table = [1, 5, 15, 60, 360];
  const idx = Math.max(0, Math.min(attemptCount - 1, table.length - 1));
  return table[idx]!;
}
