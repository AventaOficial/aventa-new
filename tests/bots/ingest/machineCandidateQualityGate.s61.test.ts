/**
 * S6.1 — Machine Candidate Quality Gate.
 * Deterministic fixtures; no DB / network / Distribution.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import {
  evaluateMachineCandidateGate,
  isTrustedOriginalPriceProvenance,
} from '@/lib/bots/ingest/candidateInsertGate';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import type { ExternalWorkerCandidate } from '@/lib/bots/ingest/externalWorker';
import { computeDealScore } from '@/lib/dealIntelligence';
import { runMlWorkerListingDryRun } from '@/lib/supplyIntelligence';

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

function trustedMeta(over: Partial<ParsedOfferMetadata> = {}): ParsedOfferMetadata {
  const { signals: overSignals, ...rest } = over;
  return {
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-foo',
    title: 'Audífonos Bluetooth noise cancelling oferta',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/x.jpg',
    discountPrice: 999,
    originalPrice: 1999,
    discountPercent: 50,
    signals: {
      soldQuantity: 200,
      ratingAverage: 4.6,
      ratingCount: 80,
      listingTypeId: 'worker_card',
      originalPriceProvenance: 'listing_card',
      cardDiscountSource: 'card_strikethrough',
      historyReady: false,
      ...(overSignals ?? {}),
    },
    ...rest,
  };
}

describe('S6.1 Machine Candidate Quality Gate', () => {
  const cfg = baseConfig();

  it('1. trusted listing_card original → VERIFIED_OPPORTUNITY', () => {
    const r = evaluateMachineCandidateGate({
      url: trustedMeta().canonicalUrl,
      meta: trustedMeta(),
      config: cfg,
      verifierDecision: 'pending',
    });
    expect(r.qualityDecision).toBe('VERIFIED_OPPORTUNITY');
    expect(r.wouldInsert).toBe(true);
    expect(r.action).toBe('insert_pending');
    expect(r.reasonCodes).toContain('VERIFIED_CARD_PRICE');
  });

  it('2. source_explicit original → VERIFIED_OPPORTUNITY', () => {
    const r = evaluateMachineCandidateGate({
      url: trustedMeta().canonicalUrl,
      meta: trustedMeta({
        signals: {
          originalPriceProvenance: 'source_explicit',
          cardDiscountSource: 'pdp',
        },
      }),
      config: cfg,
      verifierDecision: 'pending',
    });
    expect(r.qualityDecision).toBe('VERIFIED_OPPORTUNITY');
    expect(r.wouldInsert).toBe(true);
    expect(r.reasonCodes).toContain('VERIFIED_PDP_PRICE');
  });

  it('3. badge_reconstructed → SUPPRESSED', () => {
    const r = evaluateMachineCandidateGate({
      url: trustedMeta().canonicalUrl,
      meta: trustedMeta({
        signals: {
          cardDiscountSource: 'badge_reconstructed',
          originalPriceProvenance: 'unknown',
        },
      }),
      config: cfg,
      verifierDecision: 'pending',
    });
    expect(r.qualityDecision).toBe('SUPPRESSED');
    expect(r.wouldInsert).toBe(false);
    expect(r.reasonCodes).toContain('BADGE_RECONSTRUCTED');
  });

  it('4. unknown originalPrice provenance → SUPPRESSED', () => {
    const r = evaluateMachineCandidateGate({
      url: trustedMeta().canonicalUrl,
      meta: trustedMeta({
        signals: {
          cardDiscountSource: 'card_strikethrough',
          originalPriceProvenance: 'unknown',
        },
      }),
      config: cfg,
      verifierDecision: 'pending',
    });
    expect(r.qualityDecision).toBe('SUPPRESSED');
    expect(r.reasonCodes).toContain('ORIGINAL_PRICE_UNTRUSTED');
    expect(r.wouldInsert).toBe(false);
  });

  it('5. missing original price → SUPPRESSED', () => {
    const r = evaluateMachineCandidateGate({
      url: trustedMeta().canonicalUrl,
      meta: trustedMeta({ originalPrice: null, discountPercent: 0 }),
      config: cfg,
      verifierDecision: 'pending',
    });
    expect(r.action).toBe('suppress');
    expect(r.wouldInsert).toBe(false);
    expect(r.reasonCodes).toContain('INVALID_ORIGINAL_PRICE');
  });

  it('6. salePrice <= 0 → SUPPRESSED (INVALID_SALE_PRICE)', () => {
    const r = evaluateMachineCandidateGate({
      url: trustedMeta().canonicalUrl,
      meta: trustedMeta({ discountPrice: 0 }),
      config: cfg,
      verifierDecision: 'pending',
    });
    expect(r.wouldInsert).toBe(false);
    expect(r.reasonCodes).toContain('INVALID_SALE_PRICE');
  });

  it('7. discount below threshold → rejected', () => {
    const r = evaluateMachineCandidateGate({
      url: trustedMeta().canonicalUrl,
      meta: trustedMeta({ discountPercent: 5, originalPrice: 1100, discountPrice: 1045 }),
      config: cfg,
      verifierDecision: 'pending',
    });
    expect(r.action).toBe('suppress');
    expect(r.reasonCodes).toContain('DISCOUNT_BELOW_THRESHOLD');
  });

  it('8. low quality title → rejected', () => {
    const r = evaluateMachineCandidateGate({
      url: trustedMeta().canonicalUrl,
      meta: trustedMeta({ title: 'oferta' }),
      config: cfg,
      verifierDecision: 'pending',
    });
    expect(r.action).toBe('reject_quality');
    expect(r.reasonCodes).toContain('LOW_QUALITY_TITLE');
  });

  it('9. verifier below threshold → rejected', () => {
    const r = evaluateMachineCandidateGate({
      url: trustedMeta().canonicalUrl,
      meta: trustedMeta(),
      config: cfg,
      verifierDecision: 'reject',
      verifierReasons: ['score too low'],
    });
    expect(r.action).toBe('reject_quality');
    expect(r.reasonCodes).toContain('VERIFIER_BELOW_THRESHOLD');
    expect(r.wouldInsert).toBe(false);
  });

  it('10. duplicate → DUPLICATE (wins over quality)', () => {
    const r = evaluateMachineCandidateGate({
      url: trustedMeta().canonicalUrl,
      meta: trustedMeta(),
      config: cfg,
      verifierDecision: 'pending',
      duplicate: { kind: 'live', price: 1200 },
    });
    expect(r.qualityDecision).toBe('DUPLICATE');
    expect(r.action).toBe('duplicate');
    expect(r.wouldInsert).toBe(false);
  });

  it('11. valid card + no image → VERIFIED + PARTIAL_NO_IMAGE', () => {
    const r = evaluateMachineCandidateGate({
      url: trustedMeta().canonicalUrl,
      meta: trustedMeta({ imageUrl: '' }),
      config: cfg,
      verifierDecision: 'pending',
    });
    expect(r.qualityDecision).toBe('VERIFIED_OPPORTUNITY');
    expect(r.wouldInsert).toBe(true);
    expect(r.reasonCodes).toContain('PARTIAL_NO_IMAGE');
  });

  it('12. valid card + no history → VERIFIED + PARTIAL_NO_HISTORY', () => {
    const r = evaluateMachineCandidateGate({
      url: trustedMeta().canonicalUrl,
      meta: trustedMeta({ signals: { historyReady: false } }),
      config: cfg,
      verifierDecision: 'pending',
    });
    expect(r.qualityDecision).toBe('VERIFIED_OPPORTUNITY');
    expect(r.wouldInsert).toBe(true);
    expect(r.reasonCodes).toContain('PARTIAL_NO_HISTORY');
  });

  it('13. valid card + PDP blocked → VERIFIED + PARTIAL_PDP_BLOCKED', () => {
    const r = evaluateMachineCandidateGate({
      url: trustedMeta().canonicalUrl,
      meta: trustedMeta(),
      config: cfg,
      verifierDecision: 'pending',
      pdpBlocked: true,
    });
    expect(r.qualityDecision).toBe('VERIFIED_OPPORTUNITY');
    expect(r.wouldInsert).toBe(true);
    expect(r.reasonCodes).toContain('PARTIAL_PDP_BLOCKED');
  });

  it('14. badge-only 70% discount → NOT VERIFIED', () => {
    const r = evaluateMachineCandidateGate({
      url: trustedMeta().canonicalUrl,
      meta: trustedMeta({
        discountPercent: 70,
        originalPrice: 3330,
        discountPrice: 999,
        signals: {
          cardDiscountSource: 'badge_reconstructed',
          originalPriceProvenance: 'unknown',
          cardBadgePercent: 70,
        },
      }),
      config: cfg,
      verifierDecision: 'pending',
    });
    expect(r.qualityDecision).not.toBe('VERIFIED_OPPORTUNITY');
    expect(r.wouldInsert).toBe(false);
    expect(r.reasonCodes).toContain('BADGE_RECONSTRUCTED');
  });

  it('15. DealScore 10 must NOT independently reject', () => {
    const dealScore = computeDealScore({
      meta: { discountPrice: 999, originalPrice: 1999, discountPercent: 50 },
      signals: { historyReady: false },
    });
    expect(dealScore.score).toBeLessThanOrEqual(15);
    const r = evaluateMachineCandidateGate({
      url: trustedMeta().canonicalUrl,
      meta: trustedMeta({ signals: { historyReady: false } }),
      config: cfg,
      verifierDecision: 'pending',
      dealScore,
    });
    expect(r.wouldInsert).toBe(true);
    expect(r.qualityDecision).toBe('VERIFIED_OPPORTUNITY');
  });

  it('16. DealScore high must NOT independently approve when provenance bad', () => {
    const dealScore = computeDealScore({
      meta: { discountPrice: 999, originalPrice: 1999, discountPercent: 50 },
      signals: {
        historyReady: true,
        savingsVsHabitualPct: 40,
        effectiveDiscountPercent: 50,
        priceLowest90d: 900,
        priceVsLowest90dPct: 0,
      },
    });
    expect(dealScore.score).toBeGreaterThan(40);
    const r = evaluateMachineCandidateGate({
      url: trustedMeta().canonicalUrl,
      meta: trustedMeta({
        signals: {
          cardDiscountSource: 'badge_reconstructed',
          originalPriceProvenance: 'unknown',
          historyReady: true,
        },
      }),
      config: cfg,
      verifierDecision: 'pending',
      dealScore,
    });
    expect(r.wouldInsert).toBe(false);
  });

  it('17. forged client-like metadata cannot bypass gate', () => {
    const r = evaluateMachineCandidateGate({
      url: trustedMeta().canonicalUrl,
      meta: trustedMeta({
        // Client-shaped: claims source_explicit but badge_reconstructed wins
        signals: {
          cardDiscountSource: 'badge_reconstructed',
          originalPriceProvenance: 'source_explicit',
        },
      }),
      config: cfg,
      verifierDecision: 'auto_approve',
      dealScore: computeDealScore({
        meta: { discountPrice: 999, originalPrice: 1999, discountPercent: 70 },
        signals: { historyReady: true, effectiveDiscountPercent: 70 },
      }),
    });
    expect(r.wouldInsert).toBe(false);
    expect(r.reasonCodes).toContain('BADGE_RECONSTRUCTED');
  });

  it('18. UGC POST route does not use machine quality gate', () => {
    const offersRoute = readFileSync(resolve(process.cwd(), 'app/api/offers/route.ts'), 'utf8');
    expect(offersRoute).not.toMatch(/evaluateMachineCandidateGate/);
    expect(offersRoute).not.toMatch(/MachineQualityDecision/);
    expect(offersRoute).not.toMatch(/wouldInsert/);
  });

  it('19. S5.5-like fixture: parser alone ≠ 15/15 WOULD_INSERT', async () => {
    // Mix: trusted strikethrough, badge-only, missing provenance — semantics not a fixed count.
    const candidates: ExternalWorkerCandidate[] = [
      {
        url: 'https://www.mercadolibre.com.mx/a/p/MLM111?wid=MLM111',
        canonicalUrl: 'https://www.mercadolibre.com.mx/a/p/MLM111?wid=MLM111',
        title: 'Hidrolavadora Electrica Portátil 1600 Psi oferta',
        discountPrice: 870,
        originalPrice: 2299,
        discountPercent: 62,
        imageUrl: null,
        signals: {
          listingTypeId: 'worker_card',
          cardDiscountSource: 'card_strikethrough',
          originalPriceProvenance: 'listing_card',
          historyReady: false,
        },
      },
      {
        url: 'https://www.mercadolibre.com.mx/b/p/MLM222?wid=MLM222',
        canonicalUrl: 'https://www.mercadolibre.com.mx/b/p/MLM222?wid=MLM222',
        title: 'Proyector 4k Profesional Portátil Android oferta',
        discountPrice: 580,
        originalPrice: 1399,
        discountPercent: 70,
        imageUrl: null,
        signals: {
          listingTypeId: 'worker_card',
          cardDiscountSource: 'badge_reconstructed',
          originalPriceProvenance: 'unknown',
          cardBadgePercent: 70,
          historyReady: false,
        },
      },
      {
        url: 'https://www.mercadolibre.com.mx/c/p/MLM333?wid=MLM333',
        canonicalUrl: 'https://www.mercadolibre.com.mx/c/p/MLM333?wid=MLM333',
        title: 'Soldadora Inversora Portatil Maquina oferta',
        discountPrice: 499,
        originalPrice: 1325,
        discountPercent: 62,
        imageUrl: null,
        signals: {
          listingTypeId: 'worker_card',
          // Missing provenance → conservative suppress
          historyReady: false,
        },
      },
    ];

    const report = await runMlWorkerListingDryRun({ candidates, maxItems: 10 });
    expect(report.items.every((i) => i.offerInserted === false)).toBe(true);

    const verified = report.items.filter((i) => i.wouldInsert && i.status === 'WOULD_INSERT');
    const suppressed = report.items.filter((i) => i.status === 'SUPPRESSED');

    expect(verified.length).toBeGreaterThanOrEqual(1);
    expect(verified.length).toBeLessThan(candidates.length);
    expect(suppressed.length).toBeGreaterThanOrEqual(1);

    const badge = report.items.find((i) => i.reasonCodes.includes('BADGE_RECONSTRUCTED'));
    expect(badge?.wouldInsert).toBe(false);

    const trusted = verified[0];
    expect(trusted?.reasonCodes).toContain('PARTIAL_NO_IMAGE');
    expect(trusted?.reasonCodes).toContain('PARTIAL_NO_HISTORY');
  });

  it('isTrustedOriginalPriceProvenance rejects badge and unknown', () => {
    expect(isTrustedOriginalPriceProvenance('listing_card')).toBe(true);
    expect(isTrustedOriginalPriceProvenance('source_explicit')).toBe(true);
    expect(isTrustedOriginalPriceProvenance('unknown')).toBe(false);
    expect(isTrustedOriginalPriceProvenance(null)).toBe(false);
    expect(isTrustedOriginalPriceProvenance('listing_card', 'badge_reconstructed')).toBe(false);
  });
});
