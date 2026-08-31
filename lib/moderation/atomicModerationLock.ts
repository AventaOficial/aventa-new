import type { SupabaseClient } from '@supabase/supabase-js';
import { isModerationLockStale, MODERATION_LOCK_STALE_MS, type ModerationLockFields } from './moderationLock';

export function staleModerationLockIso(nowMs = Date.now()): string {
  return new Date(nowMs - MODERATION_LOCK_STALE_MS).toISOString();
}

/** El moderador actual puede actuar sobre esta oferta. */
export function moderatorOwnsActiveLock(
  lock: ModerationLockFields,
  moderatorId: string | null | undefined
): boolean {
  if (!moderatorId || !lock.locked_by) return false;
  if (lock.locked_by !== moderatorId) return false;
  return !isModerationLockStale(lock.locked_at);
}

/**
 * Estación normal: requiere lock activo del moderador que decide.
 * No permite decidir sin claim ni con lock ajeno/stale.
 */
export function assertModeratorOwnsLock(
  lock: ModerationLockFields,
  moderatorId: string
): { ok: true } | { ok: false; error: string } {
  if (moderatorOwnsActiveLock(lock, moderatorId)) return { ok: true };

  if (!lock.locked_by) {
    return {
      ok: false,
      error: 'Debes reclamar la oferta antes de decidir.',
    };
  }

  if (lock.locked_by !== moderatorId) {
    return {
      ok: false,
      error: 'Esta oferta ya está siendo moderada por otro usuario.',
    };
  }

  return {
    ok: false,
    error: 'El lock de la oferta expiró. Reclámala de nuevo.',
  };
}

/**
 * Reclama una oferta de forma atómica (UPDATE condicional).
 * Solo una transacción gana si dos moderadores compiten por la misma fila.
 */
export async function tryAcquireModerationLock(
  supabase: SupabaseClient,
  offerId: string,
  moderatorId: string
): Promise<{ claimed: boolean; error?: string }> {
  const nowIso = new Date().toISOString();
  const staleIso = staleModerationLockIso();

  const { data, error } = await supabase
    .from('offers')
    .update({ locked_by: moderatorId, locked_at: nowIso })
    .eq('id', offerId)
    .eq('status', 'pending')
    .or(`locked_by.is.null,locked_by.eq.${moderatorId},locked_at.lt.${staleIso}`)
    .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`)
    .select('id')
    .maybeSingle();

  if (error) return { claimed: false, error: error.message };
  return { claimed: Boolean(data?.id) };
}

export async function releaseModerationLockIfOwner(
  supabase: SupabaseClient,
  offerId: string,
  moderatorId: string
): Promise<void> {
  await supabase
    .from('offers')
    .update({ locked_by: null, locked_at: null })
    .eq('id', offerId)
    .eq('locked_by', moderatorId);
}
