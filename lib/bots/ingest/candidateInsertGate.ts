/**
 * Machine-candidate insert gate — S2.
 *
 * Codifies EXISTING ingest rules (runIngestCycle / verifier / duplicate).
 * Does not invent new score thresholds. Does not publish. Does not touch UGC POST.
 *
 * High-volume control reuses: candidatePoolMax, maxPerRun, score sort top-K,
 * rejectBelowScore (via verifier), sticky budgets (separate path).
 */

import type { DealScore } from '@/lib/dealIntelligence';
import type { DuplicateOfferKind } from '@/lib/offers/findDuplicateOffer';
import {
  AUTO_REJECTED_TIMEOUT_REASON,
  PENDING_STALE_AFTER_HOURS,
  TIMEOUT_REJECT_COOLDOWN_HOURS,
  classifyDuplicateOfferRow,
} from '@/lib/offers/findDuplicateOffer';
import type { BotIngestConfig } from './config';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import { isLowQualityTitle } from './isLowQualityTitle';
import type { ScoreDecision } from './scoreIngestCandidate';

export type CandidateGateAction =
  | 'insert_pending'
  | 'suppress'
  | 'duplicate'
  | 'reject_quality'
  | 'invalid';

export type CandidateGateResult = {
  action: CandidateGateAction;
  reason: string;
  /** Maps to RawObservation processingStatus when applicable. */
  processingStatus:
    | 'suppressed'
    | 'duplicate'
    | 'scored'
    | 'failed'
    | 'validated';
  duplicateKind?: DuplicateOfferKind;
  /** True only as metric — never auto-replace. */
  supplyOpportunity?: boolean;
};

export type MachineCandidateGateInput = {
  url: string;
  meta: ParsedOfferMetadata | null;
  config: BotIngestConfig;
  /** From evaluateDealSafe / scoreIngestCandidate — existing thresholds. */
  verifierDecision: ScoreDecision | 'reject';
  verifierReasons?: string[];
  /** Pre-checked duplicate (findDuplicateOffer). */
  duplicate?: {
    kind: DuplicateOfferKind;
    price: number | null;
  } | null;
  /** Optional DealScore — informational; never publishes. */
  dealScore?: DealScore | null;
  /** When true, original price gate applies (same as runIngestCycle). */
  requireOriginalPrice?: boolean;
};

function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Evaluate whether a machine observation may become offers.pending.
 * Uses real config thresholds — no invented cutoffs.
 */
export function evaluateMachineCandidateGate(
  input: MachineCandidateGateInput,
): CandidateGateResult {
  const url = (input.url || '').trim();
  if (!url || !isValidHttpUrl(url)) {
    return {
      action: 'invalid',
      reason: 'invalid_url',
      processingStatus: 'failed',
    };
  }

  const meta = input.meta;
  if (!meta) {
    return {
      action: 'suppress',
      reason: 'missing_metadata',
      processingStatus: 'failed',
    };
  }

  if (!Number.isFinite(meta.discountPrice) || meta.discountPrice <= 0) {
    return {
      action: 'suppress',
      reason: 'missing_discount_price',
      processingStatus: 'failed',
    };
  }

  const requireOriginal = input.requireOriginalPrice !== false;
  if (
    requireOriginal &&
    (meta.originalPrice == null || meta.originalPrice <= meta.discountPrice)
  ) {
    return {
      action: 'suppress',
      reason: 'sin precio original verificable',
      processingStatus: 'suppressed',
    };
  }

  if (meta.discountPercent < input.config.minDiscountPercent) {
    return {
      action: 'suppress',
      reason: `descuento ${meta.discountPercent}% < mínimo ${input.config.minDiscountPercent}%`,
      processingStatus: 'suppressed',
    };
  }

  if (isLowQualityTitle(meta.title, input.config)) {
    return {
      action: 'reject_quality',
      reason: 'título marcado como baja calidad',
      processingStatus: 'suppressed',
    };
  }

  if (input.verifierDecision === 'reject') {
    return {
      action: 'reject_quality',
      reason:
        input.verifierReasons?.[0] ??
        `score < mínimo publicación (${input.config.rejectBelowScore})`,
      processingStatus: 'suppressed',
    };
  }

  if (input.duplicate) {
    return {
      action: 'duplicate',
      reason: `duplicate:${input.duplicate.kind}`,
      processingStatus: 'duplicate',
      duplicateKind: input.duplicate.kind,
      // Caller may set supplyOpportunity via isSupplyOpportunity — never replace here.
      supplyOpportunity: false,
    };
  }

  // DealScore is advisory only — never blocks or publishes by itself.
  void input.dealScore;

  return {
    action: 'insert_pending',
    reason: 'passed_machine_gates',
    processingStatus: 'scored',
  };
}

/**
 * High-volume gate: keep top-K by score using existing maxPerRun / pool caps.
 * Discovery may be large; inserts must stay ≤ maxInsert.
 */
export function selectTopKByScore<T extends { score: number }>(
  scored: readonly T[],
  maxInsert: number,
): T[] {
  const cap = Math.max(0, Math.floor(maxInsert));
  if (cap === 0 || scored.length === 0) return [];
  return [...scored].sort((a, b) => b.score - a.score).slice(0, cap);
}

/** Effective insert budget for a run — min of configured caps (existing knobs). */
export function resolveInsertBudget(config: {
  maxPerRun: number;
  candidatePoolMax: number;
  remainingDailyCap?: number | null;
}): number {
  let n = Math.min(config.maxPerRun, config.candidatePoolMax);
  if (config.remainingDailyCap != null && Number.isFinite(config.remainingDailyCap)) {
    n = Math.min(n, Math.max(0, Math.floor(config.remainingDailyCap)));
  }
  return Math.max(0, n);
}

export const DUPLICATE_POLICY = {
  pendingStaleAfterHours: PENDING_STALE_AFTER_HOURS,
  timeoutRejectCooldownHours: TIMEOUT_REJECT_COOLDOWN_HOURS,
  autoRejectedTimeoutReason: AUTO_REJECTED_TIMEOUT_REASON,
  /** Better price on duplicate = metric only. */
  autoReplaceOnBetterPrice: false,
  classify: classifyDuplicateOfferRow,
} as const;

/** Statuses that are telemetry-only (not required on bot_meta). */
export const TELEMETRY_ONLY_STATUSES = [
  'received',
  'normalized',
  'validated',
] as const;

/** Statuses worth persisting on candidate provenance. */
export const PERSISTED_PROCESSING_STATUSES = [
  'scored',
  'suppressed',
  'duplicate',
  'inserted',
  'failed',
] as const;
