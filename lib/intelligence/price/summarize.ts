/**
 * Price knowledge derived from raw observations.
 * Raw rows stay in product_price_snapshots / offer_price_snapshots.
 * Nothing here publishes an offer or writes money.
 */

import { classifyPricePoint } from '@/lib/intelligence/quality/pricePoint';
import { PRICE_POINT_READ_MAX_ROWS } from '@/lib/intelligence/scale';
import { recordPriceSummary } from '@/lib/intelligence/telemetry';

export type PricePoint = {
  observedAt: string;
  /** Canonical sale/last price in minor-agnostic major units (MXN pesos). */
  price: number;
  listPrice: number | null;
  currency: string;
  source: string;
};

export type PriceTrend = 'insufficient' | 'down' | 'flat' | 'up';
export type PriceAnomaly = 'insufficient' | 'none' | 'low' | 'high';

export type PriceKnowledge = {
  currency: string | null;
  current: number | null;
  min: number | null;
  max: number | null;
  median: number | null;
  trend: PriceTrend;
  /** Coefficient of variation. High means the series is noisy, not that it is a deal. */
  volatility: number | null;
  /** Consecutive UTC days the latest price has held, within 1%. */
  priceDurationDays: number;
  /** Material transitions (>1%) inside the window. Frequency, not a deal score. */
  priceChanges: number;
  /** Share of points that were discounts. Method says whether list price existed. */
  discountFrequency: number | null;
  discountFrequencyMethod: 'list_vs_sale' | 'below_median' | 'unavailable';
  /** How far the current price sits under the reference, when it is actually lower. */
  discountDepth: number | null;
  anomaly: PriceAnomaly;
  /** 0–1. Sample size, source diversity, and age. Not a probability of being a good deal. */
  confidence: number;
  freshnessHours: number | null;
  evidence: {
    samples: number;
    sources: string[];
    latestObservedAt: string | null;
    truncated: boolean;
  };
  notes: string[];
};

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const a = sorted[mid - 1];
  const b = sorted[mid];
  if (a == null || b == null) return null;
  return (a + b) / 2;
}

function sampleStddev(values: number[], mean: number): number | null {
  if (values.length < 2) return null;
  const sum = values.reduce((acc, value) => acc + (value - mean) ** 2, 0);
  return Math.sqrt(sum / (values.length - 1));
}

function utcDay(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

export function summarizePricePoints(input: {
  points: PricePoint[];
  now?: Date;
  maxPoints?: number;
}): PriceKnowledge {
  const now = input.now ?? new Date();
  const maxPoints = Math.min(input.maxPoints ?? PRICE_POINT_READ_MAX_ROWS, PRICE_POINT_READ_MAX_ROWS);
  const notes: string[] = [];
  const sliced = input.points.slice(0, maxPoints);
  const truncated = input.points.length > sliced.length;

  const usable: PricePoint[] = [];
  let blocking = 0;
  let warnings = 0;
  for (const point of sliced) {
    const finding = classifyPricePoint(point, now);
    if (finding === 'blocking') {
      blocking += 1;
      continue;
    }
    if (finding === 'warning') {
      warnings += 1;
      continue;
    }
    usable.push(point);
  }
  if (blocking > 0) notes.push(`blocking_points_excluded:${blocking}`);
  if (warnings > 0) notes.push(`warning_points_excluded:${warnings}`);

  const currencies = [...new Set(usable.map((point) => point.currency.trim().toUpperCase()))];
  if (currencies.length > 1) {
    recordPriceSummary();
    return emptyKnowledge(null, usable.length, truncated, [
      'currency_mixed: refusing to mix currencies in one series',
    ]);
  }

  const currency = currencies[0] ?? null;
  const ordered = [...usable].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  const prices = ordered.map((point) => point.price);
  const priceSorted = [...prices].sort((a, b) => a - b);
  const med = median(priceSorted);
  const current = ordered.length ? ordered[ordered.length - 1]?.price ?? null : null;
  const latestAt = ordered.length ? ordered[ordered.length - 1]?.observedAt ?? null : null;
  const sources = [...new Set(ordered.map((point) => point.source).filter(Boolean))];

  let trend: PriceTrend = 'insufficient';
  if (ordered.length >= 4 && med != null && med > 0) {
    const mid = Math.floor(ordered.length / 2);
    const first = median([...ordered.slice(0, mid).map((point) => point.price)].sort((a, b) => a - b));
    const second = median([...ordered.slice(mid).map((point) => point.price)].sort((a, b) => a - b));
    if (first != null && second != null && first > 0) {
      const rel = (second - first) / first;
      if (Math.abs(rel) < 0.03) trend = 'flat';
      else trend = rel < 0 ? 'down' : 'up';
    }
  }

  const mean = prices.length ? prices.reduce((acc, value) => acc + value, 0) / prices.length : null;
  const std = mean != null ? sampleStddev(prices, mean) : null;
  const volatility = mean != null && mean > 0 && std != null ? round4(std / mean) : null;

  let priceChanges = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1]?.price;
    const next = ordered[i]?.price;
    if (prev == null || next == null || prev <= 0) continue;
    if (Math.abs(next - prev) / prev > 0.01) priceChanges += 1;
  }

  let priceDurationDays = 0;
  if (current != null) {
    const days: string[] = [];
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      const point = ordered[i];
      if (!point) break;
      if (Math.abs(point.price - current) / Math.max(current, 0.01) > 0.01) break;
      const day = utcDay(point.observedAt);
      if (day && !days.includes(day)) days.push(day);
    }
    priceDurationDays = days.length;
  }

  const listed = ordered.filter((point) => point.listPrice != null && point.listPrice > point.price * 1.02);
  let discountFrequency: number | null = null;
  let discountFrequencyMethod: PriceKnowledge['discountFrequencyMethod'] = 'unavailable';
  if (ordered.length > 0 && listed.length > 0) {
    discountFrequency = round4(listed.length / ordered.length);
    discountFrequencyMethod = 'list_vs_sale';
  } else if (ordered.length > 0 && med != null) {
    const below = ordered.filter((point) => point.price < med * 0.97).length;
    discountFrequency = round4(below / ordered.length);
    discountFrequencyMethod = 'below_median';
    notes.push('no trustworthy list price; discount frequency uses below-median prices');
  }

  let discountDepth: number | null = null;
  if (current != null && med != null && med > 0 && current < med) {
    discountDepth = round4((med - current) / med);
  }

  let anomaly: PriceAnomaly = 'insufficient';
  if (ordered.length >= 8 && med != null && std != null && std > 0 && current != null) {
    const z = (current - med) / std;
    if (z <= -2) anomaly = 'low';
    else if (z >= 2) anomaly = 'high';
    else anomaly = 'none';
  }

  const freshnessHours =
    latestAt != null ? round4((now.getTime() - Date.parse(latestAt)) / (60 * 60 * 1000)) : null;

  let confidence = 0;
  if (ordered.length >= 2) confidence = 0.25;
  if (ordered.length >= 7) confidence = 0.5;
  if (ordered.length >= 14) confidence = 0.7;
  if (ordered.length >= 30) confidence = 0.85;
  if (sources.length >= 2) confidence += 0.1;
  if (freshnessHours != null && freshnessHours > 24 * 30) confidence *= 0.4;
  else if (freshnessHours != null && freshnessHours > 24 * 7) confidence *= 0.6;
  confidence = round4(Math.max(0, Math.min(1, confidence)));

  if (truncated) notes.push(`truncated_to_${maxPoints}_points`);

  recordPriceSummary();
  return {
    currency,
    current,
    min: priceSorted.length ? priceSorted[0] ?? null : null,
    max: priceSorted.length ? priceSorted[priceSorted.length - 1] ?? null : null,
    median: med,
    trend,
    volatility,
    priceDurationDays,
    priceChanges,
    discountFrequency,
    discountFrequencyMethod,
    discountDepth,
    anomaly,
    confidence,
    freshnessHours,
    evidence: {
      samples: ordered.length,
      sources,
      latestObservedAt: latestAt,
      truncated,
    },
    notes,
  };
}

function emptyKnowledge(
  currency: string | null,
  samples: number,
  truncated: boolean,
  notes: string[],
): PriceKnowledge {
  return {
    currency,
    current: null,
    min: null,
    max: null,
    median: null,
    trend: 'insufficient',
    volatility: null,
    priceDurationDays: 0,
    priceChanges: 0,
    discountFrequency: null,
    discountFrequencyMethod: 'unavailable',
    discountDepth: null,
    anomaly: 'insufficient',
    confidence: 0,
    freshnessHours: null,
    evidence: { samples, sources: [], latestObservedAt: null, truncated },
    notes,
  };
}

export function priceRollupKey(input: {
  subjectType: 'offer' | 'product';
  subjectKey: string;
  windowDays: number;
  asOfDate: string;
}): string {
  return `${input.subjectType}:${input.subjectKey}:${input.windowDays}:${input.asOfDate}`;
}
