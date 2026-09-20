import { describe, expect, it } from 'vitest';
import {
  assertZeroSilentDrops,
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

const meta = (url: string, title: string): ParsedOfferMetadata => ({
  canonicalUrl: url,
  title,
  store: 'Mercado Libre',
  imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_1-F.jpg',
  discountPrice: 100,
  originalPrice: 200,
  discountPercent: 50,
});

describe('Zero Silent Drops — observeIngestBatch reconciliation', () => {
  it('discovered equals sum of terminal decisions including discovery skips + topK + s91', () => {
    const u1 = 'https://www.mercadolibre.com.mx/p/MLM1';
    const u2 = 'https://www.mercadolibre.com.mx/p/MLM2';
    const u3 = 'https://www.mercadolibre.com.mx/p/MLM3';
    const u4 = 'https://www.mercadolibre.com.mx/p/MLM4';
    const uSkip = 'https://www.mercadolibre.com.mx/p/MLM9';

    const m1 = meta(u1, 'A');
    const m2 = meta(u2, 'B');
    const m3 = meta(u3, 'C');
    const metaByUrl = new Map([
      [u1, m1],
      [u2, m2],
      [u3, m3],
    ]);
    const resolvedByUrl = new Map([
      [u1, { meta: m1, decision: 'pending' as const, total: 60, breakdown }],
      [u2, { meta: m2, decision: 'pending' as const, total: 55, breakdown }],
      [u3, { meta: m3, decision: 'reject' as const, total: 20, breakdown }],
    ]);

    const { records, summary } = observeIngestBatch({
      runId: 'recon-1',
      startedAt: '2026-09-20T12:00:00.000Z',
      finishedAt: '2026-09-20T12:01:00.000Z',
      dryRun: true,
      source: 'ml_api',
      rawCandidateUrls: [
        { url: uSkip, reason: 'ml discovery: descuento 5% < mínimo 20%', source: 'ml_api' },
      ],
      itemUrls: [u1, u2, u3, u4],
      sliceUrls: [u1, u2, u3],
      results: [
        {
          url: u3,
          source: 'ml_api',
          status: 'skipped',
          reason: 'score 20 < mínimo',
        },
        {
          url: u1,
          source: 'ml_api',
          status: 'skipped',
          reason: 's91_discovery_only_use_s9_for_writes',
        },
        {
          url: u2,
          source: 'ml_api',
          status: 'skipped',
          reason: 'score_shortlist_cut',
        },
      ],
      metaByUrl,
      resolvedByUrl,
      // u4 is pool truncated (in itemUrls, not slice, not results)
      // u2 also in topKCutUrls but already in results — should not double
      topKCutUrls: [u2],
    });

    const recon = assertZeroSilentDrops(summary);
    expect(recon.ok).toBe(true);
    expect(summary.candidateCount).toBe(records.length);
    // discovery skip + pool cut u4 + u3 score + u1 would_insert + u2 budget
    expect(records.length).toBe(5);

    expect(records.find((r) => r.canonicalUrl.includes('MLM9'))?.decision).toMatch(
      /REJECTED_DISCOUNT|REJECTED_/,
    );
    expect(records.find((r) => r.canonicalUrl === u4)?.reasonCode).toMatch(/budget|pool/i);
    expect(records.find((r) => r.canonicalUrl === u1)?.decision).toBe('WOULD_INSERT');
    expect(records.find((r) => r.canonicalUrl === u2)?.decision).toBe('REJECTED_BUDGET');
  });
});
