/**
 * S9 Supply Automation — orchestration types + metrics.
 */

import type { SupplyDecision, SupplyDecisionCode } from '@/lib/supply/policy';
import type { OpportunityEvaluation } from '@/lib/supply/intelligence/types';
import type { OpportunityCandidate } from '@/lib/supply/intelligence/types';

export type SupplyAutomationMode = 'dry_run' | 'execute';

/** Normalized automation candidate — hunter-agnostic. */
export type SupplyAutomationCandidate = {
  /** Stable id for metrics / caps / idempotency tracing */
  candidateKey: string;
  sourceId: string;
  hunterId?: string | null;
  discoveredAt?: string | null;
  opportunity: OpportunityCandidate;
};

export type SupplyAutomationInput = {
  runId: string;
  mode: SupplyAutomationMode;
  candidates: SupplyAutomationCandidate[];
  /** CLI may only lower server caps */
  cliCap?: number | null;
  /** Skip live S8 adapters (staging/tests) */
  skipAdapterFetch?: boolean;
  env?: NodeJS.ProcessEnv;
};

export type SupplyCandidateOutcome = {
  candidateKey: string;
  sourceId: string;
  url: string;
  /** Final outcome (may reflect write failure after policy ELIGIBLE). */
  decision: SupplyDecision;
  /** Pre-write policy decision — used for dry/live equivalence. */
  policyDecision: SupplyDecision;
  evaluation: OpportunityEvaluation | null;
  writeAttempted: boolean;
  writeSuccess: boolean;
  offerId: string | null;
  writeError: string | null;
  duplicateKind: string | null;
};

export type SupplyAutomationMetrics = {
  candidates_seen: number;
  evaluated: number;
  eligible: number;
  suppressed: number;
  duplicates: number;
  budget_rejected: number;
  write_attempted: number;
  write_success: number;
  write_failed: number;
  provenance_rejected: number;
  quality_rejected: number;
  policy_rejected: number;
  by_code: Partial<Record<SupplyDecisionCode, number>>;
};

export type SupplyAutomationResult = {
  runId: string;
  mode: SupplyAutomationMode;
  startedAt: string;
  completedAt: string;
  metrics: SupplyAutomationMetrics;
  outcomes: SupplyCandidateOutcome[];
  /** Decision fingerprint for dry/live equivalence (excludes offerId / write side effects) */
  decisionFingerprint: string;
};

export function emptyMetrics(): SupplyAutomationMetrics {
  return {
    candidates_seen: 0,
    evaluated: 0,
    eligible: 0,
    suppressed: 0,
    duplicates: 0,
    budget_rejected: 0,
    write_attempted: 0,
    write_success: 0,
    write_failed: 0,
    provenance_rejected: 0,
    quality_rejected: 0,
    policy_rejected: 0,
    by_code: {},
  };
}

export function bumpCode(
  metrics: SupplyAutomationMetrics,
  code: SupplyDecisionCode,
): void {
  metrics.by_code[code] = (metrics.by_code[code] ?? 0) + 1;
  switch (code) {
    case 'ELIGIBLE':
      metrics.eligible += 1;
      break;
    case 'SUPPRESSED':
      metrics.suppressed += 1;
      break;
    case 'DUPLICATE':
      metrics.duplicates += 1;
      break;
    case 'BUDGET_REJECTED':
      metrics.budget_rejected += 1;
      break;
    case 'INVALID_PROVENANCE':
      metrics.provenance_rejected += 1;
      break;
    case 'LOW_QUALITY':
      metrics.quality_rejected += 1;
      break;
    default:
      metrics.policy_rejected += 1;
      break;
  }
}

/** Stable dry/live comparison — uses policyDecision only (ignores write I/O). */
export function buildDecisionFingerprint(
  outcomes: SupplyCandidateOutcome[],
): string {
  const rows = outcomes.map((o) => ({
    k: o.candidateKey,
    url: o.url,
    code: o.policyDecision.code,
    reasons: o.policyDecision.reasons,
    s8: o.policyDecision.s8Decision,
    score: o.policyDecision.s8Score,
    source: o.sourceId,
  }));
  return JSON.stringify(rows);
}
