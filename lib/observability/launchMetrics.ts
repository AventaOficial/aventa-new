/**
 * In-process counters. They reset per isolate; they are a launch signal, not a long-term TSDB.
 * Names are centralized so logs and admin snapshots stay aligned.
 */

export const LAUNCH_METRIC_NAMES = [
  'freshness_checked',
  'freshness_store_capped',
  'freshness_failed',
  'freshness_skipped',
  'stale_offers_seen',
  'expired_offers_seen',
  'rate_limit_blocks',
  'rate_limit_memory_fallback',
  'rate_limit_backend_denied',
  'analytics_events',
  'critical_errors',
] as const;

export type LaunchMetricName = (typeof LAUNCH_METRIC_NAMES)[number];

const counts = new Map<LaunchMetricName, number>();

export function incrementLaunchMetric(name: LaunchMetricName, by = 1): void {
  counts.set(name, (counts.get(name) ?? 0) + by);
}

export function snapshotLaunchMetrics(): Record<LaunchMetricName, number> {
  const out = {} as Record<LaunchMetricName, number>;
  for (const name of LAUNCH_METRIC_NAMES) out[name] = counts.get(name) ?? 0;
  return out;
}

export function resetLaunchMetricsForTests(): void {
  counts.clear();
}
