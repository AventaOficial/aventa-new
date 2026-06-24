import {
  getValidCategoryValuesForFeed,
  isValidCategoryId,
  normalizeCategoryForStorage,
  type CategoryId,
} from '@/lib/categories';
import { formatStoreDisplayName } from '@/lib/formatStoreDisplay';
import { slugifyStore } from '@/lib/slug';

/** Clave estable para matching de tiendas/marcas en feed y persistencia. */
export function normalizeStorePreferenceKey(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) return '';
  const display = formatStoreDisplayName(trimmed) || trimmed;
  return slugifyStore(display);
}

export function isCategoryPreference(value: string): boolean {
  return normalizeCategoryForStorage(value) !== null;
}

export function isStorePreference(value: string): boolean {
  return !isCategoryPreference(value) && normalizeStorePreferenceKey(value) !== '';
}

/** Normaliza un valor de preferencia para almacenamiento en profiles.preferred_categories. */
export function normalizePreferenceForStorage(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const category = normalizeCategoryForStorage(trimmed);
  if (category) return category;

  const storeKey = normalizeStorePreferenceKey(trimmed);
  return storeKey || null;
}

function preferenceDedupeKey(normalized: string): string {
  if (isValidCategoryId(normalized)) return `cat:${normalized}`;
  return `store:${normalized}`;
}

/**
 * Fusiona preferencias existentes con nuevas entradas (idempotente, sin duplicados).
 * Categorías → macro canónica; tiendas → slug estable.
 */
export function mergePreferredCategories(existing: string[], incoming: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const add = (raw: string) => {
    const normalized = normalizePreferenceForStorage(raw);
    if (!normalized) return;
    const key = preferenceDedupeKey(normalized);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  };

  for (const value of existing) add(value);
  for (const value of incoming) add(value);
  return result;
}

export function preferredCategoriesEqual(a: string[], b: string[]): boolean {
  const na = mergePreferredCategories([], a);
  const nb = mergePreferredCategories([], b);
  if (na.length !== nb.length) return false;
  const setB = new Set(nb);
  return na.every((v) => setB.has(v));
}

export type PartitionedPreferences = {
  categories: CategoryId[];
  stores: string[];
};

/** Separa categorías macro y tiendas/marcas para señales de afinidad. */
export function partitionPreferredSelections(values: string[]): PartitionedPreferences {
  const categories: CategoryId[] = [];
  const stores: string[] = [];
  const seenCat = new Set<string>();
  const seenStore = new Set<string>();

  for (const raw of values) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const category = normalizeCategoryForStorage(trimmed);
    if (category) {
      if (!seenCat.has(category)) {
        seenCat.add(category);
        categories.push(category);
      }
      continue;
    }

    const storeKey = normalizeStorePreferenceKey(trimmed);
    if (storeKey && !seenStore.has(storeKey)) {
      seenStore.add(storeKey);
      stores.push(storeKey);
    }
  }

  return { categories, stores };
}

/** Expande categorías macro a ids canónicos usados en matching del feed. */
export function expandCategoryIdsForMatching(categoryIds: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const id of categoryIds) {
    const normalized = normalizeCategoryForStorage(id);
    if (!normalized) continue;
    out.add(normalized);
    for (const v of getValidCategoryValuesForFeed(normalized)) {
      const n = normalizeCategoryForStorage(v);
      if (n) out.add(n);
    }
  }
  return out;
}

export function sanitizePreferredCategoriesInput(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim());
}
