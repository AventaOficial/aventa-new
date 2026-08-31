import { isOfferLockedByOther } from './moderationLock';
import type { ModerationQueueOffer } from './pickNextEligibleOffer';

export function isSnoozedActive(
  offer: { snoozed_until?: string | null },
  nowMs = Date.now()
): boolean {
  if (!offer.snoozed_until) return false;
  const t = new Date(offer.snoozed_until).getTime();
  return Number.isFinite(t) && t > nowMs;
}

export function isOfferClaimEligible(
  offer: ModerationQueueOffer,
  moderatorId: string | null,
  excludeIds?: ReadonlySet<string>
): boolean {
  if (excludeIds?.has(offer.id)) return false;
  if (isSnoozedActive(offer)) return false;
  return !isOfferLockedByOther(
    { locked_by: offer.locked_by, locked_at: offer.locked_at },
    moderatorId
  );
}

export function countClaimEligibleOffers<T extends ModerationQueueOffer>(
  offers: T[],
  moderatorId: string | null
): number {
  return offers.filter((o) => isOfferClaimEligible(o, moderatorId)).length;
}
