/** Fecha calendario (YYYY-MM-DD) en una zona IANA. */
export function formatYmdInTz(date: Date, timeZone: string): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = p.find((x) => x.type === 'year')?.value;
  const mo = p.find((x) => x.type === 'month')?.value;
  const da = p.find((x) => x.type === 'day')?.value;
  return `${y}-${mo}-${da}`;
}

export function getZonedHourMinute(date: Date, timeZone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = Number.parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = Number.parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  return { hour, minute };
}

/**
 * Primer instante UTC en el que el calendario local (`timeZone`) es `ymd`.
 * lower_bound binario; funciona con zonas con o sin DST.
 */
export function startOfZonedDayUtc(ymd: string, timeZone: string): Date {
  const [y, m, d] = ymd.split('-').map((x) => Number.parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return new Date();
  }
  let lo = Date.UTC(y, m - 1, d - 2, 0, 0, 0);
  let hi = Date.UTC(y, m - 1, d + 2, 0, 0, 0);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const my = formatYmdInTz(new Date(mid), timeZone);
    if (my < ymd) lo = mid + 1;
    else hi = mid;
  }
  return new Date(lo);
}

/** Onda de rotación 0..2 estable por día + ventana de 15 min (para alternar fuentes). */
export function computeSourceRotationWave(date: Date, timeZone: string): number {
  const ymd = formatYmdInTz(date, timeZone);
  const { hour, minute } = getZonedHourMinute(date, timeZone);
  const slot = Math.floor((hour * 60 + minute) / 15);
  let h = 0;
  for (let i = 0; i < ymd.length; i++) {
    h = (h * 31 + ymd.charCodeAt(i)) >>> 0;
  }
  return (h + slot) % 3;
}
