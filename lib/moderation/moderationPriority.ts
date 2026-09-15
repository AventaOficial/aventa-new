/**
 * Prioridad de revisión humana en cola de moderación.
 * NO cambia Qualification / Deal Quality / Evidence Contract.
 * Solo responde: ¿qué debería revisar un humano primero?
 */

export type ModerationReviewPriority =
  | 'P1_HIGH_VALUE'
  | 'P2_REVIEW'
  | 'P3_INSUFFICIENT_EVIDENCE'
  | 'P4_LOW_VALUE';

export type ModerationPriorityReason = {
  kind: 'positive' | 'warning';
  code: string;
  label: string;
};

export type ModerationPriorityInput = {
  price?: number | null;
  originalPrice?: number | null;
  imageUrl?: string | null;
  isBot?: boolean | null;
  createdAt?: string | null;
  /** Duplicado confirmado en cola (si se conoce). */
  isDuplicate?: boolean | null;
  /** bot_meta crudo o ya parseado. */
  botMeta?: unknown;
  /** Reloj inyectable para edad del pending. */
  nowMs?: number;
};

export type ModerationPriorityResult = {
  priority: ModerationReviewPriority;
  /** 0 = revisar primero … 3 = último. */
  rank: number;
  label: string;
  shortLabel: string;
  reasons: ModerationPriorityReason[];
};

const PRIORITY_RANK: Record<ModerationReviewPriority, number> = {
  P1_HIGH_VALUE: 0,
  P2_REVIEW: 1,
  P3_INSUFFICIENT_EVIDENCE: 2,
  P4_LOW_VALUE: 3,
};

const PRIORITY_LABEL: Record<ModerationReviewPriority, string> = {
  P1_HIGH_VALUE: 'Alta prioridad',
  P2_REVIEW: 'Revisar',
  P3_INSUFFICIENT_EVIDENCE: 'Evidencia insuficiente',
  P4_LOW_VALUE: 'Bajo valor',
};

/** Etiqueta compacta para chips de cola. */
const PRIORITY_SHORT: Record<ModerationReviewPriority, string> = {
  P1_HIGH_VALUE: 'HIGH VALUE',
  P2_REVIEW: 'REVIEW',
  P3_INSUFFICIENT_EVIDENCE: 'INSUFFICIENT EVIDENCE',
  P4_LOW_VALUE: 'LOW VALUE',
};

/** Pending más viejos que esto pueden subir a P2_REVIEW (sin cambiar calidad). Alineado a SLA CEO 24h. */
export const MODERATION_PRIORITY_STALE_HOURS = 24;

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function bool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function extractSignals(botMeta: unknown) {
  const root = asRecord(botMeta);
  const signals = asRecord(root?.signals) ?? {};
  const dealQuality = asRecord(root?.dealQuality);
  return {
    effectiveDiscountPercent: num(signals.effectiveDiscountPercent),
    suspectedArtificialListPrice: bool(signals.suspectedArtificialListPrice) === true,
    habitual30d: num(signals.habitual30d),
    priceLowest90d: num(signals.priceLowest90d),
    savingsVsHabitualPct: num(signals.savingsVsHabitualPct),
    historyReady: bool(signals.historyReady) === true,
    cardDiscountSource: str(signals.cardDiscountSource)?.toLowerCase() ?? null,
    originalPriceProvenance: str(signals.originalPriceProvenance)?.toLowerCase() ?? null,
    dealQualityDecision: str(dealQuality?.decision)?.toUpperCase() ?? null,
  };
}

function hasValidImage(imageUrl: string | null | undefined): boolean {
  const u = (imageUrl ?? '').trim();
  return /^https?:\/\//i.test(u);
}

function isWeakListingSource(source: string | null): boolean {
  return source === 'badge_reconstructed' || source === 'card_strikethrough';
}

function ageHours(createdAt: string | null | undefined, nowMs: number): number | null {
  if (!createdAt) return null;
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (nowMs - t) / 3_600_000);
}

/**
 * Prioridad de revisión. Pura y determinista.
 * Nunca muta ni implica VERIFIED/POTENTIAL/NO_VERIFIED.
 */
export function evaluateModerationPriority(
  input: ModerationPriorityInput,
): ModerationPriorityResult {
  const reasons: ModerationPriorityReason[] = [];
  const nowMs = input.nowMs ?? Date.now();
  const s = extractSignals(input.botMeta);
  const imageOk = hasValidImage(input.imageUrl);
  const isBot = input.isBot === true;
  const isDuplicate = input.isDuplicate === true;
  const effective = s.effectiveDiscountPercent;
  const effectivePositive = effective != null && effective > 0;
  const artificial = s.suspectedArtificialListPrice;
  const historyUseful =
    s.historyReady ||
    s.habitual30d != null ||
    s.priceLowest90d != null ||
    (s.savingsVsHabitualPct != null && Number.isFinite(s.savingsVsHabitualPct));
  const weakListing = isWeakListingSource(s.cardDiscountSource);
  const qeStrong =
    s.dealQualityDecision === 'VERIFIED_DEAL' ||
    s.dealQualityDecision === 'PROMOTION' ||
    s.dealQualityDecision === 'POTENTIAL_DEAL';
  const ageH = ageHours(input.createdAt, nowMs);
  const stalePending = ageH != null && ageH >= MODERATION_PRIORITY_STALE_HOURS;

  if (effectivePositive) {
    reasons.push({
      kind: 'positive',
      code: 'effective_savings',
      label: `Ahorro efectivo ~${Math.round(effective!)}%`,
    });
  }
  if (historyUseful) {
    reasons.push({
      kind: 'positive',
      code: 'price_history',
      label: 'Historial de precio disponible',
    });
  }
  if (!artificial && (isBot || s.dealQualityDecision != null || effective != null)) {
    reasons.push({
      kind: 'positive',
      code: 'non_artificial',
      label: 'Sin lista artificial sospechada',
    });
  }
  if (imageOk) {
    reasons.push({
      kind: 'positive',
      code: 'image_ok',
      label: 'Imagen válida',
    });
  }
  if (qeStrong) {
    reasons.push({
      kind: 'positive',
      code: 'quality_review_worthy',
      label: `Quality: ${s.dealQualityDecision}`,
    });
  }

  if (isDuplicate) {
    reasons.push({
      kind: 'warning',
      code: 'duplicate',
      label: 'Posible duplicado en cola',
    });
  }
  if (artificial) {
    reasons.push({
      kind: 'warning',
      code: 'artificial_list',
      label: 'Precio de lista posiblemente artificial',
    });
  }
  if (!effectivePositive && isBot) {
    reasons.push({
      kind: 'warning',
      code: 'no_effective_savings',
      label: 'Sin ahorro efectivo confiable',
    });
  }
  if (weakListing) {
    reasons.push({
      kind: 'warning',
      code: 'weak_listing',
      label: 'Evidencia solo de listing/card',
    });
  }
  if (!historyUseful && isBot) {
    reasons.push({
      kind: 'warning',
      code: 'no_history',
      label: 'Sin historial de precio útil',
    });
  }
  if (!imageOk) {
    reasons.push({
      kind: 'warning',
      code: 'missing_image',
      label: 'Sin imagen válida',
    });
  }
  if (stalePending) {
    reasons.push({
      kind: 'warning',
      code: 'stale_pending',
      label: `Pending antiguo (~${Math.round(ageH!)}h)`,
    });
  }

  // Comunidad / manual: no penalizar por falta de bot signals — siempre revisables.
  if (!isBot) {
    if (!reasons.some((r) => r.code === 'community_manual')) {
      reasons.unshift({
        kind: 'positive',
        code: 'community_manual',
        label: 'Oferta humana / comunidad',
      });
    }
    return finalize('P2_REVIEW', reasons);
  }

  if (isDuplicate) {
    return finalize('P4_LOW_VALUE', reasons);
  }

  const strongProvenance =
    s.originalPriceProvenance === 'source_explicit' ||
    s.originalPriceProvenance === 'trusted_enrichment' ||
    s.cardDiscountSource === 'pdp';

  let priority: ModerationReviewPriority;

  // Bot HIGH_VALUE: economía real + coherencia.
  if (!artificial && effectivePositive && imageOk && (historyUseful || qeStrong || strongProvenance)) {
    priority = 'P1_HIGH_VALUE';
  } else if (!artificial && effectivePositive && imageOk) {
    priority = 'P1_HIGH_VALUE';
  } else if (qeStrong && !artificial && imageOk && effectivePositive) {
    priority = 'P1_HIGH_VALUE';
  } else if (artificial && !effectivePositive && !imageOk) {
    priority = 'P4_LOW_VALUE';
  } else if (artificial && !effectivePositive && weakListing) {
    priority = 'P4_LOW_VALUE';
  } else if (artificial && !effectivePositive) {
    priority = 'P3_INSUFFICIENT_EVIDENCE';
  } else if (weakListing && !effectivePositive && !qeStrong) {
    priority = 'P3_INSUFFICIENT_EVIDENCE';
  } else if (!historyUseful && !effectivePositive && !qeStrong) {
    priority = 'P3_INSUFFICIENT_EVIDENCE';
  } else {
    priority = 'P2_REVIEW';
  }

  // Antigüedad: eleva a revisión humana sin cambiar Deal Quality.
  if (
    stalePending &&
    (priority === 'P3_INSUFFICIENT_EVIDENCE' || priority === 'P4_LOW_VALUE')
  ) {
    priority = 'P2_REVIEW';
  }

  return finalize(priority, reasons);
}

function finalize(
  priority: ModerationReviewPriority,
  reasons: ModerationPriorityReason[],
): ModerationPriorityResult {
  return {
    priority,
    rank: PRIORITY_RANK[priority],
    label: PRIORITY_LABEL[priority],
    shortLabel: PRIORITY_SHORT[priority],
    reasons: reasons.slice(0, 6),
  };
}

export function moderationPriorityRank(priority: ModerationReviewPriority): number {
  return PRIORITY_RANK[priority];
}

/**
 * TTL al aprobar desde pending: siempre vigente para el feed.
 * Si expires_at es null o ya pasó → now + 7d.
 * Si aún es futuro → se conserva.
 */
export function expiresAtOnApprove(
  existingExpiresAt: string | null | undefined,
  nowMs = Date.now(),
  ttlMs = 7 * 24 * 60 * 60 * 1000,
): string {
  if (existingExpiresAt == null || String(existingExpiresAt).trim() === '') {
    return new Date(nowMs + ttlMs).toISOString();
  }
  const t = new Date(existingExpiresAt).getTime();
  if (!Number.isFinite(t) || t < nowMs) {
    return new Date(nowMs + ttlMs).toISOString();
  }
  return new Date(t).toISOString();
}

/**
 * Home feed (period=day) filtra por created_at.
 * Al aprobar desde pending, created_at pasa a ser el momento de go-live
 * para que ofertas con backlog (>24h) entren al feed del día.
 * El instante de ingesta sigue en bot_meta.capturedAt cuando existe.
 */
export function createdAtOnApprove(nowMs = Date.now()): string {
  return new Date(nowMs).toISOString();
}
