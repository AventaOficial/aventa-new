/**
 * Audit append-only para conversion/commission/settlement.
 * Sin PII. Sin secretos. Sin money mutation (salvo que el caller ya mutó).
 *
 * Fail-closed: callers MUST treat ok=false as integrity failure.
 * Soft-console-only was a P0 audit gap — silent loss of economic trail.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type AppendEconomicEventResult =
  | { ok: true }
  | { ok: false; error: string };

export async function appendEconomicEvent(
  supabase: SupabaseClient,
  input: {
    entityType: 'conversion' | 'commission' | 'settlement';
    entityId: string;
    eventType: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    actor?: string;
    payload?: Record<string, unknown>;
  },
): Promise<AppendEconomicEventResult> {
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
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
