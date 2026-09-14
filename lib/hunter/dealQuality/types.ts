/**
 * Deal Quality Engine V1 — contrato explicable.
 * Orquesta qualification + price memory + dedupe + imagen + identidad.
 * No sustituye qualifyCandidate ni publica.
 */

import type {
  DealQualification,
  DealQualificationInput,
  DealQualificationResult,
} from '@/lib/hunter/dealQualification/types';

/** Extiende la taxonomía de qualification con DUPLICATE / REJECT. */
export type DealQualityDecisionKind =
  | DealQualification
  | 'DUPLICATE'
  | 'REJECT';

export type DealQualityConfidence = 'high' | 'medium' | 'low';

export type DealQualityRecommendedAction =
  | 'PUBLISH_CANDIDATE'
  | 'HUMAN_REVIEW'
  | 'DISCARD'
  | 'DUPLICATE';

export type DealQualityDuplicateInput = {
  isDuplicate: boolean;
  kind?: string | null;
  matchId?: string | null;
  detail?: string | null;
};

/** Señales ya calculadas por Price Intel / Price Memory (no recalcular historial aquí). */
export type DealQualityPriceMemoryInput = {
  historyReady?: boolean | null;
  samples90d?: number | null;
  savingsVsHabitualPct?: number | null;
  priceVsLowest90dPct?: number | null;
  effectiveDiscountPercent?: number | null;
  suspectedArtificialListPrice?: boolean | null;
  habitual30d?: number | null;
  lowest90d?: number | null;
  priceIntelSource?: string | null;
};

export type DealQualityInput = {
  title?: string | null;
  url?: string | null;
  store?: string | null;
  source?: string | null;
  productId?: string | null;
  productFingerprint?: string | null;
  imageUrl?: string | null;
  currentPrice?: number | null;
  originalPrice?: number | null;
  availability?: string | null;
  /** Resultado previo de qualifyCandidate; si falta, se calcula. */
  qualification?: DealQualificationResult | null;
  /** Input para qualifyCandidate cuando no hay resultado previo. */
  qualificationInput?: DealQualificationInput | null;
  priceMemory?: DealQualityPriceMemoryInput | null;
  duplicate?: DealQualityDuplicateInput | null;
  /** Motivos duros ya conocidos (spam/fraude/URL bloqueada). */
  hardRejectReasons?: string[] | null;
  /**
   * Origen del descuento en cards ml_worker (Evidence Contract).
   * Ausente en community/manual → no se aplica democión WEAK listing.
   */
  cardDiscountSource?: string | null;
};

export type DealQualityDecision = {
  decision: DealQualityDecisionKind;
  confidence: DealQualityConfidence;
  reasons: string[];
  positiveSignals: string[];
  negativeSignals: string[];
  missingEvidence: string[];
  recommendedAction: DealQualityRecommendedAction;
  /** Qualification subyacente (null si DUPLICATE/REJECT temprano sin evaluarla). */
  qualification: DealQualification | null;
  policyVersion: string;
  generatedAt: string;
};

/** Snapshot compacto para bot_meta / telemetry (sin secretos). */
export type DealQualityTelemetry = {
  decision: DealQualityDecisionKind;
  confidence: DealQualityConfidence;
  recommendedAction: DealQualityRecommendedAction;
  reasons: string[];
  positiveSignals: string[];
  negativeSignals: string[];
  missingEvidence: string[];
  qualification: DealQualification | null;
  policyVersion: string;
  at: string;
};
