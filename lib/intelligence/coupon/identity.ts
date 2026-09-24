import type { CouponAppliesTo, CouponDiscountType } from '@/lib/intelligence/coupon/types';

const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

export function normalizeCouponCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const compact = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!CODE_RE.test(compact)) return null;
  return compact;
}

export function normalizeCouponStore(raw: string | null | undefined): string | null {
  const text = raw?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
  if (!text || text.length > 40) return null;
  if (text.includes('amazon')) return 'amazon';
  if (text.includes('mercado libre') || text === 'meli' || text.includes('mercadolibre')) return 'mercado libre';
  if (text.includes('walmart')) return 'walmart';
  if (text.includes('shein')) return 'shein';
  if (text.includes('aliexpress') || text.includes('ali express')) return 'aliexpress';
  if (text.includes('temu')) return 'temu';
  return text;
}

/**
 * One logical coupon per retailer and code.
 * Mechanic, scope, currency, amounts and dates are history, not a new identity.
 * discountType and appliesTo stay in the signature so callers record them, and are not part of the key.
 */
export function canonicalCouponKey(input: {
  store: string | null;
  code: string | null;
  discountType?: CouponDiscountType;
  appliesTo?: CouponAppliesTo;
}): string | null {
  const store = normalizeCouponStore(input.store);
  const code = normalizeCouponCode(input.code);
  if (!store || !code) return null;
  return `${store}|${code}`;
}
