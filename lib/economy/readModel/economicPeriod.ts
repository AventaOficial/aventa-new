import { getYmdInTz, monthYmdRange, OWNER_DASHBOARD_TZ } from '@/lib/owner/mxTime';

/** Periodo económico. Una sola zona. El cliente no elige el mes. */
export const ECONOMIC_PERIOD_TZ = OWNER_DASHBOARD_TZ;

export function periodKeyFromInstant(iso: string): string {
  return getYmdInTz(new Date(iso), ECONOMIC_PERIOD_TZ).slice(0, 7);
}

export function currentEconomicPeriod(now = new Date()): string {
  return monthYmdRange(now, ECONOMIC_PERIOD_TZ).ymdStart.slice(0, 7);
}

const MONTH_LABELS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export function parseEconomicPeriod(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null;
}

export function formatEconomicPeriodLabel(period: string): string {
  const parsed = parseEconomicPeriod(period);
  if (!parsed) return period;
  const month = Number(parsed.slice(5, 7));
  return `${MONTH_LABELS[month - 1]} ${parsed.slice(0, 4)}`;
}

/** Lista hacia atrás desde el mes económico actual. No usa el mes local del navegador. */
export function listRecentEconomicPeriods(count = 12, now = new Date()): string[] {
  const current = currentEconomicPeriod(now);
  const year = Number(current.slice(0, 4));
  const month = Number(current.slice(5, 7));
  const periods: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(Date.UTC(year, month - 1 - i, 15, 18, 0, 0));
    periods.push(currentEconomicPeriod(date));
  }
  return periods;
}

/**
 * period_start manda cuando existe.
 * Si falta, el mes de created_at en America/Mexico_City.
 * Si ambos caen en meses distintos, no se elige en silencio: es anomalía.
 * La fila queda fuera de los totales reconocidos.
 */
export function resolveEconomicPeriod(input: {
  periodStart: string | null | undefined;
  createdAt: string;
}): { period: string | null; anomaly: 'period_mismatch' | null } {
  const createdPeriod = periodKeyFromInstant(input.createdAt);
  const start = (input.periodStart ?? '').trim();
  if (!start) return { period: createdPeriod, anomaly: null };
  const startPeriod = start.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(startPeriod)) {
    return { period: createdPeriod, anomaly: null };
  }
  if (startPeriod !== createdPeriod) {
    return { period: null, anomaly: 'period_mismatch' };
  }
  return { period: startPeriod, anomaly: null };
}
