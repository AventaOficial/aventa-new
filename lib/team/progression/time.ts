import { addCalendarDays, mexicoDayAndHour } from '@/lib/achievements/calendar';

export const TEAM_PROGRESS_TIME_ZONE = 'America/Mexico_City';

/** Debe coincidir con `record_team_activity`: 49 h hacia atrás, 5 min hacia adelante. */
export const TEAM_EVENT_MAX_AGE_MS = 49 * 60 * 60 * 1000;
export const TEAM_EVENT_MAX_SKEW_MS = 5 * 60 * 1000;

/** Día civil en Ciudad de México. */
export function teamDay(iso: string): string | null {
  return mexicoDayAndHour(iso)?.day ?? null;
}

export function isFreshTeamEvent(occurredAt: string, now: Date): boolean {
  const at = Date.parse(occurredAt);
  if (Number.isNaN(at)) return false;
  const delta = now.getTime() - at;
  return delta <= TEAM_EVENT_MAX_AGE_MS && delta >= -TEAM_EVENT_MAX_SKEW_MS;
}

/** Lunes ISO de la semana del día. */
export function weekStartDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  const isoDow = weekday === 0 ? 7 : weekday;
  return addCalendarDays(day, 1 - isoDow);
}

export { addCalendarDays };
