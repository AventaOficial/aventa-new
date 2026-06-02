/** Ventanas de tiempo en zona México (alineado con product-metrics). */

export const OWNER_DASHBOARD_TZ = 'America/Mexico_City';

export function getYmdInTz(date: Date, timeZone = OWNER_DASHBOARD_TZ): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

/** 00:00 MX del día YMD → ISO UTC (misma convención que product-metrics: +6h UTC). */
export function startOfYmdUtc(ymd: string): string {
  return new Date(`${ymd}T06:00:00.000Z`).toISOString();
}

export function startOfDayUtc(ref: Date = new Date(), timeZone = OWNER_DASHBOARD_TZ): string {
  return startOfYmdUtc(getYmdInTz(ref, timeZone));
}

export function startOfYesterdayUtc(ref: Date = new Date(), timeZone = OWNER_DASHBOARD_TZ): string {
  const ymd = getYmdInTz(ref, timeZone);
  const [y, m, d] = ymd.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  return startOfYmdUtc(getYmdInTz(prev, timeZone));
}

export function daysAgoUtc(days: number, ref: Date = new Date()): string {
  return new Date(ref.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export type DayWindow = { start: string; end: string; label: string };

/** Hoy desde 00:00 MX hasta ahora. */
export function windowToday(ref = new Date()): DayWindow {
  return {
    label: 'today',
    start: startOfDayUtc(ref),
    end: ref.toISOString(),
  };
}

/** Ayer 00:00–24:00 MX. */
export function windowYesterday(ref = new Date()): DayWindow {
  const todayStart = startOfDayUtc(ref);
  return {
    label: 'yesterday',
    start: startOfYesterdayUtc(ref),
    end: todayStart,
  };
}

export function windowLastDays(days: number, ref = new Date()): DayWindow {
  return {
    label: `last_${days}d`,
    start: daysAgoUtc(days, ref),
    end: ref.toISOString(),
  };
}

export function monthYmdRange(ref = new Date(), timeZone = OWNER_DASHBOARD_TZ): {
  ymdStart: string;
  ymdEnd: string;
  startIso: string;
  endIso: string;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(ref);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const ymdStart = `${y}-${m}-01`;
  const year = Number(y);
  const month = Number(m);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const ymdEnd = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${y}-${String(month + 1).padStart(2, '0')}-01`;
  return {
    ymdStart,
    ymdEnd,
    startIso: startOfYmdUtc(ymdStart),
    endIso: startOfYmdUtc(nextMonth),
  };
}
