import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ATTRIBUTION_OUTBOUND_SOURCE, VOLUME_OUTBOUND_SOURCE } from '@/lib/intelligence/analytics/roles';
import { communitySignal } from '@/lib/intelligence/community/signal';
import { buildShadowDecision } from '@/lib/intelligence/decisions/shadow';
import { clampDecisionStage, stageIsAllowed } from '@/lib/intelligence/decisions/stage';
import { demandSignal } from '@/lib/intelligence/demand/signal';
import { explainOfferLineage } from '@/lib/intelligence/lineage/explain';
import { buildPersonalizationFoundation } from '@/lib/intelligence/personalization/foundation';
import { priceDecisionSignal } from '@/lib/intelligence/price/decision';
import { summarizePricePoints } from '@/lib/intelligence/price/summarize';
import { classifyPricePoint } from '@/lib/intelligence/quality/pricePoint';
import { compareRankShadow, scoreIntelligenceRank } from '@/lib/intelligence/ranking/features';
import { pipelineDurations } from '@/lib/intelligence/speed/durations';
import { SUPPLY_PRIORITY_ACTIVATES_SCHEDULER, SUPPLY_PRIORITY_STAGE } from '@/lib/intelligence/supply/yield';
import { selectFairFreshnessBatch } from '@/lib/offers/freshness/priority';
import { evaluateMachineLiveInsertEligibility, isMachinePendingWriteEnabled } from '@/lib/bots/ingest/machineLiveInsertEligibility';
import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';

const now = new Date('2026-09-23T18:00:00.000Z');

describe('shadow rank', () => {
  it('explains a different order and does not apply it to the feed', () => {
    const hotVotes = scoreIntelligenceRank({
      offerId: 'votes',
      currentScore: 1,
      community: { upVotes: 12, downVotes: 0 },
    });
    const highBlend = scoreIntelligenceRank({
      offerId: 'blend',
      currentScore: 100,
      community: { upVotes: 0, downVotes: 0 },
    });
    const comparison = compareRankShadow([highBlend, hotVotes]);
    expect(comparison.appliedToFeed).toBe(false);
    expect(comparison.currentOrder[0]).toBe('blend');
    expect(comparison.intelligenceOrder[0]).toBe('votes');
    expect(comparison.divergence).toContain('blend');
    expect(hotVotes.explanations.find((row) => row.feature === 'conversion_signal')?.mode).toBe('disabled');
  });

  it('does not treat a high price anomaly as a deal', () => {
    const knowledge = summarizePricePoints({
      now,
      points: [
        ...Array.from({ length: 7 }, (_, index) => ({
          observedAt: `2026-09-${16 + index}T12:00:00.000Z`,
          price: 100,
          listPrice: null,
          currency: 'MXN',
          source: 'health',
        })),
        {
          observedAt: '2026-09-23T12:00:00.000Z',
          price: 500,
          listPrice: null,
          currency: 'MXN',
          source: 'health',
        },
      ],
    });
    const decision = priceDecisionSignal(knowledge);
    expect(decision.anomalyIsDeal).toBe(false);
    expect(decision.signal).toBe('suspicious_high');
    const rank = scoreIntelligenceRank({
      offerId: 'spike',
      currentScore: 10,
      community: { upVotes: 0, downVotes: 0 },
      price: {
        confidence: knowledge.confidence,
        anomaly: knowledge.anomaly,
        trend: knowledge.trend,
        discountDepth: knowledge.discountDepth,
        samples: knowledge.evidence.samples,
      },
    });
    expect(rank.explanations.find((row) => row.feature === 'price_quality')?.reason).toContain('suspicious');
  });

  it('refuses enabled and keeps supply ranking off the scheduler', () => {
    expect(stageIsAllowed('ranking_intelligence', 'enabled')).toBe(false);
    expect(clampDecisionStage('price_anomaly', 'shadow')).toBe('observe');
    expect(SUPPLY_PRIORITY_STAGE).toBe('shadow');
    expect(SUPPLY_PRIORITY_ACTIVATES_SCHEDULER).toBe(false);
    expect(readFileSync('lib/hunter/supply/engine.ts', 'utf8')).not.toContain('rankSourcesForNextLook');
    expect(readFileSync('lib/offers/feedService.ts', 'utf8')).not.toContain('lib/intelligence');
    expect(readFileSync('lib/offers/scoring.ts', 'utf8')).not.toContain('lib/intelligence');
  });
});

describe('community and demand signals', () => {
  it('needs several votes and does not mint', () => {
    expect(communitySignal({ upVotes: 1, downVotes: 0 }).value).toBeNull();
    expect(communitySignal({ upVotes: 1, downVotes: 0 }).canMint).toBe(false);
    const split = communitySignal({ upVotes: 4, downVotes: 4, reports: 3 });
    expect(split.disagreement).toBe(true);
    expect(split.confidence).toBeLessThan(communitySignal({ upVotes: 8, downVotes: 0 }).confidence);
  });

  it('does not call two outbound clicks popularity', () => {
    expect(demandSignal({ views: 2, outbound: 2, votes: 0, saves: 0, comments: 0 }).value).toBeNull();
    expect(demandSignal({ views: 10, outbound: 2, votes: 1, saves: 0, comments: 0 }).reason).toBe(
      'rate_not_raw_clicks',
    );
  });
});

describe('lineage, personalization, speed, quality', () => {
  it('keeps missing hops empty and personalization off the feed', () => {
    const hops = explainOfferLineage({ sourceId: 'ml', outcome: null });
    expect(hops.find((hop) => hop.layer === 'source')?.missing).toBe(false);
    expect(hops.find((hop) => hop.layer === 'outcome')?.missing).toBe(true);
    const profile = buildPersonalizationFoundation([
      { category: 'audio', retailer: 'amazon', price: 500, negative: false },
      { category: 'audio', retailer: 'amazon', price: 700, negative: false },
      { category: 'audio', retailer: 'noisy', price: 100, negative: true },
      { category: 'audio', retailer: 'noisy', price: 100, negative: true },
      { category: null, retailer: 'amazon', price: 900, negative: false },
      { category: null, retailer: 'amazon', price: 1100, negative: false },
    ]);
    expect(profile.appliedToFeed).toBe(false);
    expect(profile.storesSensitiveAttributes).toBe(false);
    expect(profile.negativeRetailers).toContain('noisy');
    expect(profile.priceBand).not.toBeNull();
  });

  it('measures only forward timestamps and drops impossible prices', () => {
    expect(
      pipelineDurations({
        discoveredAt: '2026-09-23T10:00:00.000Z',
        verifiedAt: '2026-09-23T12:00:00.000Z',
      }).timeToVerificationHours,
    ).toBe(2);
    expect(pipelineDurations({ publishedAt: '2026-09-23T10:00:00.000Z' }).timeToPublicationHours).toBeNull();
    expect(pipelineDurations({}).autoPublish).toBe(false);
    expect(classifyPricePoint({ price: -1, currency: 'MXN', observedAt: now.toISOString() }, now)).toBe('blocking');
    expect(
      classifyPricePoint({ price: 10, currency: 'MXN', observedAt: '2026-09-24T00:00:00.000Z' }, now),
    ).toBe('blocking');
    const knowledge = summarizePricePoints({
      now,
      points: [
        { observedAt: now.toISOString(), price: 0, listPrice: null, currency: 'MXN', source: 'health' },
        { observedAt: now.toISOString(), price: 50, listPrice: null, currency: 'MXN', source: 'health' },
      ],
    });
    expect(knowledge.current).toBe(50);
    expect(knowledge.notes.some((note) => note.startsWith('warning_points_excluded'))).toBe(true);
  });
});

describe('freshness fairness', () => {
  it('keeps an old second store in the batch when one retailer has all the score', () => {
    const amazon = Array.from({ length: 10 }, (_, index) => ({
      id: `amazon-${index}`,
      score: 100,
      storeKey: 'amazon',
      dueAt: '2026-09-23T00:00:00.000Z',
    }));
    const walmart = [0, 1].map((index) => ({
      id: `walmart-${index}`,
      score: 1,
      storeKey: 'walmart',
      dueAt: `2026-09-0${index + 1}T00:00:00.000Z`,
    }));
    const fair = selectFairFreshnessBatch([...amazon, ...walmart], 8);
    expect(fair.ids).toContain('walmart-0');
    expect(fair.ids).toContain('walmart-1');
    expect(fair.storeCapped).toBeGreaterThan(0);
  });
});

describe('sacred invariants', () => {
  it('fails closed on money, machine writes, and missing gate input', () => {
    const previousVercel = process.env.VERCEL_ENV;
    const previousMoney = process.env.MONEY_PATH_FROZEN;
    const previousWrites = process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    try {
      process.env.VERCEL_ENV = 'production';
      delete process.env.MONEY_PATH_FROZEN;
      delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
      expect(isMoneyPathFrozen()).toBe(true);
      expect(isMachinePendingWriteEnabled()).toBe(false);
    } finally {
      if (previousVercel === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = previousVercel;
      if (previousMoney === undefined) delete process.env.MONEY_PATH_FROZEN;
      else process.env.MONEY_PATH_FROZEN = previousMoney;
      if (previousWrites === undefined) delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
      else process.env.BOT_INGEST_MACHINE_PENDING_WRITES = previousWrites;
    }

    const eligibility = evaluateMachineLiveInsertEligibility({
      url: 'https://example.com/item',
      meta: null,
      config: {} as never,
      verifierDecision: 'reject',
    });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.wouldInsert).toBe(false);
    expect(readFileSync('lib/supply/s7Bridge/writePendingViaS7Bridge.ts', 'utf8')).toContain(
      'isMachinePendingWriteEnabled',
    );
    expect(VOLUME_OUTBOUND_SOURCE).not.toBe(ATTRIBUTION_OUTBOUND_SOURCE);
    expect(buildShadowDecision({
      system: 'ranking_intelligence',
      version: 'rank-intel-v1',
      decision: 'order_unchanged',
      evidence: [],
      subjectKey: 'a',
      decidedAt: '2026-09-23T00:00:00.000Z',
    }).mutatesProduction).toBe(false);
  });
});
