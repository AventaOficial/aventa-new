import { GUIDES, type GuideId } from '@/app/descubre/guides/content';

const KEY = 'aventa_guide_progress_v1';

export type GuideProgressMap = Record<GuideId, number>;

const EMPTY: GuideProgressMap = { aventa: -1, cazador: -1, ahorrador: -1 };

export function readGuideProgress(): GuideProgressMap {
  if (typeof window === 'undefined') return { ...EMPTY };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<GuideProgressMap>;
    return {
      aventa: Number.isFinite(parsed.aventa) ? Number(parsed.aventa) : -1,
      cazador: Number.isFinite(parsed.cazador) ? Number(parsed.cazador) : -1,
      ahorrador: Number.isFinite(parsed.ahorrador) ? Number(parsed.ahorrador) : -1,
    };
  } catch {
    return { ...EMPTY };
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
