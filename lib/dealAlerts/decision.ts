/**
 * S6.1 — AlertDecision contract mapper (no matching algorithm).
 * Maps alertability (+ optional flags) → formal decision result.
 */

import { DEAL_ALERTS_CONTRACT_VERSION } from './constants';
import type { AlertabilityEvidence, AlertDecision, AlertDecisionResult } from './types';

export type EvaluateAlertDecisionInput = {
  alertability: AlertabilityEvidence;
  /** Global duplicate of same DealDetected idempotency key. */
  duplicateOfExisting?: boolean;
  /**
   * Subscription relevance — null = not evaluated (S6.4).
   * false → NOT_RELEVANT when otherwise alertable.
   */
  relevantToCriteria?: boolean | null;
  rateLimited?: boolean;
  dealDetectedIdempotencyKey?: string | null;
  now?: Date;
};

function reasonForBlock(
  block: AlertabilityEvidence['blockReason'],
): { result: AlertDecisionResult; reason: string } {
  switch (block) {
    case 'stale':
      return { result: 'STALE', reason: 'observation_stale' };
    case 'insufficient_evidence':
    case 'weak_evidence':
    case 'missing_fingerprint':
    case 'missing_identity':
    case 'dqe_ineligible':
      return { result: 'INSUFFICIENT_EVIDENCE', reason: block };
    case 'not_opportunity':
    case 'partial_opportunity':
      return { result: 'SUPPRESS', reason: block };
    default:
      return { result: 'SUPPRESS', reason: block ?? 'not_alertable' };
  }
}

/**
 * Formal AlertDecision from alertability.
 * Does NOT match users, deliver, or rate-limit by itself — only encodes contract outcomes.
 */
export function evaluateAlertDecision(input: EvaluateAlertDecisionInput): AlertDecision {
  const evaluatedAt = (input.now ?? new Date()).toISOString();
  const a = input.alertability;

  const base = {
    contractVersion: DEAL_ALERTS_CONTRACT_VERSION,
    dealFingerprint: a.fingerprint,
    dealDetectedIdempotencyKey: input.dealDetectedIdempotencyKey ?? null,
    evidenceReference: {
      evidenceLevel: a.evidenceLevel,
      historyReady: a.historyReady,
      opportunityDecision: a.authority.opportunityDecision,
    },
    detectedAt: a.observedAt,
    evaluatedAt,
  };

  if (input.duplicateOfExisting === true) {
    return {
      ...base,
      result: 'DUPLICATE',
      reason: 'deal_detected_idempotency_replay',
    };
  }

  if (input.rateLimited === true) {
    return {
      ...base,
      result: 'RATE_LIMITED',
      reason: 'user_or_system_rate_limit',
    };
  }

  if (!a.alertable) {
    const mapped = reasonForBlock(a.blockReason);
    return { ...base, result: mapped.result, reason: mapped.reason };
  }

  if (input.relevantToCriteria === false) {
    return {
      ...base,
      result: 'NOT_RELEVANT',
      reason: 'subscription_criteria_mismatch',
    };
  }

  return {
    ...base,
    result: 'MATCH',
    reason: 'alertable_opportunity',
  };
}
