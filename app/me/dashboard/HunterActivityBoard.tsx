'use client';

import { useMemo, useState } from 'react';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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

export default function HunterActivityBoard({ dates }: { dates: Array<string | null | undefined> }) {
  const stats = useMemo(() => activityFromDates(dates), [dates]);
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const key of stats.counts.keys()) set.add(Number(key.slice(0, 4)));
    return [...set].sort((a, b) => b - a);
  }, [stats]);
  const [year, setYear] = useState<number | null>(null);
  const selected = year != null && years.includes(year) ? year : years[0];

  if (!stats.hasActivity || selected == null) {
    return (
      <section className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#141414]">
        <h2 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Actividad</h2>
        <p className="mt-3 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Todavía no hay fechas de actividad.</p>
      </section>
    );
  }

  const weeks = weeksOfYear(selected, stats.counts);
  const monthLabel = stats.busiestMonth
    ? new Date(`${stats.busiestMonth}-01T12:00:00`).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
    : '—';
  const dayLabel = stats.busiestDay
    ? new Date(`${stats.busiestDay}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

  return (
    <section className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#141414]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Actividad</h2>
        {years.length > 1 ? (
          <label>
            <span className="sr-only">Año</span>
            <select
              value={selected}
              onChange={(event) => setYear(Number(event.target.value))}
              className="rounded-full border border-black/10 bg-white px-3 py-1 text-[13px] dark:border-white/15 dark:bg-[#141414]"
            >
              {years.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
        ) : (
          <span className="text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">{selected}</span>
        )}
      </div>
      <div className="mt-4 overflow-x-auto">
        <div className="grid min-w-[280px] grid-flow-col grid-rows-7 gap-1" style={{ gridAutoColumns: 'minmax(8px, 1fr)' }}>
          {weeks.flatMap((week, column) =>
            week.map((day, row) => (
              <span
                key={day?.key ?? `pad-${column}-${row}`}
                title={day ? `${day.key}: ${day.count}` : undefined}
                className={`aspect-square rounded-[2px] ${day ? heatClass(day.count) : 'bg-transparent'}`}
              />
            )),
          )}
        </div>
        <p className="mt-2 text-[11px] text-[#6e6e73] dark:text-[#a3a3a3]">{MONTHS.join(' ')}</p>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1 text-[11px] text-[#6e6e73] dark:text-[#a3a3a3]">
        <span>Menos</span>
        <span className="h-2.5 w-2.5 rounded-[2px] bg-black/5 dark:bg-white/10" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-violet-300 dark:bg-violet-800" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-violet-500" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-violet-700" />
        <span>Más</span>
      </div>
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
    </section>
  );
}

function weeksOfYear(year: number, counts: Map<string, number>) {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const cells: Array<{ key: string; count: number } | null> = Array.from({ length: start.getDay() }, () => null);
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const key = dayKey(cursor);
    cells.push({ key, count: counts.get(key) ?? 0 });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<{ key: string; count: number } | null>> = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}
