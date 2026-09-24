import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDemandFeatures, clampDemandWindowHours } from '@/lib/intelligence/demand/features';
import { FLYWHEEL_LINKS } from '@/lib/intelligence/flywheel/contracts';
import { pointsFromObservations } from '@/lib/intelligence/price/fromObservations';
import { priceRollupKey, summarizePricePoints } from '@/lib/intelligence/price/summarize';
import {
  OFFER_SNAPSHOT_RETAIN_DAYS,
  recommendedPriceReadStrategy,
  shouldDropRawOfferSnapshot,
} from '@/lib/intelligence/scale';
import { rankSourcesForNextLook, summarizeSourceRuns } from '@/lib/intelligence/supply/yield';
import {
  TRANSACTION_FOUNDATION_MODE,
  assertNoDuplicateIdentity,
  buildAttributionObservation,
  buildCommissionObservation,
  buildConversionObservation,
  buildSettlementRefusal,
  canPromoteLayer,
} from '@/lib/intelligence/transaction/economicEvent';
import type { PriceObservation } from '@/lib/dealIntelligence/types';

const now = new Date('2026-09-23T18:00:00.000Z');

function point(day: string, price: number, extra?: { listPrice?: number; currency?: string; source?: string }) {
  return {
    observedAt: `${day}T12:00:00.000Z`,
    price,
    listPrice: extra?.listPrice ?? null,
    currency: extra?.currency ?? 'MXN',
    source: extra?.source ?? 'health',
  };
}

describe('price knowledge', () => {
  it('keeps current, median, trend, duration and discount depth on one currency', () => {
    const knowledge = summarizePricePoints({
      now,
      points: [
        point('2026-09-16', 100, { listPrice: 120 }),
        point('2026-09-17', 100, { listPrice: 120 }),
        point('2026-09-18', 100),
        point('2026-09-19', 100),
        point('2026-09-20', 80, { listPrice: 120 }),
        point('2026-09-21', 80),
        point('2026-09-22', 80),
        point('2026-09-23', 80),
      ],
    });

    expect(knowledge.currency).toBe('MXN');
    expect(knowledge.current).toBe(80);
    expect(knowledge.min).toBe(80);
    expect(knowledge.max).toBe(100);
    expect(knowledge.median).toBe(90);
    expect(knowledge.trend).toBe('down');
    expect(knowledge.priceChanges).toBe(1);
    expect(knowledge.priceDurationDays).toBe(4);
    expect(knowledge.discountFrequencyMethod).toBe('list_vs_sale');
    expect(knowledge.discountDepth).toBeCloseTo(0.1111, 3);
    expect(knowledge.confidence).toBeGreaterThan(0);
    expect(knowledge.freshnessHours).toBe(6);
  });

  it('flags a high outlier only after eight samples', () => {
    const flat = Array.from({ length: 7 }, (_, index) => point(`2026-09-${16 + index}`, 100));
    const knowledge = summarizePricePoints({
      now,
      points: [...flat, point('2026-09-23', 500)],
    });
    expect(knowledge.anomaly).toBe('high');
    expect(summarizePricePoints({ now, points: flat }).anomaly).toBe('insufficient');
  });

  it('refuses mixed currencies', () => {
    const knowledge = summarizePricePoints({
      now,
      points: [point('2026-09-22', 10, { currency: 'MXN' }), point('2026-09-23', 10, { currency: 'USD' })],
    });
    expect(knowledge.confidence).toBe(0);
    expect(knowledge.current).toBeNull();
    expect(knowledge.notes[0]).toContain('currency_mixed');
  });

  it('chooses a read strategy by volume and keeps raw rows until a rollup exists', () => {
    expect(recommendedPriceReadStrategy(1_000)).toBe('point_read');
    expect(recommendedPriceReadStrategy(100_000)).toBe('point_read_plus_rollup');
    expect(recommendedPriceReadStrategy(10_000_000)).toBe('partition_and_rollup');
    expect(shouldDropRawOfferSnapshot({ ageDays: OFFER_SNAPSHOT_RETAIN_DAYS + 1, rollupExists: false })).toBe(false);
    expect(shouldDropRawOfferSnapshot({ ageDays: OFFER_SNAPSHOT_RETAIN_DAYS + 1, rollupExists: true })).toBe(true);
    expect(priceRollupKey({ subjectType: 'offer', subjectKey: 'a', windowDays: 90, asOfDate: '2026-09-23' })).toBe(
      'offer:a:90:2026-09-23',
    );
  });
});

describe('supply yield', () => {
  it('ranks reliable verified sources ahead of noisy ones', () => {
    const [good, noisy] = summarizeSourceRuns([
      {
        sourceId: 'good',
        sourceFamily: 'catalog',
        sourceLane: 'community',
        status: 'ok',
        startedAt: '2026-09-23T10:00:00.000Z',
        candidatesDiscovered: 10,
        candidatesQualified: 8,
        verifiedDeals: 4,
        duplicates: 1,
        catalogOnly: 0,
        rejected: 1,
        pending: 0,
        errors: 0,
        durationMs: 100,
      },
      {
        sourceId: 'noisy',
        sourceFamily: 'catalog',
        sourceLane: 'community',
        status: 'failed',
        startedAt: '2026-09-23T11:00:00.000Z',
        candidatesDiscovered: 10,
        candidatesQualified: 2,
        verifiedDeals: 0,
        duplicates: 6,
        catalogOnly: 2,
        rejected: 8,
        pending: 0,
        errors: 3,
        durationMs: 900,
      },
    ]);
    expect(good?.sourceId).toBe('good');
    expect(good?.discoveryYield).toBe(0.4);
    expect(good?.falsePositiveRate).toBe(0.2);
    expect(good?.medianLatencyMs).toBe(100);
    expect(noisy?.reliability).toBe(0);
    expect(rankSourcesForNextLook([good!, noisy!])).toEqual(['good']);
  });
});

describe('demand features', () => {
  it('aggregates counts without user identity and does not rank the feed', () => {
    const features = buildDemandFeatures([
      {
        offerId: 'hot',
        category: 'audio',
        retailer: 'amazon',
        views: 10,
        outbound: 2,
        votes: 3,
        saves: 1,
        comments: 0,
      },
      {
        offerId: 'cold',
        category: 'audio',
        retailer: null,
        views: 10,
        outbound: 0,
        votes: 0,
        saves: 0,
        comments: 0,
      },
    ]);
    expect(features.windowNote).toBe('counts_only_no_user_ids');
    expect(features.attractiveOfferIds).toEqual(['hot']);
    expect(features.byCategory[0]?.key).toBe('audio');
    expect(features.byRetailer.find((row) => row.key === 'unknown')?.offers).toBe(1);
    expect(JSON.stringify(features)).not.toMatch(/"email"|"user_id"|"userId"/);
    expect(clampDemandWindowHours(500)).toBe(168);
    expect(clampDemandWindowHours(0)).toBe(24);
  });
});

describe('transaction foundation', () => {
  it('stays observe-only and refuses cross-layer authority', () => {
    expect(TRANSACTION_FOUNDATION_MODE).toBe('observe_only');
    expect(canPromoteLayer('attribution', 'settlement')).toBe(false);
    expect(canPromoteLayer('conversion', 'commission')).toBe(false);
    const click = buildAttributionObservation({
      offerId: 'o1',
      clickId: 'c1',
      timestamp: now.toISOString(),
      source: 'outbound',
      idempotencyKey: 'idem-1',
    });
    expect(click.state).toBe('observed');
    expect(click.evidenceRef).toBe('c1');
    expect(buildConversionObservation({ correlationId: 'offer:o1', timestamp: now.toISOString() }).state).toBe(
      'not_connected',
    );
    expect(buildCommissionObservation('offer:o1', now.toISOString()).state).toBe('not_connected');
    expect(buildSettlementRefusal('offer:o1', now.toISOString()).state).toBe('rejected');
    expect(
      assertNoDuplicateIdentity([click, { ...click }]).duplicate,
    ).toBe('attribution:idem-1');
  });
});

describe('flywheel contracts', () => {
  it('records every link and keeps ranking off the new features', () => {
    expect(FLYWHEEL_LINKS.length).toBeGreaterThan(0);
    for (const link of FLYWHEEL_LINKS) {
      expect(link.crosses.length).toBeGreaterThan(0);
      expect(link.owner.length).toBeGreaterThan(0);
      expect(link.schema.length).toBeGreaterThan(0);
      expect(link.status).toMatch(/connected|partial|broken/);
    }
    const demandToSupply = FLYWHEEL_LINKS.find((link) => link.from === 'demand' && link.to === 'supply_discovery');
    expect(demandToSupply?.status).toBe('broken');

    const scoring = readFileSync('lib/offers/scoring.ts', 'utf8');
    const feed = readFileSync('lib/offers/feedService.ts', 'utf8');
    const money = readFileSync('lib/server/moneyPathFreeze.ts', 'utf8');
    const foundation = readFileSync('lib/intelligence/transaction/economicEvent.ts', 'utf8');
    expect(scoring).not.toMatch(/lib\/intelligence/);
    expect(feed).not.toMatch(/lib\/intelligence/);
    expect(money).not.toMatch(/lib\/intelligence/);
    expect(foundation).toContain("observe_only");
    expect(foundation).not.toMatch(/economic_ledger|reward_ledger|settlement_bridge/);
  });
});

describe('observation mapping', () => {
  it('drops observations without a sale price', () => {
    const observation = {
      salePrice: null,
      listPrice: 10,
      observedAt: now.toISOString(),
      currency: 'MXN',
      sourceId: 'health',
    } as PriceObservation;
    expect(pointsFromObservations([observation])).toEqual([]);
  });
});
