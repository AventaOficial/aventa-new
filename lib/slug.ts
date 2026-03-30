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

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[n];
}

/**
 * Igual que `storeSlugToName`, pero si el slug tiene un typo (ej. mercsdo-libre → Mercado Libre),
 * elige la tienda cuyo `slugifyStore` tenga distancia de edición más baja dentro de un umbral.
 */
export function resolveStoreSlugToCanonicalName(slug: string, storeNames: string[]): string | null {
  const exact = storeSlugToName(slug, storeNames);
  if (exact) return exact;
  const key = slug.trim().toLowerCase();
  if (!key) return null;
  let best: string | null = null;
  let bestD = Infinity;
  for (const name of storeNames) {
    const cand = slugifyStore(name);
    if (!cand) continue;
    const d = levenshtein(key, cand);
    const maxL = Math.max(key.length, cand.length, 1);
    const threshold = Math.max(2, Math.min(6, Math.floor(maxL * 0.32)));
    if (d <= threshold && d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}
