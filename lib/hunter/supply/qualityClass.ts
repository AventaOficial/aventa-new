/**
 * Clasificación operativa de candidatos Supply (telemetría / reporte).
 * No publica. No sustituye DQE/Evidence.
 */

import type { DealSignals } from './dealSignals';

export type SupplyQualityBucket =
  | 'excellent'
  | 'good'
  | 'mediocre'
  | 'filler'
  | 'rejected';

export type SupplyQualityReason =
  | 'historical_low_strong'
  | 'near_low_or_drop'
  | 'verified_deal_score'
  | 'promotion_ok'
  | 'insufficient_history'
  | 'false_discount'
  | 'anomaly_needs_human'
  | 'verifier_reject'
  | 'low_deal_score'
  | 'small_ticket'
  | 'catalog_noise'
  | 'duplicate'
  | 'unknown';

export function classifySupplyQuality(input: {
  deal: DealSignals;
  qualification: string | null;
  verifierDecision: string | null;
  isDuplicate?: boolean;
  price?: number | null;
}): { bucket: SupplyQualityBucket; reason: SupplyQualityReason } {
  if (input.isDuplicate) return { bucket: 'rejected', reason: 'duplicate' };
  if (input.verifierDecision === 'reject') {
    return { bucket: 'rejected', reason: 'verifier_reject' };
  }
  if (input.deal.priceClass === 'false_discount') {
    return { bucket: 'rejected', reason: 'false_discount' };
  }
  if (input.deal.laneHint === 'anomaly_review') {
    return { bucket: 'good', reason: 'anomaly_needs_human' };
  }
  if (input.deal.priceClass === 'historical_low' && input.deal.dealScore >= 55) {
    return { bucket: 'excellent', reason: 'historical_low_strong' };
  }
  if (
    (input.deal.priceClass === 'near_historical_low' || input.deal.priceClass === 'recent_drop') &&
    input.deal.dealScore >= 45
  ) {
    return { bucket: 'good', reason: 'near_low_or_drop' };
  }
  if (
    (input.qualification === 'VERIFIED_DEAL' || input.qualification === 'PROMOTION') &&
    input.deal.dealScore >= 50 &&
    input.deal.historyReady
  ) {
    return { bucket: 'good', reason: 'verified_deal_score' };
  }
  if (input.qualification === 'PROMOTION' && input.deal.dealScore >= 35) {
    return { bucket: 'mediocre', reason: 'promotion_ok' };
  }
  if (input.deal.priceClass === 'insufficient_evidence') {
    return { bucket: 'mediocre', reason: 'insufficient_history' };
  }
  if (typeof input.price === 'number' && input.price > 0 && input.price < 40) {
    return { bucket: 'filler', reason: 'small_ticket' };
  }
  if (input.deal.dealScore < 25) {
    return { bucket: 'filler', reason: 'low_deal_score' };
  }
  if (input.qualification === 'NO_VERIFIED_DEAL' || input.qualification == null) {
    return { bucket: 'filler', reason: 'catalog_noise' };
  }
  return { bucket: 'mediocre', reason: 'unknown' };
}

export function parseMlSourceDetail(sourceDetail: string | null | undefined): {
  kind: 'q' | 'cat' | 'hl' | 'unknown';
  value: string | null;
  sort: string | null;
} {
  const raw = (sourceDetail ?? '').trim();
  // ml:q:perfume mujer oferta|sort:sold_quantity_desc
  // ml:hl:MLM1246|q:perfume mujer oferta|sort:highlights
  const m = /^ml:(q|cat|hl):(.+?)(?:\|sort:([a-z0-9_]+))?$/i.exec(raw);
  if (!m) return { kind: 'unknown', value: null, sort: null };
  const kindRaw = m[1]!.toLowerCase();
  const kind = kindRaw === 'cat' ? 'cat' : kindRaw === 'hl' ? 'hl' : 'q';
  return {
    kind,
    value: m[2]!.trim() || null,
    sort: m[3]?.trim() || null,
  };
}
