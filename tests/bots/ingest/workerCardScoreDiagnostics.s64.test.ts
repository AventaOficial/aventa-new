/**
 * S6.4 — Worker_card empirical diagnostics tests.
 * Does not change scorer weights / thresholds / gate policy.
 */

import { describe, expect, it } from 'vitest';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import { evaluateMachineCandidateGate } from '@/lib/bots/ingest/candidateInsertGate';
import { scoreIngestCandidate } from '@/lib/bots/ingest/scoreIngestCandidate';
import {
  classifyCandidateSignals,
  decomposeIngestScores,
} from '@/lib/bots/ingest/workerCardScoreDiagnostics';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import { computeDealScore } from '@/lib/dealIntelligence';

function baseConfig(over: Partial<BotIngestConfig> = {}): BotIngestConfig {
  return {
    profile: 'standard',
    enabled: true,
    botUserId: 'x',
    botUserIdTech: null,
    botUserIdStaples: null,
    botAuthorDualMode: false,
    botUserIdsForQuota: ['x'],
    morningSustainedEnabled: false,
    morningHourStart: 5,
    morningHourEndExclusive: 11,
    morningMaxPerRunMin: 2,
    morningMaxPerRunMax: 5,
    timezone: 'America/Mexico_City',
    normalMaxPerRunMin: 1,
    normalMaxPerRunMax: 3,
    boostMaxOffers: 20,
    boostLocalHourStart: 7,
    boostLocalMinuteEnd: 30,
    dailyMaxOffers: 120,
    candidatePoolMax: 40,
    maxPerRun: 5,
    minDiscountPercent: 20,
    category: null,
    urlsFromEnv: [],
    discoverMlEnabled: true,
    mlQueries: [],
    mlCategoryIds: [],
    mlUseDefaultQueries: true,
    mlSearchLimitPerRequest: 50,
    mlMaxCollect: 80,
    mlSortTrending: 'sold_quantity_desc',
    techCategoryIds: ['MLM1648'],
    techCategoryIdSet: new Set(['MLM1648']),
    amazonAsins: [],
    amazonDpBase: 'https://www.amazon.com.mx/dp/',
    amazonSource: 'scrape',
    amazonPaapiEnabled: false,
    amazonPaapiAccessKey: null,
    amazonPaapiSecretKey: null,
    amazonPaapiPartnerTag: null,
    amazonPaapiHost: 'webservices.amazon.com.mx',
    amazonPaapiRegion: 'us-east-1',
    minSoldQuantityMl: 50,
    minRatingAverage: 4,
    minRatingReviewsCount: 5,
    mlFetchReviews: false,
    mlReviewFetchMax: 0,
    keepaEnabled: false,
    keepaApiKey: null,
    keepaDomainId: 11,
    autoApproveEnabled: true,
    legacyAutoApproveWriteEnabled: false,
    autoApproveMinScore: 78,
    autoApproveWorkerMinScore: 55,
    autoApproveWorkerMinDiscountPercent: 28,
    autoApproveRequireImage: true,
    workerMaxPerRun: 10,
    rejectBelowScore: 40,
    forcePendingMinScore: null,
    scoreWeights: {
      discount: 0.28,
      popularity: 0.22,
      rating: 0.2,
      category: 0.15,
      priceAppeal: 0.15,
    },
    titleBlocklistGenericRe: null,
    titleMinLength: 12,
    delayMsMin: 100,
    delayMsMax: 200,
    externalWorkerEnabled: true,
    ...over,
  } as BotIngestConfig;
}

const CDN = 'https://http2.mlstatic.com/D_NQ_NP_2X_S64-MLM-O.webp';

function workerMeta(over: Partial<ParsedOfferMetadata> = {}): ParsedOfferMetadata {
  const { signals: overSignals, ...rest } = over;
  return {
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-s64',
    title: 'Audífonos Bluetooth noise cancelling oferta S64',
    store: 'Mercado Libre',
    imageUrl: CDN,
    discountPrice: 698,
    originalPrice: 2492,
    discountPercent: 72,
    signals: {
      listingTypeId: 'worker_card',
      cardDiscountSource: 'card_strikethrough',
      originalPriceProvenance: 'listing_card',
      imageProvenance: 'listing_card',
      historyReady: false,
      ...(overSignals ?? {}),
    },
    ...rest,
  };
}

describe('S6.4 worker_card score diagnostics', () => {
  const cfg = baseConfig();

  it('1. score decomposition is deterministic', () => {
    const meta = workerMeta();
    const a = decomposeIngestScores({ meta, config: cfg });
    const b = decomposeIngestScores({ meta, config: cfg });
    expect(a.verifierScore).toBe(b.verifierScore);
    expect(a.dealScore).toBe(b.dealScore);
    expect(a.workerCard.estimatedTotalDelta).toBe(b.workerCard.estimatedTotalDelta);
  });

  it('2. worker_card contribution is visible when sold/rating missing', () => {
    const decomp = decomposeIngestScores({ meta: workerMeta(), config: cfg });
    expect(decomp.workerCard.present).toBe(true);
    expect(decomp.workerCard.popularityBoostApplied).toBe(true);
    expect(decomp.workerCard.ratingBoostApplied).toBe(true);
    expect(decomp.workerCard.popularityPtsActual).toBe(58);
    expect(decomp.workerCard.popularityPtsWithoutWorkerCard).toBe(40);
    expect(decomp.workerCard.ratingPtsActual).toBe(60);
    expect(decomp.workerCard.ratingPtsWithoutWorkerCard).toBe(55);
    expect(decomp.workerCard.estimatedTotalDelta).toBeGreaterThan(0);
  });

  it('3. counterfactual does not mutate real score', () => {
    const meta = workerMeta();
    const before = scoreIngestCandidate(meta, meta.signals, cfg);
    const decomp = decomposeIngestScores({ meta, config: cfg });
    const after = scoreIngestCandidate(meta, meta.signals, cfg);
    expect(after.breakdown.total).toBe(before.breakdown.total);
    expect(decomp.verifierScore).toBe(before.breakdown.total);
    expect(decomp.counterfactual.verifierScoreWithoutWorkerCard).toBeLessThan(
      decomp.verifierScore,
    );
    // meta.signals still worker_card
    expect(meta.signals?.listingTypeId).toBe('worker_card');
  });

  it('4. real verifier unchanged by diagnostics', () => {
    const meta = workerMeta();
    const scored = scoreIngestCandidate(meta, meta.signals, cfg);
    const decomp = decomposeIngestScores({ meta, config: cfg });
    expect(decomp.verifierDecision).toBe(scored.decision);
    expect(decomp.verifierScore).toBe(scored.breakdown.total);
  });

  it('5. provenance unchanged', () => {
    const meta = workerMeta();
    decomposeIngestScores({ meta, config: cfg });
    expect(meta.signals?.originalPriceProvenance).toBe('listing_card');
    expect(meta.signals?.cardDiscountSource).toBe('card_strikethrough');
    const classified = classifyCandidateSignals({ meta });
    expect(
      classified.source.find((s) => s.key === 'originalPriceProvenance')?.value,
    ).toBe('listing_card');
  });

  it('6. image unchanged', () => {
    const meta = workerMeta();
    const decomp = decomposeIngestScores({ meta, config: cfg });
    expect(meta.imageUrl).toBe(CDN);
    expect(
      decomp.qualitySignals.find((s) => s.key === 'imagePresent')?.value,
    ).toBe(true);
  });

  it('7. S6.1 gate unchanged (uses actual verifier)', () => {
    const meta = workerMeta({
      signals: {
        listingTypeId: 'worker_card',
        cardDiscountSource: 'card_strikethrough',
        originalPriceProvenance: 'listing_card',
        imageProvenance: 'listing_card',
        historyReady: true,
      },
    });
    const scored = scoreIngestCandidate(meta, meta.signals, cfg);
    const direct = evaluateMachineCandidateGate({
      url: meta.canonicalUrl,
      meta,
      config: cfg,
      verifierDecision: scored.decision,
    });
    const decomp = decomposeIngestScores({ meta, config: cfg });
    expect(decomp.gate.qualityDecision).toBe(direct.qualityDecision);
    expect(decomp.gate.wouldInsert).toBe(direct.wouldInsert);
    expect(decomp.gate.wouldInsert).toBe(true);
  });

  it('8. high DealScore does not bypass bad provenance', () => {
    const meta = workerMeta({
      signals: {
        listingTypeId: 'worker_card',
        originalPriceProvenance: 'unknown',
        cardDiscountSource: 'card_strikethrough',
        historyReady: true,
        savingsVsHabitualPct: 40,
        effectiveDiscountPercent: 50,
      },
    });
    const deal = computeDealScore({
      meta: {
        discountPrice: meta.discountPrice,
        originalPrice: meta.originalPrice,
        discountPercent: meta.discountPercent,
      },
      signals: meta.signals,
    });
    expect(deal.score).toBeGreaterThan(0);
    const decomp = decomposeIngestScores({ meta, config: cfg });
    expect(decomp.gate.wouldInsert).toBe(false);
    expect(decomp.gate.qualityDecision).toBe('SUPPRESSED');
    expect(decomp.gate.reasonCodes).toContain('ORIGINAL_PRICE_UNTRUSTED');
  });

  it('9. low DealScore does not automatically reject at gate when verifier pending', () => {
    const meta = workerMeta({
      discountPercent: 25,
      signals: {
        listingTypeId: 'worker_card',
        originalPriceProvenance: 'listing_card',
        cardDiscountSource: 'card_strikethrough',
        // Mint-valid evidence so DealScore (low without rich intel) is the variable under test.
        historyReady: true,
      },
    });
    const decomp = decomposeIngestScores({ meta, config: cfg });
    // DealScore advisory — low without rich history signals is expected; gate still verifies.
    expect(decomp.dealScore).toBeLessThanOrEqual(35);
    expect(decomp.verifierDecision).not.toBe('reject');
    expect(decomp.gate.qualityDecision).toBe('VERIFIED_OPPORTUNITY');
    expect(decomp.gate.wouldInsert).toBe(true);
  });

  it('9b. listing_card without historyReady → SUPPRESSED (not a DealScore reject)', () => {
    const meta = workerMeta({
      discountPercent: 25,
      signals: {
        listingTypeId: 'worker_card',
        originalPriceProvenance: 'listing_card',
        cardDiscountSource: 'card_strikethrough',
        historyReady: false,
      },
    });
    const decomp = decomposeIngestScores({ meta, config: cfg });
    expect(decomp.verifierDecision).not.toBe('reject');
    expect(decomp.gate.qualityDecision).toBe('SUPPRESSED');
    expect(decomp.gate.wouldInsert).toBe(false);
    expect(decomp.gate.reasonCodes).toContain('INSUFFICIENT_HISTORY');
  });

  it('10. UGC path untouched — diagnostics module is ingest-only', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const ugc = fs.readFileSync(
      path.resolve(process.cwd(), 'app/api/offers/route.ts'),
      'utf8',
    );
    expect(ugc).not.toContain('workerCardScoreDiagnostics');
    expect(ugc).not.toContain('decomposeIngestScores');
  });

  it('DealScore ignores worker_card (counterfactual dealScore unchanged)', () => {
    const withWorker = workerMeta();
    const without = workerMeta({
      signals: {
        cardDiscountSource: 'card_strikethrough',
        originalPriceProvenance: 'listing_card',
        // no listingTypeId
      },
    });
    const a = computeDealScore({
      meta: {
        discountPrice: withWorker.discountPrice,
        originalPrice: withWorker.originalPrice,
        discountPercent: withWorker.discountPercent,
      },
      signals: withWorker.signals,
    });
    const b = computeDealScore({
      meta: {
        discountPrice: without.discountPrice,
        originalPrice: without.originalPrice,
        discountPercent: without.discountPercent,
      },
      signals: without.signals,
    });
    expect(a.score).toBe(b.score);
  });

  it('control: without worker_card, popularity/rating stay at baseline defaults', () => {
    const meta = workerMeta();
    // Explicitly remove heuristic — do not leave default worker_card from helper.
    if (meta.signals) {
      const { listingTypeId: _removed, ...rest } = meta.signals;
      meta.signals = rest;
    }
    expect(meta.signals?.listingTypeId).toBeUndefined();
    const scored = scoreIngestCandidate(meta, meta.signals, cfg);
    expect(scored.breakdown.popularity).toBe(40);
    expect(scored.breakdown.rating).toBe(55);
  });
});
