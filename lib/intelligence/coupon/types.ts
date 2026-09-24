/**
 * Canonical coupon draft. Unknown fields stay null.
 * A parsed mention is not a verified coupon.
 */

export type CouponDiscountType = 'fixed' | 'percent' | 'free_shipping' | 'bogo' | 'unknown';
export type CouponAppliesTo = 'store' | 'category' | 'product' | 'offer' | 'unknown';
export type CouponSourceClass = 'user_paste' | 'bot' | 'external_page' | 'official_page' | 'admin';
export type CouponLifecycle =
  | 'discovered'
  | 'unverified'
  | 'verified'
  | 'expired'
  | 'invalid'
  | 'exhausted'
  | 'unknown';

export type CouponDraft = {
  ok: boolean;
  reason: string | null;
  store: string | null;
  code: string | null;
  discountType: CouponDiscountType;
  discountValue: number | null;
  maxDiscount: number | null;
  minimumPurchase: number | null;
  currency: string | null;
  appliesTo: CouponAppliesTo;
  restrictions: string | null;
  expiresAt: string | null;
  sourceUrl: string | null;
  canonicalKey: string | null;
  sourceClass: CouponSourceClass;
  confidence: number;
  raw: string;
};

export type CouponSnapshot = {
  canonicalKey: string;
  store: string;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number | null;
  maxDiscount: number | null;
  minimumPurchase: number | null;
  currency: string | null;
  appliesTo: CouponAppliesTo;
  restrictions: string | null;
  expiresAt: string | null;
  status: CouponLifecycle;
  verificationStatus: 'unverified' | 'verified' | 'failed';
  confidence: number;
  sourceClass: CouponSourceClass;
  lastVerifiedAt: string | null;
};

export const COUPON_INTELLIGENCE_MODE = 'shadow' as const;
export const COUPON_CONFIDENCE_CEILING: Record<CouponSourceClass, number> = {
  user_paste: 0.25,
  bot: 0.35,
  external_page: 0.45,
  official_page: 0.7,
  admin: 0.9,
};
