import { normalizeCategoryForStorage, isVitalCategory } from '@/lib/categories';

/** Meta editorial: ofertas de tecnología aprobadas en el periodo (calidad de catálogo). */
export const MOD_OBJECTIVE_TECH_COUNT = 10;
/** Meta editorial: ofertas “día a día” (categorías vitales) aprobadas en el periodo. */
export const MOD_OBJECTIVE_VITAL_COUNT = 20;

export type ModerationObjectivePeriod = '24h' | '7d';

export function periodStartIso(period: ModerationObjectivePeriod): string {
  const now = Date.now();
  const ms = period === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  return new Date(now - ms).toISOString();
}

/** Cuenta hacia objetivos: tecnología vs vitales (excluye other si no es vital). */
export function classifyForObjectives(category: string | null | undefined): {
  tech: boolean;
  vital: boolean;
} {
  const norm = normalizeCategoryForStorage(category ?? null);
  const tech = norm === 'tecnologia';
  const vital = isVitalCategory(category ?? null);
  return { tech, vital };
}
