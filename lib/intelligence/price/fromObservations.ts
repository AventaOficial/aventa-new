import type { PriceObservation } from '@/lib/dealIntelligence/types';
import type { PricePoint } from '@/lib/intelligence/price/summarize';

export function pointsFromObservations(observations: PriceObservation[]): PricePoint[] {
  const points: PricePoint[] = [];
  for (const observation of observations) {
    if (observation.salePrice == null || !Number.isFinite(observation.salePrice)) continue;
    points.push({
      observedAt: observation.observedAt,
      price: observation.salePrice,
      listPrice: observation.listPrice,
      currency: observation.currency,
      source: observation.sourceId,
    });
  }
  return points;
}
