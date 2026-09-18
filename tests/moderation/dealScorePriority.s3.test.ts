/**
 * S3 — DealScore → Moderation Focus priority.
 * Pure unit tests: ranking only; never approve/publish/claim.
 */

import { describe, expect, it } from 'vitest';
import { DEAL_SCORE_VERSION } from '@/lib/dealIntelligence';
import {
  evaluateModerationPriority,
  extractDealScoreFromBotMeta,
} from '@/lib/moderation/moderationPriority';
import { sortPendingOffersForModeration } from '@/lib/moderation/sortPendingOffers';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const IMG = 'https://http2.mlstatic.com/D_NQ_NP_2X_123-O.jpg';
const NOW = new Date('2026-09-18T12:00:00Z').getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

function botMeta(over: {
  signals?: Record<string, unknown>;
  dealScore?: Record<string, unknown>;
  rawObservation?: Record<string, unknown>;
  dealQuality?: Record<string, unknown>;
  [key: string]: unknown;
} = {}) {
  const { signals, dealScore, rawObservation, dealQuality, ...rest } = over;
  return {
    v: 1,
    source: 'ml_worker',
    signals: {
      effectiveDiscountPercent: 0,
      suspectedArtificialListPrice: false,
      ...signals,
    },
    ...(dealScore ? { dealScore } : {}),
    ...(rawObservation ? { rawObservation } : {}),
    ...(dealQuality ? { dealQuality } : {}),
    ...rest,
  };
}

function withDealScore(
  score: number,
  extra: { confidence?: number; reasons?: string[]; reasonCodes?: string[] } = {},
) {
  return {
    score,
    confidence: extra.confidence ?? 0.7,
    version: DEAL_SCORE_VERSION,
    reasons: extra.reasons ?? ['price_drop'],
    reasonCodes: extra.reasonCodes ?? ['price_drop'],
    warnings: [],
    historicalLowClaimed: false,
  };
}

describe('S3 DealScore priority', () => {
  it('1. high DealScore → higher priority than low (same base signals)', () => {
    const high = evaluateModerationPriority({
      isBot: true,
      imageUrl: IMG,
      createdAt: hoursAgo(1),
      nowMs: NOW,
      botMeta: botMeta({
        dealScore: withDealScore(72),
        signals: { effectiveDiscountPercent: 0 },
      }),
    });
    const low = evaluateModerationPriority({
      isBot: true,
      imageUrl: IMG,
      createdAt: hoursAgo(1),
      nowMs: NOW,
      botMeta: botMeta({
        dealScore: withDealScore(20),
        signals: { effectiveDiscountPercent: 0 },
      }),
    });
    expect(high.rank).toBeLessThan(low.rank);
    expect(high.priority).toBe('P1_HIGH_VALUE');
    expect(low.dealScoreTotal).toBe(20);
  });

  it('2. low DealScore → lower priority / warning', () => {
    const low = evaluateModerationPriority({
      isBot: true,
      imageUrl: IMG,
      createdAt: hoursAgo(1),
      nowMs: NOW,
      botMeta: botMeta({ dealScore: withDealScore(18) }),
    });
    expect(low.reasons.some((r) => r.code === 'deal_score_low')).toBe(true);
    expect(low.priority).not.toBe('P1_HIGH_VALUE');
  });

  it('3. missing DealScore → no catastrophic penalty (machine unscored)', () => {
    const unscored = evaluateModerationPriority({
      isBot: true,
      imageUrl: IMG,
      createdAt: hoursAgo(1),
      nowMs: NOW,
      botMeta: botMeta({
        signals: {
          effectiveDiscountPercent: 20,
          suspectedArtificialListPrice: false,
          historyReady: true,
          habitual30d: 1000,
        },
      }),
    });
    expect(unscored.dealScoreTotal).toBeNull();
    expect(unscored.priority).toBe('P1_HIGH_VALUE');
    expect(unscored.reasons.some((r) => r.code === 'deal_score_low')).toBe(false);
  });

  it('4. UGC candidate → still appears as P2 without DealScore', () => {
    const ugc = evaluateModerationPriority({
      isBot: false,
      imageUrl: null,
      createdAt: hoursAgo(1),
      nowMs: NOW,
      botMeta: null,
    });
    expect(ugc.priority).toBe('P2_REVIEW');
    expect(ugc.dealScoreTotal).toBeNull();
  });

  it('5. duplicate → deprioritized to P4', () => {
    const dup = evaluateModerationPriority({
      isBot: true,
      imageUrl: IMG,
      isDuplicate: true,
      createdAt: hoursAgo(1),
      nowMs: NOW,
      botMeta: botMeta({ dealScore: withDealScore(90) }),
    });
    expect(dup.priority).toBe('P4_LOW_VALUE');
  });

  it('6. stale candidate → freshness elevates P3/P4 to P2', () => {
    const stale = evaluateModerationPriority({
      isBot: true,
      imageUrl: IMG,
      createdAt: hoursAgo(72),
      nowMs: NOW,
      botMeta: botMeta({
        dealScore: withDealScore(20),
        signals: {
          effectiveDiscountPercent: 0,
          suspectedArtificialListPrice: true,
          cardDiscountSource: 'badge_reconstructed',
        },
      }),
    });
    expect(stale.priority).toBe('P2_REVIEW');
    expect(stale.reasons.some((r) => r.code === 'stale_pending')).toBe(true);
  });

  it('7–8. high score remains pending conceptually — priority ≠ approve', () => {
    const r = evaluateModerationPriority({
      isBot: true,
      imageUrl: IMG,
      createdAt: hoursAgo(1),
      nowMs: NOW,
      botMeta: botMeta({ dealScore: withDealScore(95) }),
    });
    expect(r.priority).toBe('P1_HIGH_VALUE');
    expect(r).not.toHaveProperty('status');
    expect(JSON.stringify(r)).not.toMatch(/approved/);
  });

  it('9–10. claim CAS / ownership untouched in source', () => {
    const claimSrc = readFileSync(
      resolve(process.cwd(), 'lib/moderation/claimNextModerationOffer.ts'),
      'utf8',
    );
    expect(claimSrc).toMatch(/sortPendingOffersForModeration/);
    expect(claimSrc).toMatch(/moderation_locked_by|locked_by|claim/i);
    // Priority helper must not live inside claim CAS mutation block as authority.
    expect(claimSrc).not.toMatch(/evaluateModerationPriority\([\s\S]*status:\s*['\"]approved/);
  });

  it('11–14. provenance / score version / reasons accessible from bot_meta', () => {
    const meta = botMeta({
      dealScore: withDealScore(66, {
        reasons: ['near historical low'],
        reasonCodes: ['historical_discount'],
      }),
      rawObservation: {
        observationId: 'raw_abc123',
        evidenceHash: 'deadbeef01',
        parserVersion: 'ingest_parser.v1',
        schemaVersion: 'raw_observation.v1',
      },
    });
    const extracted = extractDealScoreFromBotMeta(meta);
    expect(extracted?.score).toBe(66);
    expect(extracted?.version).toBe(DEAL_SCORE_VERSION);
    expect(extracted?.reasons[0]).toBe('near historical low');
    expect(extracted?.reasonCodes).toContain('historical_discount');
    const r = evaluateModerationPriority({
      isBot: true,
      imageUrl: IMG,
      createdAt: hoursAgo(1),
      nowMs: NOW,
      botMeta: meta,
    });
    expect(r.reasons.some((x) => x.code === 'deal_score')).toBe(true);
    expect(r.dealScoreTotal).toBe(66);
  });

  it('12. no N+1 — sort uses only in-memory bot_meta', () => {
    const offers = [
      {
        id: 'a',
        price: 100,
        original_price: 200,
        image_url: IMG,
        created_at: hoursAgo(2),
        is_bot: true,
        bot_meta: botMeta({ dealScore: withDealScore(40) }),
      },
      {
        id: 'b',
        price: 100,
        original_price: 200,
        image_url: IMG,
        created_at: hoursAgo(1),
        is_bot: true,
        bot_meta: botMeta({ dealScore: withDealScore(80) }),
      },
      {
        id: 'ugc',
        price: 50,
        original_price: 80,
        image_url: IMG,
        created_at: hoursAgo(3),
        is_bot: false,
        bot_meta: null,
      },
    ];
    const sorted = sortPendingOffersForModeration(offers, NOW);
    expect(sorted.map((o) => o.id)).toContain('ugc');
    expect(sorted.map((o) => o.id)).toContain('a');
    expect(sorted.map((o) => o.id)).toContain('b');
    // High DealScore before low within scored bots when ranks allow.
    const idxB = sorted.findIndex((o) => o.id === 'b');
    const idxA = sorted.findIndex((o) => o.id === 'a');
    expect(idxB).toBeLessThan(idxA);
  });

  it('15. Focus queue remains complete — UGC + machine unscored + scored all present', () => {
    const list = sortPendingOffersForModeration(
      [
        {
          id: 'ugc',
          created_at: hoursAgo(5),
          is_bot: false,
          image_url: null,
          bot_meta: null,
        },
        {
          id: 'unscored',
          created_at: hoursAgo(4),
          is_bot: true,
          image_url: IMG,
          bot_meta: botMeta({
            signals: {
              effectiveDiscountPercent: 15,
              historyReady: true,
              habitual30d: 200,
            },
          }),
        },
        {
          id: 'scored',
          created_at: hoursAgo(3),
          is_bot: true,
          image_url: IMG,
          bot_meta: botMeta({ dealScore: withDealScore(60) }),
        },
      ],
      NOW,
    );
    expect(list).toHaveLength(3);
    expect(new Set(list.map((o) => o.id))).toEqual(new Set(['ugc', 'unscored', 'scored']));
  });

  it('security: client-forged dealScore in bot_meta cannot imply ownership fields', () => {
    const forged = evaluateModerationPriority({
      isBot: true,
      imageUrl: IMG,
      createdAt: hoursAgo(1),
      nowMs: NOW,
      botMeta: {
        dealScore: withDealScore(99),
        moderation_locked_by: 'attacker',
        status: 'approved',
      },
    });
    expect(forged).not.toHaveProperty('moderation_locked_by');
    expect(forged).not.toHaveProperty('owner');
    expect(Object.keys(forged).sort()).toEqual(
      ['dealScoreTotal', 'label', 'priority', 'rank', 'reasons', 'shortLabel'].sort(),
    );
  });
});
