import type { IngestItem } from '@/lib/bots/ingest/types';
import { classifyAcquisitionCandidate, type AcquisitionSignals } from './classifyAcquisition';

export type RankedAcquisitionItem<T> = {
  item: T;
  signals: AcquisitionSignals;
  originalIndex: number;
  /** Day 6 advisory boost applied on top of Offer Standard score (documented). */
  priorityBoost: number;
};

export type AcquisitionPriorityContext = {
  /**
   * Prefer sources that are currently healthy.
   * Keys are ingest/hunter source ids. Values: healthy | degraded | down | disabled.
   */
  sourceHealth?: Record<string, string>;
  /**
   * Prefer candidates closer to Price Memory historyReady (lower daysUntilReady).
   * Read from item.precomputedMeta.signals or attached metadata — never invents history.
   */
  daysUntilReadyByUrl?: Record<string, number>;
};

function titleOf(item: IngestItem): string | null {
  const t = item.precomputedMeta?.title?.trim();
  return t ? t : null;
}

function priceOf(item: IngestItem): number | null {
  const p = item.precomputedMeta?.discountPrice;
  return typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : null;
}

/**
 * Documented priority boosts (advisory only — never bypasses DQE/S6.1):
 * - source healthy: +8
 * - source degraded: +0
 * - source down/disabled/unknown: −12
 * - daysUntilReady 0–1: +15
 * - daysUntilReady 2–3: +8
 * - daysUntilReady ≥4 or unknown: +0
 */
export function computeAcquisitionPriorityBoost(
  item: IngestItem,
  ctx?: AcquisitionPriorityContext,
): number {
  let boost = 0;
  const health = ctx?.sourceHealth?.[item.source];
  if (health === 'healthy') boost += 8;
  else if (health === 'degraded') boost += 0;
  else if (health === 'down' || health === 'disabled') boost -= 12;

  const url = item.precomputedMeta?.canonicalUrl || item.url;
  const days = ctx?.daysUntilReadyByUrl?.[url];
  if (typeof days === 'number' && Number.isFinite(days)) {
    if (days <= 1) boost += 15;
    else if (days <= 3) boost += 8;
  }
  return boost;
}

/**
 * Ordena el pool de discovery para gastar el presupuesto en SKUs de alto valor.
 * No filtra, no mintea, no cambia DQE: reordena y aplaza duplicados de familia.
 *
 * Day 6: optional context applies documented priorityBoost on top of acquisitionScore.
 */
export function prioritizeAcquisitionPool(
  items: readonly IngestItem[],
  ctx?: AcquisitionPriorityContext,
): IngestItem[] {
  if (items.length <= 1) return [...items];

  const ranked: RankedAcquisitionItem<IngestItem>[] = items.map((item, originalIndex) => {
    const signals = classifyAcquisitionCandidate({
      title: titleOf(item),
      url: item.url,
      currentPrice: priceOf(item),
    });
    const priorityBoost = computeAcquisitionPriorityBoost(item, ctx);
    return {
      item,
      originalIndex,
      signals,
      priorityBoost,
    };
  });

  ranked.sort((a, b) => {
    const scoreA = a.signals.acquisitionScore + a.priorityBoost;
    const scoreB = b.signals.acquisitionScore + b.priorityBoost;
    const d = scoreB - scoreA;
    if (d !== 0) return d;
    return a.originalIndex - b.originalIndex;
  });

  const seenFamily = new Set<string>();
  const unique: RankedAcquisitionItem<IngestItem>[] = [];
  const deferred: RankedAcquisitionItem<IngestItem>[] = [];
  for (const row of ranked) {
    const key = row.signals.familyKey;
    if (key && seenFamily.has(key)) {
      deferred.push(row);
      continue;
    }
    if (key) seenFamily.add(key);
    unique.push(row);
  }

  return [...unique, ...deferred].map((row) => row.item);
}
