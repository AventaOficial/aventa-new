export type OfferReportMetric =
  | 'report_attempt'
  | 'report_accepted'
  | 'report_duplicate'
  | 'report_rate_limited'
  | 'report_validation_failed'
  | 'report_rate_limit_error';

const counts: Record<OfferReportMetric, number> = {
  report_attempt: 0,
  report_accepted: 0,
  report_duplicate: 0,
  report_rate_limited: 0,
  report_validation_failed: 0,
  report_rate_limit_error: 0,
};

export function recordOfferReportMetric(name: OfferReportMetric) {
  counts[name] += 1;
}

export function snapshotOfferReportMetrics(): Record<OfferReportMetric, number> {
  return { ...counts };
}

export function resetOfferReportMetricsForTests() {
  for (const key of Object.keys(counts) as OfferReportMetric[]) counts[key] = 0;
}
