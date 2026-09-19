/**
 * Machine-candidate insert gate — S2 + S6.1 quality semantics.
 *
 * Codifies EXISTING ingest rules (runIngestCycle / verifier / duplicate)
 * and trusted price-provenance admission (S6.1).
 *
 * Does not invent DealScore thresholds. Does not publish. Does not touch UGC POST.
 * DealScore remains advisory.
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
  strongProductFingerprintForUrl,
} from '@/lib/offers/findDuplicateOffer';
import {
  isAllowedAffiliateNetworkHost,
  isOfferAmazonHost,
  isOfferMercadoLibreHost,
} from '@/lib/offers/commerceHostAllowlist';
import type { BotIngestConfig } from './config';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import { isLowQualityTitle } from './isLowQualityTitle';
import { isBadgeOnlyCardEvidence } from './mlWorkerPendingGate';
import type { OfferQualitySignals } from './offerQualitySignals';
import type { ScoreDecision } from './scoreIngestCandidate';

/** Existing action contract — callers depend on these values. */
export type CandidateGateAction =
  | 'insert_pending'
  | 'suppress'
  | 'duplicate'
  | 'reject_quality'
  | 'invalid';

/** S6.1 internal quality decision (not a DB status). */
export type MachineQualityDecision =
  | 'INVALID'
  | 'SUPPRESSED'
  | 'DUPLICATE'
  | 'PARTIAL_EVIDENCE'
  | 'VERIFIED_OPPORTUNITY';

export type MachineEvidenceLevel =
  | 'none'
  | 'weak_card'
  | 'strong_card'
  | 'pdp'
  | 'history_backed';

export type MachineQualityReasonCode =
  | 'INVALID_URL'
  | 'HOST_NOT_ALLOWED'
  | 'MISSING_IDENTITY'
  | 'MISSING_META'
  | 'INVALID_SALE_PRICE'
  | 'INVALID_ORIGINAL_PRICE'
  | 'ORIGINAL_PRICE_UNTRUSTED'
  | 'BADGE_RECONSTRUCTED'
  | 'DISCOUNT_BELOW_THRESHOLD'
  | 'LOW_QUALITY_TITLE'
  | 'VERIFIER_BELOW_THRESHOLD'
  | 'DUPLICATE'
  | 'PARTIAL_NO_IMAGE'
  | 'PARTIAL_NO_HISTORY'
  | 'PARTIAL_PDP_BLOCKED'
  | 'VERIFIED_CARD_PRICE'
  | 'VERIFIED_PDP_PRICE'
  | 'VERIFIED_HISTORY';

const TRUSTED_ORIGINAL_PROVENANCE = new Set([
  'listing_card',
  'source_explicit',
]);

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
  /** S6.1 additive — internal quality decision. */
  qualityDecision: MachineQualityDecision;
  /** True only when qualityDecision === VERIFIED_OPPORTUNITY. */
  wouldInsert: boolean;
  reasonCodes: MachineQualityReasonCode[];
  evidenceLevel: MachineEvidenceLevel;
  /** Conservative deterministic 0–1; not a new scorer. */
  confidence: number | null;
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
  /** Optional DealScore — informational; never publishes / never blocks. */
  dealScore?: DealScore | null;
  /** When true, original price gate applies (same as runIngestCycle). */
  requireOriginalPrice?: boolean;
  /** Optional PDP blocked signal from worker discovery (advisory). */
  pdpBlocked?: boolean | null;
};

function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isAllowedMachineOfferHost(hostname: string): boolean {
  return (
    isOfferMercadoLibreHost(hostname) ||
    isOfferAmazonHost(hostname) ||
    isAllowedAffiliateNetworkHost(hostname)
  );
}

function result(partial: Omit<CandidateGateResult, 'wouldInsert'> & { wouldInsert?: boolean }): CandidateGateResult {
  const qualityDecision = partial.qualityDecision;
  const wouldInsert = qualityDecision === 'VERIFIED_OPPORTUNITY';
  return {
    ...partial,
    wouldInsert,
  };
}

function readSignals(meta: ParsedOfferMetadata | null): OfferQualitySignals | null {
  return meta?.signals ?? null;
}

/**
 * Trusted original-price provenance for machine admission.
 * badge_reconstructed / unknown / missing → untrusted.
 */
export function isTrustedOriginalPriceProvenance(
  provenance: string | null | undefined,
  cardDiscountSource?: string | null,
): boolean {
  if (isBadgeOnlyCardEvidence(cardDiscountSource)) return false;
  const p = (provenance ?? '').trim().toLowerCase();
  return TRUSTED_ORIGINAL_PROVENANCE.has(p);
}

function deriveEvidenceLevel(input: {
  signals: OfferQualitySignals | null;
  verified: boolean;
}): MachineEvidenceLevel {
  if (!input.verified) {
    const src = (input.signals?.cardDiscountSource ?? '').trim().toLowerCase();
    if (src === 'badge_reconstructed' || !src) return 'weak_card';
    return 'none';
  }
  if (input.signals?.historyReady === true) return 'history_backed';
  const orig = (input.signals?.originalPriceProvenance ?? '').trim().toLowerCase();
  const card = (input.signals?.cardDiscountSource ?? '').trim().toLowerCase();
  if (orig === 'source_explicit' || card === 'pdp') return 'pdp';
  if (orig === 'listing_card' || card === 'card_strikethrough') return 'strong_card';
  return 'strong_card';
}

function deriveConfidence(input: {
  evidenceLevel: MachineEvidenceLevel;
  hasImage: boolean;
  historyReady: boolean;
  pdpBlocked: boolean;
}): number {
  let c = 0.35;
  if (input.evidenceLevel === 'strong_card') c = 0.55;
  if (input.evidenceLevel === 'pdp') c = 0.7;
  if (input.evidenceLevel === 'history_backed') c = 0.85;
  if (input.hasImage) c += 0.05;
  if (input.historyReady && input.evidenceLevel !== 'history_backed') c += 0.1;
  if (input.pdpBlocked) c -= 0.05;
  return Math.max(0, Math.min(1, Math.round(c * 100) / 100));
}

/**
 * Evaluate whether a machine observation may become offers.pending.
 * Uses real config thresholds — no invented DealScore cutoffs.
 * S6.1: trusted price provenance required for VERIFIED_OPPORTUNITY.
 */
export function evaluateMachineCandidateGate(
  input: MachineCandidateGateInput,
): CandidateGateResult {
  const url = (input.url || '').trim();
  if (!url || !isValidHttpUrl(url)) {
    return result({
      action: 'invalid',
      reason: 'invalid_url',
      processingStatus: 'failed',
      qualityDecision: 'INVALID',
      reasonCodes: ['INVALID_URL'],
      evidenceLevel: 'none',
      confidence: 0,
    });
  }

  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    return result({
      action: 'invalid',
      reason: 'invalid_url',
      processingStatus: 'failed',
      qualityDecision: 'INVALID',
      reasonCodes: ['INVALID_URL'],
      evidenceLevel: 'none',
      confidence: 0,
    });
  }

  if (!isAllowedMachineOfferHost(hostname)) {
    return result({
      action: 'invalid',
      reason: 'host_not_allowlisted',
      processingStatus: 'failed',
      qualityDecision: 'INVALID',
      reasonCodes: ['HOST_NOT_ALLOWED'],
      evidenceLevel: 'none',
      confidence: 0,
    });
  }

  const meta = input.meta;
  if (!meta) {
    return result({
      action: 'suppress',
      reason: 'missing_metadata',
      processingStatus: 'failed',
      qualityDecision: 'SUPPRESSED',
      reasonCodes: ['MISSING_META'],
      evidenceLevel: 'none',
      confidence: 0,
    });
  }

  const fingerprint = strongProductFingerprintForUrl(meta.canonicalUrl || url);
  if (!fingerprint) {
    return result({
      action: 'suppress',
      reason: 'missing_product_identity',
      processingStatus: 'failed',
      qualityDecision: 'SUPPRESSED',
      reasonCodes: ['MISSING_IDENTITY'],
      evidenceLevel: 'none',
      confidence: 0,
    });
  }

  if (!Number.isFinite(meta.discountPrice) || meta.discountPrice <= 0) {
    return result({
      action: 'suppress',
      reason: 'missing_discount_price',
      processingStatus: 'failed',
      qualityDecision: 'SUPPRESSED',
      reasonCodes: ['INVALID_SALE_PRICE'],
      evidenceLevel: 'none',
      confidence: 0,
    });
  }

  const signals = readSignals(meta);
  const cardSource = signals?.cardDiscountSource ?? null;
  const originalProv = signals?.originalPriceProvenance ?? null;

  if (isBadgeOnlyCardEvidence(cardSource)) {
    return result({
      action: 'suppress',
      reason: 'badge_reconstructed_original_untrusted',
      processingStatus: 'suppressed',
      qualityDecision: 'SUPPRESSED',
      reasonCodes: ['BADGE_RECONSTRUCTED', 'ORIGINAL_PRICE_UNTRUSTED'],
      evidenceLevel: 'weak_card',
      confidence: 0.15,
    });
  }

  const requireOriginal = input.requireOriginalPrice !== false;
  if (
    requireOriginal &&
    (meta.originalPrice == null || meta.originalPrice <= meta.discountPrice)
  ) {
    return result({
      action: 'suppress',
      reason: 'sin precio original verificable',
      processingStatus: 'suppressed',
      qualityDecision: 'SUPPRESSED',
      reasonCodes: ['INVALID_ORIGINAL_PRICE'],
      evidenceLevel: 'weak_card',
      confidence: 0.2,
    });
  }

  // Machine admission: unknown / missing provenance is never VERIFIED.
  if (requireOriginal && !isTrustedOriginalPriceProvenance(originalProv, cardSource)) {
    return result({
      action: 'suppress',
      reason: 'original_price_provenance_untrusted',
      processingStatus: 'suppressed',
      qualityDecision: 'SUPPRESSED',
      reasonCodes: ['ORIGINAL_PRICE_UNTRUSTED'],
      evidenceLevel: 'weak_card',
      confidence: 0.2,
    });
  }

  if (meta.discountPercent < input.config.minDiscountPercent) {
    return result({
      action: 'suppress',
      reason: `descuento ${meta.discountPercent}% < mínimo ${input.config.minDiscountPercent}%`,
      processingStatus: 'suppressed',
      qualityDecision: 'SUPPRESSED',
      reasonCodes: ['DISCOUNT_BELOW_THRESHOLD'],
      evidenceLevel: deriveEvidenceLevel({ signals, verified: false }),
      confidence: 0.25,
    });
  }

  if (isLowQualityTitle(meta.title, input.config)) {
    return result({
      action: 'reject_quality',
      reason: 'título marcado como baja calidad',
      processingStatus: 'suppressed',
      qualityDecision: 'SUPPRESSED',
      reasonCodes: ['LOW_QUALITY_TITLE'],
      evidenceLevel: deriveEvidenceLevel({ signals, verified: false }),
      confidence: 0.25,
    });
  }

  if (input.verifierDecision === 'reject') {
    return result({
      action: 'reject_quality',
      reason:
        input.verifierReasons?.[0] ??
        `score < mínimo publicación (${input.config.rejectBelowScore})`,
      processingStatus: 'suppressed',
      qualityDecision: 'SUPPRESSED',
      reasonCodes: ['VERIFIER_BELOW_THRESHOLD'],
      evidenceLevel: deriveEvidenceLevel({ signals, verified: false }),
      confidence: 0.3,
    });
  }

  // Duplicate always wins over quality (after hard validity checks).
  if (input.duplicate) {
    return result({
      action: 'duplicate',
      reason: `duplicate:${input.duplicate.kind}`,
      processingStatus: 'duplicate',
      duplicateKind: input.duplicate.kind,
      supplyOpportunity: false,
      qualityDecision: 'DUPLICATE',
      reasonCodes: ['DUPLICATE'],
      evidenceLevel: deriveEvidenceLevel({ signals, verified: false }),
      confidence: null,
    });
  }

  // DealScore is advisory only — never blocks or publishes by itself.
  void input.dealScore;

  const reasonCodes: MachineQualityReasonCode[] = [];
  const orig = (originalProv ?? '').trim().toLowerCase();
  if (orig === 'source_explicit' || (cardSource ?? '').toLowerCase() === 'pdp') {
    reasonCodes.push('VERIFIED_PDP_PRICE');
  } else {
    reasonCodes.push('VERIFIED_CARD_PRICE');
  }

  const hasImage = Boolean(meta.imageUrl?.trim());
  if (!hasImage) reasonCodes.push('PARTIAL_NO_IMAGE');

  const historyReady = signals?.historyReady === true;
  if (!historyReady) reasonCodes.push('PARTIAL_NO_HISTORY');
  else reasonCodes.push('VERIFIED_HISTORY');

  const pdpBlocked = input.pdpBlocked === true;
  if (pdpBlocked) reasonCodes.push('PARTIAL_PDP_BLOCKED');

  const evidenceLevel = deriveEvidenceLevel({ signals, verified: true });
  const confidence = deriveConfidence({
    evidenceLevel,
    hasImage,
    historyReady,
    pdpBlocked,
  });

  return result({
    action: 'insert_pending',
    reason: 'passed_machine_quality_gates',
    processingStatus: 'scored',
    qualityDecision: 'VERIFIED_OPPORTUNITY',
    reasonCodes,
    evidenceLevel,
    confidence,
  });
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
