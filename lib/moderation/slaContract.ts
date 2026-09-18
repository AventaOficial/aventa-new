/**
 * Contrato SLA de moderación (prioridad → tiempo máximo a decisión humana).
 * NO implica auto-approve: solo priorización y medición de breach.
 */

import type { ModerationReviewPriority } from './moderationPriority';

/** Horas máximas desde created_at hasta decisión (approve/reject/snooze). */
export const MODERATION_SLA_HOURS: Record<ModerationReviewPriority, number> = {
  P1_HIGH_VALUE: 2,
  P2_REVIEW: 12,
  P3_INSUFFICIENT_EVIDENCE: 24,
  /** Oportunista: no hay breach duro; se mide con umbral operativo 48h. */
  P4_LOW_VALUE: 48,
};

export function slaHoursForPriority(priority: ModerationReviewPriority): number {
  return MODERATION_SLA_HOURS[priority];
}

export function isSlaBreached(params: {
  priority: ModerationReviewPriority;
  ageHours: number | null | undefined;
}): boolean {
  if (params.ageHours == null || !Number.isFinite(params.ageHours)) return false;
  return params.ageHours >= slaHoursForPriority(params.priority);
}

/** Tope de filas pending cargadas al claim/ordenar (escala sin full-table al cliente). */
export const CLAIM_QUEUE_HARD_CAP = 1000;

/** Tope de excludeOfferIds aceptados en claim-next (sesión; anti-payload abuse). */
export const CLAIM_EXCLUDE_IDS_MAX = 2000;

/**
 * Horas estimadas para drenar backlog a throughput actual.
 * null si no hay tasa medible.
 */
export function estimateHoursToDrain(backlog: number, throughputPerHour: number): number | null {
  if (!Number.isFinite(backlog) || backlog <= 0) return 0;
  if (!Number.isFinite(throughputPerHour) || throughputPerHour <= 0) return null;
  return Math.round((backlog / throughputPerHour) * 10) / 10;
}

export function formatHoursToDrain(hours: number | null): string {
  if (hours == null) return 'NO_DATA';
  if (hours === 0) return '0h';
  if (hours < 1) return `<1h`;
  if (hours < 24) return `${hours}h`;
  return `${Math.round((hours / 24) * 10) / 10}d`;
}
