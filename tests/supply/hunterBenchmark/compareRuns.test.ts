import { describe, expect, it } from 'vitest';
import {
  compareHunterRun,
  compareMultipleHunterRuns,
  normalizeHunterResult,
  rankComparisonsByPrecision,
} from '@/lib/supply/hunterBenchmark';
import type { AventaOpportunityEvaluation } from '@/lib/supply/hunterBenchmark';

const evaluations: AventaOpportunityEvaluation[] = [
  {
    evaluationId: 'eval-1',
    candidateKey: 'url:https://www.mercadolibre.com.mx/p/MLM111',
    sourceUrl: 'https://www.mercadolibre.com.mx/p/MLM111',
    title: 'Deal A',
    isOpportunity: true,
    verified: true,
    currentPrice: 100,
    originalPrice: 150,
    currency: 'MXN',
    evaluatedAt: '2026-09-18T12:10:00.000Z',
    reasonCodes: [],
  },
];

function hunterResult(sourceId: string, runId: string, price: number) {
  const out = normalizeHunterResult({
    hunterId: `hunter-${sourceId}`,
    runId,
    sourceId,
    collectedAt: '2026-09-18T12:00:00.000Z',
    completedAt: '2026-09-18T12:00:05.000Z',
    payload: {
      candidates: [
        {
          url: 'https://www.mercadolibre.com.mx/p/MLM111',
          title: 'Deal A',
          price: { amount: price, currency: 'MXN', provenance: 'source_explicit' },
          discoveredAt: '2026-09-18T12:00:00.000Z',
        },
      ],
    },
  });
  if (!out.ok) throw new Error('fixture failed');
  return out.result;
}

describe('compareRuns', () => {
  it('compara un hunter run contra evaluaciones Aventa', () => {
    const comparison = compareHunterRun({
      hunterResult: hunterResult('chatgpt_scheduled', 'run-a', 100),
      aventaEvaluations: evaluations,
      comparedAt: '2026-09-18T12:20:00.000Z',
    });
    expect(comparison.matchedCandidates).toBe(1);
    expect(comparison.metrics.truePositives).toBe(1);
    expect(comparison.metrics.precision).toBe(1);
  });

  it('rankea múltiples hunters por precision', () => {
    const grokOut = normalizeHunterResult({
      hunterId: 'hunter-grok',
      runId: 'run-b',
      sourceId: 'grok',
      collectedAt: '2026-09-18T12:00:00.000Z',
      completedAt: '2026-09-18T12:00:05.000Z',
      payload: {
        candidates: [
          {
            url: 'https://www.mercadolibre.com.mx/p/MLM999',
            title: 'Wrong deal',
            price: { amount: 500, currency: 'MXN', provenance: 'source_explicit' },
            discoveredAt: '2026-09-18T12:00:00.000Z',
          },
        ],
      },
    });
    if (!grokOut.ok) throw new Error('fixture failed');

    const comparisons = compareMultipleHunterRuns(
      [grokOut.result, hunterResult('chatgpt_scheduled', 'run-a', 100)],
      evaluations,
    );
    const ranked = rankComparisonsByPrecision(comparisons);
    expect(ranked[0]?.sourceId).toBe('chatgpt_scheduled');
    expect(ranked[1]?.metrics.precision).toBe(0);
  });
});
