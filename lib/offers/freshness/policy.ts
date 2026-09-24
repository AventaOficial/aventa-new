/**
 * Freshness policy — deterministic, env-tunable, hard-capped.
 * CODE GUARANTEE: a single cron run cannot scan an unbounded set.
 */

export const FRESHNESS_STALE_AFTER_MS = 72 * 60 * 60 * 1000;
export const FRESHNESS_BATCH_HARD_CAP = 50;
export const FRESHNESS_BATCH_DEFAULT = 30;
export const FRESHNESS_DELAY_MS_DEFAULT = 250;
export const FRESHNESS_POOL_MULTIPLIER = 4;
export const FRESHNESS_POOL_HARD_CAP = 200;

export function readBoundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function resolveFreshnessBatchLimit(envValue?: string): number {
  return readBoundedInt(envValue, FRESHNESS_BATCH_DEFAULT, 1, FRESHNESS_BATCH_HARD_CAP);
}

export function resolveFreshnessDelayMs(envValue?: string): number {
  return readBoundedInt(envValue, FRESHNESS_DELAY_MS_DEFAULT, 0, 5_000);
}

export function resolveStaleAfterMs(envValue?: string): number {
  return readBoundedInt(envValue, FRESHNESS_STALE_AFTER_MS, 60 * 60 * 1000, 14 * 24 * 60 * 60 * 1000);
}
