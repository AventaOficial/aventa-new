import { isOfferTrackable } from '@/lib/server/trackableOffer';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DistributionOfferSnapshot } from './types';

/**
 * Server-authoritative distributable predicate.
 * Reuses isOfferTrackable: status ∈ {approved, published} ∧ not expired.
 * Distribution NEVER sets status=approved. pending ≠ approved ≠ distributed.
 */
export async function isOfferDistributable(
  offerId: string,
  supabase?: SupabaseClient,
): Promise<boolean> {
  return isOfferTrackable(offerId, supabase);
}

/** Pure check for tests / snapshots without DB. Mirrors trackable semantics. */
export function isOfferSnapshotDistributable(
  offer: Pick<DistributionOfferSnapshot, 'status' | 'expires_at'>,
  nowMs: number = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  const status = String(offer.status ?? '').trim().toLowerCase();
  if (status !== 'approved' && status !== 'published') {
    return { ok: false, reason: `status_not_live:${status || 'empty'}` };
  }
  if (offer.expires_at) {
    const exp = Date.parse(offer.expires_at);
    if (Number.isFinite(exp) && exp < nowMs) {
      return { ok: false, reason: 'expired' };
    }
  }
  return { ok: true };
}

/** Coupon signal for coupons destinations — no invented coupons. */
export function offerHasCouponSignal(
  offer: Pick<DistributionOfferSnapshot, 'coupons' | 'bank_coupon'>,
): boolean {
  return Boolean(offer.coupons?.trim() || offer.bank_coupon?.trim());
}
