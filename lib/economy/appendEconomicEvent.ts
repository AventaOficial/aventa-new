/**
 * Audit append-only para conversion/commission.
 * Sin PII. Sin secretos. Sin money mutation.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export async function appendEconomicEvent(
  supabase: SupabaseClient,
  input: {
    entityType: 'conversion' | 'commission';
    entityId: string;
    eventType: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    actor?: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from('affiliate_economic_events').insert({
    entity_type: input.entityType,
    entity_id: input.entityId,
    event_type: input.eventType,
    from_status: input.fromStatus ?? null,
    to_status: input.toStatus ?? null,
    actor: input.actor ?? 'system',
    payload: input.payload ?? {},
  });
  if (error) {
    console.error('[economy/appendEconomicEvent]', error.message);
  }
}
