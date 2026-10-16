const STORAGE_PREFIX = 'aventa_password_reset_sent_at:';

export function passwordResetSentStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function readPasswordResetSentAt(userId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(passwordResetSentStorageKey(userId));
    if (!raw) return null;
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? raw : null;
  } catch {
    return null;
  }
}

export function writePasswordResetSentAt(userId: string, iso: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(passwordResetSentStorageKey(userId), iso);
  } catch {
    /* quota / private mode */
  }
}

export function formatPasswordResetSentAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}
