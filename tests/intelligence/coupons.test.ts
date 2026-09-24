import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveOutbound } from '@/lib/affiliate/resolveOutbound';
import { computeCouponEffectivePrice } from '@/lib/intelligence/coupon/effectivePrice';
import { couponHistoryEvent } from '@/lib/intelligence/coupon/history';
import { canonicalCouponKey } from '@/lib/intelligence/coupon/identity';
import { parseCouponPaste } from '@/lib/intelligence/coupon/parse';
import { couponPriceContext } from '@/lib/intelligence/coupon/priceContext';
import { relateCopyToOutbound, couponConversionContract } from '@/lib/intelligence/coupon/interaction';
import { summarizeCouponReliability } from '@/lib/intelligence/coupon/reliability';
import { relateCoupon } from '@/lib/intelligence/coupon/relate';
import { COUPON_INTELLIGENCE_MODE, type CouponSnapshot } from '@/lib/intelligence/coupon/types';
import { classifyCoupon } from '@/lib/intelligence/coupon/validate';
import { scoreIntelligenceRank } from '@/lib/intelligence/ranking/features';

const now = new Date('2026-09-23T18:00:00.000Z');
const SAMPLE = `Amazon:
Cupón $1,500 de descuento
Código: AMAZON1500
Mínimo $10,000
Válido hasta mañana
Solo productos seleccionados`;

function snap(over: Partial<CouponSnapshot> = {}): CouponSnapshot {
  return {
    canonicalKey: 'amazon|AMAZON1500',
    store: 'amazon',
    code: 'AMAZON1500',
    discountType: 'fixed',
    discountValue: 1500,
    maxDiscount: null,
    minimumPurchase: 8000,
    currency: 'MXN',
    appliesTo: 'store',
    restrictions: null,
    expiresAt: null,
    status: 'verified',
    verificationStatus: 'verified',
    confidence: 0.9,
    sourceClass: 'admin',
    lastVerifiedAt: now.toISOString(),
    ...over,
  };
}

describe('coupon parse and identity', () => {
  it('extracts a mention without inventing currency or calling it verified', () => {
    const { drafts, failures } = parseCouponPaste(SAMPLE, { now });
    expect(failures).toEqual([]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      ok: true,
      store: 'amazon',
      code: 'AMAZON1500',
      discountType: 'fixed',
      discountValue: 1500,
      minimumPurchase: 10000,
      currency: null,
      appliesTo: 'product',
      confidence: 0.25,
    });
    expect(drafts[0]?.expiresAt).toBeTruthy();
    const again = parseCouponPaste(`${SAMPLE}\n\n${SAMPLE}`, { now });
    expect(again.drafts).toHaveLength(1);
    expect(canonicalCouponKey({ store: 'Amazon', code: 'amazon 1500', discountType: 'fixed', appliesTo: 'product' })).toBe(
      'amazon|AMAZON1500',
    );
  });

  it('rejects a malformed code and mixed currencies', () => {
    expect(parseCouponPaste('Amazon:\nCódigo: <script>\nCupón $10 de descuento', { now }).failures[0]?.reason).toBe(
      'malformed_code',
    );
    expect(
      parseCouponPaste('Amazon:\nCódigo: ABC10\nCupón $10 MXN de descuento\nMáximo $2 USD', { now }).failures[0]?.reason,
    ).toBe('currency_mixed');
  });
});

describe('coupon price, status and relation', () => {
  it('prices fixed, percent and max discount only when the scope matches', () => {
    expect(
      computeCouponEffectivePrice({
        basePrice: 10000,
        currency: 'MXN',
        discountType: 'fixed',
        discountValue: 1500,
        maxDiscount: null,
        minimumPurchase: 8000,
        couponCurrency: 'MXN',
        appliesTo: 'store',
        scopeMatched: true,
      }).effectivePrice,
    ).toBe(8500);
    expect(
      computeCouponEffectivePrice({
        basePrice: 10000,
        currency: 'MXN',
        discountType: 'percent',
        discountValue: 20,
        maxDiscount: null,
        minimumPurchase: null,
        couponCurrency: null,
        appliesTo: 'store',
        scopeMatched: true,
      }).effectivePrice,
    ).toBe(8000);
    expect(
      computeCouponEffectivePrice({
        basePrice: 10000,
        currency: 'MXN',
        discountType: 'percent',
        discountValue: 20,
        maxDiscount: 1000,
        minimumPurchase: null,
        couponCurrency: null,
        appliesTo: 'store',
        scopeMatched: true,
      }).effectivePrice,
    ).toBe(9000);
    expect(
      computeCouponEffectivePrice({
        basePrice: 5000,
        currency: 'MXN',
        discountType: 'fixed',
        discountValue: 1500,
        maxDiscount: null,
        minimumPurchase: 8000,
        couponCurrency: 'MXN',
        appliesTo: 'store',
        scopeMatched: true,
      }).reason,
    ).toBe('below_minimum');
    expect(
      computeCouponEffectivePrice({
        basePrice: 10000,
        currency: 'MXN',
        discountType: 'fixed',
        discountValue: 1500,
        maxDiscount: null,
        minimumPurchase: null,
        couponCurrency: null,
        appliesTo: 'store',
        scopeMatched: true,
      }).reason,
    ).toBe('currency_unmatched');
    expect(
      computeCouponEffectivePrice({
        basePrice: 10000,
        currency: 'MXN',
        discountType: 'fixed',
        discountValue: 1500,
        maxDiscount: null,
        minimumPurchase: null,
        couponCurrency: 'MXN',
        appliesTo: 'product',
        scopeMatched: false,
      }).reason,
    ).toBe('scope_unmatched');
    expect(
      computeCouponEffectivePrice({
        basePrice: 10000,
        currency: 'MXN',
        discountType: 'bogo',
        discountValue: null,
        maxDiscount: null,
        minimumPurchase: null,
        couponCurrency: null,
        appliesTo: 'store',
        scopeMatched: true,
      }).reason,
    ).toBe('mechanic_not_priced');
  });

  it('hides a mention and a stale verification from the public card', () => {
    expect(classifyCoupon(snap({ status: 'discovered', verificationStatus: 'unverified', lastVerifiedAt: null }), now).showAsAvailable).toBe(
      false,
    );
    expect(
      classifyCoupon(snap({ lastVerifiedAt: '2026-08-01T00:00:00.000Z' }), now).publicLabel,
    ).toBe('POR VERIFICAR');
    expect(classifyCoupon(snap(), now).publicLabel).toBe('VERIFICADO');
    expect(relateCoupon({ appliesTo: 'product', store: 'amazon', offerStore: 'amazon' }).uncertain).toBe(true);
  });

  it('keeps history when the same coupon reappears or changes', () => {
    const first = snap({ status: 'discovered', verificationStatus: 'unverified' });
    expect(couponHistoryEvent({ previous: null, next: first, day: '2026-09-23' }).eventType).toBe('discovered');
    expect(couponHistoryEvent({ previous: first, next: first, day: '2026-09-23' }).eventType).toBe('reseen');
    expect(
      couponHistoryEvent({ previous: first, next: { ...first, discountValue: 2000 }, day: '2026-09-23' }).eventType,
    ).toBe('field_changed');
  });
});

describe('outbound and shadow rank', () => {
  it('keeps the click id and does not invent a retailer coupon url', () => {
    const source = 'https://www.amazon.com.mx/dp/B00TEST?click_id=abc';
    const a = resolveOutbound({ sourceUrl: source, offerId: 'o1', couponId: 'c1', clickId: 'abc' });
    const b = resolveOutbound({ sourceUrl: source, offerId: 'o1', couponId: 'c1', clickId: 'abc' });
    expect(a).toEqual(b);
    expect(a.affiliateUrl).toContain('click_id=abc');
    expect(a.sourceUrl).toBe(source);
    expect(a.couponAppliedByRetailer).toBe(false);
    expect(a.attributionPreserved).toBe(true);
    expect(COUPON_INTELLIGENCE_MODE).toBe('shadow');
  });

  it('lets a verified coupon change only the shadow score', () => {
    const base = {
      offerId: 'o',
      currentScore: 10,
      community: { upVotes: 0, downVotes: 0 },
    };
    const plain = scoreIntelligenceRank(base);
    const mentioned = scoreIntelligenceRank({
      ...base,
      coupon: { verified: false, confidence: 0.25, showAsAvailable: false, discountValue: 1500 },
    });
    const verified = scoreIntelligenceRank({
      ...base,
      coupon: { verified: true, confidence: 0.9, showAsAvailable: true, discountValue: 1500 },
    });
    expect(mentioned.intelligenceScore).toBe(plain.intelligenceScore);
    expect(verified.intelligenceScore).not.toBe(plain.intelligenceScore);
    expect(verified.appliedToFeed).toBe(false);
  });

  it('strips tracking noise and keeps the click id', () => {
    const resolved = resolveOutbound({
      sourceUrl: 'https://www.amazon.com.mx/dp/B00TEST?utm_source=bot&click_id=abc',
      clickId: 'abc',
    });
    expect(resolved.affiliateUrl).not.toContain('utm_source');
    expect(resolved.affiliateUrl).toContain('click_id=abc');
    expect(resolved.urlUncertain).toBe(false);
    expect(resolveOutbound({ sourceUrl: 'http://[', clickId: null }).urlUncertain).toBe(true);
  });
});

describe('coupon evidence', () => {
  it('keeps one identity when the mechanic changes', () => {
    const a = canonicalCouponKey({ store: 'amazon', code: 'SAVE20', discountType: 'percent', appliesTo: 'store' });
    const b = canonicalCouponKey({ store: 'amazon', code: 'SAVE20', discountType: 'fixed', appliesTo: 'product' });
    expect(a).toBe(b);
    expect(couponHistoryEvent({
      previous: snap({ discountType: 'percent', discountValue: 20 }),
      next: snap({ discountType: 'fixed', discountValue: 1500 }),
      day: '2026-09-23',
    }).eventType).toBe('field_changed');
  });

  it('does not treat a store match as verified for the offer', () => {
    expect(relateCoupon({ appliesTo: 'store', store: 'amazon', offerStore: 'amazon' }).eligibility).toBe('eligible');
    expect(relateCoupon({ appliesTo: 'product', store: 'amazon', offerStore: 'walmart' }).eligibility).toBe('exists');
  });

  it('leaves reliability null until verifications exist', () => {
    expect(summarizeCouponReliability([{ eventType: 'discovered' }]).verificationSuccessRate).toBeNull();
    expect(
      summarizeCouponReliability([
        { eventType: 'verified', sourceClass: 'admin' },
        { eventType: 'invalidated', sourceClass: 'admin' },
      ]).verificationSuccessRate,
    ).toBe(0.5);
  });

  it('does not invent a price signal without history', () => {
    const priced = computeCouponEffectivePrice({
      basePrice: 10000,
      currency: 'MXN',
      discountType: 'percent',
      discountValue: 20,
      maxDiscount: 1000,
      minimumPurchase: null,
      couponCurrency: null,
      appliesTo: 'store',
      scopeMatched: true,
    });
    expect(priced.ok && priced.effectivePrice).toBe(9000);
    expect(couponPriceContext({ currentPrice: 10000, priced, history: null }).effectiveBelowMedian).toBeNull();
  });

  it('correlates a copy and an outbound only with the same id', () => {
    const copy = { offerId: 'o1', correlationId: 'c1', observedAt: '2026-09-23T18:00:00.000Z' };
    expect(
      relateCopyToOutbound({
        copy,
        outbound: { offerId: 'o1', correlationId: 'c1', observedAt: '2026-09-23T18:05:00.000Z' },
      }).relation,
    ).toBe('correlated');
    expect(
      relateCopyToOutbound({
        copy,
        outbound: { offerId: 'o1', correlationId: null, observedAt: '2026-09-23T18:05:00.000Z' },
      }).relation,
    ).toBe('ambiguous');
    expect(couponConversionContract('c1').infersFromClick).toBe(false);
  });

  it('records 20 to 15 as history on the same coupon', () => {
    const changed = couponHistoryEvent({
      previous: snap({ discountType: 'percent', discountValue: 20 }),
      next: snap({ discountType: 'percent', discountValue: 15 }),
      day: '2026-09-23',
    });
    expect(changed.eventType).toBe('field_changed');
    expect(changed.diff).toEqual([{ field: 'discountValue', before: '20', after: '15' }]);
    const later = couponHistoryEvent({
      previous: snap({ discountType: 'percent', discountValue: 15 }),
      next: snap({ discountType: 'percent', discountValue: 10 }),
      day: '2026-09-23',
    });
    expect(later.idempotencyKey).not.toBe(changed.idempotencyKey);
  });
});

describe('effective price stays null without evidence', () => {
  const base = {
    basePrice: 10000,
    currency: 'MXN',
    appliesTo: 'store' as const,
    scopeMatched: true,
    maxDiscount: null,
    minimumPurchase: null,
    couponCurrency: 'MXN',
  };

  it('prices the known mechanics and refuses the rest', () => {
    expect(
      computeCouponEffectivePrice({ ...base, discountType: 'percent', discountValue: 20, couponCurrency: null }).effectivePrice,
    ).toBe(8000);
    expect(
      computeCouponEffectivePrice({
        ...base,
        discountType: 'percent',
        discountValue: 20,
        maxDiscount: 1000,
        couponCurrency: null,
      }).effectivePrice,
    ).toBe(9000);
    expect(computeCouponEffectivePrice({ ...base, discountType: 'fixed', discountValue: 1500 }).effectivePrice).toBe(8500);
    expect(
      computeCouponEffectivePrice({ ...base, discountType: 'fixed', discountValue: 1500, minimumPurchase: 8000 })
        .effectivePrice,
    ).toBe(8500);
    expect(
      computeCouponEffectivePrice({ ...base, discountType: 'fixed', discountValue: 1500, couponCurrency: null }).reason,
    ).toBe('currency_unmatched');
    expect(computeCouponEffectivePrice({ ...base, discountType: 'bogo', discountValue: null }).effectivePrice).toBeNull();
    expect(
      computeCouponEffectivePrice({
        ...base,
        discountType: 'percent',
        discountValue: 20,
        appliesTo: 'product',
        scopeMatched: false,
        couponCurrency: null,
      }).reason,
    ).toBe('scope_unmatched');
    expect(
      computeCouponEffectivePrice({ ...base, discountType: 'unknown', discountValue: null, couponCurrency: null }).reason,
    ).toBe('mechanic_not_priced');
  });

  it('hides an expired coupon and does not publish a price signal', () => {
    expect(classifyCoupon(snap({ status: 'expired', expiresAt: '2020-01-01T00:00:00.000Z' }), now).showAsAvailable).toBe(
      false,
    );
    const priced = computeCouponEffectivePrice({ ...base, discountType: 'percent', discountValue: 20, couponCurrency: null });
    const context = couponPriceContext({
      currentPrice: 10000,
      priced,
      history: { median: 9500, min: 8000, max: 12000, confidence: 0.8, currency: 'MXN' },
    });
    expect(context.couponBelowMedian).toBe(true);
    expect(context.publishes).toBe(false);
    expect(context.appliedToFeed).toBe(false);
  });

  it('does not let the client name the moderator or mark a coupon verified', () => {
    const admin = readFileSync(resolve(process.cwd(), 'app/api/admin/coupons/route.ts'), 'utf8');
    const publicEvents = readFileSync(resolve(process.cwd(), 'app/api/offers/[id]/coupon-events/route.ts'), 'utf8');
    expect(admin).toContain('actorId: auth.user.id');
    expect(admin).not.toContain('body.actorId');
    expect(publicEvents).not.toContain('verified_for_offer');
    expect(publicEvents).toContain("const TYPES = new Set(['coupon_view', 'coupon_copy'])");
  });
});
