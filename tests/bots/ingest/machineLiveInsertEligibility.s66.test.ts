/**
 * S6.6 — Live insert eligibility ≡ S6.1 evaluateMachineCandidateGate.
 * No second policy. No DB / network / Distribution.
 */

import { describe, expect, it } from 'vitest';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import { evaluateMachineCandidateGate } from '@/lib/bots/ingest/candidateInsertGate';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import {
  evaluateMachineLiveInsertEligibility,
  isMachinePendingWriteEnabled,
} from '@/lib/bots/ingest/machineLiveInsertEligibility';
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
      // Mint-trusted baseline: source_explicit (listing_card alone needs historyReady).
      originalPriceProvenance: 'source_explicit',
      cardDiscountSource: 'pdp',
      historyReady: true,
      effectiveDiscountPercent: 50,
      suspectedArtificialListPrice: false,
      ...(overSignals ?? {}),
    },
    ...rest,
  };
}

function sameCandidateInput(over: {
  meta?: ParsedOfferMetadata | null;
  verifierDecision?: 'auto_approve' | 'pending' | 'reject';
  duplicate?: { kind: 'exact_url' | 'product_fingerprint'; price: number | null } | null;
  pdpBlocked?: boolean | null;
} = {}) {
  const meta = over.meta === undefined ? trustedMeta() : over.meta;
  const config = baseConfig();
  const url = meta?.canonicalUrl ?? 'https://articulo.mercadolibre.com.mx/MLM-1234567890-foo';
  const dealScore = meta
    ? computeDealScore({
        meta: {
          discountPrice: meta.discountPrice,
          originalPrice: meta.originalPrice,
          discountPercent: meta.discountPercent,
        },
        signals: meta.signals ?? null,
      })
    : null;
  return {
    url,
    meta,
    config,
    verifierDecision: over.verifierDecision ?? ('pending' as const),
    verifierReasons: [] as string[],
    duplicate: over.duplicate ?? null,
    dealScore,
    pdpBlocked: over.pdpBlocked,
  };
}

function assertEquivalence(input: ReturnType<typeof sameCandidateInput>) {
  const gate = evaluateMachineCandidateGate({
    url: input.url,
    meta: input.meta,
    config: input.config,
    verifierDecision: input.verifierDecision,
    verifierReasons: input.verifierReasons,
    duplicate: input.duplicate,
    dealScore: input.dealScore,
    pdpBlocked: input.pdpBlocked,
  });
  const live = evaluateMachineLiveInsertEligibility(input);

  expect(live.qualityDecision).toBe(gate.qualityDecision);
  expect(live.wouldInsert).toBe(gate.wouldInsert);
  expect(live.gate.qualityDecision).toBe(gate.qualityDecision);
  expect(live.gate.wouldInsert).toBe(gate.wouldInsert);
  expect(live.gate.reasonCodes).toEqual(gate.reasonCodes);
  expect(live.eligible).toBe(
    gate.qualityDecision === 'VERIFIED_OPPORTUNITY' && gate.wouldInsert === true,
  );
  return { gate, live };
}

describe('S6.6 live gate unification', () => {
  it('1. WOULD_INSERT / VERIFIED → live eligibility true', () => {
    const { gate, live } = assertEquivalence(sameCandidateInput());
    expect(gate.wouldInsert).toBe(true);
    expect(gate.qualityDecision).toBe('VERIFIED_OPPORTUNITY');
    expect(live.eligible).toBe(true);
  });

  it('2. SUPPRESSED (badge) → live eligibility false', () => {
    const { gate, live } = assertEquivalence(
      sameCandidateInput({
        meta: trustedMeta({
          signals: {
            originalPriceProvenance: 'listing_card',
            cardDiscountSource: 'badge_reconstructed',
          },
        }),
      }),
    );
    expect(gate.qualityDecision).toBe('SUPPRESSED');
    expect(gate.wouldInsert).toBe(false);
    expect(live.eligible).toBe(false);
  });

  it('3. DUPLICATE → live eligibility false', () => {
    const { gate, live } = assertEquivalence(
      sameCandidateInput({
        duplicate: { kind: 'product_fingerprint', price: 999 },
      }),
    );
    expect(gate.qualityDecision).toBe('DUPLICATE');
    expect(gate.wouldInsert).toBe(false);
    expect(live.eligible).toBe(false);
  });

  it('4. invalid / untrusted provenance → live eligibility false', () => {
    const { gate, live } = assertEquivalence(
      sameCandidateInput({
        meta: trustedMeta({
          signals: {
            originalPriceProvenance: 'unknown',
            cardDiscountSource: 'card_strikethrough',
          },
        }),
      }),
    );
    expect(gate.qualityDecision).toBe('SUPPRESSED');
    expect(gate.reasonCodes).toContain('ORIGINAL_PRICE_UNTRUSTED');
    expect(live.eligible).toBe(false);
  });

  it('5. forged trusted provenance (unknown card + forged listing_card) still untrusted if badge', () => {
    // badge_reconstructed always fails closed regardless of forged originalPriceProvenance
    const { gate, live } = assertEquivalence(
      sameCandidateInput({
        meta: trustedMeta({
          signals: {
            originalPriceProvenance: 'listing_card',
            cardDiscountSource: 'badge_reconstructed',
          },
        }),
      }),
    );
    expect(gate.wouldInsert).toBe(false);
    expect(live.eligible).toBe(false);
  });

  it('5b. missing provenance (forged absence) → not VERIFIED', () => {
    const { gate, live } = assertEquivalence(
      sameCandidateInput({
        meta: trustedMeta({
          signals: {
            originalPriceProvenance: undefined,
            cardDiscountSource: 'unknown',
          },
        }),
      }),
    );
    expect(gate.qualityDecision).not.toBe('VERIFIED_OPPORTUNITY');
    expect(live.eligible).toBe(false);
  });

  it('6. missing original price → same as dry-run / gate', () => {
    const { gate, live } = assertEquivalence(
      sameCandidateInput({
        meta: trustedMeta({ originalPrice: null }),
      }),
    );
    expect(gate.qualityDecision).toBe('SUPPRESSED');
    expect(gate.reasonCodes).toContain('INVALID_ORIGINAL_PRICE');
    expect(live.eligible).toBe(false);
    expect(live.qualityDecision).toBe(gate.qualityDecision);
  });

  it('7. image missing → same S6.1 result', () => {
    const { gate, live } = assertEquivalence(
      sameCandidateInput({
        meta: trustedMeta({ imageUrl: '' }),
      }),
    );
    expect(live.qualityDecision).toBe(gate.qualityDecision);
    expect(live.wouldInsert).toBe(gate.wouldInsert);
    expect(live.eligible).toBe(gate.wouldInsert);
    expect(gate.reasonCodes).toContain('PARTIAL_NO_IMAGE');
  });

  it('8. history missing → same S6.1 result', () => {
    const { gate, live } = assertEquivalence(
      sameCandidateInput({
        meta: trustedMeta({
          signals: {
            originalPriceProvenance: 'listing_card',
            cardDiscountSource: 'card_strikethrough',
            historyReady: false,
          },
        }),
      }),
    );
    expect(live.qualityDecision).toBe(gate.qualityDecision);
    expect(live.wouldInsert).toBe(gate.wouldInsert);
    expect(gate.wouldInsert).toBe(false);
    expect(gate.reasonCodes).toContain('INSUFFICIENT_HISTORY');
  });

  it('9. low DealScore advisory → same S6.1 (DealScore does not block)', () => {
    const meta = trustedMeta({
      discountPrice: 1800,
      originalPrice: 2000,
      discountPercent: 10,
      signals: {
        effectiveDiscountPercent: 10,
      },
    });
    // Below minDiscount → suppressed by discount threshold, not DealScore
    const lowDiscount = assertEquivalence(sameCandidateInput({ meta }));
    expect(lowDiscount.gate.reasonCodes).toContain('DISCOUNT_BELOW_THRESHOLD');
    expect(lowDiscount.live.eligible).toBe(false);

    // Trusted provenance with high discount but weak social signals — DealScore low, gate still VERIFIED
    const weakSocial = assertEquivalence(
      sameCandidateInput({
        meta: trustedMeta({
          signals: {
            soldQuantity: 0,
            ratingAverage: 0,
            ratingCount: 0,
            listingTypeId: 'worker_card',
            originalPriceProvenance: 'source_explicit',
            cardDiscountSource: 'pdp',
            historyReady: true,
            effectiveDiscountPercent: 50,
            suspectedArtificialListPrice: false,
          },
        }),
      }),
    );
    expect(weakSocial.gate.qualityDecision).toBe('VERIFIED_OPPORTUNITY');
    expect(weakSocial.live.eligible).toBe(true);
  });

  it('10. high DealScore with bad provenance → same S6.1 (not VERIFIED)', () => {
    const { gate, live } = assertEquivalence(
      sameCandidateInput({
        meta: trustedMeta({
          discountPrice: 500,
          originalPrice: 5000,
          discountPercent: 90,
          signals: {
            soldQuantity: 5000,
            ratingAverage: 4.9,
            ratingCount: 2000,
            originalPriceProvenance: 'unknown',
            cardDiscountSource: 'unknown',
          },
        }),
      }),
    );
    expect(gate.qualityDecision).toBe('SUPPRESSED');
    expect(gate.reasonCodes).toContain('ORIGINAL_PRICE_UNTRUSTED');
    expect(live.eligible).toBe(false);
  });

  it('equivalence: live wraps gate only — no second policy implementation', () => {
    const cases = [
      sameCandidateInput(),
      sameCandidateInput({
        meta: trustedMeta({ signals: { cardDiscountSource: 'badge_reconstructed' } }),
      }),
      sameCandidateInput({ duplicate: { kind: 'exact_url', price: 100 } }),
      sameCandidateInput({ verifierDecision: 'reject' }),
      sameCandidateInput({ meta: null }),
    ];
    for (const c of cases) {
      assertEquivalence(c);
    }
  });

  it('fail-closed: missing meta → not eligible, no fallback', () => {
    const live = evaluateMachineLiveInsertEligibility(sameCandidateInput({ meta: null }));
    expect(live.failClosed).toBe(true);
    expect(live.eligible).toBe(false);
    expect(live.wouldInsert).toBe(false);
  });

  it('LIVE_INSERT_ELIGIBLE invariant', () => {
    const verified = evaluateMachineLiveInsertEligibility(sameCandidateInput());
    expect(verified.eligible).toBe(
      verified.qualityDecision === 'VERIFIED_OPPORTUNITY' && verified.wouldInsert === true,
    );
    const suppressed = evaluateMachineLiveInsertEligibility(
      sameCandidateInput({
        meta: trustedMeta({ signals: { cardDiscountSource: 'badge_reconstructed' } }),
      }),
    );
    expect(suppressed.eligible).toBe(false);
    expect(suppressed.wouldInsert).toBe(false);
  });

  it('feature activation: machine pending writes default OFF', () => {
    const prev = process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    expect(isMachinePendingWriteEnabled()).toBe(false);
    process.env.BOT_INGEST_MACHINE_PENDING_WRITES = '0';
    expect(isMachinePendingWriteEnabled()).toBe(false);
    process.env.BOT_INGEST_MACHINE_PENDING_WRITES = 'true';
    expect(isMachinePendingWriteEnabled()).toBe(true);
    if (prev === undefined) delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    else process.env.BOT_INGEST_MACHINE_PENDING_WRITES = prev;
  });

  it('UGC isolation: POST offers route does not import live eligibility', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const offersRoute = readFileSync(
      resolve(process.cwd(), 'app/api/offers/route.ts'),
      'utf8',
    );
    expect(offersRoute).not.toMatch(/evaluateMachineLiveInsertEligibility/);
    expect(offersRoute).not.toMatch(/evaluateMachineCandidateGate/);
    expect(offersRoute).not.toMatch(/machineLiveInsertEligibility/);
  });
});
