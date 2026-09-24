import type { CouponAppliesTo } from '@/lib/intelligence/coupon/types';

export type CouponEligibility = 'exists' | 'eligible' | 'verified_for_offer';

export type CouponLink = {
  targetType: 'store' | 'category' | 'product' | 'offer';
  targetKey: string;
  matched: boolean;
  uncertain: boolean;
  /** exists = associated. eligible = scope matches. verified_for_offer is set only by a moderator action. */
  eligibility: CouponEligibility;
};

export function relateCoupon(input: {
  appliesTo: CouponAppliesTo;
  store: string;
  offerId?: string | null;
  offerStore?: string | null;
  productId?: string | null;
  category?: string | null;
}): CouponLink {
  const sameStore =
    input.offerStore == null || input.offerStore.trim().toLowerCase() === input.store.trim().toLowerCase();
  if (input.appliesTo === 'offer' && input.offerId) {
    return {
      targetType: 'offer',
      targetKey: input.offerId,
      matched: sameStore,
      uncertain: !sameStore,
      eligibility: sameStore ? 'eligible' : 'exists',
    };
  }
  if (input.appliesTo === 'product') {
    if (input.productId) {
      return {
        targetType: 'product',
        targetKey: input.productId,
        matched: sameStore,
        uncertain: false,
        eligibility: sameStore ? 'eligible' : 'exists',
      };
    }
    return { targetType: 'store', targetKey: input.store, matched: false, uncertain: true, eligibility: 'exists' };
  }
  if (input.appliesTo === 'category') {
    if (input.category?.trim()) {
      return {
        targetType: 'category',
        targetKey: input.category.trim().toLowerCase(),
        matched: sameStore,
        uncertain: false,
        eligibility: sameStore ? 'eligible' : 'exists',
      };
    }
    return { targetType: 'store', targetKey: input.store, matched: false, uncertain: true, eligibility: 'exists' };
  }
  if (input.appliesTo === 'store') {
    return {
      targetType: 'store',
      targetKey: input.store,
      matched: sameStore,
      uncertain: false,
      eligibility: sameStore ? 'eligible' : 'exists',
    };
  }
  return { targetType: 'store', targetKey: input.store, matched: false, uncertain: true, eligibility: 'exists' };
}
