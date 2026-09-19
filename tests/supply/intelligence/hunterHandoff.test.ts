import { describe, expect, it } from 'vitest';
import {
  opportunityCandidateFromHunterHandoff,
  evaluateOpportunity,
} from '@/lib/supply/intelligence';
import { hunterCandidateToS8Input } from '@/lib/supply/hunterBenchmark';
import type { HunterBenchmarkCandidate } from '@/lib/supply/hunterBenchmark';

describe('S8 ← S8.1 handoff', () => {
  it('maps hunter DTO to OpportunityCandidate without inventing reference trust', async () => {
    const candidate: HunterBenchmarkCandidate = {
      candidateId: 'h1',
      sourceUrl: 'https://www.mercadolibre.com.mx/x/MLM123',
      canonicalUrl: 'https://www.mercadolibre.com.mx/x/MLM123',
      title: 'Audífonos',
      currentPrice: {
        amount: 499,
        currency: 'MXN',
        provenance: 'source_explicit',
        observedAt: '2026-09-19T00:00:00.000Z',
      },
      originalPrice: {
        amount: 999,
        currency: 'MXN',
        provenance: 'unknown',
        observedAt: '2026-09-19T00:00:00.000Z',
      },
      identitySignals: [{ kind: 'url', value: 'https://www.mercadolibre.com.mx/x/MLM123', confidence: 1 }],
      discoveredAt: '2026-09-19T00:00:00.000Z',
      metadata: {},
    };
    const dto = hunterCandidateToS8Input(candidate);
    const opp = opportunityCandidateFromHunterHandoff(dto);
    expect(opp).not.toBeNull();
    expect(opp!.salePrice).toBe(499);
    expect(opp!.declaredOriginalPrice).toBe(999);

    const evaluation = await evaluateOpportunity(opp!, {
      skipAdapterFetch: true,
      forceDryRun: true,
    });
    // Untrusted declared original must not auto-approve as verified opportunity alone
    expect(evaluation.evidence.referencePrice?.trusted ?? false).toBe(false);
    expect(['REJECT', 'PARTIAL', 'OPPORTUNITY']).toContain(evaluation.decision);
  });

  it('fail-closed on missing url / price', () => {
    expect(opportunityCandidateFromHunterHandoff({ sourceUrl: null, currentPrice: 10 })).toBeNull();
    expect(
      opportunityCandidateFromHunterHandoff({
        sourceUrl: 'https://x.example/a',
        currentPrice: 0,
      }),
    ).toBeNull();
  });
});
