/**
 * Contrato canónico de decisiones humanas de moderación.
 * Observabilidad only — nunca decide approve/reject ni cambia calidad.
 */

import { evaluateModerationPriority, type ModerationReviewPriority } from '@/lib/moderation/moderationPriority';
import { parseBotMeta } from '@/lib/moderation/botFacts';

export const MODERATION_OUTCOME_DECISIONS = ['claim', 'approve', 'reject', 'snooze'] as const;
export type ModerationOutcomeDecision = (typeof MODERATION_OUTCOME_DECISIONS)[number];

export const MODERATION_OUTCOME_TABLE = 'moderation_outcomes';
export const MODERATION_OUTCOME_CONTRACT_VERSION = 1 as const;

export type ModerationOutcomeSourceLane = 'community' | 'machine' | 'unknown';

export type ModerationOutcomeOfferSnapshot = {
  id: string;
  created_at?: string | null;
  image_url?: string | null;
  price?: number | null;
  original_price?: number | null;
  offer_url?: string | null;
  link_mod_ok?: boolean | null;
  is_bot?: boolean | null;
  moderator_comment?: string | null;
  description?: string | null;
  bot_meta?: unknown;
  /** Señal de duplicado si el caller la conoce. */
  is_duplicate?: boolean | null;
};

export type BuildModerationOutcomeInput = {
  offer: ModerationOutcomeOfferSnapshot;
  decision: ModerationOutcomeDecision;
  moderatorId: string;
  decisionAt?: string | Date | number;
  rejectionReason?: string | null;
  snoozeMinutes?: number | null;
  /** Clave de idempotencia; si se omite se deriva del decision+offer. */
  idempotencyKey?: string | null;
  /** Extensiones sin schema churn. */
  extras?: Record<string, unknown>;
};

export type ModerationOutcomeRecord = {
  contract_version: typeof MODERATION_OUTCOME_CONTRACT_VERSION;
  offer_id: string;
  decision: ModerationOutcomeDecision;
  moderator_id: string;
  decision_at: string;
  offer_submitted_at: string | null;
  time_from_submission_ms: number | null;
  priority_at_decision: ModerationReviewPriority | null;
  source: string | null;
  source_lane: ModerationOutcomeSourceLane;
  quality_classification: string | null;
  evidence_classification: string | null;
  is_duplicate: boolean | null;
  artificial_discount: boolean | null;
  affiliate_ready: boolean | null;
  rejection_reason: string | null;
  snooze_minutes: number | null;
  idempotency_key: string;
  meta: Record<string, unknown>;
};

function asIso(raw: string | Date | number | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw instanceof Date ? raw.getTime() : typeof raw === 'number' ? raw : Date.parse(raw);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

function inferSourceLane(isBot: boolean, source: string | null): ModerationOutcomeSourceLane {
  if (!isBot) return 'community';
  if (source) return 'machine';
  return 'unknown';
}

function inferEvidenceClassification(input: {
  artificial: boolean | null;
  effective: number | null;
  qe: string | null;
  weakListing: boolean;
}): string | null {
  const { artificial, effective, qe, weakListing } = input;
  if (qe === 'VERIFIED_DEAL' || qe === 'PROMOTION') return 'strong';
  if (qe === 'POTENTIAL_DEAL') return 'partial';
  if (artificial === true) return 'artificial_list';
  if (weakListing) return 'listing_only';
  if (effective != null && effective > 0) return 'effective_savings';
  if (qe === 'NO_VERIFIED_DEAL' || qe === 'CATALOG_ONLY') return 'insufficient';
  return null;
}

function defaultIdempotencyKey(
  decision: ModerationOutcomeDecision,
  offerId: string,
  decisionAt: string,
  moderatorId: string,
  snoozeMinutes: number | null,
): string {
  if (decision === 'approve' || decision === 'reject') {
    return `${decision}:${offerId}`;
  }
  if (decision === 'snooze') {
    return `snooze:${offerId}:${snoozeMinutes ?? 0}:${decisionAt}`;
  }
  // claim: un claim por moderador+oferta+minuto (evita spam de reintentos)
  const minute = decisionAt.slice(0, 16);
  return `claim:${offerId}:${moderatorId}:${minute}`;
}

/**
 * Construye el registro canónico a partir del snapshot de oferta + decisión.
 * Puro / determinista (salvo decisionAt por defecto = now).
 */
export function buildModerationOutcome(input: BuildModerationOutcomeInput): ModerationOutcomeRecord {
  const decisionAt = asIso(input.decisionAt) ?? new Date().toISOString();
  const submittedAt = asIso(input.offer.created_at);
  const decisionMs = Date.parse(decisionAt);
  const submittedMs = submittedAt ? Date.parse(submittedAt) : NaN;
  const timeFromSubmissionMs =
    Number.isFinite(decisionMs) && Number.isFinite(submittedMs) && decisionMs >= submittedMs
      ? Math.round(decisionMs - submittedMs)
      : null;

  const botMeta = parseBotMeta(input.offer.bot_meta);
  const root = input.offer.bot_meta && typeof input.offer.bot_meta === 'object'
    ? (input.offer.bot_meta as Record<string, unknown>)
    : null;
  const dealQuality =
    root?.dealQuality && typeof root.dealQuality === 'object' && !Array.isArray(root.dealQuality)
      ? (root.dealQuality as Record<string, unknown>)
      : null;
  const qe =
    typeof dealQuality?.decision === 'string' ? dealQuality.decision.trim().toUpperCase() : null;

  const signals = botMeta?.signals ?? {};
  const artificial =
    typeof signals.suspectedArtificialListPrice === 'boolean'
      ? signals.suspectedArtificialListPrice
      : null;
  const effective =
    typeof signals.effectiveDiscountPercent === 'number' &&
    Number.isFinite(signals.effectiveDiscountPercent)
      ? signals.effectiveDiscountPercent
      : null;

  const signalsRaw =
    root?.signals && typeof root.signals === 'object' && !Array.isArray(root.signals)
      ? (root.signals as Record<string, unknown>)
      : {};
  const cardSrc =
    typeof signalsRaw.cardDiscountSource === 'string'
      ? signalsRaw.cardDiscountSource.toLowerCase()
      : null;
  const weakListing = cardSrc === 'badge_reconstructed' || cardSrc === 'card_strikethrough';

  const isBot =
    input.offer.is_bot === true ||
    (input.offer.moderator_comment ?? '').toLowerCase().includes('[bot-ingest]') ||
    (input.offer.description ?? '').toLowerCase().includes('ingesta automática (bot)');

  const source = botMeta?.source?.trim() || null;
  const sourceLane = inferSourceLane(isBot, source);

  const priority = evaluateModerationPriority({
    price: input.offer.price,
    originalPrice: input.offer.original_price,
    imageUrl: input.offer.image_url,
    isBot,
    createdAt: input.offer.created_at,
    isDuplicate: input.offer.is_duplicate === true,
    botMeta: input.offer.bot_meta,
    nowMs: decisionMs,
  });

  const hasUrl = Boolean(input.offer.offer_url?.trim());
  const affiliateReady = !hasUrl ? null : input.offer.link_mod_ok === true;

  const snoozeMinutes =
    input.decision === 'snooze' &&
    typeof input.snoozeMinutes === 'number' &&
    Number.isFinite(input.snoozeMinutes)
      ? Math.round(input.snoozeMinutes)
      : null;

  const rejectionReason =
    input.decision === 'reject' && input.rejectionReason?.trim()
      ? input.rejectionReason.trim().slice(0, 500)
      : null;

  const idempotencyKey =
    input.idempotencyKey?.trim() ||
    defaultIdempotencyKey(
      input.decision,
      input.offer.id,
      decisionAt,
      input.moderatorId,
      snoozeMinutes,
    );

  return {
    contract_version: MODERATION_OUTCOME_CONTRACT_VERSION,
    offer_id: input.offer.id,
    decision: input.decision,
    moderator_id: input.moderatorId,
    decision_at: decisionAt,
    offer_submitted_at: submittedAt,
    time_from_submission_ms: timeFromSubmissionMs,
    priority_at_decision: priority.priority,
    source,
    source_lane: sourceLane,
    quality_classification: qe,
    evidence_classification: inferEvidenceClassification({
      artificial,
      effective,
      qe,
      weakListing,
    }),
    is_duplicate: input.offer.is_duplicate === true ? true : input.offer.is_duplicate === false ? false : null,
    artificial_discount: artificial,
    affiliate_ready: affiliateReady,
    rejection_reason: rejectionReason,
    snooze_minutes: snoozeMinutes,
    idempotency_key: idempotencyKey,
    meta: {
      ...(input.extras ?? {}),
      priority_rank: priority.rank,
      priority_short: priority.shortLabel,
    },
  };
}

export function isModerationOutcomeDecision(raw: string): raw is ModerationOutcomeDecision {
  return (MODERATION_OUTCOME_DECISIONS as readonly string[]).includes(raw);
}
