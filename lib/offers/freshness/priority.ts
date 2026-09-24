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

/** One store may occupy at most this share of a batch before other due stores are considered. */
export const FRESHNESS_MAX_STORE_SHARE = 0.25;
/** Share of the batch reserved for the oldest due rows, so hot traffic cannot starve them. */
export const FRESHNESS_STARVATION_SHARE = 0.2;

export type FreshnessQueueCandidate = {
  id: string;
  score: number;
  storeKey: string;
  dueAt: string | null;
};

export function freshnessStoreKey(store: string | null | undefined, offerId: string): string {
  const key = store?.trim().toLowerCase();
  return key || `missing:${offerId}`;
}

function takeFair(
  sorted: FreshnessQueueCandidate[],
  slots: number,
  counts: Map<string, number>,
  cap: number,
  chosen: Set<string>,
): string[] {
  const picked: string[] = [];
  for (const row of sorted) {
    if (picked.length >= slots) break;
    if (chosen.has(row.id)) continue;
    const used = counts.get(row.storeKey) ?? 0;
    if (used >= cap) continue;
    counts.set(row.storeKey, used + 1);
    chosen.add(row.id);
    picked.push(row.id);
  }
  return picked;
}

/**
 * Due queue selection.
 * A single retailer cannot fill the batch while another due retailer is waiting,
 * unless the pool has no remaining store under the cap.
 */
export function selectFairFreshnessBatch(
  candidates: FreshnessQueueCandidate[],
  limit: number,
): { ids: string[]; storeCapped: number; starvationIds: string[] } {
  if (limit <= 0 || candidates.length === 0) {
    return { ids: [], storeCapped: 0, starvationIds: [] };
  }

  const cap = Math.max(1, Math.floor(limit * FRESHNESS_MAX_STORE_SHARE));
  const starvationSlots = limit >= 5 ? Math.max(1, Math.floor(limit * FRESHNESS_STARVATION_SHARE)) : 0;
  const counts = new Map<string, number>();
  const chosen = new Set<string>();
  const byDue = [...candidates].sort((a, b) => {
    if (a.dueAt === b.dueAt) return a.id.localeCompare(b.id);
    if (a.dueAt == null) return -1;
    if (b.dueAt == null) return 1;
    return a.dueAt.localeCompare(b.dueAt);
  });
  const byScore = [...candidates].sort(compareFreshnessCandidates);
  const starvationIds = takeFair(byDue, starvationSlots, counts, cap, chosen);
  const priorityIds = takeFair(byScore, limit - starvationIds.length, counts, cap, chosen);
  const ids = [...starvationIds, ...priorityIds];

  const diversityLeft = candidates.some(
    (row) => !chosen.has(row.id) && (counts.get(row.storeKey) ?? 0) < cap,
  );
  if (!diversityLeft) {
    for (const row of byScore) {
      if (ids.length >= limit) break;
      if (chosen.has(row.id)) continue;
      chosen.add(row.id);
      ids.push(row.id);
    }
  }

  const uncappedTop = new Set(byScore.slice(0, limit).map((row) => row.id));
  const kept = new Set(ids);
  const storeCapped = [...uncappedTop].filter((id) => !kept.has(id)).length;
  return { ids: ids.slice(0, limit), storeCapped, starvationIds };
}
