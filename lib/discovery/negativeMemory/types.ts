/**
 * Negative Memory — discovery intelligence (post DQ-03).
 *
 * Autoridad de lectura: offers.status + rejection_reason (+ product_fingerprint).
 * No blacklist permanente. No tabla nueva. No toca Caza/Economy/Rewards.
 */

export const NEGATIVE_MEMORY_TTL_MS = 72 * 60 * 60 * 1000;

export type NegativeMemoryLevel = 'ALLOW' | 'PENALIZE' | 'SUPPRESS';

export type RejectionSignalKind =
  | 'spam'
  | 'duplicate'
  | 'not_good_offer'
  | 'price_misleading'
  | 'unavailable'
  | 'invalid'
  | 'auto_rejected_timeout'
  | 'other_reject'
  | 'approved'
  | 'pending'
  | 'unknown';

export type NegativeMemoryEvent = {
  fingerprint: string;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
  source?: string | null;
  category?: string | null;
};

export type NegativeMemoryDecision = {
  level: NegativeMemoryLevel;
  fingerprint: string;
  reason: string;
  rejectCount: number;
  spamCount: number;
  seenBefore: boolean;
  /** Milliseconds until SUPPRESS expires; null if not suppressed. */
  suppressTtlRemainingMs: number | null;
  lastStrongSignalAt: string | null;
};

export type SourceQualityPrior = {
  sourceId: string;
  /** Historical approve rate from DQ-02/03 production sample. Soft prior only. */
  approveRate: number;
};

/** Soft priors from DQ-03 production sample — not hard quotas. */
export const SOURCE_QUALITY_PRIORS: ReadonlyArray<SourceQualityPrior> = [
  { sourceId: 'ml_api', approveRate: 0.182 },
  { sourceId: 'ml_worker', approveRate: 0.087 },
];
