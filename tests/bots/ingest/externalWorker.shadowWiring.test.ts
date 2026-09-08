import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { DealCheckResult, DealVerifierChecks, DealVerifierResult } from '@/lib/verifier/types';
import type { ExternalWorkerCandidate } from '@/lib/bots/ingest/externalWorker';
import {
  getAutonomousDecisionMetrics,
  resetAutonomousDecisionMetrics,
} from '@/lib/autonomous';
import { getHunterEnrichmentMetrics, resetHunterEnrichmentMetrics } from '@/lib/hunter/enrichment';
import { resetDealVerifierMetrics } from '@/lib/verifier';

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => {
    throw new Error('no supabase in shadow wiring tests');
  },
}));

vi.mock('@/lib/bots/ingest/botIngestPaused', () => ({
  getBotIngestPausedFromDb: vi.fn(async () => false),
}));

vi.mock('@/lib/bots/ingest/botIngestDailyState', () => ({
  getBotOfferCountStartUtc: () => new Date('2026-09-08T06:00:00.000Z'),
  countBotOffersCreatedSinceMulti: vi.fn(async () => 0),
}));

vi.mock('@/lib/hunter/engine', () => ({
  recordExternalSourceBatchHealth: vi.fn(async () => undefined),
}));

vi.mock('@/lib/bots/ingest/priceIntel', () => ({
  enrichWithPriceIntel: vi.fn(async (meta: unknown) => meta),
}));

vi.mock('@/lib/hunter/enrichment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/hunter/enrichment')>();
  return {
    ...actual,
    enrichParsedOfferMetadata: vi.fn(async (meta: Parameters<typeof actual.enrichParsedOfferMetadata>[0], opts) => {
      actual.recordHunterEnrichment({
        source: actual.enrichmentSourceLabel(opts.source, opts.sourceDetail),
        changed: false,
        skippedNetwork: true,
        imageFound: actual.isValidOfferImage(meta.imageUrl),
        titleFound: Boolean(meta.title?.trim()),
        priceFound: Number.isFinite(meta.discountPrice) && meta.discountPrice > 0,
        failed: false,
        fullyComplete: true,
      });
      return {
        meta,
        changed: false,
        skippedNetwork: true,
        imageStatus: actual.isValidOfferImage(meta.imageUrl) ? 'valid' : 'missing',
      };
    }),
  };
});

vi.mock('@/lib/bots/ingest/insertIngestedOffer', () => ({
  insertIngestedOffer: vi.fn(),
}));

vi.mock('@/lib/bots/ingest/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bots/ingest/config')>();
  return { ...actual, loadBotIngestConfig: vi.fn() };
});

vi.mock('@/lib/verifier', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/verifier')>();
  return { ...actual, evaluateDealSafe: vi.fn() };
});

import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { insertIngestedOffer } from '@/lib/bots/ingest/insertIngestedOffer';
import { evaluateDealSafe } from '@/lib/verifier';
import { processExternalWorkerBatch } from '@/lib/bots/ingest/externalWorker';
import { recordExternalSourceBatchHealth } from '@/lib/hunter/engine';
import { enrichParsedOfferMetadata } from '@/lib/hunter/enrichment';
import { getBotIngestPausedFromDb } from '@/lib/bots/ingest/botIngestPaused';

function cfg(over: Partial<BotIngestConfig> = {}): BotIngestConfig {
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
    normalMaxPerRunMin: 10,
    normalMaxPerRunMax: 10,
    boostMaxOffers: 20,
    boostLocalHourStart: 7,
    boostLocalMinuteEnd: 30,
    dailyMaxOffers: 120,
    candidatePoolMax: 40,
    maxPerRun: 10,
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
    titleBlocklistSpamRe: null,
    ...over,
  };
}

function pass(detail: string): DealCheckResult {
  return { status: 'pass', detail };
}
function unknown(detail: string): DealCheckResult {
  return { status: 'unknown', detail };
}

function checks(over: Partial<DealVerifierChecks> = {}): DealVerifierChecks {
  return {
    price: pass('Precios coherentes'),
    discount: pass('Descuento 50%'),
    duplicate: unknown('duplicate_not_checked'),
    seller: pass('ML seller'),
    availability: unknown('n/a'),
    quality: pass('Calidad OK'),
    risk: pass('Sin riesgo'),
    ...over,
  };
}

function verifier(over: Partial<DealVerifierResult> = {}): DealVerifierResult {
  return {
    decision: 'review',
    score: 70,
    confidence: 0.8,
    reasons: ['Score 70'],
    checks: checks(),
    breakdown: {
      discount: 50,
      popularity: 40,
      rating: 50,
      category: 80,
      priceAppeal: 50,
      historical: 70,
      total: 70,
    },
    ingestDecision: 'pending',
    duplicateOfferId: null,
    ...over,
  };
}

function candidate(over: Partial<ExternalWorkerCandidate> = {}): ExternalWorkerCandidate {
  return {
    url: 'https://articulo.mercadolibre.com.mx/MLM-123456789-audifonos-bluetooth',
    title: 'Audífonos bluetooth con cancelación de ruido activa',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_123456-MLM.webp',
    discountPrice: 499,
    originalPrice: 999,
    discountPercent: 50,
    sourceDetail: 'worker:ml',
    ...over,
  };
}

describe('FASE 4.5.1 ml_worker shadow wiring', () => {
  beforeEach(() => {
    resetAutonomousDecisionMetrics();
    resetHunterEnrichmentMetrics();
    resetDealVerifierMetrics();
    vi.mocked(loadBotIngestConfig).mockReturnValue(cfg());
    vi.mocked(evaluateDealSafe).mockImplementation(() => verifier());
    vi.mocked(insertIngestedOffer).mockResolvedValue({ ok: true, offerId: 'offer-1' });
    vi.mocked(recordExternalSourceBatchHealth).mockClear();
    vi.mocked(insertIngestedOffer).mockClear();
    vi.mocked(evaluateDealSafe).mockClear();
    vi.mocked(enrichParsedOfferMetadata).mockClear();
    vi.mocked(getBotIngestPausedFromDb).mockResolvedValue(false);
  });

  it('A. candidato ml_worker llega a enrichment + shadow cuando corresponde', async () => {
    const report = await processExternalWorkerBatch({ candidates: [candidate()] });
    expect(report.summary.inserted).toBe(1);
    expect(vi.mocked(enrichParsedOfferMetadata)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(evaluateDealSafe)).toHaveBeenCalledTimes(1);
    const shadow = getAutonomousDecisionMetrics();
    expect(shadow.evaluated).toBe(1);
    expect(shadow.bySource.ml_worker.evaluated).toBe(1);
    expect(getHunterEnrichmentMetrics().candidatesFound).toBe(1);
    expect(getHunterEnrichmentMetrics().bySource.ml_worker.candidatesFound).toBe(1);
  });

  it('B. duplicate intra-lote no infla shadow; duplicate de insert sí se observó una vez', async () => {
    const url = 'https://articulo.mercadolibre.com.mx/MLM-555000111-teclado-mecanico-rgb';
    const dupInBatch = await processExternalWorkerBatch({
      candidates: [candidate({ url, canonicalUrl: url }), candidate({ url, canonicalUrl: url })],
    });
    expect(dupInBatch.summary.sourceStats.ml_worker.collected).toBe(2);
    expect(getAutonomousDecisionMetrics().evaluated).toBe(1);
    expect(getHunterEnrichmentMetrics().candidatesFound).toBe(1);

    resetAutonomousDecisionMetrics();
    resetHunterEnrichmentMetrics();
    vi.mocked(insertIngestedOffer).mockResolvedValueOnce({
      ok: false,
      duplicate: true,
      duplicateKind: 'pending_fresh',
    });
    const insertDup = await processExternalWorkerBatch({
      candidates: [candidate({ url: 'https://articulo.mercadolibre.com.mx/MLM-777888999-monitor-gamer-27' })],
    });
    expect(insertDup.summary.duplicate).toBe(1);
    expect(insertDup.summary.inserted).toBe(0);
    expect(getAutonomousDecisionMetrics().evaluated).toBe(1);
    expect(getAutonomousDecisionMetrics().autoReject).toBe(0);
  });

  it('C. reject del verifier se observa y no inserta', async () => {
    const rejected = verifier({
      decision: 'reject',
      ingestDecision: 'reject',
      score: 20,
      reasons: ['Score 20 < mínimo de publicación'],
    });
    vi.mocked(evaluateDealSafe).mockReturnValue(rejected);
    const report = await processExternalWorkerBatch({ candidates: [candidate()] });
    expect(report.summary.rejected).toBe(1);
    expect(report.summary.inserted).toBe(0);
    expect(vi.mocked(insertIngestedOffer)).not.toHaveBeenCalled();
    expect(getAutonomousDecisionMetrics().evaluated).toBe(1);
    expect(rejected.ingestDecision).toBe('reject');
  });

  it('D. insertado queda observado; quality skip no entra a shadow', async () => {
    await processExternalWorkerBatch({ candidates: [candidate()] });
    expect(getAutonomousDecisionMetrics().evaluated).toBe(1);
    expect(vi.mocked(insertIngestedOffer)).toHaveBeenCalledTimes(1);

    resetAutonomousDecisionMetrics();
    resetHunterEnrichmentMetrics();
    vi.mocked(insertIngestedOffer).mockClear();
    vi.mocked(evaluateDealSafe).mockClear();
    const skipped = await processExternalWorkerBatch({
      candidates: [candidate({ originalPrice: 100, discountPrice: 120, discountPercent: 0 })],
    });
    expect(skipped.summary.inserted).toBe(0);
    expect(getHunterEnrichmentMetrics().candidatesFound).toBe(1);
    expect(getAutonomousDecisionMetrics().evaluated).toBe(0);
    expect(vi.mocked(evaluateDealSafe)).not.toHaveBeenCalled();
    expect(vi.mocked(insertIngestedOffer)).not.toHaveBeenCalled();
  });

  it('E. un candidato no duplica métricas shadow ni enrichment', async () => {
    await processExternalWorkerBatch({ candidates: [candidate()] });
    expect(getAutonomousDecisionMetrics().evaluated).toBe(1);
    expect(getHunterEnrichmentMetrics().candidatesFound).toBe(1);
    expect(vi.mocked(evaluateDealSafe)).toHaveBeenCalledTimes(1);
  });

  it('F. ciclo sin candidatos → 0 en shadow y enrichment', async () => {
    const report = await processExternalWorkerBatch({ candidates: [] });
    expect(report.summary.inserted).toBe(0);
    expect(getAutonomousDecisionMetrics().evaluated).toBe(0);
    expect(getHunterEnrichmentMetrics().candidatesFound).toBe(0);
    expect(vi.mocked(insertIngestedOffer)).not.toHaveBeenCalled();
  });

  it('G. no muta ingestDecision ni llama insert en skip de payload inválido', async () => {
    const verified = verifier();
    vi.mocked(evaluateDealSafe).mockReturnValue(verified);
    await processExternalWorkerBatch({
      candidates: [{ ...candidate(), url: '', title: '', discountPrice: 0, originalPrice: null }],
    });
    expect(verified.ingestDecision).toBe('pending');
    expect(vi.mocked(insertIngestedOffer)).not.toHaveBeenCalled();
    expect(getAutonomousDecisionMetrics().evaluated).toBe(0);
  });

  it('H. duplicados se desglosan por tipo en el summary del ciclo', async () => {
    vi.mocked(insertIngestedOffer).mockResolvedValue({
      ok: false,
      duplicate: true,
      duplicateKind: 'pending_stale',
    });
    const report = await processExternalWorkerBatch({
      candidates: [
        candidate({ url: 'https://articulo.mercadolibre.com.mx/MLM-111222333-teclado-mecanico' }),
        candidate({ url: 'https://articulo.mercadolibre.com.mx/MLM-444555666-mouse-inalambrico' }),
      ],
    });
    expect(report.summary.duplicate).toBe(2);
    expect(report.summary.duplicateKindCounts).toEqual({ pending_stale: 2 });
    expect(report.summary.inserted).toBe(0);
  });

  it('I. sin duplicados el summary no emite duplicateKindCounts', async () => {
    const report = await processExternalWorkerBatch({ candidates: [candidate()] });
    expect(report.summary.inserted).toBe(1);
    expect(report.summary.duplicateKindCounts).toBeUndefined();
  });

  it('J. persistencia shadow no rompe el ciclo cuando no hay cliente supabase', async () => {
    const report = await processExternalWorkerBatch({ candidates: [candidate()] });
    expect(report.ok).toBe(true);
    expect(report.summary.inserted).toBe(1);
    expect(getAutonomousDecisionMetrics().evaluated).toBe(1);
  });

  it('kill-switch: paused no inserta ni observa', async () => {
    vi.mocked(getBotIngestPausedFromDb).mockResolvedValue(true);
    const report = await processExternalWorkerBatch({ candidates: [candidate()] });
    expect(report.pausedByOwner).toBe(true);
    expect(report.summary.inserted).toBe(0);
    expect(vi.mocked(insertIngestedOffer)).not.toHaveBeenCalled();
    expect(getAutonomousDecisionMetrics().evaluated).toBe(0);
    expect(vi.mocked(recordExternalSourceBatchHealth)).not.toHaveBeenCalled();
  });
});
