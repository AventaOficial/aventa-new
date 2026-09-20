import { describe, expect, it } from 'vitest';
import { buildParsedMetaFromOpportunity } from '@/lib/supply/s7Bridge';
import type { OpportunityCandidate, OpportunityEvaluation } from '@/lib/supply/intelligence/types';
import { automationCandidatesFromHunterResult } from '@/lib/supply/automation';
import type { HunterResult } from '@/lib/supply/hunterBenchmark';

describe('S9 s7Bridge mapping', () => {
  it('builds ParsedOfferMetadata without fabricating URLs', () => {
    const candidate: OpportunityCandidate = {
      url: 'https://articulo.mercadolibre.com.mx/MLM-999',
      canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-999',
      title: 'Laptop gaming',
      imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_x.jpg',
      salePrice: 10000,
      store: 'Mercado Libre',
    };
    const evaluation: OpportunityEvaluation = {
      candidateUrl: candidate.url,
      productFingerprint: 'fp',
      decision: 'OPPORTUNITY',
      score: {
        value: 70,
        confidence: 0.7,
        reasonCodes: ['VERIFIED_OPPORTUNITY'],
        breakdown: {
          priceEvidence: 30,
          discountMagnitude: 20,
          historySupport: 10,
          qualitySignals: 10,
        },
      },
      evidence: {
        salePrice: {
          amount: 10000,
          kind: 'listing_card',
          source: 'ml',
          observedAt: new Date().toISOString(),
          trusted: true,
        },
        referencePrice: {
          amount: 15000,
          kind: 'listing_card',
          source: 'ml',
          observedAt: new Date().toISOString(),
          trusted: true,
        },
        discountPercent: 33,
        evidenceLevel: 'strong_card',
        historyReady: false,
        suspectedArtificialListPrice: false,
        hasImage: true,
        productFingerprint: 'fp',
        signals: {},
      },
      evaluatedAt: new Date().toISOString(),
      dryRun: true,
      adapterNotes: [],
    };

    const meta = buildParsedMetaFromOpportunity({ candidate, evaluation });
    expect(meta).not.toBeNull();
    expect(meta!.canonicalUrl).toBe(candidate.url);
    expect(meta!.discountPrice).toBe(10000);
    expect(meta!.originalPrice).toBe(15000);
    expect(meta!.imageUrl).toBeTruthy();
  });

  it('rejects missing image (no fabrication)', () => {
    const candidate: OpportunityCandidate = {
      url: 'https://articulo.mercadolibre.com.mx/MLM-1',
      title: 'No image',
      salePrice: 100,
      imageUrl: null,
    };
    const evaluation: OpportunityEvaluation = {
      candidateUrl: candidate.url,
      productFingerprint: null,
      decision: 'OPPORTUNITY',
      score: {
        value: 50,
        confidence: 0.5,
        reasonCodes: [],
        breakdown: {
          priceEvidence: 0,
          discountMagnitude: 0,
          historySupport: 0,
          qualitySignals: 0,
        },
      },
      evidence: {
        salePrice: {
          amount: 100,
          kind: 'listing_card',
          source: 't',
          observedAt: new Date().toISOString(),
          trusted: true,
        },
        referencePrice: {
          amount: 200,
          kind: 'listing_card',
          source: 't',
          observedAt: new Date().toISOString(),
          trusted: true,
        },
        discountPercent: 50,
        evidenceLevel: 'strong_card',
        historyReady: false,
        suspectedArtificialListPrice: false,
        hasImage: false,
        productFingerprint: null,
        signals: {},
      },
      evaluatedAt: new Date().toISOString(),
      dryRun: true,
      adapterNotes: [],
    };
    expect(buildParsedMetaFromOpportunity({ candidate, evaluation })).toBeNull();
  });
});

describe('S9 hunter contract', () => {
  it('maps HunterResult without hard-coding hunter brands in automation core', () => {
    const result: HunterResult = {
      schemaVersion: 'hunter_benchmark.v1',
      hunterId: 'external_x',
      runId: 'run-1',
      sourceId: 'custom_partner',
      collectedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      ok: true,
      errorCode: null,
      errorMessageSafe: null,
      candidates: [
        {
          candidateId: 'c1',
          sourceUrl: 'https://www.amazon.com.mx/dp/B00TEST',
          canonicalUrl: 'https://www.amazon.com.mx/dp/B00TEST',
          title: 'Test item',
          currentPrice: {
            amount: 299,
            currency: 'MXN',
            provenance: 'unknown',
            observedAt: new Date().toISOString(),
          },
          originalPrice: null,
          identitySignals: [],
          discoveredAt: new Date().toISOString(),
          metadata: { imageUrl: 'https://m.media-amazon.com/images/I/test.jpg' },
        },
      ],
    };
    const mapped = automationCandidatesFromHunterResult(result);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].sourceId).toBe('custom_partner');
    expect(mapped[0].opportunity.url).toContain('amazon');
    expect(mapped[0].opportunity.imageUrl).toBeTruthy();
  });

  it('drops malformed hunter candidates (no url / no price)', () => {
    const result: HunterResult = {
      schemaVersion: 'hunter_benchmark.v1',
      hunterId: 'x',
      runId: 'r',
      sourceId: 'x',
      collectedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      ok: true,
      errorCode: null,
      errorMessageSafe: null,
      candidates: [
        {
          candidateId: 'bad',
          sourceUrl: null,
          canonicalUrl: null,
          title: 'bad',
          currentPrice: null,
          originalPrice: null,
          identitySignals: [],
          discoveredAt: new Date().toISOString(),
          metadata: {},
        },
      ],
    };
    expect(automationCandidatesFromHunterResult(result)).toHaveLength(0);
  });
});
