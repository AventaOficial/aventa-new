/**
 * Gate de pending para ml_worker — Evidence Contract.
 * Quality Engine es la autoridad de coherencia; este gate solo aplica
 * política de entrada a pending (no re-scorea).
 *
 * WEAK listing (badge / card_strikethrough) nunca entra como VERIFIED
 * sin que QE ya haya aplicado el contrato (rescate STRONG → puede VERIFIED).
 */
import type {
  DealQualityDecisionKind,
  DealQualityRecommendedAction,
} from '@/lib/hunter/dealQuality';
import { isWeakListingCardSource } from '@/lib/hunter/dealEvidence/contract';

export type MlWorkerCardDiscountSource =
  | 'badge_reconstructed'
  | 'card_strikethrough'
  | 'pdp'
  | 'unknown';

export type MlWorkerPendingGateInput = {
  qualityDecision: DealQualityDecisionKind;
  recommendedAction: DealQualityRecommendedAction;
  cardDiscountSource?: string | null;
};

export type MlWorkerPendingGateResult = {
  allow: boolean;
  reason: string;
};

function isReviewWorthy(decision: DealQualityDecisionKind): boolean {
  return (
    decision === 'VERIFIED_DEAL' ||
    decision === 'PROMOTION' ||
    decision === 'POTENTIAL_DEAL'
  );
}

/**
 * ¿Puede este candidato ml_worker convertirse en oferta pending?
 */
export function mlWorkerMayInsertPending(input: MlWorkerPendingGateInput): MlWorkerPendingGateResult {
  const source = (input.cardDiscountSource ?? '').trim().toLowerCase();
  const weakListing = isWeakListingCardSource(source);

  // Descarte duro desde QE.
  if (
    input.recommendedAction === 'DISCARD' ||
    input.qualityDecision === 'NO_VERIFIED_DEAL' ||
    input.qualityDecision === 'REJECT'
  ) {
    if (source === 'badge_reconstructed') {
      return { allow: false, reason: 'badge_nominal_insufficient' };
    }
    if (source === 'card_strikethrough') {
      return { allow: false, reason: 'card_strikethrough_insufficient' };
    }
    return { allow: false, reason: 'quality_discard' };
  }

  if (input.recommendedAction === 'DUPLICATE' || input.qualityDecision === 'DUPLICATE') {
    return { allow: false, reason: 'quality_duplicate' };
  }

  // WEAK listing: solo pending si QE dejó review-worthy (POTENTIAL/PROMOTION/VERIFIED tras rescate).
  if (weakListing) {
    if (isReviewWorthy(input.qualityDecision)) {
      if (input.qualityDecision === 'VERIFIED_DEAL') {
        return { allow: true, reason: 'weak_listing_rescued_to_verified' };
      }
      if (source === 'badge_reconstructed') {
        return { allow: true, reason: 'badge_shortlist_rescued_by_quality' };
      }
      return { allow: true, reason: 'card_strikethrough_review_worthy' };
    }
    return {
      allow: false,
      reason:
        source === 'badge_reconstructed'
          ? 'badge_nominal_insufficient'
          : 'card_strikethrough_insufficient',
    };
  }

  if (
    input.recommendedAction === 'PUBLISH_CANDIDATE' ||
    input.recommendedAction === 'HUMAN_REVIEW'
  ) {
    return { allow: true, reason: 'quality_review_worthy' };
  }

  return { allow: false, reason: 'quality_discard' };
}

/**
 * Evidencia de card: ¿el original es solo reconstrucción de badge?
 */
export function isBadgeOnlyCardEvidence(cardDiscountSource: string | null | undefined): boolean {
  return (cardDiscountSource ?? '').trim().toLowerCase() === 'badge_reconstructed';
}

/** Evidencia WEAK de listing (badge o tachado de card). */
export function isWeakListingCardEvidence(cardDiscountSource: string | null | undefined): boolean {
  return isWeakListingCardSource(cardDiscountSource);
}
