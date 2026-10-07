'use client';

import { useMemo, useState } from 'react';
import { Crown, Flame, Zap } from 'lucide-react';

const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return dayKey(date);
}

export function activityFromDates(dates: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  for (const value of dates) {
    const key = parseDay(value);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const days = [...counts.keys()].sort();
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const key of days) {
    if (previous && nextDay(previous) === key) run += 1;
    else run = 1;
    longest = Math.max(longest, run);
    previous = key;
  }
  const today = dayKey(new Date());
  const yesterday = nextDay(today, -1);
  const anchor = counts.has(today) ? today : counts.has(yesterday) ? yesterday : null;
  let current = 0;
  if (anchor) {
    let cursor: string | null = anchor;
    while (cursor && counts.has(cursor)) {
      current += 1;
      cursor = nextDay(cursor, -1);
    }
  }
  let busiestDay: string | null = null;
  let busiestCount = 0;
  const byMonth = new Map<string, number>();
  for (const [key, count] of counts) {
    if (count > busiestCount) {
      busiestCount = count;
      busiestDay = key;
    }
    const month = key.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + count);
  }
  let busiestMonth: string | null = null;
  let monthCount = 0;
  for (const [month, count] of byMonth) {
    if (count > monthCount) {
      monthCount = count;
      busiestMonth = month;
    }
  }
  return { counts, longest, current, busiestDay, busiestMonth, hasActivity: counts.size > 0 };
}

function nextDay(key: string, delta = 1): string {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + delta);
  return dayKey(date);
}

function heatClass(count: number): string {
  if (count <= 0) return 'bg-black/5 dark:bg-white/10';
  if (count === 1) return 'bg-violet-300 dark:bg-violet-800';
  if (count === 2) return 'bg-violet-500';
  return 'bg-violet-700';
}

function activityLabel(count: number): string {
  if (count === 1) return '1 actividad';
  return `${count} actividades`;
}

function friendlyDay(key: string): string {
  return new Date(`${key}T12:00:00`).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function HunterActivityBoard({
  dates,
  variant = 'full',
  onOpen,
  tone = 'day',
}: {
  dates: Array<string | null | undefined>;
  variant?: 'full' | 'summary';
  onOpen?: () => void;
  tone?: 'day' | 'night';
}) {
  const stats = useMemo(() => activityFromDates(dates), [dates]);
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const key of stats.counts.keys()) set.add(Number(key.slice(0, 4)));
    return [...set].sort((a, b) => b - a);
  }, [stats]);
  const [year, setYear] = useState<number | null>(null);
  const [tip, setTip] = useState<{ key: string; count: number } | null>(null);
  const selected = year != null && years.includes(year) ? year : years[0];
  const night = tone === 'night';
  const card = 'min-w-0 overflow-hidden rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)] p-5 text-[var(--me-ink)] shadow-sm dark:shadow-none';

  if (!stats.hasActivity || selected == null) {
    if (variant === 'summary') {
      return (
        <section className="min-w-0 rounded-2xl border border-black/[0.04] bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#141414]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Actividad</h2>
            {onOpen ? (
              <button type="button" onClick={onOpen} className="inline-flex min-h-11 items-center text-[13px] font-medium text-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-violet-400">
                Ver todo
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Todavía no hay fechas de actividad.</p>
        </section>
      );
    }
    return (
      <section className={card}>
        <h2 className={`text-[15px] font-semibold ${night ? 'text-[var(--me-ink)]' : 'text-[#1d1d1f] dark:text-[#fafafa]'}`}>{night ? 'Tu actividad' : 'Actividad'}</h2>
        {night ? <p className="mt-1 text-[13px] text-[var(--me-muted)]">Mantén tu racha y sigue cazando ofertas.</p> : null}
        <p className={`mt-3 text-[13px] ${night ? 'text-[var(--me-muted)]' : 'text-[#6e6e73] dark:text-[#a3a3a3]'}`}>Todavía no hay fechas de actividad.</p>
      </section>
    );
  }

  const weeks = weeksOfYear(selected, stats.counts);
  let yearBestCount = 0;
  let yearBestDay: string | null = null;
  const yearMonths = new Map<string, number>();
  for (const week of weeks) {
    for (const day of week) {
      if (!day || day.count <= 0) continue;
      if (day.count > yearBestCount) {
        yearBestCount = day.count;
        yearBestDay = day.key;
      }
      const month = day.key.slice(0, 7);
      yearMonths.set(month, (yearMonths.get(month) ?? 0) + day.count);
    }
  }
  let yearBestMonth: string | null = null;
  let yearMonthCount = 0;
  for (const [month, count] of yearMonths) {
    if (count > yearMonthCount) {
      yearMonthCount = count;
      yearBestMonth = month;
    }
  }
  const monthLabel = yearBestMonth
    ? new Date(`${yearBestMonth}-01T12:00:00`).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
    : '—';
  const dayLabel = yearBestDay
    ? new Date(`${yearBestDay}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

  if (variant === 'summary') {
    const shown = weeks.slice(-18);
    const summaryMonth = stats.busiestMonth
      ? new Date(`${stats.busiestMonth}-01T12:00:00`).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
      : monthLabel;
    const summaryDay = stats.busiestDay
      ? new Date(`${stats.busiestDay}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
      : dayLabel;
    return (
      <section className="min-w-0 rounded-2xl border border-black/[0.04] bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#141414]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Actividad</h2>
          {onOpen ? (
            <button type="button" onClick={onOpen} className="inline-flex min-h-11 items-center text-[13px] font-medium text-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-violet-400">
              Ver todo
            </button>
          ) : null}
        </div>
        <div
          className="mt-3 grid grid-flow-col gap-0.5"
          style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))`, gridTemplateRows: 'repeat(7, minmax(0, 1fr))' }}
        >
          {shown.flatMap((week, column) =>
            week.map((day, row) =>
              day ? (
                <span key={day.key} className={`aspect-square rounded-[2px] ${heatClass(day.count)}`} />
              ) : (
                <span key={`pad-${column}-${row}`} className="aspect-square" />
              ),
            ),
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
          <p>
            <span className="block font-medium capitalize leading-tight text-[#1d1d1f] dark:text-[#fafafa]">{summaryMonth}</span>
            <span className="text-[#6e6e73] dark:text-[#a3a3a3]">Mes más activo</span>
          </p>
          <p>
            <span className="block font-medium leading-tight text-[#1d1d1f] dark:text-[#fafafa]">{summaryDay}</span>
            <span className="text-[#6e6e73] dark:text-[#a3a3a3]">Día de mayor actividad</span>
          </p>
          <p>
            <span className="block font-medium text-[#1d1d1f] dark:text-[#fafafa]">{stats.longest} días</span>
            <span className="text-[#6e6e73] dark:text-[#a3a3a3]">Racha más larga</span>
          </p>
          <p>
            <span className="block font-medium text-[#1d1d1f] dark:text-[#fafafa]">{stats.current} días</span>
            <span className="text-[#6e6e73] dark:text-[#a3a3a3]">Racha actual</span>
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={card}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className={`text-[15px] font-semibold ${night ? 'text-[var(--me-ink)]' : 'text-[#1d1d1f] dark:text-[#fafafa]'}`}>
            {night ? 'Tu actividad' : 'Actividad'}
          </h2>
          {night ? <p className="mt-1 text-[13px] text-[var(--me-muted)]">Mantén tu racha y sigue cazando ofertas.</p> : null}
        </div>
        <label>
          <span className="sr-only">Año</span>
          <select
            value={selected}
            onChange={(event) => setYear(Number(event.target.value))}
            className={night
              ? 'rounded-full border border-[var(--me-line)] bg-[var(--me-soft)] px-3 py-1 text-[13px] text-[var(--me-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400'
              : 'rounded-full border border-black/10 bg-white px-3 py-1 text-[13px] text-[#1d1d1f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:border-white/15 dark:bg-[#141414] dark:text-[#fafafa]'}
          >
            {years.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-4 max-w-full overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div style={{ width: `max(100%, ${weeks.length * 14}px)` }}>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
            {weeks.map((week, column) => {
              const month = week.find((day) => day)?.month;
              const previous = column > 0 ? weeks[column - 1].find((day) => day)?.month : undefined;
              const show = month != null && month !== previous;
              return (
                <span key={column} className={`truncate text-[9px] leading-none tracking-wide ${night ? 'text-[var(--me-faint)]' : 'text-[#6e6e73] dark:text-[#a3a3a3]'}`}>
                  {show && month != null ? MONTHS[month] : ''}
                </span>
              );
            })}
          </div>
          <div
            className="mt-1.5 grid grid-flow-col gap-1"
            style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`, gridTemplateRows: 'repeat(7, minmax(0, 1fr))' }}
          >
            {weeks.flatMap((week, column) =>
              week.map((day, row) =>
                day ? (
                  <ActivityCell
                    key={day.key}
                    dayKeyValue={day.key}
                    count={day.count}
                    onShow={() => setTip({ key: day.key, count: day.count })}
                    onHide={() => setTip((current) => (current?.key === day.key ? null : current))}
                  />
                ) : (
                  <span key={`pad-${column}-${row}`} className="aspect-square" />
                ),
              ),
            )}
          </div>
        </div>
      </div>
      <p className={`mt-3 min-h-8 text-[12px] ${night ? 'text-[var(--me-muted)]' : 'text-[#6e6e73] dark:text-[#a3a3a3]'}`} aria-live="polite">
        {tip ? (
          <>
            <span className={`block font-medium ${night ? 'text-[var(--me-ink)]' : 'text-[#1d1d1f] dark:text-[#fafafa]'}`}>{friendlyDay(tip.key)}</span>
            <span>{activityLabel(tip.count)}</span>
          </>
        ) : null}
      </p>
      <div className={`mt-2 flex items-center justify-end gap-1 text-[11px] ${night ? 'text-[var(--me-muted)]' : 'text-[#6e6e73] dark:text-[#a3a3a3]'}`}>
        <span>Menos</span>
        <span className="h-2.5 w-2.5 rounded-[2px] bg-black/5 dark:bg-white/10" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-violet-300 dark:bg-violet-800" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-violet-500" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-violet-700" />
        <span>Más</span>
      </div>
      {night ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <p className="rounded-xl bg-[var(--me-soft)] px-3 py-2">
            <span className="flex items-center gap-1 text-[13px] font-semibold text-[var(--me-ink)]">
              <Flame className="h-3.5 w-3.5 text-orange-500 dark:text-orange-300" aria-hidden />
              {stats.current} días
            </span>
            <span className="mt-0.5 block text-[11px] text-[var(--me-muted)]">Racha actual</span>
          </p>
          <p className="rounded-xl bg-[var(--me-soft)] px-3 py-2">
            <span className="flex min-w-0 items-start gap-1 text-[13px] font-semibold text-[var(--me-ink)]">
              <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-300" aria-hidden />
              <span className="min-w-0 break-words">{dayLabel}</span>
            </span>
            <span className="mt-0.5 block text-[11px] text-[var(--me-muted)]">Día más activo</span>
          </p>
          <p className="rounded-xl bg-[var(--me-soft)] px-3 py-2">
            <span className="flex items-center gap-1 text-[13px] font-semibold text-[var(--me-ink)]">
              <Crown className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" aria-hidden />
              {stats.longest} días
            </span>
            <span className="mt-0.5 block text-[11px] text-[var(--me-muted)]">Racha más larga</span>
          </p>
        </div>
      ) : (
      <div className="mt-4 grid grid-cols-2 gap-3 text-[12px]">
        <p>
          <span className="block font-medium capitalize text-[#1d1d1f] dark:text-[#fafafa]">{monthLabel}</span>
          <span className="text-[#6e6e73] dark:text-[#a3a3a3]">Mes más activo</span>
        </p>
        <p>
          <span className="block font-medium text-[#1d1d1f] dark:text-[#fafafa]">{dayLabel}</span>
          <span className="text-[#6e6e73] dark:text-[#a3a3a3]">Día de mayor actividad</span>
        </p>
        <p>
          <span className="block font-medium text-[#1d1d1f] dark:text-[#fafafa]">{stats.longest} días</span>
          <span className="text-[#6e6e73] dark:text-[#a3a3a3]">Racha más larga</span>
        </p>
        <p>
          <span className="block font-medium text-[#1d1d1f] dark:text-[#fafafa]">{stats.current} días</span>
          <span className="text-[#6e6e73] dark:text-[#a3a3a3]">Racha actual</span>
        </p>
      </div>
      )}
    </section>
  );
}

function ActivityCell({
  dayKeyValue,
  count,
  onShow,
  onHide,
}: {
  dayKeyValue: string;
  count: number;
  onShow: () => void;
  onHide: () => void;
}) {
  const label = `${friendlyDay(dayKeyValue)}, ${activityLabel(count)}`;
  return (
    <button
      type="button"
      aria-label={label}
      onMouseEnter={onShow}
      onMouseLeave={onHide}
      onFocus={onShow}
      onBlur={onHide}
      className={`aspect-square rounded-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${heatClass(count)}`}
    />
  );
}

function weeksOfYear(year: number, counts: Map<string, number>) {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const cells: Array<{ key: string; count: number; month: number } | null> = Array.from({ length: start.getDay() }, () => null);
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const key = dayKey(cursor);
    cells.push({ key, count: counts.get(key) ?? 0, month: cursor.getMonth() });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<{ key: string; count: number; month: number } | null>> = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}
