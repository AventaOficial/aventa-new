export type CanonicalAvailability = 'in_stock' | 'out_of_stock' | 'limited' | 'unknown';

/**
 * Solo afirma stock cuando el texto es una disponibilidad canónica.
 * "Solo quedan 2" no se convierte en stock global: queda unknown.
 * Ausencia de dato → null.
 */
export function canonicalAvailability(raw: string | null | undefined): CanonicalAvailability | null {
  if (raw == null || !String(raw).trim()) return null;
  const t = String(raw).trim().toLowerCase();
  if (/outofstock|out_of_stock|sold[\s_-]?out|agotado|no disponible/.test(t)) return 'out_of_stock';
  if (/limitedavailability|limited[\s_-]?stock|stock limitado|pocas unidades/.test(t)) return 'limited';
  if (
    /schema\.org\/instock/.test(t) ||
    /(^|[^a-z])instock([^a-z]|$)/.test(t) ||
    /in_stock/.test(t) ||
    t === 'disponible' ||
    t === 'available' ||
    t === 'en stock' ||
    t === 'in stock'
  ) {
    return 'in_stock';
  }
  return 'unknown';
}

/** Descuento desde precios verificables. Ignora el porcentaje declarado si hay ambos precios. */
export function recalculatedDiscount(price: number | null, previous: number | null): number | null {
  if (price == null || previous == null || !(price > 0) || !(previous > price)) return null;
  return Number((((previous - price) / previous) * 100).toFixed(2));
}
