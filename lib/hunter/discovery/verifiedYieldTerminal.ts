/**
 * Day 7 — Primary terminal reason for VERIFIED-yield diagnosis.
 *
 * Exactly ONE primary reason per candidate. Extends Day 4 PIPELINE_LOSS_CODES
 * with S6.1/DQE specificity. Never invents history or weakens gates.
 */

export const VERIFIED_YIELD_TERMINAL_REASONS = [
  'DISCOVERED_ONLY',
  'IDENTITY_INVALID',
  'DUPLICATE',
  'STALE',
  'FETCH_BLOCKED',
  'EXTRACTION_FAILED',
  'PRICE_MISSING',
  'INSUFFICIENT_HISTORY',
  'ARTIFICIAL_LIST_PRICE',
  'PROVENANCE_FAILURE',
  'AVAILABILITY_FAILURE',
  'CONFIDENCE_FAILURE',
  'DQE_POTENTIAL',
  'DQE_REJECT',
  'S61_SUPPRESSED',
  'HUMAN_REVIEW',
  'WRITER_BLOCK',
  'DRY_RUN_WOULD_INSERT',
  'PENDING',
  'OTHER',
] as const;

export type VerifiedYieldTerminalReason = (typeof VERIFIED_YIELD_TERMINAL_REASONS)[number];

export type VerifiedYieldCandidateTrace = {
  url: string;
  sourceId: string;
  productId: string | null;
  daysUntilReady: number | null;
  priorDays: number | null;
  historyReady: boolean;
  dqeDecision: string | null;
  s61Decision: string | null;
  reasonCodes: string[];
  primaryTerminalReason: VerifiedYieldTerminalReason;
};

/**
 * Map gate/DQE/lifecycle signals → one primary terminal reason.
 * Priority: write success → duplicate → fetch/extract/identity →
 * artificial price → insufficient history → provenance → DQE → other S6.1 → dry-run.
 */
export function assignPrimaryTerminalReason(input: {
  dryRun?: boolean;
  identityValid?: boolean;
  extracted?: boolean;
  fetchBlocked?: boolean;
  priceMissing?: boolean;
  duplicate?: boolean;
  stale?: boolean;
  historyReady?: boolean;
  dqeDecision?: string | null;
  s61WouldInsert?: boolean;
  s61QualityDecision?: string | null;
  reasonCodes?: string[];
  mintOk?: boolean;
  mintDuplicate?: boolean;
  humanReview?: boolean;
}): VerifiedYieldTerminalReason {
  const codes = (input.reasonCodes ?? []).map((c) => c.toUpperCase());
  const has = (c: string) => codes.includes(c) || codes.some((x) => x.includes(c));

  if (input.mintOk === true && !input.dryRun) return 'PENDING';
  if (input.mintDuplicate === true || input.duplicate === true || has('DUPLICATE')) {
    return 'DUPLICATE';
  }
  // Fetch blocked is only primary when we could not extract a usable offer.
  // PM-backed tips may fail live fetch yet still evaluate DQE/S6.1 — keep quality reasons.
  if (input.extracted === false && input.fetchBlocked === true) return 'FETCH_BLOCKED';
  if (input.extracted === false) return 'EXTRACTION_FAILED';
  if (input.identityValid === false) return 'IDENTITY_INVALID';
  if (input.priceMissing === true || has('INVALID_SALE_PRICE') || has('MISSING_META')) {
    return 'PRICE_MISSING';
  }
  if (input.stale === true || has('STALE')) return 'STALE';

  if (has('ARTIFICIAL_LIST_PRICE')) return 'ARTIFICIAL_LIST_PRICE';
  if (has('INSUFFICIENT_HISTORY') || has('PARTIAL_NO_HISTORY')) {
    return 'INSUFFICIENT_HISTORY';
  }
  if (
    has('ORIGINAL_PRICE_UNTRUSTED') ||
    has('BADGE_RECONSTRUCTED') ||
    has('INVALID_ORIGINAL_PRICE')
  ) {
    return 'PROVENANCE_FAILURE';
  }
  if (has('AVAILABILITY') || has('OUT_OF_STOCK')) return 'AVAILABILITY_FAILURE';
  if (has('LOW_QUALITY') || has('VERIFIER_BELOW') || has('CONFIDENCE')) {
    return 'CONFIDENCE_FAILURE';
  }

  const dqe = (input.dqeDecision ?? '').toUpperCase();
  if (dqe === 'POTENTIAL_DEAL' || dqe.includes('POTENTIAL') || has('DQE_POTENTIAL')) {
    return 'DQE_POTENTIAL';
  }
  if (dqe === 'REJECT' || dqe === 'NO_VERIFIED_DEAL' || dqe.includes('REJECT')) {
    return 'DQE_REJECT';
  }

  if (input.humanReview === true || has('HUMAN_REVIEW')) return 'HUMAN_REVIEW';

  if (input.s61WouldInsert === true) {
    if (input.dryRun === true) return 'DRY_RUN_WOULD_INSERT';
    return 'WRITER_BLOCK';
  }

  if (input.s61QualityDecision === 'SUPPRESSED' || input.s61WouldInsert === false) {
    if (input.historyReady === false) return 'INSUFFICIENT_HISTORY';
    return 'S61_SUPPRESSED';
  }

  return 'OTHER';
}

export function isQualityBlockedTerminal(reason: VerifiedYieldTerminalReason): boolean {
  return (
    reason === 'INSUFFICIENT_HISTORY' ||
    reason === 'ARTIFICIAL_LIST_PRICE' ||
    reason === 'PROVENANCE_FAILURE' ||
    reason === 'DQE_POTENTIAL' ||
    reason === 'DQE_REJECT' ||
    reason === 'CONFIDENCE_FAILURE' ||
    reason === 'AVAILABILITY_FAILURE' ||
    reason === 'S61_SUPPRESSED'
  );
}

export function isExternalBlockedTerminal(reason: VerifiedYieldTerminalReason): boolean {
  return reason === 'FETCH_BLOCKED';
}
