export const COUPON_INTERACTION_TYPES = ['coupon_view', 'coupon_copy', 'outbound_open'] as const;
export type CouponInteractionType = (typeof COUPON_INTERACTION_TYPES)[number];

export type CouponCorrelation =
  | { relation: 'correlated'; reason: 'same_offer_same_correlation' }
  | { relation: 'ambiguous'; reason: 'correlation_missing' | 'offer_mismatch' | 'outside_window' }
  | { relation: 'unknown'; reason: 'no_copy' };

const CORRELATION_WINDOW_MS = 30 * 60 * 1000;

export function couponInteractionKey(input: {
  couponId: string;
  offerId: string;
  actorKey: string;
  eventType: CouponInteractionType;
  bucket: string;
}): string {
  return `${input.eventType}:${input.couponId}:${input.offerId}:${input.actorKey}:${input.bucket}`.slice(0, 200);
}

export function relateCopyToOutbound(input: {
  copy: { offerId: string; correlationId: string; observedAt: string } | null;
  outbound: { offerId: string; correlationId: string | null; observedAt: string };
}): CouponCorrelation {
  if (!input.copy) return { relation: 'unknown', reason: 'no_copy' };
  if (!input.outbound.correlationId) return { relation: 'ambiguous', reason: 'correlation_missing' };
  if (input.outbound.correlationId !== input.copy.correlationId) {
    return { relation: 'ambiguous', reason: 'correlation_missing' };
  }
  if (input.outbound.offerId !== input.copy.offerId) return { relation: 'ambiguous', reason: 'offer_mismatch' };
  const delta = Date.parse(input.outbound.observedAt) - Date.parse(input.copy.observedAt);
  if (!Number.isFinite(delta) || delta < 0 || delta > CORRELATION_WINDOW_MS) {
    return { relation: 'ambiguous', reason: 'outside_window' };
  }
  return { relation: 'correlated', reason: 'same_offer_same_correlation' };
}

/** Future chain. Click does not become a conversion. */
export function couponConversionContract(correlationId: string): {
  layer: 'conversion';
  state: 'not_connected';
  correlationId: string;
  infersFromClick: false;
} {
  return {
    layer: 'conversion',
    state: 'not_connected',
    correlationId,
    infersFromClick: false,
  };
}
