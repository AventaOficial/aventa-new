import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { NicheHunterProfile } from './nicheProfiles';

/**
 * Aplica un NicheHunterProfile sobre la config de ingest existente.
 * No inventa fuentes nuevas; solo acota queries/categorías/budget.
 */
export function applyNicheProfileToIngestConfig(
  base: BotIngestConfig,
  niche: NicheHunterProfile
): BotIngestConfig {
  const mlQueries = niche.mlQueries.map((q) => q.trim()).filter(Boolean);
  const mlCategoryIds = niche.mlCategoryIds.map((c) => c.trim()).filter(Boolean);

  return {
    ...base,
    discoverMlEnabled: base.discoverMlEnabled || mlQueries.length > 0 || mlCategoryIds.length > 0,
    mlUseDefaultQueries: false,
    mlQueries: mlQueries.length > 0 ? mlQueries : base.mlQueries,
    mlCategoryIds: mlCategoryIds.length > 0 ? mlCategoryIds : base.mlCategoryIds,
    // Evitar que defaults tech contaminen beauty/day_to_day (buildMlSearchPlan usa techCategoryIds).
    techCategoryIds: niche.lane === 'electronics' ? mlCategoryIds : [],
    techCategoryIdSet: new Set(niche.lane === 'electronics' ? mlCategoryIds : []),
    minDiscountPercent: Math.max(0, niche.minDiscountPercent),
    candidatePoolMax: Math.min(base.candidatePoolMax, Math.max(4, niche.candidateBudget)),
    mlMaxCollect: Math.min(base.mlMaxCollect, Math.max(4, niche.candidateBudget)),
    mlSearchLimitPerRequest: Math.min(base.mlSearchLimitPerRequest, 20),
    normalMaxPerRunMin: Math.min(base.normalMaxPerRunMin, niche.insertBudget),
    normalMaxPerRunMax: Math.min(base.normalMaxPerRunMax, niche.insertBudget),
    morningMaxPerRunMin: Math.min(base.morningMaxPerRunMin, niche.insertBudget),
    morningMaxPerRunMax: Math.min(base.morningMaxPerRunMax, niche.insertBudget),
    boostMaxOffers: Math.min(base.boostMaxOffers, Math.max(niche.insertBudget, 4)),
    category:
      niche.categories[0] && niche.categories[0] !== 'other'
        ? niche.categories[0]
        : base.category,
  };
}

/** ¿El candidato encaja en el nicho por categoría Aventa o ML? */
export function candidateMatchesNiche(
  niche: NicheHunterProfile,
  input: {
    category?: string | null;
    mlCategoryId?: string | null;
    title?: string | null;
    price?: number | null;
  }
): boolean {
  const cat = (input.category ?? '').trim().toLowerCase();
  if (cat && niche.categories.some((c) => c.toLowerCase() === cat)) return true;

  const ml = (input.mlCategoryId ?? '').trim().toUpperCase();
  if (ml && niche.mlCategoryIds.some((c) => c.toUpperCase() === ml)) return true;

  if (typeof input.price === 'number' && Number.isFinite(input.price)) {
    if (niche.priceMin != null && input.price < niche.priceMin) return false;
    if (niche.priceMax != null && input.price > niche.priceMax) return false;
  }

  // Fallback suave: si no hay categoría, no excluir (el budget ya limita).
  if (!cat && !ml) return true;
  return niche.categories.length === 0;
}
