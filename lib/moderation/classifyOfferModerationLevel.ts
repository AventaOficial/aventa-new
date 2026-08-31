import { computeModerationTrust, type ModerationTrustInput } from './confidenceBadge';
import { classifyModerationLevel, type ModerationLevel } from './classifyModerationLevel';
import { buildModerationChecklist, countChecklistBlockers } from './botFacts';

export type OfferModerationSignals = {
  authorBanned?: boolean;
  hasPendingReport?: boolean;
  similarCount?: number;
};

export type ClassifiableOffer = ModerationTrustInput & {
  title?: string | null;
  image_urls?: string[] | null;
  offer_url?: string | null;
  risk_score?: number | null;
};

export function classifyOfferModerationLevel(
  offer: ClassifiableOffer,
  signals: OfferModerationSignals = {}
): { level: ModerationLevel; reasons: string[]; blockerCount: number } {
  const trust = computeModerationTrust(offer);
  const checklist = buildModerationChecklist({
    title: offer.title,
    image_url: offer.image_url,
    image_urls: offer.image_urls,
    offer_url: offer.offer_url,
    category: offer.category,
  });
  const blockerCount = countChecklistBlockers(checklist);

  const reasons: string[] = [];
  if (signals.authorBanned) reasons.push('Autor baneado');
  if (signals.hasPendingReport) reasons.push('Reporte pendiente');
  if (signals.similarCount && signals.similarCount > 0) {
    reasons.push(`${signals.similarCount} posible(s) duplicado(s)`);
  }
  if (offer.risk_score != null && offer.risk_score > 70) {
    reasons.push(`Riesgo alto (${offer.risk_score}/100)`);
  }
  reasons.push(...trust.reasons);

  const level = classifyModerationLevel({
    trust,
    similarCount: signals.similarCount ?? 0,
    hasPendingReport: signals.hasPendingReport,
    authorBanned: signals.authorBanned,
    blockerCount,
    riskScore: offer.risk_score ?? null,
  });

  return { level, reasons, blockerCount };
}
