import { normalizeCategoryForStorage } from '@/lib/categories';

/** Confianza del moderador en la oferta (no confundir con risk_score crudo). */
export type ModerationTrustLevel = 'high' | 'medium' | 'low';

export type ModerationTrustInput = {
  risk_score?: number | null;
  moderator_comment?: string | null;
  image_url?: string | null;
  category?: string | null;
  original_price?: number | null;
  price?: number | null;
  is_bot?: boolean;
};

export type ModerationTrustResult = {
  level: ModerationTrustLevel;
  label: string;
  reasons: string[];
  riskScore: number | null;
  ingestScore: number | null;
};

export const MODERATION_TRUST_LABELS: Record<ModerationTrustLevel, string> = {
  high: 'Confianza alta',
  medium: 'Confianza media',
  low: 'Confianza baja',
};

/** Parsea score=NN de `[bot-ingest v3] score=82 …`. */
export function parseBotIngestScore(moderatorComment?: string | null): number | null {
  const m = (moderatorComment ?? '').match(/score=(\d{1,3})/i);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function discountPercent(input: ModerationTrustInput): number {
  const price = Number(input.price ?? 0);
  const original = Number(input.original_price ?? 0);
  if (!Number.isFinite(price) || !Number.isFinite(original)) return 0;
  if (original <= 0 || original <= price) return 0;
  return Math.round(((original - price) / original) * 100);
}

function hasSuspiciousDiscount(input: ModerationTrustInput): boolean {
  const pct = discountPercent(input);
  if (pct <= 60) return false;
  const original = Number(input.original_price ?? 0);
  const price = Number(input.price ?? 0);
  return original <= 0 || original <= price;
}

function isBotOffer(input: ModerationTrustInput): boolean {
  return (
    input.is_bot === true ||
    (input.moderator_comment ?? '').toLowerCase().includes('[bot-ingest]') ||
    parseBotIngestScore(input.moderator_comment) != null
  );
}

/**
 * Combina risk_score (SQL) + score de ingesta (bot) + completitud en un solo nivel.
 * Umbrales acordados con el equipo de moderación.
 */
export function computeModerationTrust(input: ModerationTrustInput): ModerationTrustResult {
  const reasons: string[] = [];
  const risk = input.risk_score ?? null;
  const ingest = isBotOffer(input) ? parseBotIngestScore(input.moderator_comment) : null;
  const noImage = !input.image_url?.trim();
  const noCategory = !normalizeCategoryForStorage(input.category ?? null);

  if (risk != null && risk > 50) reasons.push(`Riesgo automático ${risk}/100`);
  if (ingest != null && ingest < 58) reasons.push(`Score del bot ${ingest}/100`);
  if (noImage) reasons.push('Sin foto');
  if (noCategory) reasons.push('Sin categoría');

  const lowTrust =
    (risk != null && risk > 50) ||
    (ingest != null && ingest < 58) ||
    noImage ||
    noCategory;

  if (lowTrust) {
    return {
      level: 'low',
      label: MODERATION_TRUST_LABELS.low,
      reasons,
      riskScore: risk,
      ingestScore: ingest,
    };
  }

  const mediumReasons: string[] = [];
  if (risk != null && risk >= 26 && risk <= 50) {
    mediumReasons.push(`Riesgo automático ${risk}/100`);
  }
  if (ingest != null && ingest >= 58 && ingest <= 77) {
    mediumReasons.push(`Score del bot ${ingest}/100`);
  }
  if (hasSuspiciousDiscount(input)) {
    mediumReasons.push('Descuento alto sin precio original claro');
  }

  if (mediumReasons.length > 0) {
    return {
      level: 'medium',
      label: MODERATION_TRUST_LABELS.medium,
      reasons: mediumReasons,
      riskScore: risk,
      ingestScore: ingest,
    };
  }

  const highReasons: string[] = ['Datos completos'];
  if (risk != null) highReasons.push(`Riesgo ${risk}/100`);
  if (ingest != null) highReasons.push(`Score bot ${ingest}/100`);

  return {
    level: 'high',
    label: MODERATION_TRUST_LABELS.high,
    reasons: highReasons,
    riskScore: risk,
    ingestScore: ingest,
  };
}

export function isLowModerationTrust(input: ModerationTrustInput): boolean {
  return computeModerationTrust(input).level === 'low';
}
