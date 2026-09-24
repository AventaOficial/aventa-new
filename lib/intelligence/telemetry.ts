/**
 * In-process counters for intelligence reads. Not a warehouse.
 */

const counts = {
  price_summaries: 0,
  supply_windows: 0,
  demand_windows: 0,
  transaction_cross_layer_refusals: 0,
  coupon_parsed: 0,
  coupon_saved: 0,
  coupon_verified: 0,
  coupon_rejected: 0,
};

export function recordPriceSummary(): void {
  counts.price_summaries += 1;
}

export function recordSupplyWindow(): void {
  counts.supply_windows += 1;
}

export function recordDemandWindow(): void {
  counts.demand_windows += 1;
}

export function recordCrossLayerRefusal(): void {
  counts.transaction_cross_layer_refusals += 1;
}

/** Process signal only. Durable counts live in coupon_events. */
export function recordCouponMetric(name: 'coupon_parsed' | 'coupon_saved' | 'coupon_verified' | 'coupon_rejected'): void {
  counts[name] += 1;
}

export function snapshotIntelligenceTelemetry(): Readonly<typeof counts> {
  return { ...counts };
}

export function resetIntelligenceTelemetryForTests(): void {
  counts.price_summaries = 0;
  counts.supply_windows = 0;
  counts.demand_windows = 0;
  counts.transaction_cross_layer_refusals = 0;
  counts.coupon_parsed = 0;
  counts.coupon_saved = 0;
  counts.coupon_verified = 0;
  counts.coupon_rejected = 0;
}
