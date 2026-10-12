import { compareWithListPrice } from '@/lib/offers/listPriceComparison';

/** Descuento visible solo si ambos precios son positivos y el original es mayor. */
export function offerDiscountPercent(price: number | null, original: number | null): number | null {
  return compareWithListPrice(price, original)?.percent ?? null;
}
