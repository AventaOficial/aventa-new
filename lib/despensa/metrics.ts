import type { DespensaFamilyId } from '@/lib/despensa/catalog';
import { classifyDespensaText } from '@/lib/despensa/classify';
import type { EvidenceLevel } from '@/lib/despensa/evidence';
import { despensaSignals, type DespensaRankable } from '@/lib/despensa/rank';
import { productClusterKey } from '@/lib/offers/feedDiversity';

/**
 * Métricas de un listado del feed, calculadas solo con lo que el listado trae.
 * Lo que el feed no expone se reporta como `null` (pendiente), nunca como cero.
 */
export type DespensaFeedMetrics = {
  total: number;
  withNeed: number;
  byFamily: Partial<Record<DespensaFamilyId, number>>;
  withUnitPrice: number;
  evidence: Record<EvidenceLevel, number>;
  duplicateProducts: number;
  /** Proporción de ofertas de origen máquina; null si el listado no trae `origin`. */
  machineShare: number | null;
};

export type MetricsOffer = DespensaRankable & { brand?: string | null; origin?: 'community' | 'machine' | null };

export function despensaFeedMetrics(offers: readonly MetricsOffer[], now: Date): DespensaFeedMetrics {
  const evidence: Record<EvidenceLevel, number> = {
    history_confirmed: 0,
    published_with_validity: 0,
    published_source: 0,
    reported: 0,
    incomplete: 0,
  };
  const byFamily: Partial<Record<DespensaFamilyId, number>> = {};
  const clusters = new Map<string, number>();
  let withNeed = 0;
  let withUnitPrice = 0;
  let withOrigin = 0;
  let machine = 0;

  for (const offer of offers) {
    const signals = despensaSignals(offer, { now });
    evidence[signals.evidence] += 1;
    if (signals.needId) {
      withNeed += 1;
      const family = classifyDespensaText(offer.title)?.family;
      if (family) byFamily[family] = (byFamily[family] ?? 0) + 1;
    }
    if (signals.unitPrice) withUnitPrice += 1;
    if (offer.title?.trim()) {
      const key = productClusterKey(offer.title, offer.brand);
      clusters.set(key, (clusters.get(key) ?? 0) + 1);
    }
    if (offer.origin) {
      withOrigin += 1;
      if (offer.origin === 'machine') machine += 1;
    }
  }

  let duplicateProducts = 0;
  for (const n of clusters.values()) if (n > 1) duplicateProducts += n - 1;

  return {
    total: offers.length,
    withNeed,
    byFamily,
    withUnitPrice,
    evidence,
    duplicateProducts,
    machineShare: withOrigin === offers.length && offers.length > 0 ? machine / offers.length : null,
  };
}
