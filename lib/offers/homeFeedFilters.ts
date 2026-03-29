import { getValidCategoryValuesForFeed, VITAL_FILTER_VALUES } from '@/lib/categories';

export type HomeFeedRankedView = 'vitales' | 'top' | 'latest';

/** Límite inferior de `created_at` alineado al home (día / semana / mes). */
export function homeFeedCreatedAtIsoMin(period: 'day' | 'week' | 'month'): string {
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
  return new Date(now.getTime() - days * msPerDay).toISOString();
}

/**
 * Valores para `.in('category', …)` en `ofertas_ranked_general`.
 * - vitales + sin macro: solo categorías vitales.
 * - vitales + macro: intersección vital ∩ valores del macro (legacy incluido).
 * - top/latest + macro: valores del macro.
 * - top/latest sin macro: sin filtro por categoría (null).
 */
export function homeFeedCategoryInList(
  view: HomeFeedRankedView,
  categoryMacro: string | null | undefined
): string[] | null {
  if (view === 'vitales') {
    const vital = VITAL_FILTER_VALUES;
    if (categoryMacro?.trim()) {
      const catValues = getValidCategoryValuesForFeed(categoryMacro.trim());
      const inter = catValues.filter((c) => vital.includes(c));
      return inter.length > 0 ? inter : catValues;
    }
    return vital;
  }
  if (categoryMacro?.trim()) {
    const catValues = getValidCategoryValuesForFeed(categoryMacro.trim());
    return catValues.length > 0 ? catValues : null;
  }
  return null;
}

/** Categoría en búsqueda: solo si hay macro elegido; en vitales respeta intersección con vitales. */
export function homeSearchCategoryInList(
  viewMode: HomeFeedRankedView | 'personalized',
  categoryMacro: string | null | undefined
): string[] | null {
  if (!categoryMacro?.trim()) return null;
  if (viewMode === 'vitales') {
    return homeFeedCategoryInList('vitales', categoryMacro);
  }
  return homeFeedCategoryInList('latest', categoryMacro);
}
