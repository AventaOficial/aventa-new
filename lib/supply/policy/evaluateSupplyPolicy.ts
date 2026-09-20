/**
 * S9 Policy evaluation — consumes S8 OpportunityEvaluation; no second scorer.
 */

import type { OpportunityEvaluation } from '@/lib/supply/intelligence/types';
import {
  decision,
  isSupplyAutomationEnabled,
  resolveSupplyAutomationCaps,
  type SupplyDecision,
} from './types';
import { isProductionRuntime } from '@/lib/server/moneyPathFreeze';

export type EvaluateSupplyPolicyInput = {
  evaluation: OpportunityEvaluation | null;
  evaluationError?: string | null;
  /** Pre-checked duplicate from findDuplicateOfferByUrl */
  isDuplicate?: boolean;
  duplicateKind?: string | null;
  /** Budget: writes already used this run / for this source */
  writesUsedThisRun?: number;
  writesUsedThisSource?: number;
  sourceId?: string | null;
  cliCap?: number | null;
  env?: NodeJS.ProcessEnv;
  /** When true, S7 machine pending writes are enabled in this process */
  machinePendingWritesEnabled?: boolean;
  /** Dry-run still evaluates eligibility; write gates soft-pass for dry */
  mode?: 'dry_run' | 'execute';
};

/**
 * Deterministic policy matrix. S8 owns quality score; S9 owns ops eligibility.
 */
export function evaluateSupplyPolicy(
  input: EvaluateSupplyPolicyInput,
): SupplyDecision {
  const env = input.env ?? process.env;
  const mode = input.mode ?? 'dry_run';
  const s8Echo = input.evaluation
    ? {
        decision: input.evaluation.decision,
        score: input.evaluation.score.value,
        confidence: input.evaluation.score.confidence,
      }
    : undefined;

  if (isProductionRuntime()) {
    return decision('PRODUCTION_BLOCKED', ['production_runtime'], s8Echo);
  }

  if (!isSupplyAutomationEnabled(env)) {
    return decision('S9_DISABLED', ['SUPPLY_AUTOMATION_ENABLED_off'], s8Echo);
  }

  const caps = resolveSupplyAutomationCaps(env, input.cliCap);
  if (!caps) {
    return decision('INVALID_CONFIG', ['invalid_s9_caps_env'], s8Echo);
  }

  if (input.evaluationError) {
    return decision('S8_FAILURE', [input.evaluationError], s8Echo);
  }

  if (!input.evaluation) {
    return decision('MALFORMED_INPUT', ['missing_opportunity_evaluation'], s8Echo);
  }

  const ev = input.evaluation;
  if (!ev.candidateUrl?.trim()) {
    return decision('MALFORMED_INPUT', ['missing_candidate_url'], s8Echo);
  }

  if (input.isDuplicate) {
    return decision(
      'DUPLICATE',
      [`duplicate:${input.duplicateKind ?? 'unknown'}`],
      s8Echo,
    );
  }

  // Provenance: require sale price; reject fabricated / missing reference for OPPORTUNITY path
  if (!ev.evidence.salePrice.amount || ev.evidence.salePrice.amount <= 0) {
    return decision('INVALID_PROVENANCE', ['missing_sale_price'], s8Echo);
  }

  if (!ev.evidence.hasImage) {
    return decision('INVALID_PROVENANCE', ['missing_image'], s8Echo);
  }

  if (ev.evidence.suspectedArtificialListPrice) {
    return decision('INVALID_PROVENANCE', ['artificial_list_price'], s8Echo);
  }

  if (ev.score.reasonCodes.includes('FABRICATED_DISCOUNT')) {
    return decision('INVALID_PROVENANCE', ['fabricated_discount'], s8Echo);
  }

  if (ev.decision === 'REJECT') {
    return decision('LOW_QUALITY', ['s8_reject', ...ev.score.reasonCodes.slice(0, 5)], s8Echo);
  }

  if (ev.decision === 'PARTIAL') {
    return decision('SUPPRESSED', ['s8_partial', ...ev.score.reasonCodes.slice(0, 5)], s8Echo);
  }

  // OPPORTUNITY — still require trusted reference for automated write eligibility
  if (!ev.evidence.referencePrice?.trusted) {
    return decision(
      'INVALID_PROVENANCE',
      ['reference_untrusted_or_missing'],
      s8Echo,
    );
  }

  if (ev.score.confidence < 0.35) {
    return decision('RISK_REJECTED', ['low_s8_confidence'], s8Echo);
  }

  const writesUsed = input.writesUsedThisRun ?? 0;
  if (writesUsed >= caps.maxWritesPerRun) {
    return decision('BUDGET_REJECTED', [`max_writes_per_run:${caps.maxWritesPerRun}`], s8Echo);
  }

  const sourceWrites = input.writesUsedThisSource ?? 0;
  if (sourceWrites >= caps.maxWritesPerSource) {
    return decision(
      'BUDGET_REJECTED',
      [`max_writes_per_source:${caps.maxWritesPerSource}`],
      s8Echo,
    );
  }

  // Execute mode requires S7 write flag; dry_run may still mark ELIGIBLE
  if (mode === 'execute' && input.machinePendingWritesEnabled === false) {
    return decision('S7_WRITES_DISABLED', ['BOT_INGEST_MACHINE_PENDING_WRITES_off'], s8Echo);
  }

  if (mode === 'execute' && input.machinePendingWritesEnabled !== true) {
    return decision('WRITE_BLOCKED', ['machine_writes_not_confirmed'], s8Echo);
  }

  return decision('ELIGIBLE', ['s8_opportunity', 'policy_pass'], s8Echo);
}

export {
  isSupplyAutomationEnabled,
  resolveSupplyAutomationCaps,
  SUPPLY_DECISION_CODES,
  S9_ENV_ENABLED,
  type SupplyDecision,
  type SupplyDecisionCode,
  type SupplyAutomationCaps,
} from './types';
