import type { CouponSnapshot } from '@/lib/intelligence/coupon/types';

const TRACKED = [
  'discountType',
  'discountValue',
  'maxDiscount',
  'minimumPurchase',
  'currency',
  'appliesTo',
  'restrictions',
  'expiresAt',
  'status',
] as const;

export type CouponHistoryEvent = {
  eventType: 'discovered' | 'reseen' | 'field_changed' | 'verified' | 'invalidated' | 'expired';
  changes: string[];
  idempotencyKey: string;
};

export function couponHistoryEvent(input: {
  previous: CouponSnapshot | null;
  next: CouponSnapshot;
  day: string;
}): CouponHistoryEvent {
  if (!input.previous) {
    return {
      eventType: 'discovered',
      changes: [],
      idempotencyKey: `${input.next.canonicalKey}:discovered:${input.day}`,
    };
  }
  const changes = TRACKED.filter((field) => input.previous?.[field] !== input.next[field]).map(String);
  if (input.next.status === 'expired' && input.previous.status !== 'expired') {
    return {
      eventType: 'expired',
      changes,
      idempotencyKey: `${input.next.canonicalKey}:expired:${input.day}`,
    };
  }
  if (input.next.verificationStatus === 'verified' && input.previous.verificationStatus !== 'verified') {
    return {
      eventType: 'verified',
      changes,
      idempotencyKey: `${input.next.canonicalKey}:verified:${input.day}`,
    };
  }
  if (input.next.verificationStatus === 'failed' && input.previous.verificationStatus !== 'failed') {
    return {
      eventType: 'invalidated',
      changes,
      idempotencyKey: `${input.next.canonicalKey}:invalidated:${input.day}`,
    };
  }
  if (changes.length === 0) {
    return {
      eventType: 'reseen',
      changes: [],
      idempotencyKey: `${input.next.canonicalKey}:reseen:${input.day}`,
    };
  }
  return {
    eventType: 'field_changed',
    changes,
    idempotencyKey: `${input.next.canonicalKey}:changed:${changes.join(',')}:${input.day}`,
  };
}
