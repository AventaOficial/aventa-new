/** Tope de la misma oportunidad en Día a día. El ranking no cambia; los extras pasan al final. */
export const DEFAULT_MAX_SAME_PRODUCT = 2;

/** Entero 1–4. Cualquier otro valor vuelve al tope en código. */
export function resolveMaxSameProduct(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 4) {
    return DEFAULT_MAX_SAME_PRODUCT;
  }
  return value;
}

const STOP = new Set(['con', 'para', 'del', 'las', 'los', 'una', 'uno', 'the', 'and', 'pack', 'pieza', 'piezas']);

export function productClusterKey(title: string | null | undefined, store: string | null | undefined): string {
  const words = (title ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP.has(word))
    .slice(0, 4);
  const merchant = (store ?? '').trim().toLowerCase();
  return `${merchant}|${words.join(' ')}`;
}

/**
 * Evita que variantes del mismo producto ocupen el inicio del feed.
 * No borra ofertas ni recalcula su puntuación.
 */
export function deferDuplicateProducts<T extends { title?: string | null; brand?: string | null }>(
  items: readonly T[],
  maxSame: number = DEFAULT_MAX_SAME_PRODUCT,
): T[] {
  const limit = Number.isFinite(maxSame) ? Math.min(4, Math.max(1, Math.floor(maxSame))) : DEFAULT_MAX_SAME_PRODUCT;
  const counts = new Map<string, number>();
  const kept: T[] = [];
  const deferred: T[] = [];
  for (const item of items) {
    if (!item.title?.trim()) {
      kept.push(item);
      continue;
    }
    const key = productClusterKey(item.title, item.brand);
    const seen = counts.get(key) ?? 0;
    if (seen >= limit) {
      deferred.push(item);
      continue;
    }
    counts.set(key, seen + 1);
    kept.push(item);
  }
  return [...kept, ...deferred];
}
