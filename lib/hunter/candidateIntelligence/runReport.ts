import type { HunterCandidateDecision } from './taxonomy';
import type { HunterCandidateRecord, HunterIntelligenceRunSummary } from './types';
import {
  DECISION_POLICY_VERSION,
  HUNTER_VERSION,
  SCORING_VERSION,
} from './versions';

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function scoreBucket(score: number | null): string {
  if (score == null || !Number.isFinite(score)) return 'unknown';
  if (score < 30) return '0-29';
  if (score < 42) return '30-41';
  if (score < 55) return '42-54';
  if (score < 78) return '55-77';
  return '78-100';
}

const REJECTED_PREFIX = 'REJECTED_';

export function buildHunterIntelligenceRunSummary(input: {
  runId: string;
  startedAt: string;
  finishedAt: string;
  records: HunterCandidateRecord[];
}): HunterIntelligenceRunSummary {
  const decisionBreakdown: Record<string, number> = {};
  const rejectionBreakdown: Record<string, number> = {};
  const scoreDistribution: Record<string, number> = {};
  const sources = new Set<string>();
  const retailers = new Set<string>();

  let normalizedCount = 0;
  let duplicateCount = 0;
  let rejectedCount = 0;
  let needsReviewCount = 0;
  let wouldInsertCount = 0;
  let insertedPendingCount = 0;
  let publishedCount = 0;

  for (const r of input.records) {
    sources.add(r.source);
    if (r.retailer) retailers.add(r.retailer);
    bump(decisionBreakdown, r.decision);
    bump(scoreDistribution, scoreBucket(r.hunterScore));

    if (r.title || r.salePrice != null) normalizedCount += 1;
    if (r.decision === 'DUPLICATE') duplicateCount += 1;
    if (r.decision.startsWith(REJECTED_PREFIX) || r.decision === 'FAILED') {
      rejectedCount += 1;
      bump(rejectionBreakdown, r.reasonCode);
    }
    if (r.decision === 'NEEDS_REVIEW' || r.decision === 'WATCHLIST') needsReviewCount += 1;
    if (r.decision === 'WOULD_INSERT') wouldInsertCount += 1;
    if (r.decision === 'INSERTED_PENDING') insertedPendingCount += 1;
    if (r.decision === 'PUBLISHED') publishedCount += 1;
  }

  return {
    runId: input.runId,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    mode: 'observation',
    sources: [...sources].sort(),
    retailers: [...retailers].sort(),
    candidateCount: input.records.length,
    normalizedCount,
    duplicateCount,
    rejectedCount,
    needsReviewCount,
    wouldInsertCount,
    insertedPendingCount,
    publishedCount,
    rejectionBreakdown,
    decisionBreakdown,
    scoreDistribution,
    hunterVersion: HUNTER_VERSION,
    scoringVersion: SCORING_VERSION,
    decisionPolicyVersion: DECISION_POLICY_VERSION,
  };
}

export function isRejectedDecision(d: HunterCandidateDecision): boolean {
  return d.startsWith(REJECTED_PREFIX) || d === 'FAILED';
}
