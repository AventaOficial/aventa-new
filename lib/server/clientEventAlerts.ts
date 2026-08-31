export const FEED_STREAK_ALERT = 'feed_streak_5';
export const FEED_STREAK_SOURCE = 'feed:consecutive_failures';

/** Solo alertas generadas por el cliente legítimo (feedConsecutiveErrors) pueden disparar webhook. */
export function isLegitimateFeedStreakAlert(
  type: string,
  source: string,
  metadata?: Record<string, unknown>,
): boolean {
  if (metadata?.alert !== FEED_STREAK_ALERT) return false;
  if (type !== 'error') return false;
  if (source !== FEED_STREAK_SOURCE) return false;
  const count = metadata.count;
  return typeof count === 'number' && Number.isFinite(count) && count >= 5;
}
