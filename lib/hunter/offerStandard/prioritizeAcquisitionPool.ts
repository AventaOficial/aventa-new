import type { IngestItem } from '@/lib/bots/ingest/types';
import { classifyAcquisitionCandidate, type AcquisitionSignals } from './classifyAcquisition';

export type RankedAcquisitionItem<T> = {
  item: T;
  signals: AcquisitionSignals;
  originalIndex: number;
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
 * Ordena el pool de discovery para gastar el presupuesto en SKUs de alto valor.
 * No filtra, no mintea, no cambia DQE: reordena y aplaza duplicados de familia.
 */
export function prioritizeAcquisitionPool(items: readonly IngestItem[]): IngestItem[] {
  if (items.length <= 1) return [...items];

  const ranked: RankedAcquisitionItem<IngestItem>[] = items.map((item, originalIndex) => ({
    item,
    originalIndex,
    signals: classifyAcquisitionCandidate({
      title: titleOf(item),
      url: item.url,
      currentPrice: priceOf(item),
    }),
  }));

  ranked.sort((a, b) => {
    const d = b.signals.acquisitionScore - a.signals.acquisitionScore;
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
