import { normalizeCategoryForStorage } from '@/lib/categories';
import {
  expandCategoryIdsForMatching,
  normalizeStorePreferenceKey,
  partitionPreferredSelections,
} from '@/lib/preferences/userPreferences';

export type UserAffinitySignals = {
  /** Macros canónicas + alias legacy para matching de offers.category */
  categoryIds: Set<string>;
  /** Slugs de tienda/marca para matching de offers.store */
  storeKeys: Set<string>;
};

export function createEmptyAffinitySignals(): UserAffinitySignals {
  return { categoryIds: new Set(), storeKeys: new Set() };
}

export function buildAffinityFromPreferredSelections(rawPrefs: string[]): UserAffinitySignals {
  const { categories, stores } = partitionPreferredSelections(rawPrefs);
  return {
    categoryIds: expandCategoryIdsForMatching(categories),
    storeKeys: new Set(stores),
  };
}

export function enrichAffinityFromBehavior(
  affinity: UserAffinitySignals,
  offers: ReadonlyArray<{ category: string | null; store: string | null }>,
): UserAffinitySignals {
  const categoryIds = new Set(affinity.categoryIds);
  const storeKeys = new Set(affinity.storeKeys);

  for (const offer of offers) {
    const normalized = normalizeCategoryForStorage(offer.category);
    if (normalized) categoryIds.add(normalized);
    const storeKey = normalizeStorePreferenceKey(offer.store);
    if (storeKey) storeKeys.add(storeKey);
  }

  return { categoryIds, storeKeys };
}

/** True si la tienda de la oferta coincide con alguna preferencia de tienda del usuario. */
export function storeMatchesAffinity(userStoreKeys: Set<string>, offerStore: string | null | undefined): boolean {
  if (userStoreKeys.size === 0 || !offerStore?.trim()) return false;
  const offerKey = normalizeStorePreferenceKey(offerStore);
  if (!offerKey) return false;

  for (const prefKey of userStoreKeys) {
    if (prefKey === offerKey) return true;
    if (offerKey.startsWith(`${prefKey}-`) || prefKey.startsWith(`${offerKey}-`)) return true;
  }
  return false;
}

export function categoryMatchesAffinity(
  userCategoryIds: Set<string>,
  offerCategory: string | null | undefined,
): boolean {
  if (userCategoryIds.size === 0) return false;
  const normalized = normalizeCategoryForStorage(offerCategory ?? null);
  return normalized ? userCategoryIds.has(normalized) : false;
}

export function offerMatchesAffinity(
  offer: { category?: string | null; store?: string | null },
  affinity: UserAffinitySignals,
): boolean {
  return (
    categoryMatchesAffinity(affinity.categoryIds, offer.category ?? null) ||
    storeMatchesAffinity(affinity.storeKeys, offer.store ?? null)
  );
}

export function hasAffinitySignals(affinity: UserAffinitySignals): boolean {
  return affinity.categoryIds.size > 0 || affinity.storeKeys.size > 0;
}

export function sortOffersByAffinity<T extends { category?: string | null; store?: string | null; ranking_blend?: number | null }>(
  offers: T[],
  affinity: UserAffinitySignals,
): T[] {
  if (!hasAffinitySignals(affinity)) return offers;

  return [...offers].sort((a, b) => {
    const aMatch = offerMatchesAffinity(a, affinity);
    const bMatch = offerMatchesAffinity(b, affinity);
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;
    const blendA = a.ranking_blend ?? 0;
    const blendB = b.ranking_blend ?? 0;
    return blendB - blendA;
  });
}
