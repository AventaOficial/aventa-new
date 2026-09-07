import type { ScoreBreakdown, ScoreDecision } from '@/lib/bots/ingest/scoreIngestCandidate';
import type { IngestSourceId } from '@/lib/bots/ingest/types';

/** Decisiones del Deal Verifier (review = cola de moderación existente). */
export type DealVerifierDecision = 'auto_approve' | 'review' | 'reject';

export type DealCheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';

export type DealCheckResult = {
  status: DealCheckStatus;
  detail: string;
};

export type DealVerifierChecks = {
  price: DealCheckResult;
  discount: DealCheckResult;
  duplicate: DealCheckResult;
  seller: DealCheckResult;
  availability: DealCheckResult;
  quality: DealCheckResult;
  risk: DealCheckResult;
};

export type DealVerifierResult = {
  decision: DealVerifierDecision;
  /** Score 0–100 reutilizado de scoreIngestCandidate. */
  score: number;
  /** Confianza 0–1 derivada de la decisión y checks. */
  confidence: number;
  reasons: string[];
  checks: DealVerifierChecks;
  breakdown: ScoreBreakdown;
  /** Mapeo al contrato de ingest existente. */
  ingestDecision: ScoreDecision;
  duplicateOfferId?: string | null;
};

export type DealVerifierInputSource = IngestSourceId | string;
