/**
 * Lectura de ritmo hacia 10,000 ventas confirmadas.
 * null significa que el dato no existe. No es cero.
 */

import { SALES_TARGET, SALES_WINDOW_DAYS, SALES_WINDOW_START_MS } from './campaignContext';

export type PaceStatus = 'AHEAD' | 'ON_TRACK' | 'BEHIND' | 'DATA_INSUFFICIENT';

export type MeasuredCount = number | null;

export type GrowthWindow = {
  confirmedSales: MeasuredCount;
  outboundClicks: MeasuredCount;
  confirmedCommissionCents: MeasuredCount;
  commissionKind: 'CONFIRMED' | 'ESTIMATED' | 'DATA_INCOMPLETE';
};

export function conversionRate(sales: MeasuredCount, clicks: MeasuredCount): number | null {
  if (sales == null || clicks == null || clicks <= 0) return null;
  return sales / clicks;
}

export function revenuePerClick(commissionCents: MeasuredCount, clicks: MeasuredCount): number | null {
  if (commissionCents == null || clicks == null || clicks <= 0) return null;
  return commissionCents / clicks;
}

export function remainingDays(nowMs: number, startMs = SALES_WINDOW_START_MS, days = SALES_WINDOW_DAYS): number | null {
  if (nowMs < startMs) return days;
  const elapsed = Math.floor((nowMs - startMs) / 86_400_000);
  const left = days - elapsed;
  return left > 0 ? left : 0;
}

export function requiredDailyRunRate(confirmedSales: MeasuredCount, nowMs: number): number | null {
  if (confirmedSales == null) return null;
  const left = remainingDays(nowMs);
  if (left == null || left <= 0) return null;
  const remaining = Math.max(0, SALES_TARGET - confirmedSales);
  return remaining / left;
}

export function paceStatus(input: {
  confirmedSales: MeasuredCount;
  currentDaily: MeasuredCount;
  nowMs: number;
}): PaceStatus {
  if (input.confirmedSales == null || input.currentDaily == null) return 'DATA_INSUFFICIENT';
  const required = requiredDailyRunRate(input.confirmedSales, input.nowMs);
  if (required == null) return 'DATA_INSUFFICIENT';
  if (input.currentDaily >= required * 1.05) return 'AHEAD';
  if (input.currentDaily >= required * 0.9) return 'ON_TRACK';
  return 'BEHIND';
}

export type FunnelStep = { id: string; count: MeasuredCount };

export function largestBottleneck(steps: FunnelStep[]): { from: string; to: string; rate: number } | null {
  let worst: { from: string; to: string; rate: number } | null = null;
  for (let i = 0; i < steps.length - 1; i += 1) {
    const prev = steps[i]!;
    const next = steps[i + 1]!;
    if (prev.count == null || next.count == null || prev.count <= 0) continue;
    const rate = next.count / prev.count;
    if (!worst || rate < worst.rate) worst = { from: prev.id, to: next.id, rate };
  }
  return worst;
}

export const MIN_RETAILER_CLICKS = 30;

export function rankRetailers(
  rows: Array<{ id: string; clicks: number | null; conversions: number | null }>,
): { best: string | null; worst: string | null; insufficient: string[] } {
  const insufficient: string[] = [];
  const ranked: Array<{ id: string; rate: number }> = [];
  for (const row of rows) {
    if (row.clicks == null || row.conversions == null || row.clicks < MIN_RETAILER_CLICKS) {
      insufficient.push(row.id);
      continue;
    }
    ranked.push({ id: row.id, rate: row.conversions / row.clicks });
  }
  ranked.sort((a, b) => b.rate - a.rate);
  return {
    best: ranked[0]?.id ?? null,
    worst: ranked.length > 1 ? ranked[ranked.length - 1]!.id : null,
    insufficient,
  };
}

export type TrackingHealth = 'HEALTHY' | 'WARNING' | 'CRITICAL';

export function trackingHealth(input: {
  outboundVolume: number | null;
  attributedClicks: number | null;
  completenessPct: number | null;
  conversionConnected: boolean;
}): TrackingHealth {
  if (input.outboundVolume == null || input.attributedClicks == null) return 'CRITICAL';
  if (!input.conversionConnected) return 'WARNING';
  if (input.completenessPct != null && input.completenessPct < 0.5) return 'CRITICAL';
  if (input.completenessPct != null && input.completenessPct < 0.8) return 'WARNING';
  return 'HEALTHY';
}

export type GrowthAlert = { code: string; detail: string };

export function growthAlerts(input: {
  outboundClicks: MeasuredCount;
  previousOutbound: MeasuredCount;
  confirmedSales: MeasuredCount;
  previousSales: MeasuredCount;
  conversionConnected: boolean;
}): GrowthAlert[] {
  const alerts: GrowthAlert[] = [];
  if (!input.conversionConnected) return alerts;
  if (
    input.confirmedSales != null &&
    input.previousSales != null &&
    input.previousSales >= 10 &&
    input.confirmedSales < input.previousSales * 0.7
  ) {
    alerts.push({ code: 'sales_drop', detail: 'Las ventas confirmadas cayeron más de 30% contra el período anterior.' });
  }
  if (
    input.outboundClicks != null &&
    input.previousOutbound != null &&
    input.previousOutbound > 0 &&
    input.outboundClicks > input.previousOutbound * 1.5 &&
    input.confirmedSales === 0
  ) {
    alerts.push({ code: 'clicks_without_sales', detail: 'Los clics subieron y las ventas confirmadas quedaron en cero.' });
  }
  return alerts;
}
