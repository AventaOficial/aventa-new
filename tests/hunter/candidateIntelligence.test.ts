import { describe, expect, it } from 'vitest';
import {
  buildHunterCandidateRecord,
  buildHunterIntelligenceRunSummary,
  candidateKeyForUrl,
  classifyIngestDisposition,
  classifyLabelOutcome,
  explainScoreBreakdown,
  HUNTER_VERSION,
  isHunterCandidateIntelligenceEnabled,
  observeExternalWorkerBatch,
  SCORING_VERSION,
} from '@/lib/hunter/candidateIntelligence';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import type { ScoreBreakdown } from '@/lib/bots/ingest/scoreIngestCandidate';

const breakdown: ScoreBreakdown = {
  discount: 18,
  popularity: 7,
  rating: 5,
  category: 10,
  priceAppeal: 4,
  historical: 20,
  total: 64,
};

const meta = (url: string, title = 'Audífonos BT'): ParsedOfferMetadata => ({
  canonicalUrl: url,
  title,
  store: 'Mercado Libre',
  imageUrl: 'https://http2.mlstatic.com/x.jpg',
  discountPrice: 499,
  originalPrice: 999,
  discountPercent: 50,
  signals: { ratingAverage: 4.6, ratingCount: 120, categoryId: 'MLM1055' },
});

describe('Candidate Intelligence — taxonomy', () => {
  it('maps negative memory to REJECTED_NEGATIVE_MEMORY', () => {
    const d = classifyIngestDisposition({
      status: 'skipped',
      reason: 'negative_memory:repeat_reject',
    });
    expect(d.decision).toBe('REJECTED_NEGATIVE_MEMORY');
    expect(d.stage).toBe('negative_memory');
  });

  it('maps dry-run / writes disabled', () => {
    expect(
      classifyIngestDisposition({ status: 'skipped', reason: 'machine_pending_writes_disabled' })
        .decision,
    ).toBe('REJECTED_WRITE_GATE');
    expect(
      classifyIngestDisposition({ status: 'would_insert', reason: 'dry_run' }).decision,
    ).toBe('WOULD_INSERT');
  });

  it('maps discount / price / score rejects', () => {
    expect(
      classifyIngestDisposition({
        status: 'skipped',
        reason: 'descuento 12% fuera de rango',
      }).decision,
    ).toBe('REJECTED_DISCOUNT');
    expect(
      classifyIngestDisposition({
        status: 'skipped',
        reason: 'sin precio original verificable',
      }).decision,
    ).toBe('REJECTED_PRICE');
    expect(
      classifyIngestDisposition({
        status: 'skipped',
        reason: 'score 30 < mínimo',
        scoreDecision: 'reject',
      }).decision,
    ).toBe('REJECTED_SCORE');
  });
});

describe('Candidate Intelligence — score explanation', () => {
  it('explains score with named signals', () => {
    const exp = explainScoreBreakdown(breakdown, 64);
    expect(exp.total).toBe(64);
    expect(exp.scoringVersion).toBe(SCORING_VERSION);
    expect(exp.signals.find((s) => s.signal === 'price_drop')?.points).toBe(18);
    expect(exp.signals.find((s) => s.signal === 'historical_price_confidence')?.points).toBe(20);
    expect(exp.summary).toContain('score=64');
  });
});

describe('Candidate Intelligence — versions + flags', () => {
  it('exposes hunter version', () => {
    expect(HUNTER_VERSION).toMatch(/^hunter_intelligence_/);
  });

  it('defaults intelligence ON; disables only on explicit off', () => {
    expect(isHunterCandidateIntelligenceEnabled({} as NodeJS.ProcessEnv)).toBe(true);
    expect(
      isHunterCandidateIntelligenceEnabled({ HUNTER_CANDIDATE_INTELLIGENCE: '0' } as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});

describe('Candidate Intelligence — human labels FP/FN', () => {
  it('detects false negative when human would publish rejected', () => {
    expect(
      classifyLabelOutcome({
        hunterDecision: 'REJECTED_LOW_VALUE',
        humanDecision: 'PUBLISH',
      }),
    ).toBe('false_negative');
  });

  it('detects false positive when human rejects would_insert', () => {
    expect(
      classifyLabelOutcome({
        hunterDecision: 'WOULD_INSERT',
        humanDecision: 'FALSE_DEAL',
      }),
    ).toBe('false_positive');
  });
});

describe('Candidate Intelligence — observe batch + run report', () => {
  it('persists identity-invalid, rejects, diversity cuts, and dry-run would_insert', () => {
    const urlOk = 'https://www.mercadolibre.com.mx/x/p/MLM1234567890';
    const urlCut = 'https://www.mercadolibre.com.mx/x/p/MLM9876543210';
    const urlBad = 'https://www.mercadolibre.com.mx/gz/login';

    const mOk = meta(urlOk);
    const mCut = meta(urlCut, 'TV 55');
    const metaByUrl = new Map([
      [urlOk, mOk],
      [urlCut, mCut],
    ]);
    const resolvedByUrl = new Map([
      [
        urlOk,
        {
          meta: mOk,
          decision: 'pending' as const,
          total: 64,
          breakdown,
        },
      ],
      [
        urlCut,
        {
          meta: mCut,
          decision: 'pending' as const,
          total: 55,
          breakdown,
        },
      ],
    ]);

    const { records, summary } = observeExternalWorkerBatch({
      runId: 'run-ci-1',
      startedAt: '2026-09-20T12:00:00.000Z',
      finishedAt: '2026-09-20T12:01:00.000Z',
      dryRun: true,
      rawCandidateUrls: [{ url: urlBad, reason: 'worker payload inválido' }],
      itemUrls: [urlOk, urlCut],
      sliceUrls: [urlOk, urlCut],
      results: [
        {
          url: urlOk,
          source: 'ml_worker',
          status: 'inserted',
          offerId: 'dry-run-1',
        },
        {
          url: 'https://www.mercadolibre.com.mx/x/p/MLM111',
          source: 'ml_worker',
          status: 'skipped',
          reason: 'descuento 10% fuera de rango',
        },
      ],
      metaByUrl,
      resolvedByUrl,
      diversityCutUrls: [urlCut],
    });

    expect(records.length).toBeGreaterThanOrEqual(4);
    expect(summary.candidateCount).toBe(records.length);
    expect(summary.mode).toBe('observation');
    expect(summary.hunterVersion).toBe(HUNTER_VERSION);

    const dry = records.find((r) => r.canonicalUrl === urlOk);
    expect(dry?.decision).toBe('WOULD_INSERT');
    expect(dry?.scoreExplanation.some((s) => s.signal === 'price_drop')).toBe(true);

    const cut = records.find((r) => r.canonicalUrl === urlCut);
    expect(cut?.decision).toBe('REJECTED_DIVERSITY');
    expect(cut?.diversityCut).toBe(true);

    const invalid = records.find((r) => r.sourceUrl.includes('login') || r.reasonCode.includes('identity') || r.reasonCode.includes('payload') || r.reasonCode.includes('source'));
    expect(invalid).toBeTruthy();

    const discount = records.find((r) => r.decision === 'REJECTED_DISCOUNT');
    expect(discount).toBeTruthy();

    const report = buildHunterIntelligenceRunSummary({
      runId: summary.runId,
      startedAt: summary.startedAt,
      finishedAt: summary.finishedAt,
      records,
    });
    expect(report.rejectedCount).toBeGreaterThanOrEqual(1);
    expect(Object.keys(report.rejectionBreakdown).length).toBeGreaterThan(0);
  });

  it('builds stable candidate keys and versioned records', () => {
    const url = 'https://www.mercadolibre.com.mx/x/p/MLM555';
    const rec = buildHunterCandidateRecord({
      runId: 'r1',
      source: 'ml_worker',
      url,
      meta: meta(url),
      status: 'skipped',
      reason: 'negative_memory:spam',
      scoreTotal: 48,
      breakdown,
    });
    expect(rec.candidateKey).toBe(candidateKeyForUrl(url));
    expect(rec.hunterVersion).toBe(HUNTER_VERSION);
    expect(rec.scoringVersion).toBe(SCORING_VERSION);
    expect(rec.decision).toBe('REJECTED_NEGATIVE_MEMORY');
    expect(rec.rejectionStage).toBe('negative_memory');
  });
});
