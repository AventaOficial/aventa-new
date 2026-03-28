import { normalizeCategoryForStorage } from '@/lib/categories';

export type ModerationObjectivePeriod = '24h' | '7d';

export const MOD_OBJECTIVE_DAILY_TOTAL = 50;
export const MOD_OBJECTIVE_DAILY_QUALITY = 10;
export const MOD_OBJECTIVE_DAILY_CATEGORY: Record<string, number> = {
  tecnologia: 5,
  gaming: 3,
  hogar: 8,
  supermercado: 10,
  moda: 8,
  belleza: 5,
  viajes: 4,
  servicios: 7,
};

export function getObjectiveTargets(period: ModerationObjectivePeriod): {
  total: number;
  quality: number;
  categories: Record<string, number>;
} {
  const factor = period === '24h' ? 1 : 7;
  const categories = Object.fromEntries(
    Object.entries(MOD_OBJECTIVE_DAILY_CATEGORY).map(([key, value]) => [key, value * factor]),
  );
  return {
    total: MOD_OBJECTIVE_DAILY_TOTAL * factor,
    quality: MOD_OBJECTIVE_DAILY_QUALITY * factor,
    categories,
  };
}

export function periodStartIso(period: ModerationObjectivePeriod): string {
  const now = Date.now();
  const ms = period === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  return new Date(now - ms).toISOString();
}

export function classifyCategoryForObjectives(category: string | null | undefined): string | null {
  const norm = normalizeCategoryForStorage(category ?? null);
  if (!norm || norm === 'other') return null;
  return norm;
}

/** Oferta "de calidad" para objetivo editorial diario/semanal. */
export function isQualityObjectiveOffer(offer: { moderator_comment?: string | null }): boolean {
  const note = offer.moderator_comment?.trim() ?? '';
  return note.length >= 12;
}
