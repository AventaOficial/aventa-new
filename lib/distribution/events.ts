import type { SupabaseClient } from '@supabase/supabase-js';
import type { DistributionEventType } from './types';

/** Append-only distribution event. Fail-soft for callers. */
export async function appendDistributionEvent(
  supabase: SupabaseClient,
  input: {
    publicationId: string;
    eventType: DistributionEventType;
    meta?: Record<string, unknown>;
  },
): Promise<boolean> {
  const { error } = await supabase.from('distribution_events').insert({
    publication_id: input.publicationId,
    event_type: input.eventType,
    meta: input.meta ?? {},
  });
  if (error) {
    console.error('[distribution] event insert failed:', error.message);
    return false;
  }
  return true;
}
