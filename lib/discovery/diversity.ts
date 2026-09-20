import { SOURCE_QUALITY_PRIORS } from './negativeMemory/types';

/**
 * Soft source quality multiplier from observed approve rates (DQ-03).
 * Does not eliminate ml_worker — only reallocates shortlist preference.
 */
export function sourceQualityMultiplier(sourceId: string | null | undefined): number {
  if (!sourceId) return 1;
  const prior = SOURCE_QUALITY_PRIORS.find((p) => p.sourceId === sourceId);
  if (!prior) return 1;
  // Normalize around ~0.12 baseline so ml_api > 1, ml_worker < 1 but > 0.7
  const baseline = 0.12;
  const raw = prior.approveRate / baseline;
  return Math.min(1.35, Math.max(0.75, raw));
}

export type DiversityCandidate = {
  id: string;
  score: number;
  category?: string | null;
  title?: string | null;
  source?: string | null;
};

/**
 * Shortlist con diversidad de categoría antes del POST/insert.
 * Round-robin suave: no más de `maxPerCategory` seguidos de la misma categoría
 * mientras queden alternativas.
 */
export function selectDiverseShortlist<T extends DiversityCandidate>(
  candidates: readonly T[],
  limit: number,
  opts?: { maxPerCategory?: number },
): T[] {
  const cap = Math.max(0, Math.floor(limit));
  if (cap === 0 || candidates.length === 0) return [];

  const maxPerCat = Math.max(1, opts?.maxPerCategory ?? Math.max(2, Math.ceil(cap / 3)));
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const picked: T[] = [];
  const catCounts = new Map<string, number>();
  const used = new Set<string>();

  const catKey = (c: T) => {
    const raw = (c.category ?? '').trim().toLowerCase();
    if (raw) return raw;
    // Soft family hint from title when category missing (no hard blacklist)
    const t = (c.title ?? '').toLowerCase();
    if (/aud[ií]fono|earbud|airpods|headset/i.test(t)) return '_family:audio';
    if (/smartwatch|reloj inteligente/i.test(t)) return '_family:watch';
    if (/\btv\b|television|smart tv/i.test(t)) return '_family:tv';
    return '_unknown';
  };

  // Pass 1: respect per-category caps
  for (const c of sorted) {
    if (picked.length >= cap) break;
    const key = catKey(c);
    const n = catCounts.get(key) ?? 0;
    if (n >= maxPerCat) continue;
    picked.push(c);
    used.add(c.id);
    catCounts.set(key, n + 1);
  }

  // Pass 2: fill remaining with best leftover (boundedness > perfect diversity)
  if (picked.length < cap) {
    for (const c of sorted) {
      if (picked.length >= cap) break;
      if (used.has(c.id)) continue;
      picked.push(c);
      used.add(c.id);
    }
  }

  return picked;
}
