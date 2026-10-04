import { OWNER_DASHBOARD_TZ, getYmdInTz, monthYmdRange, startOfDayUtc } from '@/lib/owner/mxTime';

export const OWNER_RANGE_KEYS = ['today', '7d', '30d', 'month'] as const;
export type OwnerRangeKey = (typeof OWNER_RANGE_KEYS)[number];

export const OWNER_RANGE_LABELS: Record<OwnerRangeKey, string> = {
  today: 'Hoy',
  '7d': '7 días',
  '30d': '30 días',
  month: 'Este mes',
};

export type ResolvedOwnerRange = {
  key: OwnerRangeKey;
  label: string;
  start: string;
  end: string;
  /** Ventana anterior de la misma duración (misma hora del día para Hoy / mismo avance para Este mes). */
  prevStart: string;
  prevEnd: string;
  prevLabel: string;
  bucket: 'hour' | 'day';
  /** Inicio del primer bucket (alineado a hora o a medianoche MX). */
  bucketOrigin: string;
  bucketCount: number;
};

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export function parseOwnerRange(raw: string | null | undefined): OwnerRangeKey {
  return (OWNER_RANGE_KEYS as readonly string[]).includes(raw ?? '') ? (raw as OwnerRangeKey) : 'today';
}

export function resolveOwnerRange(key: OwnerRangeKey, now: Date = new Date()): ResolvedOwnerRange {
  const end = now.toISOString();
  const nowMs = now.getTime();

  if (key === 'today') {
    const start = startOfDayUtc(now);
    const elapsed = nowMs - new Date(start).getTime();
    // MX sin horario de verano (convención fija +6 h de mxTime): ayer 00:00 = hoy 00:00 − 24 h.
    const prevStart = new Date(new Date(start).getTime() - DAY_MS).toISOString();
    return {
      key,
      label: OWNER_RANGE_LABELS[key],
      start,
      end,
      prevStart,
      prevEnd: new Date(new Date(prevStart).getTime() + elapsed).toISOString(),
      prevLabel: 'ayer a esta hora',
      bucket: 'hour',
      bucketOrigin: start,
      bucketCount: Math.max(1, Math.ceil(elapsed / HOUR_MS)),
    };
  }

  if (key === 'month') {
    const { startIso } = monthYmdRange(now);
    const elapsed = nowMs - new Date(startIso).getTime();
    const prevRef = new Date(new Date(startIso).getTime() - DAY_MS);
    const prevStart = monthYmdRange(prevRef).startIso;
    const prevMonthEnd = monthYmdRange(prevRef).endIso;
    const prevEndMs = Math.min(new Date(prevStart).getTime() + elapsed, new Date(prevMonthEnd).getTime());
    return {
      key,
      label: OWNER_RANGE_LABELS[key],
      start: startIso,
      end,
      prevStart,
      prevEnd: new Date(prevEndMs).toISOString(),
      prevLabel: 'mismo avance del mes anterior',
      bucket: 'day',
      bucketOrigin: startIso,
      bucketCount: Math.max(1, Math.ceil(elapsed / DAY_MS)),
    };
  }

  const days = key === '7d' ? 7 : 30;
  const startMs = nowMs - days * DAY_MS;
  const start = new Date(startMs).toISOString();
  const origin = startOfDayUtc(new Date(startMs));
  return {
    key,
    label: OWNER_RANGE_LABELS[key],
    start,
    end,
    prevStart: new Date(startMs - days * DAY_MS).toISOString(),
    prevEnd: start,
    prevLabel: `${days} días anteriores`,
    bucket: 'day',
    bucketOrigin: origin,
    bucketCount: Math.max(1, Math.ceil((nowMs - new Date(origin).getTime()) / DAY_MS)),
  };
}

/** Índice de bucket para un timestamp; -1 si cae fuera. */
export function bucketIndex(range: ResolvedOwnerRange, iso: string): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return -1;
  const size = range.bucket === 'hour' ? HOUR_MS : DAY_MS;
  const idx = Math.floor((t - new Date(range.bucketOrigin).getTime()) / size);
  return idx >= 0 && idx < range.bucketCount ? idx : -1;
}

export function bucketLabel(range: ResolvedOwnerRange, idx: number): string {
  const size = range.bucket === 'hour' ? HOUR_MS : DAY_MS;
  const at = new Date(new Date(range.bucketOrigin).getTime() + idx * size);
  if (range.bucket === 'hour') {
    return new Intl.DateTimeFormat('es-MX', { timeZone: OWNER_DASHBOARD_TZ, hour: '2-digit', hour12: false }).format(at);
  }
  const ymd = getYmdInTz(at);
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
}

/** Variación % entre periodos; null si no es calculable (sin base o datos faltantes). */
export function pctChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
