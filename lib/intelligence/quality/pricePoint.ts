/**
 * Blocking points never enter a price series.
 * Warnings are excluded from the math and named in the summary notes.
 * Neither severity publishes or unpublishes an offer.
 */

const FUTURE_SLACK_MS = 5 * 60 * 1000;

export type PricePointFinding = 'ok' | 'warning' | 'blocking';

export function classifyPricePoint(
  point: { price: number; currency: string; observedAt: string },
  now: Date,
): PricePointFinding {
  if (!Number.isFinite(point.price) || point.price < 0) return 'blocking';
  if (point.currency.trim().length !== 3) return 'blocking';
  const observed = Date.parse(point.observedAt);
  if (!Number.isFinite(observed)) return 'blocking';
  if (observed > now.getTime() + FUTURE_SLACK_MS) return 'blocking';
  if (point.price === 0) return 'warning';
  return 'ok';
}
