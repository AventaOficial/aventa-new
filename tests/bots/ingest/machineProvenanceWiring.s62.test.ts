/**
 * S6.2 — Provenance wiring / machine ingest integration.
 * Cases A–F + S5.5 fixture distribution + upgrade invariant.
 * No DB / network / Distribution / production writes.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import { evaluateMachineCandidateGate } from '@/lib/bots/ingest/candidateInsertGate';
import type { ExternalWorkerCandidate } from '@/lib/bots/ingest/externalWorker';
import {
  isLegalProvenanceTransition,
  preserveMachinePriceProvenance,
  tracePriceProvenanceBoundary,
} from '@/lib/bots/ingest/machinePriceProvenance';
import { buildBotMeta } from '@/lib/bots/ingest/buildBotMeta';
import {
  normalizeMlWorkerListing,
  normalizedListingToRawObservation,
  runMlWorkerListingDryRun,
} from '@/lib/supplyIntelligence';
import { toProvenanceSlice } from '@/lib/dealIntelligence/rawObservation';

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

const BASE_URL = 'https://articulo.mercadolibre.com.mx/MLM-9876543210-s62-fixture';

function workerCandidate(
  over: Partial<ExternalWorkerCandidate> & {
    discountPrice: number;
    title?: string;
  },
): ExternalWorkerCandidate {
  return {
    url: BASE_URL,
    canonicalUrl: BASE_URL,
    title: over.title ?? 'Audífonos Bluetooth noise cancelling oferta S62',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_s62.jpg',
    originalPrice: null,
    discountPercent: null,
    sourceDetail: 'worker:playwright:card',
    ...over,
  };
}

function gateFromNormalized(candidate: ExternalWorkerCandidate, pdpBlocked?: boolean) {
  const n = normalizeMlWorkerListing(candidate);
  expect(n.ok).toBe(true);
  if (!n.ok) throw new Error(n.reason);
  const gate = evaluateMachineCandidateGate({
    url: n.value.meta.canonicalUrl,
    meta: n.value.meta,
    config: baseConfig(),
    verifierDecision: 'pending',
    pdpBlocked: pdpBlocked ?? candidate.pdpBlocked ?? false,
  });
  return { normalized: n.value, gate };
}

describe('S6.2 provenance wiring', () => {
  it('CASE A — card strikethrough → listing_card → may verify', () => {
    const candidate = workerCandidate({
      discountPrice: 698,
      originalPrice: 2492,
      discountPercent: 72,
      cardDiscountSource: 'card_strikethrough',
      cardBadgePercent: 72,
      signals: {
        cardDiscountSource: 'card_strikethrough',
        cardBadgePercent: 72,
        originalPriceProvenance: 'listing_card',
        currentPriceProvenance: 'source_explicit',
        listingTypeId: 'worker_card',
      },
    });
    const { normalized, gate } = gateFromNormalized(candidate);
    expect(normalized.meta.signals?.originalPriceProvenance).toBe('listing_card');
    expect(normalized.meta.signals?.cardDiscountSource).toBe('card_strikethrough');
    expect(gate.qualityDecision).toBe('VERIFIED_OPPORTUNITY');
    expect(gate.wouldInsert).toBe(true);
    expect(gate.reasonCodes).toContain('VERIFIED_CARD_PRICE');
  });

  it('CASE B — badge only → unknown/badge → NOT VERIFIED', () => {
    const candidate = workerCandidate({
      discountPrice: 698,
      originalPrice: 2492, // reconstructed by worker — untrusted
      discountPercent: 72,
      cardDiscountSource: 'badge_reconstructed',
      cardBadgePercent: 72,
      signals: {
        cardDiscountSource: 'badge_reconstructed',
        cardBadgePercent: 72,
        originalPriceProvenance: 'unknown',
        listingTypeId: 'worker_card',
      },
    });
    const { normalized, gate } = gateFromNormalized(candidate);
    expect(normalized.meta.signals?.cardDiscountSource).toBe('badge_reconstructed');
    expect(normalized.meta.signals?.originalPriceProvenance).toBe('unknown');
    expect(gate.wouldInsert).toBe(false);
    expect(gate.qualityDecision).toBe('SUPPRESSED');
    expect(gate.reasonCodes).toContain('BADGE_RECONSTRUCTED');
  });

  it('CASE C — source_explicit → may verify', () => {
    const candidate = workerCandidate({
      discountPrice: 698,
      originalPrice: 2492,
      discountPercent: 72,
      cardDiscountSource: 'pdp',
      signals: {
        cardDiscountSource: 'pdp',
        originalPriceProvenance: 'source_explicit',
        currentPriceProvenance: 'source_explicit',
        listingTypeId: 'worker_card',
      },
    });
    const { normalized, gate } = gateFromNormalized(candidate);
    expect(normalized.meta.signals?.originalPriceProvenance).toBe('source_explicit');
    expect(gate.qualityDecision).toBe('VERIFIED_OPPORTUNITY');
    expect(gate.wouldInsert).toBe(true);
    expect(gate.reasonCodes).toContain('VERIFIED_PDP_PRICE');
  });

  it('CASE D — original present, provenance absent → unknown → NOT VERIFIED', () => {
    const candidate = workerCandidate({
      discountPrice: 698,
      originalPrice: 2492,
      discountPercent: 72,
      // no cardDiscountSource, no signals provenance
      signals: { listingTypeId: 'worker_card' },
    });
    const { normalized, gate } = gateFromNormalized(candidate);
    expect(normalized.meta.signals?.originalPriceProvenance).toBe('unknown');
    expect(gate.wouldInsert).toBe(false);
    expect(gate.qualityDecision).toBe('SUPPRESSED');
    expect(gate.reasonCodes).toContain('ORIGINAL_PRICE_UNTRUSTED');
  });

  it('CASE E — trusted card + null image → verified with PARTIAL_NO_IMAGE', () => {
    const candidate = workerCandidate({
      discountPrice: 698,
      originalPrice: 2492,
      discountPercent: 72,
      imageUrl: null,
      cardDiscountSource: 'card_strikethrough',
      signals: {
        cardDiscountSource: 'card_strikethrough',
        originalPriceProvenance: 'listing_card',
        listingTypeId: 'worker_card',
      },
    });
    const { gate } = gateFromNormalized(candidate);
    expect(gate.qualityDecision).toBe('VERIFIED_OPPORTUNITY');
    expect(gate.wouldInsert).toBe(true);
    expect(gate.reasonCodes).toContain('PARTIAL_NO_IMAGE');
  });

  it('CASE F — trusted card + pdpBlocked → PDP warning only', () => {
    const candidate = workerCandidate({
      discountPrice: 698,
      originalPrice: 2492,
      discountPercent: 72,
      pdpBlocked: true,
      cardDiscountSource: 'card_strikethrough',
      signals: {
        cardDiscountSource: 'card_strikethrough',
        originalPriceProvenance: 'listing_card',
        listingTypeId: 'worker_card',
      },
    });
    const { normalized, gate } = gateFromNormalized(candidate, true);
    const obs = normalizedListingToRawObservation(normalized, {
      pdpBlocked: true,
      sourceDetail: candidate.sourceDetail,
    });
    expect(obs.fetchMetadata.blocked).toBe(true);
    expect(gate.qualityDecision).toBe('VERIFIED_OPPORTUNITY');
    expect(gate.wouldInsert).toBe(true);
    expect(gate.reasonCodes).toContain('PARTIAL_PDP_BLOCKED');
  });

  it('does not invent listing_card from discountPercent alone', () => {
    const preserved = preserveMachinePriceProvenance({
      salePrice: 698,
      originalPrice: 2492,
      signals: { listingTypeId: 'worker_card' },
      // no cardDiscountSource
    });
    expect(preserved.signals.originalPriceProvenance).toBe('unknown');
    expect(preserved.signals.cardDiscountSource).toBeUndefined();
  });

  it('maps top-level card_strikethrough into listing_card when provenance omitted', () => {
    const preserved = preserveMachinePriceProvenance({
      salePrice: 698,
      originalPrice: 2492,
      signals: { listingTypeId: 'worker_card' },
      cardDiscountSource: 'card_strikethrough',
      cardBadgePercent: 72,
    });
    expect(preserved.signals.cardDiscountSource).toBe('card_strikethrough');
    expect(preserved.signals.originalPriceProvenance).toBe('listing_card');
  });

  it('provenance invariant: badge_reconstructed cannot upgrade to listing_card', () => {
    expect(
      isLegalProvenanceTransition({
        fromProvenance: 'unknown',
        fromCardSource: 'badge_reconstructed',
        toProvenance: 'listing_card',
        toCardSource: 'badge_reconstructed',
      }),
    ).toBe(false);

    const preserved = preserveMachinePriceProvenance({
      salePrice: 698,
      originalPrice: 2492,
      signals: {
        cardDiscountSource: 'badge_reconstructed',
        // Hostile attempt to claim trusted provenance
        originalPriceProvenance: 'listing_card',
      },
    });
    expect(preserved.signals.originalPriceProvenance).toBe('unknown');
    expect(preserved.signals.cardDiscountSource).toBe('badge_reconstructed');
  });

  it('provenance invariant: unknown cannot upgrade without new evidence', () => {
    expect(
      isLegalProvenanceTransition({
        fromProvenance: 'unknown',
        toProvenance: 'listing_card',
        hasNewCardStrikethroughEvidence: false,
        hasNewSourceExplicitEvidence: false,
      }),
    ).toBe(false);

    const preserved = preserveMachinePriceProvenance({
      salePrice: 698,
      originalPrice: 2492,
      signals: { originalPriceProvenance: 'unknown', listingTypeId: 'worker_card' },
    });
    expect(preserved.signals.originalPriceProvenance).toBe('unknown');
  });

  it('information-loss check: provenance survives adapter → RawObservation → gate → bot_meta', () => {
    const candidate = workerCandidate({
      discountPrice: 698,
      originalPrice: 2492,
      discountPercent: 72,
      cardDiscountSource: 'card_strikethrough',
      signals: {
        cardDiscountSource: 'card_strikethrough',
        originalPriceProvenance: 'listing_card',
        listingTypeId: 'worker_card',
      },
    });

    const sourceTrace = tracePriceProvenanceBoundary('SOURCE', {
      salePrice: 698,
      originalPrice: 2492,
      discountPercent: 72,
      originalPriceProvenance: 'listing_card',
      cardDiscountSource: 'card_strikethrough',
      cardBadgePercent: 72,
    });

    const n = normalizeMlWorkerListing(candidate);
    expect(n.ok).toBe(true);
    if (!n.ok) throw new Error(n.reason);

    const adapterTrace = tracePriceProvenanceBoundary('ADAPTER', {
      salePrice: n.value.meta.discountPrice,
      originalPrice: n.value.meta.originalPrice,
      discountPercent: n.value.meta.discountPercent,
      originalPriceProvenance: n.value.meta.signals?.originalPriceProvenance ?? null,
      cardDiscountSource: n.value.meta.signals?.cardDiscountSource ?? null,
      cardBadgePercent: n.value.meta.signals?.cardBadgePercent ?? null,
    });

    const obs = normalizedListingToRawObservation(n.value, {
      sourceDetail: candidate.sourceDetail,
    });
    const rawTrace = tracePriceProvenanceBoundary('RAW_OBSERVATION', {
      salePrice: obs.salePrice,
      originalPrice: obs.listPrice,
      originalPriceProvenance:
        typeof obs.payload.summary?.originalPriceProvenance === 'string'
          ? obs.payload.summary.originalPriceProvenance
          : null,
      cardDiscountSource:
        typeof obs.payload.summary?.cardDiscountSource === 'string'
          ? obs.payload.summary.cardDiscountSource
          : null,
      cardBadgePercent:
        typeof obs.payload.summary?.cardBadgePercent === 'number'
          ? obs.payload.summary.cardBadgePercent
          : null,
    });

    const gate = evaluateMachineCandidateGate({
      url: n.value.meta.canonicalUrl,
      meta: n.value.meta,
      config: baseConfig(),
      verifierDecision: 'pending',
    });

    const slice = toProvenanceSlice(obs);
    const botMeta = buildBotMeta({
      meta: n.value.meta,
      ingestSource: 'ml_worker',
      ingestSourceDetail: candidate.sourceDetail ?? undefined,
      rawObservation: slice,
      gateAction: gate.action,
      gateReason: gate.reason,
    });

    expect(sourceTrace.originalPriceProvenance).toBe('listing_card');
    expect(adapterTrace.originalPriceProvenance).toBe('listing_card');
    expect(rawTrace.originalPriceProvenance).toBe('listing_card');
    expect(gate.wouldInsert).toBe(true);
    expect(botMeta?.signals).toMatchObject({
      originalPriceProvenance: 'listing_card',
      cardDiscountSource: 'card_strikethrough',
    });
    expect(botMeta?.rawObservation).toMatchObject({
      originalPriceProvenance: 'listing_card',
      cardDiscountSource: 'card_strikethrough',
    });
    // No secret-like keys
    const dumped = JSON.stringify({ sourceTrace, adapterTrace, rawTrace, botMeta });
    expect(dumped).not.toMatch(/cookie|authorization|password|html/i);
  });
});

describe('S6.2 S5.5 real fixture provenance distribution', () => {
  it('reports distribution and does not invent provenance', async () => {
    const fixturePath = resolve(process.cwd(), 'scripts/_smoke-gate-v2-discovery.json');
    const raw = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      candidates: ExternalWorkerCandidate[];
    };
    const candidates = raw.candidates;
    expect(candidates.length).toBeGreaterThanOrEqual(15);

    const dist = {
      listing_card: 0,
      source_explicit: 0,
      badge_reconstructed: 0,
      unknown: 0,
      missing: 0,
    };
    const cardDist: Record<string, number> = {};

    for (const c of candidates) {
      const n = normalizeMlWorkerListing(c);
      expect(n.ok).toBe(true);
      if (!n.ok) continue;
      const p = n.value.meta.signals?.originalPriceProvenance;
      if (!p) dist.missing += 1;
      else if (p === 'listing_card') dist.listing_card += 1;
      else if (p === 'source_explicit') dist.source_explicit += 1;
      else if (p === 'unknown') dist.unknown += 1;
      else dist.badge_reconstructed += 1;

      const card = n.value.meta.signals?.cardDiscountSource ?? 'missing';
      cardDist[card] = (cardDist[card] ?? 0) + 1;
    }

    // Real S5.5 smoke: all 15 carry worker listing_card + card_strikethrough.
    expect(dist.listing_card).toBe(15);
    expect(dist.source_explicit).toBe(0);
    expect(dist.unknown).toBe(0);
    expect(dist.missing).toBe(0);
    expect(cardDist.card_strikethrough).toBe(15);

    const report = await runMlWorkerListingDryRun({
      candidates,
      maxItems: 50,
      config: baseConfig({ maxPerRun: 50, candidatePoolMax: 50 }),
    });

    expect(report.wouldInsertCount).toBe(15);
    expect(report.items.every((i) => i.offerInserted === false)).toBe(true);
    expect(report.items.every((i) => i.status === 'WOULD_INSERT')).toBe(true);
    // S6.3: card images now present on real fixtures — no PARTIAL_NO_IMAGE required.
    // Gate policy unchanged: verified card price still admits.
    expect(
      report.items.every((i) => i.reasonCodes.includes('VERIFIED_CARD_PRICE')),
    ).toBe(true);
  });
});
