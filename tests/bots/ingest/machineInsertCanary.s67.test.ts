/**
 * S6.7 — Machine insert canary contract tests.
 * No production writes. No Distribution / Rewards / Economy / Attribution.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  S67_CANARY_HARD_CAP,
  resolveCanaryInsertCap,
  selectCanaryCandidates,
  withMachinePendingWritesEnabled,
  type CanarySelectionRow,
} from '@/lib/bots/ingest/machineInsertCanary';
import {
  evaluateMachineLiveInsertEligibility,
  isMachinePendingWriteEnabled,
} from '@/lib/bots/ingest/machineLiveInsertEligibility';
import { evaluateMachineCandidateGate } from '@/lib/bots/ingest/candidateInsertGate';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';

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
      originalPriceProvenance: 'source_explicit',
      cardDiscountSource: 'pdp',
      historyReady: false,
      ...(overSignals ?? {}),
    },
    ...rest,
  };
}

const VERIFIED_DQE = {
  decision: 'VERIFIED_DEAL' as const,
  recommendedAction: 'PUBLISH_CANDIDATE' as const,
  reasons: ['ok'],
};

function row(over: Partial<CanarySelectionRow> & { index: number }): CanarySelectionRow {
  return {
    url: `https://example.com/${over.index}`,
    canonicalUrl: `https://example.com/${over.index}`,
    sourceEventId: `evt_${over.index}`,
    idempotencyKey: `idem_${over.index}`,
    productFingerprint: `fp_${over.index}`,
    qualityDecision: 'VERIFIED_OPPORTUNITY',
    wouldInsert: true,
    reasonCodes: ['VERIFIED_CARD_PRICE'],
    evidenceLevel: 'strong_card',
    confidence: 0.6,
    dealScore: 15,
    verifierScore: 60,
    originalPriceProvenance: 'listing_card',
    cardDiscountSource: 'card_strikethrough',
    imageUrl: 'https://http2.mlstatic.com/x.jpg',
    pdpBlocked: null,
    duplicate: false,
    ...over,
  };
}

describe('S6.7 machine insert canary', () => {
  it('1. canary cap hard-clamps to ≤5 even if budget is larger', () => {
    expect(resolveCanaryInsertCap(120, 10)).toBe(S67_CANARY_HARD_CAP);
    expect(resolveCanaryInsertCap(120, 3)).toBe(3);
    expect(resolveCanaryInsertCap(2, 5)).toBe(2);
  });

  it('2. flag OFF by default', () => {
    const prev = process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    expect(isMachinePendingWriteEnabled()).toBe(false);
    if (prev !== undefined) process.env.BOT_INGEST_MACHINE_PENDING_WRITES = prev;
  });

  it('3. flag ON only inside controlled withMachinePendingWritesEnabled', async () => {
    const prev = process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    expect(isMachinePendingWriteEnabled()).toBe(false);
    const inside = await withMachinePendingWritesEnabled(async () => {
      expect(isMachinePendingWriteEnabled()).toBe(true);
      return 'ok';
    });
    expect(inside).toBe('ok');
    expect(isMachinePendingWriteEnabled()).toBe(false);
    if (prev !== undefined) process.env.BOT_INGEST_MACHINE_PENDING_WRITES = prev;
    else delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
  });

  it('4. dry-run/live equivalence via same gate', () => {
    const meta = trustedMeta();
    const config = baseConfig();
    const gate = evaluateMachineCandidateGate({
      url: meta.canonicalUrl,
      meta,
      config,
      verifierDecision: 'pending',
      dealQuality: VERIFIED_DQE,
    });
    const live = evaluateMachineLiveInsertEligibility({
      url: meta.canonicalUrl,
      meta,
      config,
      verifierDecision: 'pending',
      dealQuality: VERIFIED_DQE,
    });
    expect(live.qualityDecision).toBe(gate.qualityDecision);
    expect(live.wouldInsert).toBe(gate.wouldInsert);
    expect(live.eligible).toBe(true);
  });

  it('5. VERIFIED candidate is live-eligible (pending path)', () => {
    const live = evaluateMachineLiveInsertEligibility({
      url: trustedMeta().canonicalUrl,
      meta: trustedMeta(),
      config: baseConfig(),
      verifierDecision: 'pending',
      dealQuality: VERIFIED_DQE,
    });
    expect(live.qualityDecision).toBe('VERIFIED_OPPORTUNITY');
    expect(live.eligible).toBe(true);
  });

  it('6. suppressed candidate does not insert (not eligible)', () => {
    const live = evaluateMachineLiveInsertEligibility({
      url: trustedMeta().canonicalUrl,
      meta: trustedMeta({
        signals: { cardDiscountSource: 'badge_reconstructed' },
      }),
      config: baseConfig(),
      verifierDecision: 'pending',
    });
    expect(live.eligible).toBe(false);
    expect(live.wouldInsert).toBe(false);
  });

  it('7. duplicate selection excluded from canary set', () => {
    const selected = selectCanaryCandidates(
      [
        row({ index: 0, duplicate: true }),
        row({ index: 1 }),
        row({ index: 2 }),
      ],
      3,
    );
    expect(selected.map((s) => s.index)).toEqual([1, 2]);
  });

  it('8. retry idempotency contract: duplicate → not eligible', () => {
    const live = evaluateMachineLiveInsertEligibility({
      url: trustedMeta().canonicalUrl,
      meta: trustedMeta(),
      config: baseConfig(),
      verifierDecision: 'pending',
      dealQuality: VERIFIED_DQE,
      duplicate: { kind: 'product_fingerprint', price: 999 },
    });
    expect(live.qualityDecision).toBe('DUPLICATE');
    expect(live.eligible).toBe(false);
  });

  it('9. unexpected status: reject verifier → not eligible', () => {
    const live = evaluateMachineLiveInsertEligibility({
      url: trustedMeta().canonicalUrl,
      meta: trustedMeta(),
      config: baseConfig(),
      verifierDecision: 'reject',
    });
    expect(live.eligible).toBe(false);
  });

  it('10. UGC remains isolated', () => {
    const offersRoute = readFileSync(resolve(process.cwd(), 'app/api/offers/route.ts'), 'utf8');
    expect(offersRoute).not.toMatch(/evaluateMachineCandidateGate/);
    expect(offersRoute).not.toMatch(/machineInsertCanary/);
    expect(offersRoute).not.toMatch(/BOT_INGEST_MACHINE_PENDING_WRITES/);
  });

  it('11. Distribution remains isolated from canary helpers', () => {
    const canary = readFileSync(
      resolve(process.cwd(), 'lib/bots/ingest/machineInsertCanary.ts'),
      'utf8',
    );
    const eligibility = readFileSync(
      resolve(process.cwd(), 'lib/bots/ingest/machineLiveInsertEligibility.ts'),
      'utf8',
    );
    expect(canary).not.toMatch(/lib\/distribution/);
    expect(eligibility).not.toMatch(/lib\/distribution/);
  });

  it('12. Rewards/Economy/Attribution remain isolated', () => {
    const canary = readFileSync(
      resolve(process.cwd(), 'lib/bots/ingest/machineInsertCanary.ts'),
      'utf8',
    );
    expect(canary).not.toMatch(/rewards|economy|attribution/i);
    const external = readFileSync(
      resolve(process.cwd(), 'lib/bots/ingest/externalWorker.ts'),
      'utf8',
    );
    expect(external).not.toMatch(/from ['\"]@\/lib\/distribution/);
    expect(external).not.toMatch(/from ['\"]@\/lib\/rewards/);
  });

  it('selectCanaryCandidates respects cap and VERIFIED-only', () => {
    const selected = selectCanaryCandidates(
      [
        row({ index: 0 }),
        row({
          index: 1,
          qualityDecision: 'SUPPRESSED',
          wouldInsert: false,
        }),
        row({ index: 2 }),
        row({ index: 3 }),
        row({ index: 4 }),
        row({ index: 5 }),
        row({ index: 6 }),
      ],
      3,
    );
    expect(selected).toHaveLength(3);
    expect(selected.every((s) => s.wouldInsert && s.qualityDecision === 'VERIFIED_OPPORTUNITY')).toBe(
      true,
    );
  });

  it('omit canaryCap → budget unchanged', () => {
    expect(resolveCanaryInsertCap(17, null)).toBe(17);
    expect(resolveCanaryInsertCap(17, undefined)).toBe(17);
  });
});
