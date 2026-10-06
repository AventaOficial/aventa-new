import { GUIDES, type GuideId } from '@/app/descubre/guides/content';

const KEY = 'aventa_guide_progress_v1';

export type GuideProgressMap = Record<GuideId, number>;

export function emptyGuideProgress(): GuideProgressMap {
  return Object.fromEntries(GUIDES.map((guide) => [guide.id, -1])) as GuideProgressMap;
}

export function readGuideProgress(): GuideProgressMap {
  const empty = emptyGuideProgress();
  if (typeof window === 'undefined') return empty;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<GuideProgressMap>;
    for (const guide of GUIDES) {
      const value = parsed[guide.id];
      empty[guide.id] = Number.isFinite(value) ? Number(value) : -1;
    }
    return empty;
  } catch {
    return emptyGuideProgress();
  }
}

export function markGuideStep(id: GuideId, index: number): GuideProgressMap {
  const current = readGuideProgress();
  const next = { ...current, [id]: Math.max(current[id], index) };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // quota / private mode
  }
  return next;
}

export function stepsSeen(id: GuideId, total: number, progress: GuideProgressMap): number {
  if (total <= 0) return 0;
  return Math.min(total, Math.max(0, progress[id] + 1));
}

export function totalGuideSteps(): number {
  return GUIDES.reduce((sum, g) => sum + g.steps.length, 0);
}

export function completedGuideCount(progress: GuideProgressMap): number {
  return GUIDES.filter((g) => stepsSeen(g.id, g.steps.length, progress) >= g.steps.length).length;
}
