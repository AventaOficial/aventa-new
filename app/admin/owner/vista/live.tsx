'use client';

import { useMemo } from 'react';
import type { OwnerRangeKey } from '@/lib/owner/ownerRange';
import type { RangeMetric } from '@/lib/owner/buildOwnerCommand';
import type { EconomyPeriodSnapshot } from '@/lib/owner/estimatedEconomy';
import { getYmdInTz } from '@/lib/owner/mxTime';
import { deriveGoals, derivePriorities } from '../command/derive';
import { formatCount, formatMoneyCents } from '../command/ceo/model';
import { useCommandCenter } from '../command/useCommandCenter';

export function useVista() {
  const cc = useCommandCenter();
  const now = Date.now();
  const todayYmd = getYmdInTz(new Date(now));
  const base = cc.data.base.data;
  const cmd = cc.data.command.data;
  const gerencia = cc.data.gerencia.data;
  const priorities = useMemo(() => derivePriorities(base, cmd, todayYmd, now), [base, cmd, todayYmd, now]);
  const goals = useMemo(() => deriveGoals(base, cmd, gerencia), [base, cmd, gerencia]);
  return { ...cc, base, cmd, gerencia, priorities, goals, todayYmd };
}

export function money(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return formatMoneyCents(cents);
}

export function num(value: number | null | undefined): string {
  return formatCount(value);
}

export function deltaOf(metric: RangeMetric | null | undefined): { text: string; up: boolean } | null {
  if (!metric || metric.value == null || metric.previous == null || metric.previous === 0) return null;
  const pct = Math.round(((metric.value - metric.previous) / metric.previous) * 1000) / 10;
  return { text: `${Math.abs(pct)}%`, up: pct >= 0 };
}

export function economyFor(range: OwnerRangeKey, day: EconomyPeriodSnapshot, week: EconomyPeriodSnapshot, month: EconomyPeriodSnapshot): EconomyPeriodSnapshot | null {
  if (range === 'today') return day;
  if (range === '7d') return week;
  if (range === 'month') return month;
  return null;
}

export function seriesValues(points: { label: string; value: number }[]): { values: number[]; labels: string[] } {
  if (points.length === 0) return { values: [], labels: [] };
  const head = points[0]?.label ?? '';
  const tail = points[points.length - 1]?.label ?? '';
  const mid = points[Math.floor(points.length / 2)]?.label ?? '';
  return { values: points.map((p) => p.value), labels: [head, mid, tail].filter((l, i, arr) => l && arr.indexOf(l) === i) };
}
