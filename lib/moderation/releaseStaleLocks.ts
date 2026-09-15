import type { SupabaseClient } from '@supabase/supabase-js';
import { staleModerationLockIso } from './atomicModerationLock';

/**
 * Libera locks abandonados (locked_at < lease TTL).
 * Idempotente. No cambia status. No aprueba ni rechaza.
 * La oferta vuelve a la cola elegible para el siguiente claim.
 */
export async function releaseStaleModerationLocks(
  supabase: SupabaseClient,
  opts?: { nowMs?: number; limit?: number },
): Promise<{ released: number }> {
  const staleIso = staleModerationLockIso(opts?.nowMs);
  const limit = Math.max(1, Math.min(500, opts?.limit ?? 200));

  const { data: staleRows, error: selectError } = await supabase
    .from('offers')
    .select('id')
    .eq('status', 'pending')
    .not('locked_by', 'is', null)
    .lt('locked_at', staleIso)
    .limit(limit);

  if (selectError) return { released: 0 };
  const ids = (staleRows ?? []).map((r) => (r as { id: string }).id).filter(Boolean);
  if (ids.length === 0) return { released: 0 };

  const { data: updated, error } = await supabase
    .from('offers')
    .update({ locked_by: null, locked_at: null })
    .in('id', ids)
    .eq('status', 'pending')
    .lt('locked_at', staleIso)
    .select('id');

  if (error) return { released: 0 };
  return { released: (updated ?? []).length };
}
