/**
 * Deterministic revalidation priority.
 * Signals that exist today: outbound clicks, created_at, health status, last_checked_at.
 * No ML. Higher score = check sooner.
 */

export type FreshnessPersistedStatus =
  | 'available'
  | 'price_changed'
  | 'out_of_stock'
  | 'unknown'
  | 'error';

export type FreshnessPriorityInput = {
  outbound7d: number;
  createdAt: string | null;
  healthStatus: string | null;
  lastCheckedAt: string | null;
  now: Date;
};

export function freshnessPriorityScore(input: FreshnessPriorityInput): number {
  const outbound = Math.max(0, Math.min(20, Math.floor(input.outbound7d || 0)));
  const traffic = outbound * 10;

  let recency = 0;
  if (input.createdAt) {
    const ageMs = input.now.getTime() - new Date(input.createdAt).getTime();
    if (Number.isFinite(ageMs) && ageMs >= 0) {
      if (ageMs <= 48 * 60 * 60 * 1000) recency = 30;
      else if (ageMs <= 7 * 24 * 60 * 60 * 1000) recency = 10;
    }
  }

  let volatility = 0;
  if (input.healthStatus === 'price_changed') volatility = 40;
  else if (input.healthStatus === 'out_of_stock') volatility = 25;
  else if (input.healthStatus === 'unknown' || input.healthStatus === 'error') volatility = 15;

  let stale = 0;
  if (input.lastCheckedAt) {
    const hours = (input.now.getTime() - new Date(input.lastCheckedAt).getTime()) / (60 * 60 * 1000);
    if (Number.isFinite(hours) && hours > 0) stale = Math.min(72, Math.floor(hours));
  } else {
    stale = 72;
  }

  return traffic + recency + volatility + stale;
}

export function scheduleNextCheckAt(input: {
  now: Date;
  persistedStatus: FreshnessPersistedStatus;
  outbound7d: number;
  consecutiveFailures: number;
}): Date {
  const now = input.now.getTime();
  const hour = 60 * 60 * 1000;
  if (input.persistedStatus === 'unknown' || input.persistedStatus === 'error') {
    const failures = Math.max(0, Math.min(8, input.consecutiveFailures));
    const delay = Math.min(24 * hour, 30 * 60 * 1000 * 2 ** failures);
    return new Date(now + delay);
  }
  if (input.persistedStatus === 'price_changed') return new Date(now + 4 * hour);
  if (input.persistedStatus === 'out_of_stock') return new Date(now + 2 * hour);
  if (input.outbound7d >= 3) return new Date(now + 6 * hour);
  return new Date(now + 24 * hour);
}

export function compareFreshnessCandidates(
  a: { id: string; score: number },
  b: { id: string; score: number }
): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.id.localeCompare(b.id);
}
