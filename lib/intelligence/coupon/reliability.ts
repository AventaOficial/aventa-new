/**
 * Counts only. A rate stays null when the denominator does not exist.
 */

export type CouponEventCount = {
  eventType: string;
  sourceClass?: string | null;
  observedAt?: string | null;
};

export type CouponReliability = {
  observations: number;
  verifiedCount: number;
  invalidatedCount: number;
  recurrenceCount: number;
  verificationSuccessRate: number | null;
  averageLifetimeHours: number | null;
  sourceReliability: number | null;
};

export function summarizeCouponReliability(
  events: CouponEventCount[],
  lifetime?: { firstSeenAt: string | null; endedAt: string | null },
): CouponReliability {
  const observations = events.length;
  const verifiedCount = events.filter((event) => event.eventType === 'verified').length;
  const invalidatedCount = events.filter((event) => event.eventType === 'invalidated').length;
  const recurrenceCount = events.filter((event) => event.eventType === 'reseen').length;
  const decided = verifiedCount + invalidatedCount;
  const bySource = new Map<string, { verified: number; decided: number }>();
  for (const event of events) {
    if (event.eventType !== 'verified' && event.eventType !== 'invalidated') continue;
    const key = event.sourceClass?.trim() || 'unknown';
    const bucket = bySource.get(key) ?? { verified: 0, decided: 0 };
    bucket.decided += 1;
    if (event.eventType === 'verified') bucket.verified += 1;
    bySource.set(key, bucket);
  }
  const sourceRates = [...bySource.values()].filter((bucket) => bucket.decided > 0);
  let averageLifetimeHours: number | null = null;
  if (lifetime?.firstSeenAt && lifetime.endedAt) {
    const ms = Date.parse(lifetime.endedAt) - Date.parse(lifetime.firstSeenAt);
    averageLifetimeHours = Number.isFinite(ms) && ms >= 0 ? Math.round((ms / 3600000) * 100) / 100 : null;
  }
  return {
    observations,
    verifiedCount,
    invalidatedCount,
    recurrenceCount,
    verificationSuccessRate: decided > 0 ? Math.round((verifiedCount / decided) * 10000) / 10000 : null,
    averageLifetimeHours,
    sourceReliability:
      sourceRates.length === 1
        ? Math.round((sourceRates[0]!.verified / sourceRates[0]!.decided) * 10000) / 10000
        : null,
  };
}
