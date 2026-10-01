import type { SupabaseClient } from '@supabase/supabase-js';

export type RewardAuditInput = {
  eventType: string;
  actorId?: string | null;
  entityType: string;
  entityId: string;
  previousState?: string | null;
  newState?: string | null;
  metadata?: Record<string, unknown>;
};

function isMissingAuditTable(error: { message?: string } | null): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes('reward_audit_log') || msg.includes('does not exist') || msg.includes('schema cache');
}

export async function writeRewardAuditLog(
  supabase: SupabaseClient,
  input: RewardAuditInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('reward_audit_log').insert({
    event_type: input.eventType,
    actor_id: input.actorId ?? null,
    entity_type: input.entityType,
    entity_id: input.entityId,
    previous_state: input.previousState ?? null,
    new_state: input.newState ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    if (!isMissingAuditTable(error)) {
      console.error('[rewards/audit]', error.message);
    }
    return { ok: false, error: error.message ?? 'audit_append_failed' };
  }
  return { ok: true };
}
