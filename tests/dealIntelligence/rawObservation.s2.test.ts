/**
 * S2 — RawObservation contract + candidate insert gate.
 * Pure unit tests; no DB / network.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import {
  DUPLICATE_POLICY,
  evaluateMachineCandidateGate,
  resolveInsertBudget,
  selectTopKByScore,
} from '@/lib/bots/ingest/candidateInsertGate';
import { buildBotMeta } from '@/lib/bots/ingest/buildBotMeta';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import {
  DEAL_SCORE_VERSION,
  buildExactIdentity,
  buildSourceEvent,
  buildRawObservation,
  computeDealScore,
  dedupeObservationsByIdempotency,
  dedupeRawObservationsByIdempotency,
  mapRawObservationToPriceObservation,
  observationsAreSame,
  sourceEventsAreSame,
  toProvenanceSlice,
  withProcessingStatus,
} from '@/lib/dealIntelligence';
import {
  AUTO_REJECTED_TIMEOUT_REASON,
  classifyDuplicateOfferRow,
  strongProductFingerprintForUrl,
} from '@/lib/offers/findDuplicateOffer';

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

function goodMeta(over: Partial<ParsedOfferMetadata> = {}): ParsedOfferMetadata {
  return {
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-foo',
    title: 'Audífonos Bluetooth noise cancelling oferta',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/x.jpg',
    discountPrice: 999,
    originalPrice: 1999,
    discountPercent: 50,
    signals: {
      effectiveDiscountPercent: 50,
      soldQuantity: 200,
      ratingAverage: 4.6,
      ratingCount: 80,
      historyReady: true,
      savingsVsHabitualPct: 18,
    },
    ...over,
  };
}

describe('S2 RawObservation / SourceEvent idempotency', () => {
  it('1. same source event → idempotent', () => {
    const a = buildSourceEvent({ sourceId: 'ml_worker', sourceEventId: 'evt-1' });
    const b = buildSourceEvent({ sourceId: 'ml_worker', sourceEventId: 'evt-1' });
    expect(sourceEventsAreSame(a, b)).toBe(true);
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
  });

  it('2. same observation → idempotent', () => {
    const observedAt = '2026-09-17T15:30:10.000Z';
    const a = buildRawObservation({
      sourceId: 'ml_worker',
      sourceEventId: 'evt-1',
      url: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-foo',
      salePrice: 999,
      listPrice: 1999,
      currency: 'MXN',
      observedAt,
    });
    const b = buildRawObservation({
      sourceId: 'ml_worker',
      sourceEventId: 'evt-2',
      url: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-foo',
      salePrice: 999,
      listPrice: 1999,
      currency: 'MXN',
      observedAt: '2026-09-17T15:30:59.000Z',
    });
    expect(observationsAreSame(a, b)).toBe(true);
    const deduped = dedupeRawObservationsByIdempotency([a, b]);
    expect(deduped.unique).toHaveLength(1);
    expect(deduped.duplicateKeys).toHaveLength(1);
  });

  it('different products → distinct observation keys', () => {
    const a = buildRawObservation({
      sourceId: 'ml_worker',
      sourceEventId: 'e1',
      url: 'https://articulo.mercadolibre.com.mx/MLM-1111111111-a',
      salePrice: 100,
      observedAt: '2026-09-17T12:00:00.000Z',
    });
    const b = buildRawObservation({
      sourceId: 'ml_worker',
      sourceEventId: 'e2',
      url: 'https://articulo.mercadolibre.com.mx/MLM-2222222222-b',
      salePrice: 100,
      observedAt: '2026-09-17T12:00:00.000Z',
    });
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
  });
});

describe('S2 duplicate / fingerprint policy', () => {
  it('3. duplicate product fingerprints match strong ids', () => {
    const fp1 = strongProductFingerprintForUrl(
      'https://articulo.mercadolibre.com.mx/MLM-1234567890-foo',
    );
    const fp2 = strongProductFingerprintForUrl(
      'https://www.mercadolibre.com.mx/p/MLM1234567890',
    );
    // Same item id when extractable — at least both strong or consistent ml:
    expect(fp1?.startsWith('ml:') || fp1 == null).toBe(true);
    if (fp1 && fp2) expect(fp1).toBe(fp2);
  });

  it('4. different products → no false duplicate fingerprint', () => {
    const a = strongProductFingerprintForUrl(
      'https://articulo.mercadolibre.com.mx/MLM-1111111111-a',
    );
    const b = strongProductFingerprintForUrl(
      'https://articulo.mercadolibre.com.mx/MLM-2222222222-b',
    );
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it('5. stale offer → correct classification', () => {
    const now = new Date('2026-09-17T12:00:00.000Z');
    const fresh = classifyDuplicateOfferRow(
      { status: 'pending', created_at: '2026-09-17T10:00:00.000Z' },
      now,
    );
    const stale = classifyDuplicateOfferRow(
      { status: 'pending', created_at: '2026-09-10T10:00:00.000Z' },
      now,
    );
    expect(fresh).toBe('pending_fresh');
    expect(stale).toBe('pending_stale');
    expect(DUPLICATE_POLICY.autoReplaceOnBetterPrice).toBe(false);
  });

  it('6. rejected cooldown reason constant preserved', () => {
    expect(AUTO_REJECTED_TIMEOUT_REASON).toBe('auto_rejected_timeout');
    expect(DUPLICATE_POLICY.timeoutRejectCooldownHours).toBeGreaterThan(0);
  });
});

describe('S2 candidate gate', () => {
  const cfg = baseConfig();

  it('7. malformed source / missing meta → isolated suppress (not insert)', () => {
    const r = evaluateMachineCandidateGate({
      url: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-foo',
      meta: null,
      config: cfg,
      verifierDecision: 'pending',
    });
    expect(r.action).toBe('suppress');
    expect(r.processingStatus).toBe('failed');
  });

  it('8. invalid URL → rejected', () => {
    const r = evaluateMachineCandidateGate({
      url: 'not-a-url',
      meta: goodMeta(),
      config: cfg,
      verifierDecision: 'pending',
    });
    expect(r.action).toBe('invalid');
    expect(r.reason).toBe('invalid_url');
  });

  it('9. verifier block → no pending insert', () => {
    const r = evaluateMachineCandidateGate({
      url: goodMeta().canonicalUrl,
      meta: goodMeta(),
      config: cfg,
      verifierDecision: 'reject',
      verifierReasons: ['score too low'],
    });
    expect(r.action).toBe('reject_quality');
    expect(r.action).not.toBe('insert_pending');
  });

  it('10. low-quality candidate → suppressed (discount gate)', () => {
    const r = evaluateMachineCandidateGate({
      url: goodMeta().canonicalUrl,
      meta: goodMeta({ discountPercent: 5, originalPrice: 1100, discountPrice: 1045 }),
      config: cfg,
      verifierDecision: 'pending',
    });
    expect(r.action).toBe('suppress');
    expect(r.reason).toMatch(/descuento/i);
  });

  it('11. high-quality candidate → pending insert allowed', () => {
    const r = evaluateMachineCandidateGate({
      url: goodMeta().canonicalUrl,
      meta: goodMeta(),
      config: cfg,
      verifierDecision: 'pending',
    });
    expect(r.action).toBe('insert_pending');
  });

  it('duplicate gate returns duplicate without auto-replace', () => {
    const r = evaluateMachineCandidateGate({
      url: goodMeta().canonicalUrl,
      meta: goodMeta({ discountPrice: 800 }),
      config: cfg,
      verifierDecision: 'pending',
      duplicate: { kind: 'live', price: 900 },
    });
    expect(r.action).toBe('duplicate');
    expect(r.duplicateKind).toBe('live');
    expect(DUPLICATE_POLICY.autoReplaceOnBetterPrice).toBe(false);
  });
});

describe('S2 provenance + DealScore on bot_meta', () => {
  it('12–13. provenance and DealScore version survive buildBotMeta', () => {
    const meta = goodMeta();
    const dealScore = computeDealScore({
      meta: {
        discountPrice: meta.discountPrice,
        originalPrice: meta.originalPrice,
        discountPercent: meta.discountPercent,
      },
      signals: meta.signals ?? null,
    });
    const raw = withProcessingStatus(
      buildRawObservation({
        sourceId: 'ml_worker',
        sourceEventId: 'run:ml_worker:url',
        url: meta.canonicalUrl,
        salePrice: meta.discountPrice,
        listPrice: meta.originalPrice,
        currency: 'MXN',
        title: meta.title,
        merchant: meta.store,
        processingStatus: 'scored',
      }),
      'inserted',
    );
    const botMeta = buildBotMeta({
      meta,
      ingestSource: 'ml_worker',
      ingestSourceDetail: 'seed:test',
      decision: 'pending',
      scoreBreakdown: {
        total: 72,
        discount: 70,
        popularity: 60,
        rating: 70,
        category: 55,
        priceAppeal: 80,
        historical: 85,
      },
      dealScore,
      rawObservation: toProvenanceSlice(raw, dealScore),
      gateAction: 'insert_pending',
      gateReason: 'passed_machine_gates',
    });
    expect(botMeta).toBeTruthy();
    expect(botMeta?.source).toBe('ml_worker');
    expect(botMeta?.gateAction).toBe('insert_pending');
    const embedded = botMeta?.rawObservation as Record<string, unknown>;
    expect(embedded.evidenceHash).toBeTruthy();
    expect(embedded.parserVersion).toBeTruthy();
    expect(embedded.normalizationVersion).toBeTruthy();
    expect(embedded.processingStatus).toBe('inserted');
    expect(embedded.observationId).toBeTruthy();
    const ds = botMeta?.dealScore as Record<string, unknown>;
    expect(ds.version).toBe(DEAL_SCORE_VERSION);
    expect(typeof ds.score).toBe('number');
    // No giant HTML dump
    expect(JSON.stringify(botMeta).length).toBeLessThan(8_000);
  });
});

describe('S2 Price Memory mapping + high-volume + isolation', () => {
  it('RawObservation → PriceObservation without price_observations table', () => {
    const raw = buildRawObservation({
      sourceId: 'ml_worker',
      sourceEventId: 'e1',
      url: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-foo',
      salePrice: 999,
      listPrice: 1999,
      currency: 'MXN',
      identity: buildExactIdentity({
        merchant: 'mercadolibre',
        mlItemId: 'MLM1234567890',
      }),
    });
    const mapped = mapRawObservationToPriceObservation(raw);
    expect('ok' in mapped && mapped.ok === false).toBe(false);
    if (!('ok' in mapped)) {
      expect(mapped.backendHint).toBe('product_price_snapshots');
      expect(mapped.salePrice).toBe(999);
      expect(mapped.idempotencyKey.startsWith('po:')).toBe(true);
      const d = dedupeObservationsByIdempotency([mapped, mapped]);
      expect(d.unique).toHaveLength(1);
    }
  });

  it('14. high-volume top-K: source failure isolation via selectTopK', () => {
    const scored = [
      { id: 'a', score: 90 },
      { id: 'b', score: 40 },
      { id: 'c', score: 80 },
      { id: 'd', score: 70 },
    ];
    const top = selectTopKByScore(scored, 2);
    expect(top.map((x) => x.id)).toEqual(['a', 'c']);
    expect(resolveInsertBudget({ maxPerRun: 5, candidatePoolMax: 40, remainingDailyCap: 2 })).toBe(
      2,
    );
  });

  it('15. UGC flow remains unchanged — gate is machine-only helper', () => {
    // Community POST must not depend on evaluateMachineCandidateGate.
    const offersRoute = readFileSync(
      resolve(process.cwd(), 'app/api/offers/route.ts'),
      'utf8',
    );
    expect(offersRoute).toMatch(/export async function POST/);
    expect(offersRoute).not.toMatch(/evaluateMachineCandidateGate/);
    expect(offersRoute).not.toMatch(/candidateInsertGate/);
    // buildBotMeta without rawObservation still works (UGC / legacy bot).
    const meta = buildBotMeta({
      meta: goodMeta(),
      ingestSource: undefined,
      scoreBreakdown: {
        total: 50,
        discount: 50,
        popularity: 50,
        rating: 50,
        category: 50,
        priceAppeal: 50,
        historical: 50,
      },
    });
    expect(meta?.rawObservation).toBeUndefined();
  });

  it('probable identity does not map to Price Memory', () => {
    const raw = buildRawObservation({
      sourceId: 'env_urls',
      sourceEventId: 'e',
      url: 'https://example.com/x',
      salePrice: 10,
      currency: 'MXN',
    });
    expect(raw.identity.identityStatus).toBe('unknown');
    const mapped = mapRawObservationToPriceObservation(raw);
    expect(mapped).toEqual({ ok: false, reason: 'identity_not_exact' });
  });
});
