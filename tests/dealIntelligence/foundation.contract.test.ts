/**
 * Deal Intelligence P0.1 — contract tests.
 * Synthetic fixtures only; no invented provider APIs.
 */

import { describe, expect, it } from 'vitest';
import { ECONOMIC_LEDGER_BOUNDARY } from '@/lib/economy/types';
import {
  DEAL_INTELLIGENCE_ECONOMY_BOUNDARY,
  DEAL_INTELLIGENCE_PUBLICATION_BOUNDARY,
  DEAL_SCORE_VERSION,
  assertCapabilitySupported,
  assertDealDetectedDoesNotPublish,
  assertDealIntelligenceMoneyUntouched,
  assertCurrencyMatch,
  assertObservationCompatible,
  buildCouponObservation,
  buildDealDetectedEvent,
  buildDealScoreFromSignals,
  buildExactIdentity,
  buildPriceObservation,
  buildProbableIdentity,
  buildPromotionObservation,
  buildUnknownIdentity,
  computeDealScore,
  computeEffectivePrice,
  dedupeDealDetectedEvents,
  dedupeObservationsByIdempotency,
  isDealIntelligencePersistenceEnabled,
  isObservationStale,
  isSupplyWriteEnabledFromEnv,
  mayClaimHistoricalLow,
  promotionsConflict,
  resolveDealSourceCapabilities,
  resolveIdentityFromUrl,
  buildDealIntelligenceTruth,
} from '@/lib/dealIntelligence';
import { computeDealSignals } from '@/lib/hunter/supply/dealSignals';

const EVIDENCE = [{ kind: 'test', ref: 'fixture' }];

describe('Deal Intelligence — identity', () => {
  it('exact identity from Amazon URL', () => {
    const id = resolveIdentityFromUrl({
      url: 'https://www.amazon.com.mx/dp/B0TESTASIN',
    });
    // ASIN must be 10 chars — use valid pattern
    const id2 = resolveIdentityFromUrl({
      url: 'https://www.amazon.com.mx/dp/B08N5WRWNW',
    });
    expect(id2.identityStatus).toBe('exact');
    expect(id2.asin).toBe('B08N5WRWNW');
    expect(id2.productFingerprint).toBe('amz:B08N5WRWNW');
    expect(id.identityStatus === 'exact' || id.identityStatus === 'unknown').toBe(true);
  });

  it('exact identity from ML item URL', () => {
    const id = resolveIdentityFromUrl({
      url: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-foo',
    });
    expect(id.identityStatus).toBe('exact');
    expect(id.mlItemId).toBeTruthy();
    expect(id.productFingerprint?.startsWith('ml:')).toBe(true);
  });

  it('unknown identity for generic URL', () => {
    const id = resolveIdentityFromUrl({ url: 'https://example.com/product/xyz' });
    expect(id.identityStatus).toBe('unknown');
  });

  it('probable requires confidence + evidence else unknown', () => {
    const weak = buildProbableIdentity({
      merchant: 'x',
      confidence: 0.2,
      matchMethod: 'gtin',
      evidence: EVIDENCE,
      gtin: '123',
    });
    expect(weak.identityStatus).toBe('unknown');

    const ok = buildProbableIdentity({
      merchant: 'x',
      confidence: 0.8,
      matchMethod: 'gtin',
      evidence: EVIDENCE,
      gtin: '123',
    });
    expect(ok.identityStatus).toBe('probable');
    expect(ok.probableMatch?.confidence).toBe(0.8);
  });

  it('exact builder sets fingerprint', () => {
    const id = buildExactIdentity({ merchant: 'amazon', asin: 'B08N5WRWNW' });
    expect(id.identityStatus).toBe('exact');
    expect(id.productFingerprint).toBe('amz:B08N5WRWNW');
  });
});

describe('Deal Intelligence — price observation', () => {
  const identity = buildExactIdentity({ merchant: 'amazon', asin: 'B08N5WRWNW' });

  it('builds observation with idempotency', () => {
    const a = buildPriceObservation({
      identity,
      currency: 'MXN',
      salePrice: 100,
      observedAt: '2026-09-16T12:00:00.000Z',
      sourceId: 'amazon_paapi',
      captureMethod: 'official_api',
      extractionConfidence: 0.9,
      evidence: EVIDENCE,
    });
    const b = buildPriceObservation({
      identity,
      currency: 'MXN',
      salePrice: 100,
      observedAt: '2026-09-16T12:00:30.000Z',
      sourceId: 'amazon_paapi',
      captureMethod: 'official_api',
      extractionConfidence: 0.9,
      evidence: EVIDENCE,
    });
    expect('ok' in a && a.ok === false).toBe(false);
    expect('idempotencyKey' in a && 'idempotencyKey' in b).toBe(true);
    if ('idempotencyKey' in a && 'idempotencyKey' in b) {
      expect(a.idempotencyKey).toBe(b.idempotencyKey);
    }
  });

  it('rejects bad currency', () => {
    const r = buildPriceObservation({
      identity,
      currency: 'PESO',
      salePrice: 10,
      observedAt: '2026-09-16T12:00:00.000Z',
      sourceId: 'x',
      captureMethod: 'unknown',
      extractionConfidence: 0.5,
    });
    expect(r).toEqual({ ok: false, reason: 'currency_invalid' });
  });

  it('detects stale observation', () => {
    expect(
      isObservationStale({
        observedAt: '2026-09-01T00:00:00.000Z',
        now: new Date('2026-09-16T00:00:00.000Z'),
        maxAgeSeconds: 86400,
      }),
    ).toBe(true);
  });

  it('currency mismatch', () => {
    expect(assertCurrencyMatch('MXN', 'USD').ok).toBe(false);
  });

  it('variant mismatch', () => {
    const a = buildPriceObservation({
      identity: { ...identity, variantKey: '128gb' },
      currency: 'MXN',
      salePrice: 100,
      observedAt: '2026-09-16T12:00:00.000Z',
      sourceId: 'x',
      captureMethod: 'official_api',
      extractionConfidence: 1,
    });
    const b = buildPriceObservation({
      identity: { ...identity, variantKey: '256gb' },
      currency: 'MXN',
      salePrice: 100,
      observedAt: '2026-09-16T12:00:00.000Z',
      sourceId: 'x',
      captureMethod: 'official_api',
      extractionConfidence: 1,
    });
    expect('identity' in a && 'identity' in b).toBe(true);
    if ('identity' in a && 'identity' in b) {
      expect(assertObservationCompatible(a, b).reason).toBe('variant_mismatch');
    }
  });

  it('duplicate observations collapse', () => {
    const o = buildPriceObservation({
      identity,
      currency: 'MXN',
      salePrice: 50,
      observedAt: '2026-09-16T12:00:00.000Z',
      sourceId: 'x',
      captureMethod: 'official_api',
      extractionConfidence: 1,
    });
    expect('idempotencyKey' in o).toBe(true);
    if ('idempotencyKey' in o) {
      const { unique, duplicateKeys } = dedupeObservationsByIdempotency([o, o, o]);
      expect(unique).toHaveLength(1);
      expect(duplicateKeys).toHaveLength(2);
    }
  });

  it('never claims historical low without historyReady', () => {
    expect(mayClaimHistoricalLow(false)).toBe(false);
    expect(mayClaimHistoricalLow(true)).toBe(true);
  });
});

describe('Deal Intelligence — promotion / coupon', () => {
  it('rejects promotion without evidence', () => {
    const r = buildPromotionObservation({
      kind: 'percent',
      sourceId: 'x',
      observedAt: '2026-09-16T00:00:00.000Z',
      percentOff: 10,
      evidence: [],
      confidence: 0.9,
    });
    expect(r).toEqual({ ok: false, reason: 'promotion_missing_evidence' });
  });

  it('rejects expired coupon', () => {
    const r = buildCouponObservation({
      code: 'OLD',
      sourceId: 'x',
      observedAt: '2026-09-01T00:00:00.000Z',
      validUntil: '2026-09-10T00:00:00.000Z',
      amountOff: 50,
      evidence: EVIDENCE,
      confidence: 0.9,
      now: new Date('2026-09-16T00:00:00.000Z'),
    });
    expect(r).toEqual({ ok: false, reason: 'coupon_expired' });
  });

  it('conflicting same-kind promotions without stack flags', () => {
    const a = buildPromotionObservation({
      kind: 'percent',
      sourceId: 'x',
      observedAt: '2026-09-16T00:00:00.000Z',
      percentOff: 10,
      evidence: EVIDENCE,
      confidence: 0.9,
    });
    const b = buildPromotionObservation({
      kind: 'percent',
      sourceId: 'x',
      observedAt: '2026-09-16T00:00:00.000Z',
      percentOff: 15,
      evidence: EVIDENCE,
      confidence: 0.9,
    });
    expect('promotionId' in a && 'promotionId' in b).toBe(true);
    if ('promotionId' in a && 'promotionId' in b) {
      expect(promotionsConflict(a, b)).toBe(true);
    }
  });

  it('refuses effective price when stacking not evidenced', () => {
    const promo = buildPromotionObservation({
      kind: 'percent',
      sourceId: 'x',
      observedAt: '2026-09-16T00:00:00.000Z',
      percentOff: 10,
      evidence: EVIDENCE,
      confidence: 0.9,
    });
    const coupon = buildCouponObservation({
      code: 'SAVE',
      sourceId: 'x',
      observedAt: '2026-09-16T00:00:00.000Z',
      amountOff: 20,
      evidence: EVIDENCE,
      confidence: 0.9,
      now: new Date('2026-09-16T00:00:00.000Z'),
    });
    expect('promotionId' in promo && 'couponId' in coupon).toBe(true);
    if ('promotionId' in promo && 'couponId' in coupon) {
      const eff = computeEffectivePrice({
        basePrice: 1000,
        currency: 'MXN',
        promotions: [promo],
        coupons: [coupon],
      });
      expect(eff.ok).toBe(false);
      expect(eff.refusalReason).toBe('invalid_stacking_missing_evidence');
      expect(eff.effectivePrice).toBeNull();
    }
  });

  it('allows single promotion effective price', () => {
    const promo = buildPromotionObservation({
      kind: 'fixed_amount',
      sourceId: 'x',
      observedAt: '2026-09-16T00:00:00.000Z',
      amountOff: 100,
      evidence: EVIDENCE,
      confidence: 0.9,
    });
    expect('promotionId' in promo).toBe(true);
    if ('promotionId' in promo) {
      const eff = computeEffectivePrice({
        basePrice: 1000,
        currency: 'MXN',
        promotions: [promo],
      });
      expect(eff.ok).toBe(true);
      expect(eff.effectivePrice).toBe(900);
    }
  });

  it('allows stacked effective price with stacking evidence', () => {
    const stackEv = [{ kind: 'stack_rule', ref: 'merchant_policy' }];
    const promo = buildPromotionObservation({
      kind: 'percent',
      sourceId: 'x',
      observedAt: '2026-09-16T00:00:00.000Z',
      percentOff: 10,
      evidence: EVIDENCE,
      confidence: 0.9,
      stackingEvidence: stackEv,
    });
    const coupon = buildCouponObservation({
      code: 'SAVE',
      sourceId: 'x',
      observedAt: '2026-09-16T00:00:00.000Z',
      amountOff: 50,
      evidence: EVIDENCE,
      confidence: 0.9,
      now: new Date('2026-09-16T00:00:00.000Z'),
      stackingEvidence: stackEv,
    });
    if ('promotionId' in promo && 'couponId' in coupon) {
      const eff = computeEffectivePrice({
        basePrice: 1000,
        currency: 'MXN',
        promotions: [promo],
        coupons: [coupon],
      });
      expect(eff.ok).toBe(true);
      expect(eff.effectivePrice).toBe(850);
    }
  });
});

describe('Deal Intelligence — deal score', () => {
  it('is deterministic for same inputs', () => {
    const input = {
      meta: { discountPrice: 800, originalPrice: 1000, discountPercent: 20 },
      signals: {
        historyReady: true,
        effectiveDiscountPercent: 20,
        priceLowest90d: 750,
        habitual30d: 1000,
        priceVsLowest90dPct: 6.6,
        savingsVsHabitualPct: 20,
        suspectedArtificialListPrice: false,
      } as Parameters<typeof computeDealSignals>[0]['signals'],
    };
    const a = computeDealScore(input);
    const b = computeDealScore(input);
    expect(a.score).toBe(b.score);
    expect(a.version).toBe(DEAL_SCORE_VERSION);
    expect(a.reasons).toEqual(b.reasons);
  });

  it('does not claim historical low without history', () => {
    const signals = computeDealSignals({
      meta: { discountPrice: 100, originalPrice: 200, discountPercent: 50 },
      signals: {
        historyReady: false,
        suspectedArtificialListPrice: false,
      } as Parameters<typeof computeDealSignals>[0]['signals'],
    });
    const score = buildDealScoreFromSignals(signals);
    expect(score.historicalLowClaimed).toBe(false);
    expect(score.warnings).toContain('insufficient_price_history');
  });
});

describe('Deal Intelligence — deal.detected', () => {
  it('idempotent replay', () => {
    const identity = buildExactIdentity({ merchant: 'amazon', asin: 'B08N5WRWNW' });
    const score = computeDealScore({
      meta: { discountPrice: 100 },
      signals: { historyReady: false } as Parameters<typeof computeDealSignals>[0]['signals'],
    });
    const e1 = buildDealDetectedEvent({
      productIdentity: identity,
      sourceId: 'amazon_paapi',
      observedAt: '2026-09-16T12:00:00.000Z',
      dealScore: score,
      confidence: score.confidence,
    });
    const e2 = buildDealDetectedEvent({
      productIdentity: identity,
      sourceId: 'amazon_paapi',
      observedAt: '2026-09-16T12:00:10.000Z',
      dealScore: score,
      confidence: score.confidence,
    });
    expect(e1.idempotencyKey).toBe(e2.idempotencyKey);
    expect(e1.publicationAllowed).toBe(false);
    assertDealDetectedDoesNotPublish(e1);
    const { unique, duplicateKeys } = dedupeDealDetectedEvents([e1, e2]);
    expect(unique).toHaveLength(1);
    expect(duplicateKeys).toHaveLength(1);
  });
});

describe('Deal Intelligence — source capabilities', () => {
  it('UNKNOWN remains UNKNOWN for day-to-day', () => {
    const caps = resolveDealSourceCapabilities({ id: 'walmart_mx' });
    expect(caps.priceObservation).toBe('UNKNOWN');
    expect(caps.economicReporting).toBe('UNSUPPORTED');
  });

  it('Amazon economic reporting UNSUPPORTED', () => {
    const caps = resolveDealSourceCapabilities({ id: 'amazon_paapi' });
    expect(caps.economicReporting).toBe('UNSUPPORTED');
    expect(assertCapabilitySupported(caps, 'economicReporting').ok).toBe(false);
    expect(assertCapabilitySupported(caps, 'api').ok).toBe(true);
  });

  it('unsupported provider stays fail-closed', () => {
    const caps = resolveDealSourceCapabilities({ id: 'partner_unknown' });
    expect(caps.priceObservation).toBe('UNKNOWN');
    expect(assertCapabilitySupported(caps, 'priceObservation').ok).toBe(false);
  });
});

describe('Deal Intelligence — money / supply / publish safety', () => {
  it('money path untouched', () => {
    const r = assertDealIntelligenceMoneyUntouched();
    expect(r.ok).toBe(true);
    expect(ECONOMIC_LEDGER_BOUNDARY.settlementEnabled).toBe(false);
    expect(DEAL_INTELLIGENCE_ECONOMY_BOUNDARY.settlementEnabled).toBe(false);
    expect(DEAL_INTELLIGENCE_ECONOMY_BOUNDARY.writesLedger).toBe(false);
    expect(DEAL_INTELLIGENCE_ECONOMY_BOUNDARY.writesRewards).toBe(false);
    expect(DEAL_INTELLIGENCE_ECONOMY_BOUNDARY.writesPayouts).toBe(false);
  });

  it('Supply WRITE not enabled by DI', () => {
    const prev = process.env.SUPPLY_ENGINE_WRITE;
    process.env.SUPPLY_ENGINE_WRITE = '0';
    expect(isSupplyWriteEnabledFromEnv()).toBe(false);
    process.env.SUPPLY_ENGINE_WRITE = prev;
  });

  it('no auto-publish boundary', () => {
    expect(DEAL_INTELLIGENCE_PUBLICATION_BOUNDARY.autoPublish).toBe(false);
    expect(DEAL_INTELLIGENCE_PUBLICATION_BOUNDARY.bypassesDqe).toBe(false);
  });

  it('persistence default OFF', () => {
    const prev = process.env.DEAL_INTELLIGENCE_ENABLED;
    delete process.env.DEAL_INTELLIGENCE_ENABLED;
    expect(isDealIntelligencePersistenceEnabled()).toBe(false);
    process.env.DEAL_INTELLIGENCE_ENABLED = prev;
  });

  it('CEO truth NOT_CONNECTED by default (not $0)', () => {
    const snap = buildDealIntelligenceTruth();
    expect(snap.connection).toBe('NOT_CONNECTED');
    expect(snap.economicDataSettleable).toBe(false);
    expect(snap.autoPublish).toBe(false);
    expect(snap.metrics.dealsDetectedHour).toBeNull();
  });

  it('CONNECTED_ZERO when readOk and zero SoT rows', () => {
    const snap = buildDealIntelligenceTruth({
      readOk: true,
      offerSnapshotsTotal: 0,
      priceMemoryTotal: 0,
    });
    expect(snap.connection).toBe('CONNECTED_ZERO');
    expect(snap.persistenceEnabled).toBe(false);
  });

  it('CONNECTED_WITH_DATA when readOk and SoT rows exist', () => {
    const snap = buildDealIntelligenceTruth({
      readOk: true,
      offerSnapshotsTotal: 3,
      priceMemoryTotal: 10,
      identityExact: 8,
      identityUnknown: 2,
      fresh: 9,
      stale: 1,
    });
    expect(snap.connection).toBe('CONNECTED_WITH_DATA');
    expect(snap.identity.exactPct).toBe(80);
  });

  it('persistence flag stays OFF by default', () => {
    const prev = process.env.DEAL_INTELLIGENCE_ENABLED;
    delete process.env.DEAL_INTELLIGENCE_ENABLED;
    expect(isDealIntelligencePersistenceEnabled()).toBe(false);
    const snap = buildDealIntelligenceTruth({
      readOk: true,
      offerSnapshotsTotal: 5,
      priceMemoryTotal: 0,
    });
    expect(snap.persistenceEnabled).toBe(false);
    process.env.DEAL_INTELLIGENCE_ENABLED = prev;
  });

  it('unknown identity helper available', () => {
    expect(buildUnknownIdentity().identityStatus).toBe('unknown');
  });
});
