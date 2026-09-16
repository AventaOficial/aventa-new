import type { SupabaseClient } from '@supabase/supabase-js';
import { staleModerationLockIso } from './atomicModerationLock';
import { writeModerationAuditBatch } from './writeModerationAudit';

export type StaleLockReleaseResult = {
  released: number;
  audited: number;
  offerIds: string[];
};

/**
 * Libera locks abandonados (locked_at < lease TTL).
 * Idempotente. No cambia status. No aprueba ni rechaza.
 * La oferta vuelve a la cola elegible para el siguiente claim.
 * Escribe auditoría `lock_reclaimed_stale` (fail-soft).
 */
export async function releaseStaleModerationLocks(
  supabase: SupabaseClient,
  opts?: { nowMs?: number; limit?: number; actorUserId?: string | null },
): Promise<StaleLockReleaseResult> {
  const staleIso = staleModerationLockIso(opts?.nowMs);
  const limit = Math.max(1, Math.min(500, opts?.limit ?? 200));
  const empty: StaleLockReleaseResult = { released: 0, audited: 0, offerIds: [] };

  const { data: staleRows, error: selectError } = await supabase
    .from('offers')
    .select('id, locked_by, locked_at')
    .eq('status', 'pending')
    .not('locked_by', 'is', null)
    .lt('locked_at', staleIso)
    .limit(limit);

  if (selectError) return empty;
  const rows = (staleRows ?? []) as Array<{
    id: string;
    locked_by: string | null;
    locked_at: string | null;
  }>;
  const ids = rows.map((r) => r.id).filter(Boolean);
  if (ids.length === 0) return empty;

  const { data: updated, error } = await supabase
    .from('offers')
    .update({ locked_by: null, locked_at: null })
    .in('id', ids)
    .eq('status', 'pending')
    .lt('locked_at', staleIso)
    .select('id');

  if (error) return empty;
  const releasedIds = ((updated ?? []) as Array<{ id: string }>).map((r) => r.id).filter(Boolean);
  if (releasedIds.length === 0) return empty;

  const releasedSet = new Set(releasedIds);
  const auditRows = rows
    .filter((r) => releasedSet.has(r.id))
    .map((r) => ({
      offerId: r.id,
      userId: opts?.actorUserId ?? null,
      action: 'lock_reclaimed_stale' as const,
      previousStatus: 'pending',
      newStatus: 'pending',
      reason: 'lease_expired',
      metadata: {
        previous_locked_by: r.locked_by,
        previous_locked_at: r.locked_at,
        reclaim_kind: opts?.actorUserId ? 'manual' : 'system',
      },
    }));

  const audit = await writeModerationAuditBatch(supabase, auditRows);

  return {
    released: releasedIds.length,
    audited: audit.written,
    offerIds: releasedIds,
  };
}
