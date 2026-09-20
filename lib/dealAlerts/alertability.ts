/**
 * S6.1 — Alertability gates (deterministic).
 * Authority: S8 OPPORTUNITY + historyReady/history_backed + Evidence/DQE.
 * Not a new alert score.
 */

import { isObservationStale } from '@/lib/dealIntelligence/priceObservation';
import type {
  OpportunityDecision,
  OpportunityEvidence,
  OpportunityEvaluation,
  OpportunityEvidenceLevel,
} from '@/lib/supply/intelligence/types';
import type { DealEvidenceStrength } from '@/lib/hunter/dealEvidence/contract';
import {
  DEAL_ALERTS_CONTRACT_VERSION,
  DEAL_ALERTS_DEFAULT_MAX_AGE_SECONDS,
} from './constants';
import type { AlertabilityEvidence, AlertabilityAuthority } from './types';

export type EvaluateAlertabilityInput = {
  opportunityDecision: OpportunityDecision;
  evidence: Pick<
    OpportunityEvidence,
    | 'evidenceLevel'
    | 'historyReady'
    | 'discountPercent'
    | 'salePrice'
    | 'productFingerprint'
  > & {
    salePriceAmount?: number | null;
    currency?: string | null;
  };
  identityStatus: 'exact' | 'probable' | 'unknown';
  merchant?: string | null;
  store?: string | null;
  sourceId: string;
  observedAt: string;
  /** Evidence Contract strength when known. */
  evidenceStrength?: DealEvidenceStrength | null;
  /** false = DQE reject / ineligible; null = not evaluated. */
  dqeEligible?: boolean | null;
  now?: Date;
  maxAgeSeconds?: number;
};

function saleAmount(
  evidence: EvaluateAlertabilityInput['evidence'],
): number | null {
  if (typeof evidence.salePriceAmount === 'number' && Number.isFinite(evidence.salePriceAmount)) {
    return evidence.salePriceAmount;
  }
  const amt = evidence.salePrice?.amount;
  return typeof amt === 'number' && Number.isFinite(amt) ? amt : null;
}

/**
 * Strong-enough evidence for alerts: history_backed preferred;
 * api_verified only when historyReady (Price Memory gate).
 * weak_card / none → insufficient.
 */
export function evidenceStrongEnoughForAlerts(
  level: OpportunityEvidenceLevel,
  historyReady: boolean,
): boolean {
  if (!historyReady) return false;
  return level === 'history_backed' || level === 'api_verified';
}

/**
 * Pure alertability evaluation — fail-closed, no LLM, no new scorer.
 */
export function evaluateAlertability(
  input: EvaluateAlertabilityInput,
): AlertabilityEvidence {
  const evaluatedAt = (input.now ?? new Date()).toISOString();
  const maxAge = input.maxAgeSeconds ?? DEAL_ALERTS_DEFAULT_MAX_AGE_SECONDS;
  const stale = isObservationStale({
    observedAt: input.observedAt,
    now: input.now,
    maxAgeSeconds: maxAge,
  });

  const fingerprint = input.evidence.productFingerprint?.trim() || null;
  const historyReady = input.evidence.historyReady === true;
  const evidenceLevel = input.evidence.evidenceLevel;
  const evidenceStrength = input.evidenceStrength ?? null;
  const dqeEligible = input.dqeEligible ?? null;

  const authority: AlertabilityAuthority = {
    opportunityDecision: input.opportunityDecision,
    evidenceLevel,
    historyReady,
    evidenceStrength,
    dqeEligible,
  };

  const base = {
    contractVersion: DEAL_ALERTS_CONTRACT_VERSION,
    authority,
    fingerprint,
    identityStatus: input.identityStatus,
    merchant: input.merchant ?? null,
    store: input.store ?? null,
    salePrice: saleAmount(input.evidence),
    discountPercent: input.evidence.discountPercent,
    currency: input.evidence.currency ?? null,
    historyReady,
    evidenceLevel,
    stale,
    observedAt: input.observedAt,
    evaluatedAt,
    sourceId: input.sourceId,
  };

  if (input.opportunityDecision === 'REJECT') {
    return { ...base, alertable: false, blockReason: 'not_opportunity' };
  }
  if (input.opportunityDecision === 'PARTIAL') {
    return { ...base, alertable: false, blockReason: 'partial_opportunity' };
  }
  if (input.opportunityDecision !== 'OPPORTUNITY') {
    return { ...base, alertable: false, blockReason: 'not_opportunity' };
  }

  if (!fingerprint) {
    return { ...base, alertable: false, blockReason: 'missing_fingerprint' };
  }

  if (input.identityStatus === 'unknown') {
    return { ...base, alertable: false, blockReason: 'missing_identity' };
  }

  if (stale) {
    return { ...base, alertable: false, blockReason: 'stale' };
  }

  if (!historyReady) {
    return { ...base, alertable: false, blockReason: 'insufficient_evidence' };
  }

  if (!evidenceStrongEnoughForAlerts(evidenceLevel, historyReady)) {
    return { ...base, alertable: false, blockReason: 'weak_evidence' };
  }

  if (evidenceStrength === 'WEAK') {
    return { ...base, alertable: false, blockReason: 'weak_evidence' };
  }

  if (dqeEligible === false) {
    return { ...base, alertable: false, blockReason: 'dqe_ineligible' };
  }

  return { ...base, alertable: true, blockReason: null };
}

/** Convenience: build alertability from S8 OpportunityEvaluation. */
export function evaluateAlertabilityFromOpportunity(
  evaluation: OpportunityEvaluation,
  options?: {
    identityStatus?: 'exact' | 'probable' | 'unknown';
    merchant?: string | null;
    store?: string | null;
    sourceId?: string | null;
    evidenceStrength?: DealEvidenceStrength | null;
    dqeEligible?: boolean | null;
    now?: Date;
    maxAgeSeconds?: number;
  },
): AlertabilityEvidence {
  const fp = evaluation.productFingerprint;
  const identityStatus =
    options?.identityStatus ??
    (fp?.startsWith('amz:') || fp?.startsWith('ml:') ? 'exact' : 'unknown');

  return evaluateAlertability({
    opportunityDecision: evaluation.decision,
    evidence: {
      ...evaluation.evidence,
      salePriceAmount: evaluation.evidence.salePrice.amount,
      currency: null,
    },
    identityStatus,
    merchant: options?.merchant ?? null,
    store: options?.store ?? null,
    sourceId: options?.sourceId ?? evaluation.candidateUrl,
    observedAt: evaluation.evaluatedAt,
    evidenceStrength: options?.evidenceStrength ?? null,
    dqeEligible: options?.dqeEligible ?? null,
    now: options?.now,
    maxAgeSeconds: options?.maxAgeSeconds,
  });
}
