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

export type CouponFieldDiff = {
  field: string;
  before: string | null;
  after: string | null;
};

export type CouponHistoryEvent = {
  eventType: 'discovered' | 'reseen' | 'field_changed' | 'verified' | 'invalidated' | 'expired';
  changes: string[];
  diff: CouponFieldDiff[];
  idempotencyKey: string;
};

function asText(value: unknown): string | null {
  if (value == null || value === '') return null;
  return String(value);
}

export function couponHistoryEvent(input: {
  previous: CouponSnapshot | null;
  next: CouponSnapshot;
  day: string;
}): CouponHistoryEvent {
  if (!input.previous) {
    return {
      eventType: 'discovered',
      changes: [],
      diff: [],
      idempotencyKey: `${input.next.canonicalKey}:discovered:${input.day}`,
    };
  }
  const diff: CouponFieldDiff[] = TRACKED.filter((field) => input.previous?.[field] !== input.next[field]).map(
    (field) => ({
      field,
      before: asText(input.previous?.[field]),
      after: asText(input.next[field]),
    }),
  );
  const changes = diff.map((row) => `${row.field}:${row.before ?? '∅'}→${row.after ?? '∅'}`);
  if (input.next.status === 'expired' && input.previous.status !== 'expired') {
    return {
      eventType: 'expired',
      changes,
      diff,
      idempotencyKey: `${input.next.canonicalKey}:expired:${input.day}`,
    };
  }
  if (input.next.verificationStatus === 'verified' && input.previous.verificationStatus !== 'verified') {
    return {
      eventType: 'verified',
      changes,
      diff,
      idempotencyKey: `${input.next.canonicalKey}:verified:${input.day}`,
    };
  }
  if (input.next.verificationStatus === 'failed' && input.previous.verificationStatus !== 'failed') {
    return {
      eventType: 'invalidated',
      changes,
      diff,
      idempotencyKey: `${input.next.canonicalKey}:invalidated:${input.day}`,
    };
  }
  if (changes.length === 0) {
    return {
      eventType: 'reseen',
      changes: [],
      diff: [],
      idempotencyKey: `${input.next.canonicalKey}:reseen:${input.day}`,
    };
  }
  return {
    eventType: 'field_changed',
    changes,
    diff,
    idempotencyKey: `${input.next.canonicalKey}:changed:${changes.join('|')}:${input.day}`,
  };
}
