import { describe, expect, it } from 'vitest';
import {
  computeHunterBenchmarkMetrics,
  countDuplicates,
  countFalsePositives,
  countVerifiedOpportunities,
  normalizeHunterResult,
} from '@/lib/supply/hunterBenchmark';
import type { AventaOpportunityEvaluation, HunterResult } from '@/lib/supply/hunterBenchmark';

function sampleResult(): HunterResult {
  const out = normalizeHunterResult({
    hunterId: 'hunter-a',
    runId: 'run-metrics',
    sourceId: 'chatgpt_scheduled',
    collectedAt: '2026-09-18T12:00:00.000Z',
    completedAt: '2026-09-18T12:00:05.000Z',
    payload: {
      candidates: [
        {
          url: 'https://www.mercadolibre.com.mx/p/MLM111',
          title: 'Deal A',
          price: { amount: 100, currency: 'MXN', provenance: 'source_explicit' },
          discoveredAt: '2026-09-18T12:00:00.000Z',
        },
        {
          url: 'https://www.mercadolibre.com.mx/p/MLM111/',
          title: 'Deal A duplicate',
          price: { amount: 100, currency: 'MXN', provenance: 'source_explicit' },
          discoveredAt: '2026-09-18T12:00:01.000Z',
        },
        {
          url: 'https://www.mercadolibre.com.mx/p/MLM222',
          title: 'Deal B',
          price: { amount: 200, currency: 'MXN', provenance: 'listing_card' },
          discoveredAt: '2026-09-18T12:00:02.000Z',
        },
        {
          url: 'https://www.mercadolibre.com.mx/p/MLM444',
          title: 'False positive',
          price: { amount: 300, currency: 'MXN', provenance: 'source_explicit' },
          discoveredAt: '2026-09-18T12:00:03.000Z',
        },
      ],
    },
  });
  if (!out.ok) throw new Error('fixture failed');
  return out.result;
}

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
    reasonCodes: ['explicit_discount'],
  },
  {
    evaluationId: 'eval-2',
    candidateKey: 'url:https://www.mercadolibre.com.mx/p/MLM333',
    sourceUrl: 'https://www.mercadolibre.com.mx/p/MLM333',
    title: 'Missed deal',
    isOpportunity: true,
    verified: true,
    currentPrice: 50,
    originalPrice: 100,
    currency: 'MXN',
    evaluatedAt: '2026-09-18T12:10:00.000Z',
    reasonCodes: ['explicit_discount'],
  },
];

describe('hunter benchmark metrics', () => {
  it('computa candidatos, duplicados y oportunidades verificadas', () => {
    const result = sampleResult();
    expect(result.candidates).toHaveLength(4);
    expect(countDuplicates(result.candidates)).toBe(1);
    expect(countVerifiedOpportunities(result.candidates)).toBe(3);
  });

  it('computa precision y latencia determinísticamente', () => {
    const result = sampleResult();
    const metrics = computeHunterBenchmarkMetrics(result, evaluations);
    expect(metrics.candidatesFound).toBe(4);
    expect(metrics.truePositives).toBe(2);
    expect(metrics.falsePositives).toBe(1);
    expect(metrics.falseNegatives).toBe(1);
    expect(metrics.precision).toBeCloseTo(2 / 3);
    expect(metrics.priceAccuracy).toBe(1);
    expect(metrics.detectionLatencyMs).toBe(599_500);
    expect(countFalsePositives(result.candidates, evaluations)).toBe(1);
  });
});
