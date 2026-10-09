/** Estados que el feed público sigue mostrando. */
export const PUBLIC_FEED_STATUSES = ['approved', 'published'] as const;

export function isPublicFeedStatus(status: string | null | undefined): boolean {
  return status === 'approved' || status === 'published';
}

const FEED_ONLY_PUBLISHED = 'Desde el feed solo se retira una oferta publicada.';

export type PublicFeedTakedownPlan =
  | { action: 'not-feed' }
  | { action: 'takedown' }
  | { action: 'reject'; httpStatus: 409; error: string };

/** Decisión de retiro desde el feed. `not-feed` deja el camino de la cola (solo pending). */
export function planPublicFeedTakedown(input: {
  surface: unknown;
  nextStatus: string | null;
  previousStatus: string;
}): PublicFeedTakedownPlan {
  if (input.surface !== 'feed') return { action: 'not-feed' };
  if (input.nextStatus === 'rejected' && isPublicFeedStatus(input.previousStatus)) {
    return { action: 'takedown' };
  }
  return { action: 'reject', httpStatus: 409, error: FEED_ONLY_PUBLISHED };
}
