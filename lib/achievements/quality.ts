/**
 * Umbral de calidad de logros, leído del DealScore y del DQE que ya
 * persisten en bot_meta. Si no hay señal, la oferta no cuenta.
 * No inventa un score paralelo.
 *
 * DealScore es 0–100. VERIFIED_DEAL es la decisión fuerte del DQE.
 */

export const DEAL_SCORE_QUALITY_MIN = 70;
export const DEAL_SCORE_SECRET_MIN = 95;
export const DEAL_SCORE_SECRET_WITH_VERIFIED_MIN = 92;

export type OfferQualityReading = {
  qualifies: boolean;
  secret: boolean;
  gateFailed: boolean;
  duplicate: boolean;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function readOfferQuality(botMeta: unknown): OfferQualityReading {
  const root = record(botMeta);
  if (!root) {
    return { qualifies: false, secret: false, gateFailed: false, duplicate: false };
  }
  const dealScore = record(root.dealScore);
  const score = numberOrNull(dealScore?.score);
  const dealQuality = record(root.dealQuality);
  const decision = text(dealQuality?.decision)?.toUpperCase() ?? null;
  const action = text(dealQuality?.recommendedAction)?.toUpperCase() ?? null;
  const duplicate = decision === 'DUPLICATE' || action === 'DUPLICATE';
  const gateFailed =
    duplicate
    || decision === 'REJECT'
    || decision === 'NO_VERIFIED_DEAL'
    || action === 'DISCARD';
  const verified = decision === 'VERIFIED_DEAL';
  const scoreOk = score != null && score >= DEAL_SCORE_QUALITY_MIN && score <= 100;
  const qualifies = !gateFailed && (verified || scoreOk);
  const secret =
    !gateFailed
    && (
      (verified && score != null && score >= DEAL_SCORE_SECRET_WITH_VERIFIED_MIN)
      || (score != null && score >= DEAL_SCORE_SECRET_MIN)
    );
  return { qualifies, secret, gateFailed, duplicate };
}

export function offerWasCorrected(moderatorComment: string | null | undefined): boolean {
  return Boolean(moderatorComment?.trim());
}
