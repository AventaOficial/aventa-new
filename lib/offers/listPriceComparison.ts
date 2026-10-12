import { presentOfferPrice } from '@/lib/formatPrice';
import type { PriceInsight } from '@/lib/offers/priceHistory';

/**
 * Precio actual frente al precio de lista declarado (por la tienda o por quien publica).
 *
 * Es una diferencia contra una etiqueta, no un ahorro confirmado: `offers.original_price`
 * no guarda su procedencia y el único historial propio (`offer_price_snapshots`) solo
 * llega al detalle vía `buildOfferPriceInsight`. Ninguna superficie debe decir «ahorras».
 */
export type ListPriceComparison = {
  price: number;
  listPrice: number;
  difference: number;
  /** Porcentaje redondeado; `null` cuando no llega a 1 %. */
  percent: number | null;
};

function toAmount(value: unknown): number | null {
  const n =
    typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** `null` si falta algún precio, alguno no es positivo o el de lista no supera al actual. */
export function compareWithListPrice(price: unknown, listPrice: unknown): ListPriceComparison | null {
  const current = toAmount(price);
  const list = toAmount(listPrice);
  if (current == null || list == null || !(list > current)) return null;
  const difference = Math.round((list - current) * 100) / 100;
  if (!(difference > 0)) return null;
  const pct = Math.round((1 - current / list) * 100);
  return { price: current, listPrice: list, difference, percent: pct >= 1 ? pct : null };
}

/** Aviso de la vista previa al publicar: los precios los escribe quien publica. */
export const DECLARED_PRICES_NOTE = 'Precio y precio de lista declarados por ti. Aventa aún no los ha verificado.';

export function listPriceDifferenceText(comparison: ListPriceComparison, currency?: string | null): string {
  return `${presentOfferPrice(comparison.difference, currency)} menos que el precio de lista`;
}

/**
 * Porcentaje para la etiqueta «−N%». Se oculta cuando el historial de Aventa
 * dice que el descuento es solo de etiqueta (`label_only`).
 */
export function listPriceBadgePercent(
  comparison: ListPriceComparison | null,
  verdict?: PriceInsight['verdict'] | null,
): number | null {
  if (!comparison || comparison.percent == null) return null;
  if (verdict === 'label_only') return null;
  return comparison.percent;
}
