const STORAGE_PREFIX = 'aventa_moderation_last_seen_';
const SESSION_SHOWN_PREFIX = 'aventa_moderation_summary_shown_';

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

/** Una sola vez por pestaña/sesión de navegador (evita reaparición al remount). */
export function wasModerationSummaryShownThisSession(userId: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return sessionStorage.getItem(`${SESSION_SHOWN_PREFIX}${userId}`) === '1';
  } catch {
    return true;
  }
}

export function markModerationSummaryShownThisSession(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(`${SESSION_SHOWN_PREFIX}${userId}`, '1');
  } catch {
    /* ignore */
  }
}

export type ModerationSummaryActivity = {
  newOffers: number;
  lowTrustOffers: number;
  newReports: number;
};

/** Solo novedades accionables; “en revisión ahora” no justifica interrumpir. */
export function hasModerationSummaryActivity(s: ModerationSummaryActivity): boolean {
  return s.newOffers > 0 || s.lowTrustOffers > 0 || s.newReports > 0;
}
