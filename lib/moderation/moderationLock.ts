/** Lock de colaboración expira tras 5 min sin heartbeat. */
export const MODERATION_LOCK_STALE_MS = 5 * 60 * 1000;

export type ModerationLockFields = {
  locked_by?: string | null;
  locked_at?: string | null;
};

export function isModerationLockStale(lockedAt: string | null | undefined, nowMs = Date.now()): boolean {
  if (!lockedAt) return true;
  const t = new Date(lockedAt).getTime();
  if (!Number.isFinite(t)) return true;
  return nowMs - t > MODERATION_LOCK_STALE_MS;
}

export function isOfferLockedByOther(
  lock: ModerationLockFields,
  currentUserId: string | null | undefined
): boolean {
  if (!lock.locked_by || !currentUserId) return false;
  if (lock.locked_by === currentUserId) return false;
  return !isModerationLockStale(lock.locked_at);
}
