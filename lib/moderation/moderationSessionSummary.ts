const STORAGE_PREFIX = 'aventa_moderation_last_seen_';

export function getModerationLastSeenKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function readModerationLastSeen(userId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(getModerationLastSeenKey(userId));
  } catch {
    return null;
  }
}

export function writeModerationLastSeen(userId: string, iso = new Date().toISOString()): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getModerationLastSeenKey(userId), iso);
  } catch {
    /* ignore */
  }
}

export function defaultModerationSinceIso(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}
