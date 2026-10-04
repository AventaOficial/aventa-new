import { longestConsecutiveDays } from '@/lib/achievements/calendar';
import { addCalendarDays } from './time';

/**
 * Racha de trabajo por equipo. Un día cuenta si hubo al menos un resultado de regla
 * concedido (`granted`) ese día civil en Ciudad de México. Abrir Team OS no cuenta.
 */
export type TeamStreak = {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string;
};

export type ActivityDayResult = { duplicate: boolean; streak: TeamStreak };

/** Modelo puro de `record_team_activity`: mismo resultado sin importar el orden de llegada. */
export function recordActivityDay(
  days: ReadonlySet<string>,
  previous: TeamStreak | null,
  day: string,
): { days: Set<string>; result: ActivityDayResult } {
  if (days.has(day) && previous) {
    return { days: new Set(days), result: { duplicate: true, streak: previous } };
  }
  const next = new Set(days);
  next.add(day);
  const sorted = [...next].sort();
  const last = sorted[sorted.length - 1];
  let current = 1;
  for (let index = sorted.length - 1; index > 0; index -= 1) {
    if (sorted[index - 1] !== addCalendarDays(sorted[index], -1)) break;
    current += 1;
  }
  const longest = Math.max(previous?.longestStreak ?? 0, longestConsecutiveDays(sorted));
  return {
    days: next,
    result: { duplicate: false, streak: { currentStreak: current, longestStreak: longest, lastActivityDate: last } },
  };
}

/** Lo guardado es la racha que terminó en el último día activo; si ya pasó ayer, hoy vale 0. */
export function visibleStreak(streak: TeamStreak | null, today: string): number {
  if (!streak) return 0;
  if (streak.lastActivityDate === today) return streak.currentStreak;
  if (streak.lastActivityDate === addCalendarDays(today, -1)) return streak.currentStreak;
  return 0;
}
