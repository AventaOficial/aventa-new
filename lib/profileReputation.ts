const STORAGE_KEY = 'aventa:profileReputation';

export type ProfileReputation = {
  level: number;
  score: number;
};

export function readCachedProfileReputation(userId: string): ProfileReputation | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { uid?: string; level?: number; score?: number };
    if (parsed.uid !== userId) return null;
    if (typeof parsed.level !== 'number' || typeof parsed.score !== 'number') return null;
    return {
      level: Math.max(1, parsed.level),
      score: Math.max(0, parsed.score),
    };
  } catch {
    return null;
  }
}

export function writeCachedProfileReputation(userId: string, rep: ProfileReputation): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        uid: userId,
        level: Math.max(1, rep.level),
        score: Math.max(0, rep.score),
      }),
    );
  } catch {
    /* quota / private mode */
  }
}
