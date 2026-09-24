import type { CouponAppliesTo, CouponDiscountType } from '@/lib/intelligence/coupon/types';

export type CouponPriceInput = {
  basePrice: number;
  currency: string;
  discountType: CouponDiscountType;
  discountValue: number | null;
  maxDiscount: number | null;
  minimumPurchase: number | null;
  couponCurrency: string | null;
  appliesTo: CouponAppliesTo;
  scopeMatched: boolean;
};

export type CouponPriceResult = {
  ok: boolean;
  effectivePrice: number | null;
  savings: number | null;
  currency: string | null;
  reason: string | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Savings only when the mechanic, currency, minimum and scope are known. */
export function computeCouponEffectivePrice(input: CouponPriceInput): CouponPriceResult {
  if (!Number.isFinite(input.basePrice) || input.basePrice < 0) {
    return { ok: false, effectivePrice: null, savings: null, currency: input.currency, reason: 'invalid_base_price' };
  }
  if (input.appliesTo !== 'store' && !input.scopeMatched) {
    return { ok: false, effectivePrice: null, savings: null, currency: input.currency, reason: 'scope_unmatched' };
  }
  if (input.appliesTo === 'unknown') {
    return { ok: false, effectivePrice: null, savings: null, currency: input.currency, reason: 'scope_unknown' };
  }
  if (input.minimumPurchase != null && input.basePrice < input.minimumPurchase) {
    return { ok: false, effectivePrice: null, savings: null, currency: input.currency, reason: 'below_minimum' };
  }
  if (input.discountType === 'bogo' || input.discountType === 'unknown') {
    return { ok: false, effectivePrice: null, savings: null, currency: input.currency, reason: 'mechanic_not_priced' };
  }
  if (input.discountType === 'free_shipping') {
    return {
      ok: true,
      effectivePrice: input.basePrice,
      savings: null,
      currency: input.currency,
      reason: 'shipping_cost_unknown',
    };
  }
  if (input.discountType === 'fixed') {
    if (!input.couponCurrency || input.couponCurrency.toUpperCase() !== input.currency.toUpperCase()) {
      return { ok: false, effectivePrice: null, savings: null, currency: null, reason: 'currency_unmatched' };
    }
    if (input.discountValue == null || input.discountValue <= 0) {
      return { ok: false, effectivePrice: null, savings: null, currency: input.currency, reason: 'discount_missing' };
    }
    const savings = Math.min(input.discountValue, input.basePrice);
    return {
      ok: true,
      effectivePrice: round2(input.basePrice - savings),
      savings: round2(savings),
      currency: input.currency,
      reason: null,
    };
  }
  if (input.discountValue == null || input.discountValue <= 0 || input.discountValue > 100) {
    return { ok: false, effectivePrice: null, savings: null, currency: input.currency, reason: 'percent_invalid' };
  }
  let savings = (input.basePrice * input.discountValue) / 100;
  if (input.maxDiscount != null) savings = Math.min(savings, input.maxDiscount);
  return {
    ok: true,
    effectivePrice: round2(input.basePrice - savings),
    savings: round2(savings),
    currency: input.currency,
    reason: input.maxDiscount != null ? 'capped_by_max_discount' : null,
  };
}
