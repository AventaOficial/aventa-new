import type { PriceKnowledge } from '@/lib/intelligence/price/summarize';
import type { CouponPriceResult } from '@/lib/intelligence/coupon/effectivePrice';

export type CouponPriceContext = {
  currentPrice: number | null;
  effectivePrice: number | null;
  historicalMedian: number | null;
  historicalMin: number | null;
  historicalMax: number | null;
  historyConfidence: number | null;
  effectiveBelowMedian: boolean | null;
  effectiveNearHistoricalLow: boolean | null;
  effectiveNewLow: boolean | null;
  publishes: false;
};

/** Read-only signals. A low effective price is not a verified opportunity. */
export function couponPriceContext(input: {
  currentPrice: number | null;
  priced: CouponPriceResult | null;
  history: Pick<PriceKnowledge, 'median' | 'min' | 'max' | 'confidence' | 'currency'> | null;
}): CouponPriceContext {
  const effective = input.priced?.ok ? input.priced.effectivePrice : null;
  const history = input.history;
  const sameCurrency =
    !history?.currency || !input.priced?.currency || history.currency.toUpperCase() === input.priced.currency.toUpperCase();
  const usable = effective != null && history != null && sameCurrency && (history.confidence ?? 0) >= 0.5;
  return {
    currentPrice: input.currentPrice,
    effectivePrice: effective,
    historicalMedian: history?.median ?? null,
    historicalMin: history?.min ?? null,
    historicalMax: history?.max ?? null,
    historyConfidence: history?.confidence ?? null,
    effectiveBelowMedian: usable && history?.median != null ? effective! < history.median : null,
    effectiveNearHistoricalLow:
      usable && history?.min != null ? effective! <= history.min * 1.02 : null,
    effectiveNewLow: usable && history?.min != null ? effective! < history.min : null,
    publishes: false,
  };
}
