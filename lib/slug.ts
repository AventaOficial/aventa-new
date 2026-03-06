/**
 * URL-safe slug from display strings (store names, etc.).
 * Used for /tienda/[slug] and consistent internal linking.
 */
export function slugifyStore(store: string | null | undefined): string {
  if (!store?.trim()) return '';
  return store
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Resolve slug back to store name by matching against a list of store names.
 * Returns the first store whose slugifyStore(store) equals slug (case-insensitive).
 */
export function storeSlugToName(slug: string, storeNames: string[]): string | null {
  const lower = slug.toLowerCase().trim();
  for (const name of storeNames) {
    if (slugifyStore(name) === lower) return name;
  }
  return null;
}
