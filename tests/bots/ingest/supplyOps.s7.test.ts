/**
 * S7 — Supply operations: run summary, bottleneck diagnosis, write-safety invariants.
 * No Distribution / Rewards / Economy / Attribution. No production write activation.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSupplyOpsRunSummary,
  diagnoseSupplyOpsBottleneck,
  formatSupplyOpsRunSummaryLog,
  type BuildSupplyOpsRunSummaryInput,
} from '@/lib/bots/ingest/supplyOpsRunSummary';
import { isMachinePendingWriteEnabled } from '@/lib/bots/ingest/machineLiveInsertEligibility';
import { ingestRunBlockFromConfig } from '@/lib/bots/ingest/ingestRunGate';
import { resolveCanaryInsertCap } from '@/lib/bots/ingest/machineInsertCanary';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { DealCheckResult, DealVerifierChecks, DealVerifierResult } from '@/lib/verifier/types';
import type { ExternalWorkerCandidate } from '@/lib/bots/ingest/externalWorker';
import {
  getAutonomousDecisionMetrics,
  resetAutonomousDecisionMetrics,
} from '@/lib/autonomous';
import { resetHunterEnrichmentMetrics } from '@/lib/hunter/enrichment';
import { resetDealVerifierMetrics } from '@/lib/verifier';

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => {
    throw new Error('no supabase in s7 supply ops tests');
  },
}));

vi.mock('@/lib/bots/ingest/botIngestPaused', () => ({
  getBotIngestPausedFromDb: vi.fn(async () => false),
}));

vi.mock('@/lib/bots/ingest/botIngestDailyState', () => ({
  getBotOfferCountStartUtc: () => new Date('2026-09-18T06:00:00.000Z'),
  countBotOffersCreatedSinceMulti: vi.fn(async () => 0),
}));

vi.mock('@/lib/hunter/engine', () => ({
  recordExternalSourceBatchHealth: vi.fn(async () => undefined),
}));

vi.mock('@/lib/hunter/healthStore', () => ({
  getHunterHealth: vi.fn(async () => []),
}));

vi.mock('@/lib/bots/ingest/priceIntel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bots/ingest/priceIntel')>();
  return {
    ...actual,
    enrichWithPriceIntel: vi.fn(async (meta: unknown) => meta),
  };
});

vi.mock('@/lib/hunter/enrichment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/hunter/enrichment')>();
  return {
    ...actual,
    enrichParsedOfferMetadata: vi.fn(async (meta: Parameters<typeof actual.enrichParsedOfferMetadata>[0]) => ({
      meta,
      changed: false,
      skippedNetwork: true,
      imageStatus: actual.isValidOfferImage(meta.imageUrl) ? 'valid' : 'missing',
    })),
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

vi.mock('@/lib/bots/ingest/ingestCycleLock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bots/ingest/ingestCycleLock')>();
  return {
    ...actual,
    acquireIngestCycleLock: vi.fn(async () => ({
      acquired: true as const,
      holder: 's7-test',
      reason: 'no_backend' as const,
    })),
  };
});

import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { insertIngestedOffer } from '@/lib/bots/ingest/insertIngestedOffer';
import { evaluateDealSafe } from '@/lib/verifier';
import { processExternalWorkerBatch } from '@/lib/bots/ingest/externalWorker';
import { acquireIngestCycleLock } from '@/lib/bots/ingest/ingestCycleLock';
import { getBotIngestPausedFromDb } from '@/lib/bots/ingest/botIngestPaused';
import { getHunterHealth } from '@/lib/hunter/healthStore';

const WRITES_ENV = 'BOT_INGEST_MACHINE_PENDING_WRITES';

function enableWrites() {
  process.env[WRITES_ENV] = '1';
}

function disableWrites() {
  delete process.env[WRITES_ENV];
}

function baseInput(over: Partial<BuildSupplyOpsRunSummaryInput> = {}): BuildSupplyOpsRunSummaryInput {
  return {
    runId: 'run-s7-test',
    startedAt: '2026-09-18T18:00:00.000Z',
    finishedAt: '2026-09-18T18:00:05.000Z',
    profile: 'standard',
    dryRun: false,
    machinePendingWritesEnabled: false,
    environment: 'test',
    discovered: 10,
    identityValid: 8,
    identityInvalid: 2,
    qualityVerified: 3,
    suppressed: 5,
    duplicates: 0,
    liveEligible: 3,
    budgetRejected: 0,
    writeAttempts: 0,
    writeSuccess: 0,
    writeDuplicate: 0,
    writeFailed: 0,
    writesDisabled: 3,
    dryRunSimulated: 0,
    ...over,
  };
}

function cfg(over: Partial<BotIngestConfig> = {}): BotIngestConfig {
  return {
    profile: 'standard',
    enabled: true,
    botUserId: 'bot-author-s7',
    botUserIdTech: null,
    botUserIdStaples: null,
    botAuthorDualMode: false,
    botUserIdsForQuota: ['bot-author-s7'],
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
    minDiscountPercent: 18,
    category: null,
    urlsFromEnv: [],
    discoverMlEnabled: false,
    mlQueries: [],
    mlCategoryIds: [],
    mlUseDefaultQueries: false,
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
    delayMsMin: 0,
    delayMsMax: 0,
    externalWorkerEnabled: true,
    ...over,
  } as BotIngestConfig;
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

function goodCandidate(n: number, over: Partial<ExternalWorkerCandidate> = {}): ExternalWorkerCandidate {
  return {
    url: `https://articulo.mercadolibre.com.mx/MLM-${1000000000 + n}-producto-test-s7`,
    title: `Audífonos Bluetooth noise cancelling oferta ${n}`,
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_test.jpg',
    discountPrice: 999,
    originalPrice: 1999,
    discountPercent: 50,
    sourceDetail: 'worker:ml:s7',
    signals: {
      cardDiscountSource: 'pdp',
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'source_explicit',
      effectiveDiscountPercent: 50,
      suspectedArtificialListPrice: false,
      habitual30d: 1800,
      soldQuantity: 200,
      ratingAverage: 4.7,
      ratingCount: 80,
      categoryId: 'MLM1648',
    },
    ...over,
  };
}

describe('S7 supplyOpsRunSummary (pure)', () => {
  it('B — diagnoses empty discovery', () => {
    const d = diagnoseSupplyOpsBottleneck(
      baseInput({
        discovered: 0,
        identityValid: 0,
        liveEligible: 0,
        writesDisabled: 0,
        suppressed: 0,
        qualityVerified: 0,
      }),
    );
    expect(d.bottleneck).toBe('discovery_empty');
  });

  it('C — diagnoses discovery_failed when all seeds fail', () => {
    const d = diagnoseSupplyOpsBottleneck(
      baseInput({
        discovered: 0,
        identityValid: 0,
        discoverySeedsAttempted: 4,
        discoverySeedsFailed: 4,
        writesDisabled: 0,
        suppressed: 0,
        qualityVerified: 0,
        liveEligible: 0,
      }),
    );
    expect(d.bottleneck).toBe('discovery_failed');
  });

  it('E — diagnoses identity_invalid', () => {
    const d = diagnoseSupplyOpsBottleneck(
      baseInput({
        discovered: 5,
        identityValid: 0,
        identityInvalid: 5,
        qualityVerified: 0,
        liveEligible: 0,
        writesDisabled: 0,
        suppressed: 0,
      }),
    );
    expect(d.bottleneck).toBe('identity_invalid');
  });

  it('F — diagnoses quality_suppressed', () => {
    const d = diagnoseSupplyOpsBottleneck(
      baseInput({
        identityValid: 5,
        qualityVerified: 0,
        suppressed: 5,
        liveEligible: 0,
        writesDisabled: 0,
      }),
    );
    expect(d.bottleneck).toBe('quality_suppressed');
  });

  it('I — diagnoses budget_exhausted', () => {
    const d = diagnoseSupplyOpsBottleneck(
      baseInput({
        qualityVerified: 5,
        liveEligible: 5,
        budgetRejected: 5,
        writeAttempts: 0,
        writesDisabled: 0,
        machinePendingWritesEnabled: true,
      }),
    );
    expect(d.bottleneck).toBe('budget_exhausted');
  });

  it('J — diagnoses writes_disabled', () => {
    const d = diagnoseSupplyOpsBottleneck(
      baseInput({
        dryRun: false,
        machinePendingWritesEnabled: false,
        productionWriteBlocked: false,
        liveEligible: 3,
        writesDisabled: 3,
      }),
    );
    expect(d.bottleneck).toBe('writes_disabled');
  });

  it('diagnoses dry_run when discovery-only', () => {
    const d = diagnoseSupplyOpsBottleneck(
      baseInput({
        dryRun: true,
        machinePendingWritesEnabled: true,
        liveEligible: 3,
        dryRunSimulated: 3,
        writesDisabled: 0,
      }),
    );
    expect(d.bottleneck).toBe('dry_run');
  });

  it('A/N — run blocks', () => {
    expect(diagnoseSupplyOpsBottleneck(baseInput({ runBlock: 'disabled' })).bottleneck).toBe(
      'ingest_disabled',
    );
    expect(diagnoseSupplyOpsBottleneck(baseInput({ runBlock: 'paused' })).bottleneck).toBe(
      'ingest_paused',
    );
    expect(diagnoseSupplyOpsBottleneck(baseInput({ runBlock: 'missing_bot_user' })).bottleneck).toBe(
      'missing_bot_user',
    );
    expect(diagnoseSupplyOpsBottleneck(baseInput({ runBlock: 'concurrent' })).bottleneck).toBe(
      'concurrent_lock',
    );
  });

  it('M — structured run summary + safe log', () => {
    const summary = buildSupplyOpsRunSummary(
      baseInput({
        writeSuccess: 2,
        machinePendingWritesEnabled: true,
        productionWriteBlocked: false,
        writesDisabled: 0,
      }),
    );
    expect(summary.runId).toBe('run-s7-test');
    expect(summary.durationMs).toBe(5000);
    expect(summary.normalized).toBe(summary.identityValid);
    expect(summary.bottleneck).toBe('none');
    expect(summary.offersSentToModeration).toBe(2);
    const log = formatSupplyOpsRunSummaryLog(summary);
    expect(log).toContain('[supply-ops]');
    expect(log).toContain('bottleneck=none');
    expect(log).toContain('moderation=2');
    expect(log).not.toMatch(/cookie|secret|token/i);
  });

  it('N — machine writes OFF by default', () => {
    const prev = process.env[WRITES_ENV];
    delete process.env[WRITES_ENV];
    expect(isMachinePendingWriteEnabled()).toBe(false);
    if (prev !== undefined) process.env[WRITES_ENV] = prev;
  });

  it('N — ingestRunGate requires enabled + author', () => {
    expect(ingestRunBlockFromConfig({ enabled: false, botUserIdsForQuota: ['x'] }, false)).toBe(
      'disabled',
    );
    expect(ingestRunBlockFromConfig({ enabled: true, botUserIdsForQuota: [] }, false)).toBe(
      'missing_bot_user',
    );
    expect(ingestRunBlockFromConfig({ enabled: true, botUserIdsForQuota: ['x'] }, true)).toBe(
      'paused',
    );
    expect(ingestRunBlockFromConfig({ enabled: true, botUserIdsForQuota: ['x'] }, false)).toBeNull();
  });

  it('I — canary cap never exceeds hard budget', () => {
    expect(resolveCanaryInsertCap(10, 3)).toBe(3);
    expect(resolveCanaryInsertCap(2, 3)).toBe(2);
    expect(resolveCanaryInsertCap(10, 0)).toBe(0);
    expect(resolveCanaryInsertCap(10, undefined)).toBe(10);
  });
});

describe('S7 processExternalWorkerBatch funnel', () => {
  beforeEach(() => {
    resetAutonomousDecisionMetrics();
    resetHunterEnrichmentMetrics();
    resetDealVerifierMetrics();
    disableWrites();
    vi.mocked(loadBotIngestConfig).mockReturnValue(cfg());
    vi.mocked(evaluateDealSafe).mockReturnValue(verifier());
    vi.mocked(insertIngestedOffer).mockResolvedValue({ ok: true, offerId: 'offer-s7-1' });
    vi.mocked(getBotIngestPausedFromDb).mockResolvedValue(false);
    vi.mocked(getHunterHealth).mockResolvedValue([]);
    vi.mocked(acquireIngestCycleLock).mockResolvedValue({
      acquired: true,
      holder: 's7-test',
      reason: 'no_backend',
    });
    vi.mocked(insertIngestedOffer).mockClear();
    vi.mocked(evaluateDealSafe).mockClear();
  });

  it('B — empty discovery → discovery_empty, no writes', async () => {
    const report = await processExternalWorkerBatch({
      candidates: [],
      profile: 'standard',
      dryRun: false,
      discovery: {
        cycleIndex: 1,
        seedsAvailable: 3,
        seedsAttempted: 3,
        seedsSuccessful: 3,
        seedsZeroResults: 3,
        seedsFailed: 0,
        bySeed: [],
      },
    });
    expect(report.summary.ops?.bottleneck).toBe('discovery_empty');
    expect(report.summary.ops?.discovered).toBe(0);
    expect(report.summary.inserted).toBe(0);
    expect(vi.mocked(insertIngestedOffer)).not.toHaveBeenCalled();
  });

  it('C — all seeds failed → discovery_failed', async () => {
    const report = await processExternalWorkerBatch({
      candidates: [],
      profile: 'standard',
      dryRun: false,
      discovery: {
        cycleIndex: 1,
        seedsAvailable: 2,
        seedsAttempted: 2,
        seedsSuccessful: 0,
        seedsZeroResults: 0,
        seedsFailed: 2,
        bySeed: [
          { id: 'a', status: 'failed', rawLinks: 0, accepted: 0 },
          { id: 'b', status: 'failed', rawLinks: 0, accepted: 0 },
        ],
      },
    });
    expect(report.summary.ops?.bottleneck).toBe('discovery_failed');
  });

  it('D/E — invalid payload → identity_invalid', async () => {
    const report = await processExternalWorkerBatch({
      candidates: [
        {
          url: '',
          title: '',
          store: null,
          imageUrl: null,
          discountPrice: 0,
          originalPrice: null,
        },
      ],
      profile: 'standard',
      dryRun: false,
    });
    expect(report.summary.ops?.discovered).toBe(1);
    expect(report.summary.ops?.identityValid).toBe(0);
    expect(report.summary.ops?.bottleneck).toBe('identity_invalid');
    expect(vi.mocked(insertIngestedOffer)).not.toHaveBeenCalled();
  });

  it('H — duplicate URL in batch counted once', async () => {
    const c = goodCandidate(1);
    const report = await processExternalWorkerBatch({
      candidates: [c, { ...c }],
      profile: 'standard',
      dryRun: true,
    });
    expect(report.summary.ops?.discovered).toBe(2);
    expect(report.summary.ops?.identityValid).toBe(1);
    expect(report.summary.ops?.reasonCodes?.['duplicado dentro del lote worker']).toBe(1);
  });

  it('F — quality suppression surfaces in ops', async () => {
    const report = await processExternalWorkerBatch({
      candidates: [
        goodCandidate(2, {
          signals: {
            cardDiscountSource: 'badge_reconstructed',
            cardBadgePercent: 50,
            listingTypeId: 'worker_card',
          },
        }),
      ],
      profile: 'standard',
      dryRun: false,
    });
    expect(report.summary.ops?.identityValid).toBeGreaterThan(0);
    expect(report.summary.ops?.qualityVerified).toBe(0);
    expect(report.summary.ops?.suppressed).toBeGreaterThan(0);
    expect(report.summary.ops?.bottleneck).toBe('quality_suppressed');
    expect(vi.mocked(insertIngestedOffer)).not.toHaveBeenCalled();
  });

  it('G/J — verified + live eligible but writes OFF → writes_disabled', async () => {
    expect(isMachinePendingWriteEnabled()).toBe(false);
    const report = await processExternalWorkerBatch({
      candidates: [goodCandidate(3)],
      profile: 'standard',
      dryRun: false,
    });
    expect(report.summary.ops?.liveEligible).toBeGreaterThan(0);
    expect(report.summary.ops?.writesDisabled).toBeGreaterThan(0);
    expect(report.summary.ops?.bottleneck).toBe('writes_disabled');
    expect(report.summary.ops?.writeSuccess).toBe(0);
    expect(vi.mocked(insertIngestedOffer)).not.toHaveBeenCalled();
  });

  it('dryRun simulates without insertIngestedOffer', async () => {
    const report = await processExternalWorkerBatch({
      candidates: [goodCandidate(4)],
      profile: 'standard',
      dryRun: true,
    });
    expect(report.summary.ops?.bottleneck).toBe('dry_run');
    expect(report.summary.ops?.dryRunSimulated).toBeGreaterThan(0);
    expect(vi.mocked(insertIngestedOffer)).not.toHaveBeenCalled();
  });

  it('K — controlled write inserts pending when flag ON', async () => {
    enableWrites();
    const report = await processExternalWorkerBatch({
      candidates: [goodCandidate(5)],
      profile: 'standard',
      dryRun: false,
    });
    expect(report.summary.ops?.writeAttempts).toBeGreaterThan(0);
    expect(report.summary.ops?.writeSuccess).toBe(1);
    expect(report.summary.ops?.bottleneck).toBe('none');
    expect(vi.mocked(insertIngestedOffer)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(insertIngestedOffer)).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ status: 'pending' }),
    );
    disableWrites();
  });

  it('L — insert duplicate is idempotent', async () => {
    enableWrites();
    vi.mocked(insertIngestedOffer).mockResolvedValue({
      ok: false,
      duplicate: true,
      duplicateKind: 'fingerprint',
      supplyOpportunity: false,
    });
    const report = await processExternalWorkerBatch({
      candidates: [goodCandidate(6)],
      profile: 'standard',
      dryRun: false,
    });
    expect(report.summary.ops?.writeDuplicate).toBe(1);
    expect(report.summary.ops?.writeSuccess).toBe(0);
    expect(report.results.some((r) => r.status === 'duplicate')).toBe(true);
    disableWrites();
  });

  it('A — ingest_disabled early return includes ops', async () => {
    vi.mocked(loadBotIngestConfig).mockReturnValue(
      cfg({ enabled: false, botUserIdsForQuota: ['bot-author-s7'] }),
    );
    const report = await processExternalWorkerBatch({
      candidates: [goodCandidate(7)],
      profile: 'standard',
      dryRun: false,
    });
    expect(report.summary.ops?.bottleneck).toBe('ingest_disabled');
    expect(vi.mocked(insertIngestedOffer)).not.toHaveBeenCalled();
  });

  it('A — concurrent lock early return', async () => {
    vi.mocked(acquireIngestCycleLock).mockResolvedValue({
      acquired: false,
      reason: 'held',
    });
    const report = await processExternalWorkerBatch({
      candidates: [goodCandidate(8)],
      profile: 'standard',
      dryRun: false,
    });
    expect(report.summary.ops?.bottleneck).toBe('concurrent_lock');
    expect(vi.mocked(insertIngestedOffer)).not.toHaveBeenCalled();
  });

  it('I — canaryCap 0 → budgetRejected, no write attempts', async () => {
    enableWrites();
    const report = await processExternalWorkerBatch({
      candidates: [goodCandidate(9), goodCandidate(10)],
      profile: 'standard',
      dryRun: false,
      canaryCap: 0,
    });
    expect(report.summary.ops?.liveEligible).toBeGreaterThan(0);
    expect(report.summary.ops?.budgetRejected).toBeGreaterThan(0);
    expect(report.summary.ops?.writeAttempts).toBe(0);
    expect(vi.mocked(insertIngestedOffer)).not.toHaveBeenCalled();
    disableWrites();
  });

  it('shadow still evaluates when writes OFF (Distribution not activated)', async () => {
    const report = await processExternalWorkerBatch({
      candidates: [goodCandidate(11)],
      profile: 'standard',
      dryRun: false,
    });
    expect(report.summary.ops?.bottleneck).toBe('writes_disabled');
    expect(getAutonomousDecisionMetrics().evaluated).toBeGreaterThan(0);
    expect(vi.mocked(insertIngestedOffer)).not.toHaveBeenCalled();
  });
});
