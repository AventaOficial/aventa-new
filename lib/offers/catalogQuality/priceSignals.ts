import { compareWithListPrice } from '@/lib/offers/listPriceComparison';

export type PriceProvenance = 'source_explicit' | 'declared_by_publisher' | 'unknown';

const HIGH_DISCOUNT_REVIEW_PCT = 45;

function readBotOriginalProvenance(botMeta: unknown): PriceProvenance {
  if (!botMeta || typeof botMeta !== 'object' || Array.isArray(botMeta)) return 'unknown';
  const policy = (botMeta as Record<string, unknown>).candidate_policy;
  if (policy && typeof policy === 'object' && !Array.isArray(policy)) {
    const prov = (policy as Record<string, unknown>).original_price_provenance;
    if (prov === 'source_explicit') return 'source_explicit';
  }
  const admission = (botMeta as Record<string, unknown>).admission;
  if (admission && typeof admission === 'object' && !Array.isArray(admission)) {
    const prov = (admission as Record<string, unknown>).original_price_provenance;
    if (prov === 'source_explicit') return 'source_explicit';
  }
  return 'unknown';
}

export function resolvePriceProvenance(input: {
  source: 'community' | 'bot' | 'machine' | 'unknown';
  botMeta?: unknown;
}): PriceProvenance {
  if (input.source === 'community') return 'declared_by_publisher';
  const fromBot = readBotOriginalProvenance(input.botMeta);
  return fromBot === 'source_explicit' ? 'source_explicit' : 'unknown';
}

export function discountPercent(price: number, original: number): number | null {
  if (!Number.isFinite(price) || !Number.isFinite(original) || original <= price || original <= 0) return null;
  return Math.round(((original - price) / original) * 100);
}

/** Precio de lista admisible para persistir y mostrar comparación. */
export function sanitizeOriginalPriceForIngest(input: {
  price: number;
  originalPrice: number | null;
  provenance: PriceProvenance;
}): { originalPrice: number | null; dropped: boolean; reason?: string } {
  const { price, originalPrice, provenance } = input;
  if (originalPrice == null) return { originalPrice: null, dropped: false };
  const comparison = compareWithListPrice(price, originalPrice);
  if (!comparison) {
    return { originalPrice: null, dropped: true, reason: 'list_not_above_price' };
  }
  if (provenance === 'unknown') {
    return { originalPrice: null, dropped: true, reason: 'original_unprovenanced' };
  }
  if (provenance === 'declared_by_publisher') {
    const pct = discountPercent(price, originalPrice);
    if (pct != null && pct >= HIGH_DISCOUNT_REVIEW_PCT) {
      return { originalPrice: null, dropped: true, reason: 'high_discount_declared_only' };
    }
  }
  return { originalPrice, dropped: false };
}

export function assessPriceSignals(input: {
  price?: number | null;
  original_price?: number | null;
  provenance: PriceProvenance;
}): Array<{
  type: 'original_price_unprovenanced' | 'discount_unverifiable' | 'price_format_anomaly';
  kind: 'confirmed' | 'review';
  severity: 'low' | 'medium' | 'high';
  evidence: string;
}> {
  const out: Array<{
    type: 'original_price_unprovenanced' | 'discount_unverifiable' | 'price_format_anomaly';
    kind: 'confirmed' | 'review';
    severity: 'low' | 'medium' | 'high';
    evidence: string;
  }> = [];
  const price = Number(input.price ?? 0);
  const original = input.original_price != null ? Number(input.original_price) : null;

  if (Number.isFinite(price) && price > 0) {
    const frac = Math.abs(price - Math.round(price * 100) / 100);
    if (frac > 0 && String(price).split('.')[1]?.length > 2) {
      out.push({
        type: 'price_format_anomaly',
        kind: 'review',
        severity: 'low',
        evidence: `price=${price} con más de 2 decimales`,
      });
    }
  }

  if (original == null || !Number.isFinite(original)) return out;

  const comparison = compareWithListPrice(price, original);
  if (!comparison) return out;

  const pct = comparison.percent ?? discountPercent(price, original);
  if (input.provenance === 'unknown') {
    out.push({
      type: 'original_price_unprovenanced',
      kind: 'confirmed',
      severity: 'high',
      evidence: `original_price=${original} sin procedencia verificable`,
    });
    out.push({
      type: 'discount_unverifiable',
      kind: 'confirmed',
      severity: pct != null && pct >= HIGH_DISCOUNT_REVIEW_PCT ? 'high' : 'medium',
      evidence: pct != null ? `descuento declarado ~${pct}% sin evidencia` : 'lista sin % verificable',
    });
  } else if (input.provenance === 'declared_by_publisher' && pct != null && pct >= HIGH_DISCOUNT_REVIEW_PCT) {
    out.push({
      type: 'discount_unverifiable',
      kind: 'review',
      severity: 'medium',
      evidence: `descuento declarado ${pct}% (solo publicador)`,
    });
  }

  return out;
}
