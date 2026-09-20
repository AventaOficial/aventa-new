/**
 * Human review label helpers for Candidate Intelligence dataset.
 * Append-only labels; never mutates hunter decision history.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { HUNTER_CANDIDATE_LABELS_TABLE } from './persist';
import { isHunterCandidateIntelligenceEnabled } from './flags';
import { LABEL_SCHEMA_VERSION } from './versions';

export const HUNTER_HUMAN_DECISIONS = [
  'PUBLISH',
  'REJECT',
  'WATCH',
  'DUPLICATE',
  'REVIEW',
  'FALSE_NEGATIVE',
  'FALSE_POSITIVE',
  'GREAT_DEAL',
  'FALSE_DEAL',
  'COUPON',
  'PRICE_ERROR',
  'LOW_VALUE',
  'GOOD_DEAL',
  'BAD_DEAL',
  'WRONG_IMAGE',
  'BROKEN_LINK',
  'BAD_PRICE',
  'BAD_DISCOUNT',
  'OTHER',
] as const;

export type HunterHumanDecision = (typeof HUNTER_HUMAN_DECISIONS)[number];

export type HunterHumanLabelInput = {
  candidateId: string;
  hunterDecision: string;
  humanDecision: HunterHumanDecision;
  reasonCode?: string | null;
  reasonDetail?: string | null;
  reviewer?: string | null;
};

/**
 * Infer FP/FN from hunter vs human decisions for analytics.
 * Does not write — pure classification.
 */
export function classifyLabelOutcome(input: {
  hunterDecision: string;
  humanDecision: HunterHumanDecision;
}): 'false_negative' | 'false_positive' | 'agreement' | 'watch' | 'other' {
  const rejected =
    input.hunterDecision.startsWith('REJECTED_') ||
    input.hunterDecision === 'FAILED' ||
    input.hunterDecision === 'DUPLICATE';
  const approvedish =
    input.hunterDecision === 'WOULD_INSERT' ||
    input.hunterDecision === 'INSERTED_PENDING' ||
    input.hunterDecision === 'PUBLISHED' ||
    input.hunterDecision === 'NEEDS_REVIEW';

  if (input.humanDecision === 'FALSE_NEGATIVE') return 'false_negative';
  if (input.humanDecision === 'FALSE_POSITIVE') return 'false_positive';
  if (input.humanDecision === 'WATCH') return 'watch';

  if (
    rejected &&
    (input.humanDecision === 'PUBLISH' ||
      input.humanDecision === 'GREAT_DEAL' ||
      input.humanDecision === 'GOOD_DEAL')
  ) {
    return 'false_negative';
  }
  if (
    approvedish &&
    (input.humanDecision === 'REJECT' ||
      input.humanDecision === 'FALSE_DEAL' ||
      input.humanDecision === 'BAD_DEAL' ||
      input.humanDecision === 'LOW_VALUE' ||
      input.humanDecision === 'PRICE_ERROR' ||
      input.humanDecision === 'BAD_PRICE' ||
      input.humanDecision === 'BAD_DISCOUNT' ||
      input.humanDecision === 'WRONG_IMAGE' ||
      input.humanDecision === 'BROKEN_LINK')
  ) {
    return 'false_positive';
  }
  if (
    (rejected &&
      (input.humanDecision === 'REJECT' || input.humanDecision === 'DUPLICATE')) ||
    (approvedish && input.humanDecision === 'PUBLISH')
  ) {
    return 'agreement';
  }
  return 'other';
}

export async function persistHunterHumanLabel(
  supabase: SupabaseClient | null | undefined,
  label: HunterHumanLabelInput,
  opts?: { allowInTests?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  if (!isHunterCandidateIntelligenceEnabled() && !opts?.allowInTests) {
    return { ok: true };
  }
  if (!supabase) return { ok: false, error: 'no_supabase' };
  if (process.env.NODE_ENV === 'test' && !opts?.allowInTests) {
    return { ok: true };
  }

  const { error } = await supabase.from(HUNTER_CANDIDATE_LABELS_TABLE).insert({
    candidate_id: label.candidateId,
    hunter_decision: label.hunterDecision,
    human_decision: label.humanDecision,
    reason_code: label.reasonCode ?? null,
    reason_detail: label.reasonDetail ?? null,
    reviewer: label.reviewer ?? null,
    label_schema_version: LABEL_SCHEMA_VERSION,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
