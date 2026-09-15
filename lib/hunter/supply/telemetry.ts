/**
 * Agregación liviana de telemetría Supply (process memory / report).
 * No es un analytics warehouse. No duplica eventos de hunter_supply_runs.
 */

import type { SupplyQualityBucket } from './qualityClass';

export type SupplyDimCounters = {
  discovered: number;
  unique: number;
  approvalReady: number;
  rejected: number;
  duplicate: number;
  insufficientEvidence: number;
  falseDiscount: number;
  priceDrop: number;
  historicalLow: number;
  anomaly: number;
  excellent: number;
  good: number;
  mediocre: number;
  filler: number;
};

export type SupplyDimKey = {
  nicheId: string;
  sourceId: string;
  query: string;
  category: string;
  merchant: string;
};

function emptyCounters(): SupplyDimCounters {
  return {
    discovered: 0,
    unique: 0,
    approvalReady: 0,
    rejected: 0,
    duplicate: 0,
    insufficientEvidence: 0,
    falseDiscount: 0,
    priceDrop: 0,
    historicalLow: 0,
    anomaly: 0,
    excellent: 0,
    good: 0,
    mediocre: 0,
    filler: 0,
  };
}

function dimKey(parts: Partial<SupplyDimKey> & { nicheId: string }): string {
  return [
    parts.nicheId,
    parts.sourceId ?? '*',
    parts.query ?? '*',
    parts.category ?? '*',
    parts.merchant ?? '*',
  ].join('|');
}

export type SupplyTelemetryRollup = {
  byNiche: Record<string, SupplyDimCounters>;
  bySource: Record<string, SupplyDimCounters>;
  byQuery: Record<string, SupplyDimCounters & { nicheId: string }>;
  byCategory: Record<string, SupplyDimCounters>;
  byMerchant: Record<string, SupplyDimCounters>;
};

export function emptySupplyTelemetryRollup(): SupplyTelemetryRollup {
  return { byNiche: {}, bySource: {}, byQuery: {}, byCategory: {}, byMerchant: {} };
}

function bump(
  map: Record<string, SupplyDimCounters>,
  key: string,
  patch: (c: SupplyDimCounters) => void,
) {
  const row = map[key] ?? emptyCounters();
  patch(row);
  map[key] = row;
}

export function recordSupplyCandidateTelemetry(
  rollup: SupplyTelemetryRollup,
  input: {
    nicheId: string;
    sourceId: string;
    query: string | null;
    category: string | null;
    merchant: string | null;
    isUnique: boolean;
    isDuplicate: boolean;
    approvalReady: boolean;
    bucket: SupplyQualityBucket;
    priceClass: string;
    laneHint: string;
  },
) {
  const apply = (c: SupplyDimCounters) => {
    c.discovered += 1;
    if (input.isUnique) c.unique += 1;
    if (input.isDuplicate) c.duplicate += 1;
    if (input.approvalReady) c.approvalReady += 1;
    if (input.bucket === 'rejected') c.rejected += 1;
    if (input.priceClass === 'insufficient_evidence') c.insufficientEvidence += 1;
    if (input.priceClass === 'false_discount') c.falseDiscount += 1;
    if (input.priceClass === 'historical_low') c.historicalLow += 1;
    if (input.priceClass === 'recent_drop' || input.priceClass === 'near_historical_low') {
      c.priceDrop += 1;
    }
    if (input.laneHint === 'anomaly_review') c.anomaly += 1;
    if (input.bucket === 'excellent') c.excellent += 1;
    if (input.bucket === 'good') c.good += 1;
    if (input.bucket === 'mediocre') c.mediocre += 1;
    if (input.bucket === 'filler') c.filler += 1;
  };

  bump(rollup.byNiche, input.nicheId, apply);
  bump(rollup.bySource, `${input.nicheId}::${input.sourceId}`, apply);
  const q = (input.query ?? '(none)').trim() || '(none)';
  const qKey = dimKey({ nicheId: input.nicheId, query: q });
  const qRow = (rollup.byQuery[qKey] as (SupplyDimCounters & { nicheId: string }) | undefined) ?? {
    ...emptyCounters(),
    nicheId: input.nicheId,
  };
  apply(qRow);
  rollup.byQuery[qKey] = qRow;
  bump(rollup.byCategory, `${input.nicheId}::${input.category ?? '(none)'}`, apply);
  bump(rollup.byMerchant, `${input.nicheId}::${input.merchant ?? '(none)'}`, apply);
}

export function ratesFromCounters(c: SupplyDimCounters) {
  const base = Math.max(1, c.discovered);
  const uniq = Math.max(1, c.unique);
  return {
    approvalReadyRate: Math.round((c.approvalReady / uniq) * 1000) / 10,
    rejectionRate: Math.round((c.rejected / uniq) * 1000) / 10,
    duplicateRate: Math.round((c.duplicate / base) * 1000) / 10,
    falseDiscountRate: Math.round((c.falseDiscount / uniq) * 1000) / 10,
    evidenceFailureRate: Math.round((c.insufficientEvidence / uniq) * 1000) / 10,
    goodDealsPerDiscovered:
      Math.round(((c.excellent + c.good) / base) * 1000) / 10,
  };
}

export function topKeysByGoodDeals(
  map: Record<string, SupplyDimCounters>,
  limit = 8,
): Array<{ key: string; good: number; approvalReady: number; discovered: number; rate: number }> {
  return Object.entries(map)
    .map(([key, c]) => ({
      key,
      good: c.excellent + c.good,
      approvalReady: c.approvalReady,
      discovered: c.discovered,
      rate: c.discovered > 0 ? Math.round(((c.excellent + c.good) / c.discovered) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.good - a.good || b.rate - a.rate || b.approvalReady - a.approvalReady)
    .slice(0, limit);
}
