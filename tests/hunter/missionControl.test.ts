/**
 * Mission Control — novelty, loss funnel, reconciliation, observation boundary.
 */
import { describe, expect, it } from 'vitest';
import {
  assertZeroInsertAttempts,
  assertZeroSilentDrops,
  buildLossFunnelReport,
  buildMissionControlReport,
  classifyLossBucket,
  computeNoveltyRunMetrics,
  observeIngestBatch,
} from '@/lib/hunter/candidateIntelligence';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import type { ScoreBreakdown } from '@/lib/bots/ingest/scoreIngestCandidate';

const breakdown: ScoreBreakdown = {
  discount: 10,
  popularity: 5,
  rating: 5,
  category: 5,
  priceAppeal: 5,
  historical: 10,
  total: 40,
};

const meta = (url: string): ParsedOfferMetadata => ({
  canonicalUrl: url,
  title: 'X',
  store: 'Mercado Libre',
  imageUrl: 'https://http2.mlstatic.com/x.jpg',
  discountPrice: 100,
  originalPrice: 200,
  discountPercent: 50,
});

describe('novelty metrics', () => {
  it('separates URL / identity / product and computes repeat + jaccard', () => {
    const run = [
      {
        canonicalUrl: 'https://ml.mx/a',
        productFingerprint: 'fp-a',
        productIdentifier: 'MLM1',
        source: 'ml_api',
        category: 'electronics',
        rotQuery: 'tv',
        rotPage: 1,
        rotSeedId: 'seed1',
      },
      {
        canonicalUrl: 'https://ml.mx/a?x=1',
        productFingerprint: 'fp-a',
        productIdentifier: 'MLM1',
        source: 'ml_api',
        category: 'electronics',
        rotQuery: 'tv',
        rotPage: 1,
        rotSeedId: 'seed1',
      },
      {
        canonicalUrl: 'https://ml.mx/b',
        productFingerprint: 'fp-b',
        productIdentifier: 'MLM2',
        source: 'ml_worker',
        category: 'home',
        rotQuery: 'silla',
        rotPage: 2,
        rotSeedId: 'seed2',
      },
    ];
    const hist7 = new Set(['fp-a', 'old']);
    const m = computeNoveltyRunMetrics({
      runCandidates: run,
      identities7d: hist7,
      previousRunIdentities: new Set(['fp-a']),
      products7d: hist7,
    });
    expect(m.discovered_count).toBe(3);
    expect(m.unique_url_count).toBe(3);
    expect(m.unique_identity_count).toBe(2);
    expect(m.unique_product_count).toBe(2);
    expect(m.novel_identity_count).toBe(1); // fp-b
    expect(m.repeated_identity_count).toBe(1); // fp-a
    expect(m.jaccard_vs_previous_run).toBeGreaterThan(0);
    expect(m.source_concentration[0]?.key).toBe('ml_api');
    expect(m.page_depth_novelty.some((p) => p.page === 2)).toBe(true);
  });
});

describe('loss funnel accounting', () => {
  it('separates TOPK / DIVERSITY / UNKNOWN / REAL_LOW and reconciles', () => {
    const rows = [
      { decision: 'WOULD_INSERT', reasonCode: 'ok' },
      { decision: 'REJECTED_DISCOUNT', reasonCode: 'low', discountClass: 'DISCOUNT_REAL_LOW', discountPercentage: 10 },
      { decision: 'REJECTED_DISCOUNT', reasonCode: 'unknown', discountClass: 'DISCOUNT_UNKNOWN', discountPercentage: null },
      {
        decision: 'REJECTED_DISCOUNT',
        reasonCode: 'false_zero',
        discountClass: 'DISCOUNT_REAL_GOOD',
        discountPercentage: 65,
        priceEvidence: { calculationStatus: 'conflict', suppliedDiscountPercentage: 0, computedDiscountPercentage: 65 },
      },
      { decision: 'REJECTED_BUDGET', reasonCode: 'score_shortlist_cut', wouldTopkCut: true },
      { decision: 'REJECTED_DIVERSITY', reasonCode: 'diversity_cut', wouldDiversityCut: true },
      { decision: 'DUPLICATE', reasonCode: 'duplicate' },
      { decision: 'REJECTED_QUALITY', reasonCode: 'título baja calidad' },
    ];
    const report = buildLossFunnelReport(rows);
    expect(report.reconciliation.matchesTotal).toBe(true);
    expect(report.separated.WOULD_INSERT).toBe(1);
    expect(report.separated.REAL_LOW_DISCOUNT).toBe(1);
    expect(report.separated.UNKNOWN_DISCOUNT).toBe(1);
    expect(report.separated.FALSE_ZERO_CORRECTED).toBe(1);
    expect(report.separated.TOPK_CUT + report.separated.BUDGET_CUT).toBeGreaterThanOrEqual(1);
    expect(report.separated.DIVERSITY_CUT).toBe(1);
    expect(report.separated.DUPLICATE).toBe(1);
    expect(report.separated.QUALITY_REJECTED).toBe(1);
    expect(classifyLossBucket(rows[2]!)).toBe('DISCOUNT_UNKNOWN');
  });
});

describe('mission control answers', () => {
  it('answers A–H structure with zero silent drops from observe batch', () => {
    const u1 = 'https://www.mercadolibre.com.mx/p/MLM1';
    const u2 = 'https://www.mercadolibre.com.mx/p/MLM2';
    const m1 = meta(u1);
    const m2 = meta(u2);
    const { records, summary } = observeIngestBatch({
      runId: 'mc-1',
      startedAt: '2026-09-20T00:00:00.000Z',
      finishedAt: '2026-09-20T00:01:00.000Z',
      dryRun: true,
      source: 'ml_api',
      rawCandidateUrls: [],
      itemUrls: [u1, u2],
      sliceUrls: [u1, u2],
      results: [
        { url: u1, source: 'ml_api', status: 'skipped', reason: 's91_discovery_only_use_s9_for_writes' },
        { url: u2, source: 'ml_api', status: 'skipped', reason: 'score_shortlist_cut' },
      ],
      metaByUrl: new Map([
        [u1, m1],
        [u2, m2],
      ]),
      resolvedByUrl: new Map([
        [u1, { meta: m1, decision: 'pending', total: 60, breakdown }],
        [u2, { meta: m2, decision: 'pending', total: 55, breakdown }],
      ]),
      topKCutUrls: [u2],
    });
    expect(assertZeroSilentDrops(summary).ok).toBe(true);

    const report = buildMissionControlReport({
      candidates: records.map((r) => ({
        runId: r.runId,
        canonicalUrl: r.canonicalUrl,
        source: r.source,
        category: r.category,
        decision: r.decision,
        reasonCode: r.reasonCode,
        reasonDetail: r.reasonDetail,
        discountClass: r.discountClass,
        discountPercentage: r.discountPercentage,
        funnelStage: r.funnelStage,
        wouldTopkCut: r.wouldTopkCut,
        wouldDiversityCut: r.wouldDiversityCut,
        diversityCut: r.diversityCut,
        negativeMemoryLevel: r.negativeMemoryLevel,
        priceEvidence: r.priceEvidence,
        productFingerprint: r.productFingerprint,
        productIdentifier: r.productIdentifier,
        hunterScore: r.hunterScore,
      })),
      identities7d: new Set(['other']),
    });

    expect(report.answers.A_universe_breadth.discovered).toBe(2);
    expect(report.answers.G_zero_silent_drops.ok).toBe(true);
    expect(report.answers.H_variety_without_money.money_path_untouched).toBe(true);
    expect(report.answers.C_bottleneck.ranked.length).toBeGreaterThan(0);
    expect(report.lossFunnel.reconciliation.matchesTotal).toBe(true);
  });
});

describe('observation boundary', () => {
  it('hard wall: insertedAttempted must be 0', () => {
    expect(assertZeroInsertAttempts({ insertedAttempted: 0 }).ok).toBe(true);
    expect(assertZeroInsertAttempts({ insertedAttempted: 1 }).ok).toBe(false);
    expect(assertZeroInsertAttempts({ publishedAttempted: 2 }).violations[0]).toMatch(/published/);
  });
});
