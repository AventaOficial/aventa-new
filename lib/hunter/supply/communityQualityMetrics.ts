/**
 * Universo communityQuality. Process memory.
 * No mezclar con supplyOrchestration, qualification, autonomous ni source health.
 */
export type CommunityQualitySnapshot = {
  communitySubmissions: number;
  qualified: number;
  verified: number;
  promotions: number;
  potential: number;
  catalogOnly: number;
  duplicates: number;
  review: number;
  rejected: number;
  errors: number;
  verifierScoreSum: number;
  verifierScoreCount: number;
  averageVerifierScore: number;
  topRejectionReasons: Array<{ reason: string; count: number }>;
};

const counters = {
  communitySubmissions: 0,
  qualified: 0,
  verified: 0,
  promotions: 0,
  potential: 0,
  catalogOnly: 0,
  duplicates: 0,
  review: 0,
  rejected: 0,
  errors: 0,
  verifierScoreSum: 0,
  verifierScoreCount: 0,
};

const reasons = new Map<string, number>();

export function recordCommunityQuality(input: {
  qualification: string | null;
  verifierDecision: string | null;
  verifierScore?: number | null;
  duplicate?: boolean;
  error?: boolean;
  rejectionReasons?: string[];
}) {
  counters.communitySubmissions += 1;
  if (input.error) counters.errors += 1;
  if (input.duplicate) counters.duplicates += 1;
  if (input.qualification) counters.qualified += 1;
  if (input.qualification === 'VERIFIED_DEAL') counters.verified += 1;
  else if (input.qualification === 'PROMOTION') counters.promotions += 1;
  else if (input.qualification === 'POTENTIAL_DEAL') counters.potential += 1;
  else if (input.qualification === 'NO_VERIFIED_DEAL') counters.catalogOnly += 1;
  if (input.verifierDecision === 'review') counters.review += 1;
  if (input.verifierDecision === 'reject') counters.rejected += 1;
  if (input.verifierScore != null && Number.isFinite(input.verifierScore)) {
    counters.verifierScoreSum += input.verifierScore;
    counters.verifierScoreCount += 1;
  }
  for (const r of input.rejectionReasons ?? []) {
    reasons.set(r, (reasons.get(r) ?? 0) + 1);
  }
}

export function recordCommunityDuplicateOnly() {
  counters.duplicates += 1;
}

export function recordCommunityInvalidUrl() {
  counters.communitySubmissions += 1;
  counters.errors += 1;
}

export function resetCommunityQualityMetrics() {
  counters.communitySubmissions = 0;
  counters.qualified = 0;
  counters.verified = 0;
  counters.promotions = 0;
  counters.potential = 0;
  counters.catalogOnly = 0;
  counters.duplicates = 0;
  counters.review = 0;
  counters.rejected = 0;
  counters.errors = 0;
  counters.verifierScoreSum = 0;
  counters.verifierScoreCount = 0;
  reasons.clear();
}

export function getCommunityQualityMetrics(): CommunityQualitySnapshot {
  const topRejectionReasons = [...reasons.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));
  return {
    ...counters,
    averageVerifierScore:
      counters.verifierScoreCount > 0
        ? Math.round((counters.verifierScoreSum / counters.verifierScoreCount) * 10) / 10
        : 0,
    topRejectionReasons,
  };
}
