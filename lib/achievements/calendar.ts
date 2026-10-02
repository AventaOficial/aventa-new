/** Calendario de contribución y ventanas especiales. México, no el login. */

export const ACHIEVEMENT_TIME_ZONE = 'America/Mexico_City';

/** Madrugador: 05:00 inclusive a 08:00 exclusive. */
export const DAWN_HOUR_START = 5;
export const DAWN_HOUR_END = 8;

/** Cazador nocturno: 00:00 inclusive a 05:00 exclusive. */
export const NIGHT_HOUR_START = 0;
export const NIGHT_HOUR_END = 5;

/** Flash Hunter: vigencia real de la oferta, como máximo 6 horas. */
export const FLASH_WINDOW_MS = 6 * 60 * 60 * 1000;

export function mexicoDayAndHour(iso: string): { day: string; hour: number } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ACHIEVEMENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  let hour = Number(get('hour'));
  if (!Number.isFinite(hour)) return null;
  if (hour === 24) hour = 0;
  return { day, hour };
}

export function addCalendarDays(day: string, amount: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date));
  utc.setUTCDate(utc.getUTCDate() + amount);
  return utc.toISOString().slice(0, 10);
}

export function longestConsecutiveDays(days: readonly string[]): number {
  const sorted = [...new Set(days)].sort();
  if (sorted.length === 0) return 0;
  let best = 1;
  let run = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] === addCalendarDays(sorted[index - 1], 1)) run += 1;
    else run = 1;
    if (run > best) best = run;
  }
  return best;
}

export function isDawnHour(hour: number): boolean {
  return hour >= DAWN_HOUR_START && hour < DAWN_HOUR_END;
}

export function isNightHour(hour: number): boolean {
  return hour >= NIGHT_HOUR_START && hour < NIGHT_HOUR_END;
}

export function flashAvailability(createdAt: string, expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const start = new Date(createdAt).getTime();
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  const span = end - start;
  return span > 0 && span <= FLASH_WINDOW_MS;
}

function thanksgivingDay(year: number): string {
  let thursdays = 0;
  for (let day = 1; day <= 30; day += 1) {
    if (new Date(Date.UTC(year, 10, day)).getUTCDay() === 4) {
      thursdays += 1;
      if (thursdays === 4) return `${year}-11-${String(day).padStart(2, '0')}`;
    }
  }
  return `${year}-11-22`;
}

/** Viernes de Black Friday hasta el lunes siguiente (Cyber Monday), en fecha civil. */
export function isBlackFridayWindow(day: string): boolean {
  const year = Number(day.slice(0, 4));
  if (!Number.isFinite(year)) return false;
  const friday = addCalendarDays(thanksgivingDay(year), 1);
  const monday = addCalendarDays(friday, 3);
  return day >= friday && day <= monday;
}

/**
 * Temporadas reales de compra en México.
 * Buen Fin (13–17 nov), Hot Sale (23–31 may) y Navidad de regalos (12–24 dic).
 */
export function isSeasonWindow(day: string): boolean {
  const monthDay = day.slice(5);
  return (
    (monthDay >= '11-13' && monthDay <= '11-17')
    || (monthDay >= '05-23' && monthDay <= '05-31')
    || (monthDay >= '12-12' && monthDay <= '12-24')
  );
}

export function seasonalWindowOpen(now = new Date()): boolean {
  const parts = mexicoDayAndHour(now.toISOString());
  if (!parts) return false;
  return isBlackFridayWindow(parts.day) || isSeasonWindow(parts.day);
}

export function blackFridayWindowOpen(now = new Date()): boolean {
  const parts = mexicoDayAndHour(now.toISOString());
  return parts ? isBlackFridayWindow(parts.day) : false;
}

export function seasonWindowOpen(now = new Date()): boolean {
  const parts = mexicoDayAndHour(now.toISOString());
  return parts ? isSeasonWindow(parts.day) : false;
}
