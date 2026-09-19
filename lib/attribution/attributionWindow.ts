/**
 * Ventana de atribución click → conversión.
 * Alineada a REWARDS_CLICK_ATTRIBUTION_WINDOW_DAYS (única fuente de política).
 */

import { REWARDS_CLICK_ATTRIBUTION_WINDOW_DAYS } from '@/lib/rewards/config';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Días de ventana (política rewards — no override por env aquí). */
export function getAttributionWindowDays(): number {
  return REWARDS_CLICK_ATTRIBUTION_WINDOW_DAYS;
}

export function getAttributionWindowMs(): number {
  return getAttributionWindowDays() * MS_PER_DAY;
}

/** ISO `since` para queries: conversión en `conversionAtMs` solo puede atribuir clicks >= since. */
export function getAttributionWindowSinceIso(conversionAtMs: number): string {
  const sinceMs = conversionAtMs - getAttributionWindowMs();
  return new Date(sinceMs).toISOString();
}

export function parseAttributionTimestamp(raw: string | Date | null | undefined): number | null {
  if (raw == null) return null;
  const ms = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Click dentro de ventana si created_at <= conversionAt y created_at >= since.
 * Fail-closed: timestamps inválidos → false.
 */
export function isClickWithinAttributionWindow(
  clickCreatedAt: string | Date | null | undefined,
  conversionAt: string | Date | null | undefined,
): boolean {
  const clickMs = parseAttributionTimestamp(clickCreatedAt);
  const conversionMs = parseAttributionTimestamp(conversionAt);
  if (clickMs == null || conversionMs == null) return false;
  if (clickMs > conversionMs) return false;
  const sinceMs = conversionMs - getAttributionWindowMs();
  return clickMs >= sinceMs;
}

export function isAttributionWindowExpired(
  clickCreatedAt: string | Date | null | undefined,
  conversionAt: string | Date | null | undefined,
): boolean {
  const clickMs = parseAttributionTimestamp(clickCreatedAt);
  const conversionMs = parseAttributionTimestamp(conversionAt);
  if (clickMs == null || conversionMs == null) return true;
  if (clickMs > conversionMs) return true;
  const sinceMs = conversionMs - getAttributionWindowMs();
  return clickMs < sinceMs;
}
