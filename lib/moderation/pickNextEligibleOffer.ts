import { isOfferLockedByOther } from './moderationLock';
import { sortPendingOffersForModeration, type ModerationSortableOffer } from './sortPendingOffers';

export type ModerationQueueOffer = ModerationSortableOffer & {
  id: string;
  locked_by?: string | null;
  locked_at?: string | null;
};

function isEligible<T extends ModerationQueueOffer>(
  offer: T,
  currentUserId: string | null,
  excludeId?: string | null
): boolean {
  if (excludeId && offer.id === excludeId) return false;
  return !isOfferLockedByOther(
    { locked_by: offer.locked_by, locked_at: offer.locked_at },
    currentUserId
  );
}

/** Primera oferta elegible en el orden editorial actual. */
export function pickFirstEligibleOffer<T extends ModerationQueueOffer>(
  list: T[],
  currentUserId: string | null
): string | null {
  const sorted = sortPendingOffersForModeration(list);
  const first = sorted.find((o) => isEligible(o, currentUserId));
  return first?.id ?? null;
}

/** Siguiente oferta tras decidir; ignora locks ajenos activos. */
export function pickNextEligibleOffer<T extends ModerationQueueOffer>(
  list: T[],
  currentId: string | null,
  currentUserId: string | null
): string | null {
  const sorted = sortPendingOffersForModeration(list);
  if (sorted.length === 0) return null;

  const startIdx = currentId ? sorted.findIndex((o) => o.id === currentId) : -1;

  for (let i = startIdx + 1; i < sorted.length; i += 1) {
    if (isEligible(sorted[i], currentUserId, currentId)) return sorted[i].id;
  }
  for (let i = Math.max(0, startIdx - 1); i >= 0; i -= 1) {
    if (isEligible(sorted[i], currentUserId, currentId)) return sorted[i].id;
  }
  return null;
}
