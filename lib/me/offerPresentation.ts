/** Descuento visible solo si ambos precios existen y el original es mayor. */
export function offerDiscountPercent(price: number | null, original: number | null): number | null {
  if (price == null || original == null) return null;
  if (!Number.isFinite(price) || !Number.isFinite(original)) return null;
  if (!(original > price) || original <= 0) return null;
  const pct = Math.round((1 - price / original) * 100);
  return pct > 0 ? pct : null;
}
