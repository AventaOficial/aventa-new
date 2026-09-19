/**
 * CazaOfertasss — Elegibilidad de publicación.
 *
 * Separada del scoring: un GREAT_DEAL no monetizable no se publica.
 * Usa la misma autoridad que `generateTelegramCard` (tarjeta) + status.
 */

import { generateTelegramCard, type TelegramDealCard } from '../telegram/card';
import type { CazaResult, DealCandidate } from '../types';
import { failResult, okResult } from '../types';

export interface PublicationEligibility {
  readonly eligible: boolean;
  readonly reasons: readonly string[];
  readonly card: TelegramDealCard | null;
}

export function evaluatePublicationEligibility(
  candidate: DealCandidate
): PublicationEligibility {
  const reasons: string[] = [];

  if (candidate.status !== 'PUBLICATION_READY') {
    reasons.push(`eligibility.status_not_ready:${candidate.status}`);
  }
  if (candidate.score.grade === 'REJECT') {
    reasons.push('eligibility.grade_reject');
  }
  if (candidate.affiliate === null || candidate.affiliateUrl === null) {
    reasons.push('eligibility.not_monetizable');
  }
  if (candidate.discountPercent <= 0) {
    reasons.push('eligibility.no_discount');
  }
  if (candidate.availability === 'out_of_stock') {
    reasons.push('eligibility.out_of_stock');
  }

  const card = generateTelegramCard(candidate);
  if (!card.ok) {
    reasons.push(...card.reasons.map((r) => `eligibility.card:${r}`));
  }

  if (reasons.length > 0 || !card.ok) {
    return { eligible: false, reasons, card: null };
  }

  // Defensa: la CTA de la tarjeta DEBE ser la affiliate URL del dominio.
  if (card.value.ctaUrl !== candidate.affiliateUrl) {
    return {
      eligible: false,
      reasons: ['eligibility.cta_url_mismatch'],
      card: null,
    };
  }

  return { eligible: true, reasons: ['eligibility.ok'], card: card.value };
}

export function assertPublishableCandidate(
  candidate: DealCandidate
): CazaResult<{ candidate: DealCandidate; card: TelegramDealCard }> {
  const e = evaluatePublicationEligibility(candidate);
  if (!e.eligible || !e.card) return failResult(e.reasons);
  return okResult({ candidate, card: e.card });
}
