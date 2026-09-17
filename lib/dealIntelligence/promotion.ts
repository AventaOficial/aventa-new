/**
 * Promotion / coupon intelligence — stacking never assumed.
 */

import { hashStable } from './identity';
import type {
  CouponObservation,
  EffectivePriceComputation,
  EvidenceReference,
  PromotionObservation,
} from './types';

export function buildPromotionObservation(input: {
  kind: PromotionObservation['kind'];
  sourceId: string;
  observedAt: string;
  validFrom?: string | null;
  validUntil?: string | null;
  eligibility?: string | null;
  percentOff?: number | null;
  amountOff?: number | null;
  currency?: string | null;
  evidence: EvidenceReference[];
  confidence: number;
  stackableWith?: string[];
  stackingEvidence?: EvidenceReference[];
}): PromotionObservation | { ok: false; reason: string } {
  if (!input.evidence.length) {
    return { ok: false, reason: 'promotion_missing_evidence' };
  }
  if (input.confidence < 0.3) {
    return { ok: false, reason: 'promotion_confidence_too_low' };
  }
  if (
    input.validUntil &&
    Date.parse(input.validUntil) < Date.parse(input.observedAt)
  ) {
    return { ok: false, reason: 'promotion_already_expired' };
  }
  const promotionId = `promo_${hashStable([
    input.sourceId,
    input.kind,
    String(input.percentOff ?? ''),
    String(input.amountOff ?? ''),
    input.observedAt.slice(0, 10),
  ])}`;
  return {
    promotionId,
    kind: input.kind,
    sourceId: input.sourceId,
    observedAt: input.observedAt,
    validFrom: input.validFrom ?? null,
    validUntil: input.validUntil ?? null,
    eligibility: input.eligibility ?? null,
    percentOff: input.percentOff ?? null,
    amountOff: input.amountOff ?? null,
    currency: input.currency ?? null,
    evidence: input.evidence,
    confidence: Math.max(0, Math.min(1, input.confidence)),
    stackableWith: input.stackableWith ?? [],
    stackingEvidence: input.stackingEvidence ?? [],
  };
}

export function buildCouponObservation(input: {
  code?: string | null;
  sourceId: string;
  observedAt: string;
  validFrom?: string | null;
  validUntil?: string | null;
  eligibility?: string | null;
  percentOff?: number | null;
  amountOff?: number | null;
  currency?: string | null;
  evidence: EvidenceReference[];
  confidence: number;
  now?: Date;
  stackableWith?: string[];
  stackingEvidence?: EvidenceReference[];
}): CouponObservation | { ok: false; reason: string } {
  if (!input.evidence.length) {
    return { ok: false, reason: 'coupon_missing_evidence' };
  }
  const now = input.now ?? new Date();
  const expired =
    Boolean(input.validUntil) && Date.parse(input.validUntil!) < now.getTime();
  if (expired) {
    return { ok: false, reason: 'coupon_expired' };
  }
  const couponId = `cpn_${hashStable([
    input.sourceId,
    input.code ?? '',
    String(input.amountOff ?? ''),
    String(input.percentOff ?? ''),
  ])}`;
  return {
    couponId,
    code: input.code ?? null,
    sourceId: input.sourceId,
    observedAt: input.observedAt,
    validFrom: input.validFrom ?? null,
    validUntil: input.validUntil ?? null,
    eligibility: input.eligibility ?? null,
    percentOff: input.percentOff ?? null,
    amountOff: input.amountOff ?? null,
    currency: input.currency ?? null,
    evidence: input.evidence,
    confidence: Math.max(0, Math.min(1, input.confidence)),
    expired: false,
    stackableWith: input.stackableWith ?? [],
    stackingEvidence: input.stackingEvidence ?? [],
  };
}

function applyAmount(
  running: number,
  amountOff: number | null,
  percentOff: number | null,
): number {
  if (amountOff != null) return running - amountOff;
  if (percentOff != null) return running - (running * percentOff) / 100;
  return running;
}

/**
 * EFFECTIVE_PRICE only when multi-component stacking is evidenced.
 * A single promotion OR single coupon alone is allowed without stack evidence.
 * Two+ components require stackingEvidence on each non-base component.
 */
export function computeEffectivePrice(input: {
  basePrice: number;
  currency: string;
  promotions?: PromotionObservation[];
  coupons?: CouponObservation[];
  bankDiscountAmount?: number | null;
  bankStackingEvidence?: EvidenceReference[];
}): EffectivePriceComputation {
  const components: EffectivePriceComputation['components'] = [
    { role: 'BASE_PRICE', amount: input.basePrice, note: 'list_or_sale_base' },
  ];

  if (!Number.isFinite(input.basePrice) || input.basePrice < 0) {
    return {
      ok: false,
      effectivePrice: null,
      currency: input.currency,
      components,
      refusalReason: 'invalid_base_price',
    };
  }

  const promos = input.promotions ?? [];
  const coupons = input.coupons ?? [];
  const bank = input.bankDiscountAmount != null && input.bankDiscountAmount > 0
    ? input.bankDiscountAmount
    : null;
  const adjustmentCount = promos.length + coupons.length + (bank != null ? 1 : 0);

  if (adjustmentCount === 0) {
    return {
      ok: true,
      effectivePrice: input.basePrice,
      currency: input.currency,
      components,
      refusalReason: null,
    };
  }

  if (adjustmentCount > 1) {
    const promosOk = promos.every((p) => p.stackingEvidence.length > 0);
    const couponsOk = coupons.every((c) => c.stackingEvidence.length > 0);
    const bankOk = bank == null || (input.bankStackingEvidence?.length ?? 0) > 0;
    if (!promosOk || !couponsOk || !bankOk) {
      return {
        ok: false,
        effectivePrice: null,
        currency: input.currency,
        components,
        refusalReason: 'invalid_stacking_missing_evidence',
      };
    }
  }

  let running = input.basePrice;
  for (const p of promos) {
    const before = running;
    running = applyAmount(running, p.amountOff, p.percentOff);
    components.push({
      role: 'PROMOTION',
      amount: running - before,
      note: p.kind,
    });
  }
  for (const c of coupons) {
    const before = running;
    running = applyAmount(running, c.amountOff, c.percentOff);
    components.push({
      role: 'COUPON',
      amount: running - before,
      note: c.code ?? 'coupon',
    });
  }
  if (bank != null) {
    running -= bank;
    components.push({ role: 'BANK_DISCOUNT', amount: -bank, note: 'bank' });
  }

  if (!Number.isFinite(running) || running < 0) {
    return {
      ok: false,
      effectivePrice: null,
      currency: input.currency,
      components,
      refusalReason: 'effective_price_invalid',
    };
  }

  return {
    ok: true,
    effectivePrice: Math.round(running * 100) / 100,
    currency: input.currency,
    components,
    refusalReason: null,
  };
}

export function promotionsConflict(
  a: PromotionObservation,
  b: PromotionObservation,
): boolean {
  if (a.kind !== b.kind) return false;
  const aStacks =
    a.stackableWith.includes(b.promotionId) || a.stackableWith.includes(b.kind);
  const bStacks =
    b.stackableWith.includes(a.promotionId) || b.stackableWith.includes(a.kind);
  return !(aStacks && bStacks);
}
