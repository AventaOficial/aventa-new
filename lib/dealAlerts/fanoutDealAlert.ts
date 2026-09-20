/**
 * S6.3 — Deal Alerts Fanout / Matching Engine.
 *
 * Layers (never mixed):
 *  1. Candidate Retrieval  — SubscriptionCandidateIndex.findCandidates
 *  2. Candidate Filtering  — index prefilters + input dedupe
 *  3. Decision evaluation  — decideDealAlert (S6.2) ONLY
 *  4. Fanout construction  — partition matched / suppressed / duplicate
 *
 * No delivery. No money writes.
 * S6.4: awaits Postgres (or InMemory) candidate index; business rules unchanged.
 */

import { DEAL_ALERTS_CONTRACT_VERSION } from './constants';
import {
  decideDealAlert,
  type DealAlertDecisionOutcome,
  type EligibleSubscriptionMatch,
  type SuppressedSubscription,
} from './decideDealAlert';
import type { AlertDecisionContext } from './decisionContext';
import type { SubscriptionCandidateIndex } from './subscriptionIndex';
import type {
  AlertabilityEvidence,
  AlertDecisionResult,
  DealAlertsDealDetected,
} from './types';
import type { DealDetectedEvent } from '@/lib/dealIntelligence/types';
import { assertDealAlertsMoneyUntouched } from './safety';

export type FanoutMatchedSubscription = {
  subscriptionId: string;
  userId: string;
  alertIdentityKey: string;
  opportunityKey: string;
  matchReason: string;
  channels: EligibleSubscriptionMatch['channels'];
  matchedConstraints: EligibleSubscriptionMatch['matchedConstraints'];
};

export type FanoutSuppressedSubscription = {
  subscriptionId: string;
  userId: string;
  reason: string;
  result: AlertDecisionResult;
};

export type DealAlertFanoutStats = {
  candidatesFound: number;
  candidatesEvaluated: number;
  matched: number;
  suppressed: number;
  duplicates: number;
  malformed: number;
  retrievalSource: string;
  indexScanned: number;
  candidateLimit: number;
  candidateLimitReached: boolean;
  retrievalLatencyMs: number;
};

export type DealAlertFanoutResult = {
  contractVersion: typeof DEAL_ALERTS_CONTRACT_VERSION;
  /** Opportunity identity (fingerprint). */
  opportunityKey: string | null;
  /**
   * Primary alert identity for the fanout batch when single match;
   * otherwise null — use matchedSubscriptions[].alertIdentityKey.
   * Does NOT invent a fourth identity.
   */
  alertIdentityKey: string | null;
  /** Global opportunity idempotency `da:{dw.v1}:{diKey}` — never blocks multi-sub fanout. */
  opportunityIdempotencyKey: string | null;
  /** Aggregate S6.2 decision (or SUPPRESS when candidateLimitReached). */
  decision: AlertDecisionResult;
  reason: string;
  matchedSubscriptions: FanoutMatchedSubscription[];
  suppressedSubscriptions: FanoutSuppressedSubscription[];
  duplicateSubscriptions: FanoutSuppressedSubscription[];
  stats: DealAlertFanoutStats;
  evaluatedAt: string;
  /** Full S6.2 outcome for audit / S6.5 handoff; null if limit overflow abort. */
  decisionOutcome: DealAlertDecisionOutcome | null;
  /** Multi-channel handoff: fanout does not expand channels. */
  channelExpansionDeferred: true;
  /** Fail-safe: too many candidates — do not partially deliver. */
  candidateLimitReached: boolean;
};

export type FanoutDealAlertInput = {
  dealDetected: DealDetectedEvent | DealAlertsDealDetected;
  alertability: AlertabilityEvidence;
  /** Candidate retrieval — never full-table scan in production implementations. */
  candidateIndex: SubscriptionCandidateIndex;
  context: AlertDecisionContext;
  opportunityCategory?: string | null;
  now: Date;
  recordMatches?: boolean;
  /** Optional: assert money untouched at start (default true). */
  assertMoneyUntouched?: boolean;
  /** Override candidate limit for this fanout. */
  candidateLimit?: number;
  /**
   * When true, index omits disabled (production scale path).
   * Default false preserves S6.3 decision visibility for disabled→SUPPRESS.
   * PostgresSubscriptionCandidateIndex callers should pass true.
   */
  enabledOnly?: boolean;
};

function partitionExclusive(
  eligible: EligibleSubscriptionMatch[],
  suppressed: SuppressedSubscription[],
  opportunityKey: string,
): {
  matched: FanoutMatchedSubscription[];
  suppressedOut: FanoutSuppressedSubscription[];
  duplicates: FanoutSuppressedSubscription[];
  malformed: number;
} {
  const matchedIds = new Set(eligible.map((e) => e.subscriptionId));
  const matched: FanoutMatchedSubscription[] = [...eligible]
    .sort((a, b) => a.subscriptionId.localeCompare(b.subscriptionId))
    .map((e) => ({
      subscriptionId: e.subscriptionId,
      userId: e.userId,
      alertIdentityKey: e.alertIdentityKey,
      opportunityKey,
      matchReason: 'decideDealAlert_MATCH',
      channels: e.channels,
      matchedConstraints: e.matchedConstraints,
    }));

  const suppressedOut: FanoutSuppressedSubscription[] = [];
  const duplicates: FanoutSuppressedSubscription[] = [];
  let malformed = 0;
  const seen = new Set<string>(matchedIds);

  const sortedSup = [...suppressed].sort((a, b) =>
    a.subscriptionId.localeCompare(b.subscriptionId),
  );
  for (const s of sortedSup) {
    if (seen.has(s.subscriptionId)) continue;
    seen.add(s.subscriptionId);
    if (s.reason.startsWith('malformed:')) malformed += 1;
    const row: FanoutSuppressedSubscription = {
      subscriptionId: s.subscriptionId,
      userId: s.userId,
      reason: s.reason,
      result: s.result,
    };
    if (s.result === 'DUPLICATE') duplicates.push(row);
    else suppressedOut.push(row);
  }

  return { matched, suppressedOut, duplicates, malformed };
}

/**
 * Fanout engine: retrieve candidates → decideDealAlert → typed fanout result.
 * Deterministic given same inputs + context state + now.
 */
export async function fanoutDealAlert(
  input: FanoutDealAlertInput,
): Promise<DealAlertFanoutResult> {
  if (input.assertMoneyUntouched !== false) {
    assertDealAlertsMoneyUntouched();
  }

  const a = input.alertability;
  const enabledOnly = input.enabledOnly === true;
  const query = {
    store: a.store,
    merchant: a.merchant,
    category: input.opportunityCategory?.trim() || null,
    discountPercent: a.discountPercent,
    enabledOnly,
    candidateLimit: input.candidateLimit,
  };

  // 1–2. Candidate retrieval + filtering (index)
  const candidateSet = await input.candidateIndex.findCandidates(query);
  const candidates = candidateSet.subscriptions;

  if (candidateSet.stats.candidateLimitReached) {
    return {
      contractVersion: DEAL_ALERTS_CONTRACT_VERSION,
      opportunityKey: a.fingerprint,
      alertIdentityKey: null,
      opportunityIdempotencyKey:
        'idempotencyKey' in input.dealDetected
          ? input.dealDetected.idempotencyKey
          : null,
      decision: 'SUPPRESS',
      reason: 'candidate_limit_reached_requires_batching',
      matchedSubscriptions: [],
      suppressedSubscriptions: [],
      duplicateSubscriptions: [],
      stats: {
        candidatesFound: candidateSet.stats.returned,
        candidatesEvaluated: 0,
        matched: 0,
        suppressed: 0,
        duplicates: 0,
        malformed: 0,
        retrievalSource: candidateSet.retrievalSource,
        indexScanned: candidateSet.stats.scanned,
        candidateLimit: candidateSet.stats.candidateLimit,
        candidateLimitReached: true,
        retrievalLatencyMs: candidateSet.stats.latencyMs,
      },
      evaluatedAt: input.now.toISOString(),
      decisionOutcome: null,
      channelExpansionDeferred: true,
      candidateLimitReached: true,
    };
  }

  // 3. Decision evaluation (S6.2 only — no duplicated gates)
  const decisionOutcome = decideDealAlert({
    dealDetected: input.dealDetected,
    alertability: input.alertability,
    subscriptions: candidates,
    context: input.context,
    opportunityCategory: input.opportunityCategory,
    now: input.now,
    recordMatches: input.recordMatches,
  });

  const opportunityKey = decisionOutcome.opportunityFingerprint;
  const oppKeyForMatch = opportunityKey ?? '';

  // 4. Fanout construction
  const { matched, suppressedOut, duplicates, malformed } = partitionExclusive(
    decisionOutcome.eligibleSubscriptions,
    decisionOutcome.suppressedSubscriptions,
    oppKeyForMatch,
  );

  return {
    contractVersion: DEAL_ALERTS_CONTRACT_VERSION,
    opportunityKey,
    alertIdentityKey: matched.length === 1 ? matched[0]!.alertIdentityKey : null,
    opportunityIdempotencyKey: decisionOutcome.idempotencyKey,
    decision: decisionOutcome.decision,
    reason: decisionOutcome.reason,
    matchedSubscriptions: matched,
    suppressedSubscriptions: suppressedOut,
    duplicateSubscriptions: duplicates,
    stats: {
      candidatesFound: candidateSet.stats.returned,
      candidatesEvaluated: candidates.length,
      matched: matched.length,
      suppressed: suppressedOut.length,
      duplicates: duplicates.length,
      malformed,
      retrievalSource: candidateSet.retrievalSource,
      indexScanned: candidateSet.stats.scanned,
      candidateLimit: candidateSet.stats.candidateLimit,
      candidateLimitReached: false,
      retrievalLatencyMs: candidateSet.stats.latencyMs,
    },
    evaluatedAt: input.now.toISOString(),
    decisionOutcome,
    channelExpansionDeferred: true,
    candidateLimitReached: false,
  };
}
