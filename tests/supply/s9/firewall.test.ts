import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { evaluateSupplyPolicy } from '@/lib/supply/policy';
import { writePendingViaS7Bridge } from '@/lib/supply/s7Bridge';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import type { OpportunityEvaluation } from '@/lib/supply/intelligence/types';

function opportunity(): OpportunityEvaluation {
  return {
    candidateUrl: 'https://articulo.mercadolibre.com.mx/MLM-FW',
    productFingerprint: 'fp',
    decision: 'OPPORTUNITY',
    score: {
      value: 80,
      confidence: 0.8,
      reasonCodes: ['VERIFIED_OPPORTUNITY'],
      breakdown: {
        priceEvidence: 40,
        discountMagnitude: 20,
        historySupport: 10,
        qualitySignals: 10,
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
      historyReady: true,
      suspectedArtificialListPrice: false,
      hasImage: true,
      productFingerprint: 'fp',
      signals: {},
    },
    evaluatedAt: new Date().toISOString(),
    dryRun: true,
    adapterNotes: [],
  };
}

describe('S9 production firewall + write gate', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env = { ...prev, SUPPLY_AUTOMATION_ENABLED: 'true', NODE_ENV: 'test' };
    delete process.env.VERCEL_ENV;
    delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it('policy blocks production runtime', () => {
    process.env.VERCEL_ENV = 'production';
    const d = evaluateSupplyPolicy({
      evaluation: opportunity(),
      mode: 'execute',
      machinePendingWritesEnabled: true,
    });
    expect(d.code).toBe('PRODUCTION_BLOCKED');
  });

  it('writePendingViaS7Bridge refuses when S7 flag off', async () => {
    const meta: ParsedOfferMetadata = {
      canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1',
      title: 'Test',
      store: 'Mercado Libre',
      imageUrl: 'https://http2.mlstatic.com/x.jpg',
      discountPrice: 100,
      originalPrice: 200,
      discountPercent: 50,
    };
    const config = {
      botUserId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      botAuthorDualMode: false,
    } as unknown as BotIngestConfig;

    const r = await writePendingViaS7Bridge({ config, meta });
    expect(r.ok).toBe(false);
    if (!r.ok && 'code' in r) {
      expect(r.code).toBe('WRITE_BLOCKED');
    }
  });
});
