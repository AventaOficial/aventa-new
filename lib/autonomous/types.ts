import type { HunterHealthStatus } from '@/lib/hunter/types';
import type { MonetizationReadinessResult } from '@/lib/moderation/monetizationReadiness';
import type { DealCheckResult, DealVerifierResult } from '@/lib/verifier/types';

export type AutonomousDecision = 'AUTO_APPROVE' | 'HUMAN_REVIEW' | 'AUTO_REJECT';

export type AutonomousThresholds = {
  /** Reutilizado de BotIngestConfig.autoApproveMinScore (default env 78). */
  autoApproveMinScore: number;
  /** Reutilizado de BotIngestConfig.autoApproveRequireImage. */
  requireImage: boolean;
  /** Reutilizado de BotIngestConfig.autoApproveEnabled. */
  autoApproveEnabled: boolean;
};

/**
 * Snapshot de un candidato ya procesado (Verifier + señales existentes).
 * No vuelve a scrape/score: consume equivalentes ya calculados.
 */
export type AutonomousDecisionInput = {
  verifier: DealVerifierResult;
  thresholds: AutonomousThresholds;
  monetization: MonetizationReadinessResult;
  requiresAffiliateValidation: boolean;
  source: string;
  /** null = salud desconocida (fail closed → no AUTO_APPROVE). */
  sourceHealth: HunterHealthStatus | null;
  /** Status de oferta en DB si existe; null si es candidato nuevo. */
  existingModerationStatus: string | null;
  title: string;
  imageUrl: string | null;
  store: string | null;
  price: number | null;
  discountPercent: number | null;
  effectiveDiscountPercent: number | null;
  suspectedArtificialListPrice: boolean;
  /**
   * Duplicate REAL para shadow. Si viene, sustituye verifier.checks.duplicate.
   * Nunca se alimenta a evaluateDeal / ingestDecision.
   */
  shadowDuplicate?: {
    status: DealCheckResult['status'];
    detail: string;
    matchId?: string | null;
  };
};

export type AutonomousEngineCheck = DealCheckResult & {
  key: string;
};

export type AutonomousDecisionChecks = {
  verifierDecision: AutonomousEngineCheck;
  score: AutonomousEngineCheck;
  confidence: AutonomousEngineCheck;
  critical: AutonomousEngineCheck;
  duplicate: AutonomousEngineCheck;
  price: AutonomousEngineCheck;
  discount: AutonomousEngineCheck;
  quality: AutonomousEngineCheck;
  image: AutonomousEngineCheck;
  seller: AutonomousEngineCheck;
  availability: AutonomousEngineCheck;
  risk: AutonomousEngineCheck;
  monetization: AutonomousEngineCheck;
  affiliate: AutonomousEngineCheck;
  sourceHealth: AutonomousEngineCheck;
  moderation: AutonomousEngineCheck;
  contradictions: AutonomousEngineCheck;
};

export type AutonomousDecisionResult = {
  decision: AutonomousDecision;
  confidence: number;
  score: number | null;
  reasons: string[];
  checks: AutonomousDecisionChecks;
  policyVersion: string;
  generatedAt: string;
};
