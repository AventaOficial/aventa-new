/**
 * How price reads stay bounded as snapshot volume grows.
 * These are access policies, not measured benchmarks.
 *
 * 1k–100k: point read on (marketplace, product_id, recorded_on) or (offer_id, recorded_at). One subject, ≤200 rows.
 * 100k–1M: same point read, plus a daily rollup row so dashboards do not re-aggregate.
 * 1M–10M: product snapshots are already one row per product per day. Offer snapshots must be retained
 * only 180 days once a rollup exists. Partitioning product snapshots by recorded_on is the next
 * physical step and is intentionally not applied here.
 */

export type PriceReadStrategy = 'point_read' | 'point_read_plus_rollup' | 'partition_and_rollup';

export const PRICE_POINT_READ_MAX_ROWS = 200;
export const OFFER_SNAPSHOT_RETAIN_DAYS = 180;
export const PRICE_WINDOWS_DAYS = [7, 30, 90] as const;

/**
 * Growth policy per table. These are access rules, not measured row counts.
 * Partition only at the stated threshold. Do not delete a moat table before its rollup exists.
 */
export const TABLE_SCALE_POLICY = [
  {
    table: 'product_price_snapshots',
    pointReadUntil: 100_000,
    rollupFrom: 100_000,
    partitionAt: 1_000_000,
    retain: 'one row per product per day, kept',
  },
  {
    table: 'offer_price_snapshots',
    pointReadUntil: 100_000,
    rollupFrom: 100_000,
    partitionAt: 1_000_000,
    retain: '180 days after a rollup exists; no automatic delete',
  },
  {
    table: 'offer_events',
    pointReadUntil: 100_000,
    rollupFrom: 100_000,
    partitionAt: 1_000_000,
    retain: 'raw kept; demand reads a 7-day aggregate of at most 100 offers',
  },
  {
    table: 'coupon_events',
    pointReadUntil: 100_000,
    rollupFrom: 100_000,
    partitionAt: 1_000_000,
    retain: 'append-only; read by coupon id, not a full scan',
  },
  {
    table: 'coupon_interactions',
    pointReadUntil: 100_000,
    rollupFrom: 100_000,
    partitionAt: 10_000_000,
    retain: 'copy, view and outbound stay separate; no conversion inferred',
  },
  {
    table: 'hunter_supply_runs',
    pointReadUntil: 100_000,
    rollupFrom: 100_000,
    partitionAt: 1_000_000,
    retain: 'append-only; admin reads at most 500 rows in 30 days',
  },
] as const;

export function recommendedPriceReadStrategy(snapshotCount: number): PriceReadStrategy {
  if (!Number.isFinite(snapshotCount) || snapshotCount < 100_000) return 'point_read';
  if (snapshotCount < 1_000_000) return 'point_read_plus_rollup';
  return 'partition_and_rollup';
}

/** Drop raw offer snapshots only after the rollup for that offer exists. Product daily rows stay. */
export function shouldDropRawOfferSnapshot(input: {
  ageDays: number;
  rollupExists: boolean;
}): boolean {
  return input.rollupExists && input.ageDays > OFFER_SNAPSHOT_RETAIN_DAYS;
}
