/**
 * P0.2 — PriceObservation read bridge + telemetry contracts.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  assertDealDetectedDoesNotPublish,
  assertDealIntelligenceMoneyUntouched,
  assertTelemetryHasNoPii,
  buildDealDetectedEvent,
  buildDealIntelligenceTruth,
  computeEffectivePrice,
  getDealIntelligenceTelemetry,
  isDealIntelligencePersistenceEnabled,
  isSupplyWriteEnabledFromEnv,
  mapOfferPriceSnapshotToObservation,
  mapPriceMemorySnapshotToObservation,
  mayClaimHistoricalLow,
  observationToDealDetectedCandidate,
  redactTelemetryValue,
  recordMappedObservation,
  resetDealIntelligenceTelemetry,
  DEAL_INTELLIGENCE_PUBLICATION_BOUNDARY,
  DEAL_SCORE_VERSION,
  computeDealScore,
} from '@/lib/dealIntelligence';
import { ECONOMIC_LEDGER_BOUNDARY } from '@/lib/economy/types';

beforeEach(() => {
  resetDealIntelligenceTelemetry();
});

describe('P0.2 offer_price_snapshots → PriceObservation', () => {
  const baseRow = {
    id: '11111111-1111-1111-1111-111111111111',
    offer_id: '22222222-2222-2222-2222-222222222222',
    price: 199.5,
    original_price: 249,
    source: 'health' as const,
    recorded_at: '2026-09-16T12:00:00.000Z',
  };

  it('maps snapshot with currency hint + unknown identity without fingerprint', () => {
    const r = mapOfferPriceSnapshotToObservation(baseRow, { currencyHint: 'MXN' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.observation.salePrice).toBe(199.5);
    expect(r.observation.listPrice).toBe(249);
    expect(r.observation.effectivePrice).toBeNull();
    expect(r.observation.identity.identityStatus).toBe('unknown');
    expect(r.observation.backendHint).toBe('offer_price_snapshots');
    expect(r.observation.currency).toBe('MXN');
  });

  it('exact identity when fingerprint amz provided', () => {
    const r = mapOfferPriceSnapshotToObservation(baseRow, {
      currencyHint: 'MXN',
      productFingerprint: 'amz:B08N5WRWNW',
      store: 'amazon',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.observation.identity.identityStatus).toBe('exact');
    expect(r.observation.identity.asin).toBe('B08N5WRWNW');
  });

  it('missing currency → currency_unknown', () => {
    const r = mapOfferPriceSnapshotToObservation(baseRow);
    expect(r).toEqual({ ok: false, reason: 'currency_unknown' });
  });

  it('invalid price rejected', () => {
    const r = mapOfferPriceSnapshotToObservation(
      { ...baseRow, price: -1 },
      { currencyHint: 'MXN' },
    );
    expect(r).toEqual({ ok: false, reason: 'invalid_price' });
  });

  it('listPrice vs salePrice separated; no auto coupon stacking', () => {
    const r = mapOfferPriceSnapshotToObservation(baseRow, { currencyHint: 'MXN' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.observation.salePrice).not.toBe(r.observation.listPrice);
    expect(r.observation.effectivePrice).toBeNull();
    const eff = computeEffectivePrice({
      basePrice: r.observation.salePrice!,
      currency: 'MXN',
      promotions: [],
      coupons: [],
    });
    expect(eff.ok).toBe(true);
    expect(eff.effectivePrice).toBe(r.observation.salePrice);
  });

  it('adapter determinism for same row', () => {
    const a = mapOfferPriceSnapshotToObservation(baseRow, { currencyHint: 'MXN' });
    const b = mapOfferPriceSnapshotToObservation(baseRow, { currencyHint: 'MXN' });
    expect(a).toEqual(b);
  });
});

describe('P0.2 Price Memory → PriceObservation', () => {
  const row = {
    id: '33333333-3333-3333-3333-333333333333',
    marketplace: 'mercadolibre',
    product_id: 'MLM1234567890',
    last_price: 500,
    min_price: 480,
    list_price: 600,
    regular_price: 590,
    currency: 'MXN',
    recorded_on: '2026-09-16',
    recorded_at: '2026-09-16T18:00:00.000Z',
  };

  it('maps to exact ML identity', () => {
    const r = mapPriceMemorySnapshotToObservation(row);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.observation.identity.identityStatus).toBe('exact');
    expect(r.observation.identity.mlItemId).toBe('MLM1234567890');
    expect(r.observation.salePrice).toBe(500);
    expect(r.observation.listPrice).toBe(600);
    expect(r.observation.effectivePrice).toBeNull();
    expect(r.observation.backendHint).toBe('product_price_snapshots');
    // min_price is evidence only — not historical low claim
    expect(r.observation.evidence.some((e) => e.kind === 'day_min_price')).toBe(true);
  });

  it('rejects unsupported marketplace', () => {
    const r = mapPriceMemorySnapshotToObservation({ ...row, marketplace: 'amazon' });
    expect(r).toEqual({ ok: false, reason: 'unsupported_marketplace' });
  });

  it('unknown identity for short product id', () => {
    const r = mapPriceMemorySnapshotToObservation({ ...row, product_id: 'x' });
    expect(r).toEqual({ ok: false, reason: 'unknown_identity' });
  });

  it('no fake historical low from mapper', () => {
    expect(mayClaimHistoricalLow(false)).toBe(false);
    const r = mapPriceMemorySnapshotToObservation(row);
    expect(r.ok).toBe(true);
  });
});

describe('P0.2 stale / variant / deal.detected candidate', () => {
  it('stale flagged via freshnessSeconds age', () => {
    const r = mapOfferPriceSnapshotToObservation(
      {
        offer_id: '22222222-2222-2222-2222-222222222222',
        price: 10,
        recorded_at: '2026-01-01T00:00:00.000Z',
      },
      { currencyHint: 'MXN' },
      { now: new Date('2026-09-16T00:00:00.000Z') },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.observation.freshnessSeconds).toBeGreaterThan(7 * 24 * 3600);
  });

  it('variant remains unknown (null) from SoT rows', () => {
    const r = mapPriceMemorySnapshotToObservation({
      marketplace: 'mercadolibre',
      product_id: 'MLM1234567890',
      last_price: 1,
      currency: 'MXN',
      recorded_on: '2026-09-16',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.observation.variantKey).toBeNull();
  });

  it('observation → deal.detected candidate with publicationAllowed false', () => {
    const mapped = mapPriceMemorySnapshotToObservation({
      marketplace: 'mercadolibre',
      product_id: 'MLM1234567890',
      last_price: 100,
      currency: 'MXN',
      recorded_on: '2026-09-16',
      recorded_at: '2026-09-16T12:00:00.000Z',
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    const cand = observationToDealDetectedCandidate(mapped.observation);
    expect(cand.publicationAllowed).toBe(false);
    const score = computeDealScore({
      meta: { discountPrice: mapped.observation.salePrice },
      signals: { historyReady: false },
    });
    expect(score.version).toBe(DEAL_SCORE_VERSION);
    const evt = buildDealDetectedEvent({
      productIdentity: cand.productIdentity,
      sourceId: cand.sourceId,
      observedAt: cand.observedAt,
      priceObservation: cand.priceObservation,
      dealScore: score,
    });
    assertDealDetectedDoesNotPublish(evt);
    expect(DEAL_INTELLIGENCE_PUBLICATION_BOUNDARY.autoPublish).toBe(false);
  });
});

describe('P0.2 telemetry', () => {
  it('counters increment without PII', () => {
    recordMappedObservation({
      ok: true,
      sourceId: 'price_memory_ml',
      identityStatus: 'exact',
      stale: false,
      variantUnknown: true,
    });
    recordMappedObservation({ ok: false, reason: 'currency_unknown' });
    const t = getDealIntelligenceTelemetry();
    expect(t.observations_read).toBe(2);
    expect(t.observations_valid).toBe(1);
    expect(t.observations_invalid).toBe(1);
    expect(t.identity_exact).toBe(1);
    expect(t.currency_unknown).toBe(1);
    expect(assertTelemetryHasNoPii(t).ok).toBe(true);
  });

  it('redacts URLs in telemetry values', () => {
    expect(redactTelemetryValue('https://user:pass@evil.example/secret?x=1')).toMatch(/…|redacted/);
    expect(redactTelemetryValue('user@host.com')).toBe('[redacted]');
  });
});

describe('P0.2 CEO truth + safety', () => {
  it('zero-data connected state', () => {
    const snap = buildDealIntelligenceTruth({
      readOk: true,
      offerSnapshotsTotal: 0,
      priceMemoryTotal: 0,
    });
    expect(snap.connection).toBe('CONNECTED_ZERO');
  });

  it('connected-with-data state', () => {
    const snap = buildDealIntelligenceTruth({
      readOk: true,
      offerSnapshotsTotal: 2,
      priceMemoryTotal: 5,
      identityExact: 5,
      identityUnknown: 2,
    });
    expect(snap.connection).toBe('CONNECTED_WITH_DATA');
    expect(snap.economicDataAvailable).toBe(false);
  });

  it('feature flag OFF + money + supply', () => {
    delete process.env.DEAL_INTELLIGENCE_ENABLED;
    expect(isDealIntelligencePersistenceEnabled()).toBe(false);
    assertDealIntelligenceMoneyUntouched();
    expect(ECONOMIC_LEDGER_BOUNDARY.settlementEnabled).toBe(false);
    process.env.SUPPLY_ENGINE_WRITE = '0';
    expect(isSupplyWriteEnabledFromEnv()).toBe(false);
  });
});
