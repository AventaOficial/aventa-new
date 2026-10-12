import { presentOfferPrice } from '@/lib/formatPrice';
import { UNNORMALIZED_PRICE_LABEL } from '@/lib/money/types';
import type { PriceInsight } from '@/lib/offers/priceHistory';

/**
 * Precio actual frente al precio de lista declarado (por la tienda o por quien publica).
 *
 * Es una diferencia contra una etiqueta, no un ahorro confirmado: `offers.original_price`
 * no guarda su procedencia y el único historial propio (`offer_price_snapshots`) solo
 * llega al modal y al detalle vía `buildOfferPriceInsight`. Ninguna superficie debe decir
 * «ahorras», y el porcentaje se presenta «vs. lista» salvo en la insignia de las tarjetas.
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

/** `null` si falta algún precio, alguno no es positivo o la referencia no supera al actual. */
function compareAmounts(price: unknown, reference: unknown): ListPriceComparison | null {
  const current = toAmount(price);
  const ref = toAmount(reference);
  if (current == null || ref == null || !(ref > current)) return null;
  const difference = Math.round((ref - current) * 100) / 100;
  if (!(difference > 0)) return null;
  const pct = Math.round((1 - current / ref) * 100);
  return { price: current, listPrice: ref, difference, percent: pct >= 1 ? pct : null };
}

/** `null` si falta algún precio, alguno no es positivo o el de lista no supera al actual. */
export function compareWithListPrice(price: unknown, listPrice: unknown): ListPriceComparison | null {
  return compareAmounts(price, listPrice);
}

/** Aviso de la vista previa al publicar: los precios los escribe quien publica. */
export const DECLARED_PRICES_NOTE = 'Precio y precio de lista declarados por ti. Aventa aún no los ha verificado.';

export const LABEL_CONTRADICTED_NOTE = 'El historial de Aventa no respalda el descuento de la etiqueta.';

/** `null` sin moneda confirmada: la etiqueta de precio no normalizado no es una cantidad. */
export function listPriceDifferenceText(comparison: ListPriceComparison, currency?: string | null): string | null {
  const amount = presentOfferPrice(comparison.difference, currency);
  if (amount === UNNORMALIZED_PRICE_LABEL) return null;
  return `${amount} menos que el precio de lista`;
}

/** Porcentaje contra la etiqueta, nunca presentado como descuento confirmado. */
export function listPercentText(percent: number): string {
  return `-${percent}% vs. lista`;
}

/** Insignia compacta de las tarjetas del feed; misma regla de validez que `listPercentText`. */
export function cardPercentText(percent: number): string {
  return `-${percent}%`;
}

export function observedDropText(percent: number): string {
  return `${percent}% por debajo del precio más alto visto en Aventa (90 días)`;
}

/**
 * Porcentaje para la etiqueta «−N% vs. lista». Se oculta cuando el historial de Aventa
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

/**
 * Bajada respaldada por el historial propio: el veredicto es `strong` (precio actual en el
 * mínimo de 90 días, con al menos dos registros) y hubo un precio observado más alto.
 */
export function observedDropPercent(insight: PriceInsight): number | null {
  if (insight.verdict !== 'strong') return null;
  return compareAmounts(insight.current, insight.max90d)?.percent ?? null;
}

/** Historial propio de una oferta tal como lo ve el cliente. */
export type PriceEvidence =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; insight: PriceInsight };

export type ListPriceView = {
  comparison: ListPriceComparison | null;
  /** Diferencia porcentual contra la etiqueta; `null` mientras carga o si el historial la contradice. */
  listPercent: number | null;
  labelContradicted: boolean;
  /** Único porcentaje respaldado por evidencia. */
  observedDropPercent: number | null;
};

/**
 * Sin `evidence` (superficies sin historial accesible) solo se aplica la regla de validez.
 * Con historial, el porcentaje no aparece hasta conocer el veredicto.
 */
export function presentListPrice(price: unknown, listPrice: unknown, evidence?: PriceEvidence): ListPriceView {
  const comparison = compareWithListPrice(price, listPrice);
  if (evidence?.status === 'loading') {
    return { comparison, listPercent: null, labelContradicted: false, observedDropPercent: null };
  }
  if (evidence?.status === 'ready') {
    const { insight } = evidence;
    return {
      comparison,
      listPercent: listPriceBadgePercent(comparison, insight.verdict),
      labelContradicted: comparison != null && insight.verdict === 'label_only',
      observedDropPercent: observedDropPercent(insight),
    };
  }
  return { comparison, listPercent: listPriceBadgePercent(comparison), labelContradicted: false, observedDropPercent: null };
}
