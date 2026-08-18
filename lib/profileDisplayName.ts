const STORAGE_KEY = 'aventa:displayName';

export function readCachedDisplayName(userId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { uid?: string; name?: string };
    if (parsed.uid !== userId || typeof parsed.name !== 'string') return null;
    const name = parsed.name.trim();
    return name || null;
  } catch {
    return null;
  }
}

export function writeCachedDisplayName(userId: string, name: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = name.trim();
  if (!trimmed) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ uid: userId, name: trimmed }));
  } catch {
    /* quota / private mode */
  }
}
