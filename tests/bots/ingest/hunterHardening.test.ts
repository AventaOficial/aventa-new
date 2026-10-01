/**
 * Hunter hardening — forensic regressions while Price Memory matures.
 * Does NOT change historyReady>=4, DQE thresholds, topK, diversity, or 25%.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeMlPriceIntel,
  ML_PRICE_MIN_HISTORY_DAYS,
  ML_PRICE_TZ,
  normalizeMlProductId,
} from '@/lib/bots/ingest/mlPriceEngine';
import { formatYmdInTz } from '@/lib/bots/ingest/ingestZonedTime';
import { priceMemoryFromParsedMeta } from '@/lib/hunter/dealQuality/fromParsedMeta';
import { evaluateDealQualityFromParsedMeta } from '@/lib/hunter/dealQuality';
import { evaluateMachineCandidateGate } from '@/lib/bots/ingest/candidateInsertGate';
import { buildHunterDecisionTrace } from '@/lib/bots/ingest/hunterDecisionTrace';
import { applyMlPriceIntelToMeta } from '@/lib/bots/ingest/priceIntel';
import {
  extractMercadoLibreItemId,
  resolveMercadoLibreItem,
} from '@/lib/offers/resolveMercadoLibreItem';
import { nextSchedulerState } from '@/lib/hunter/candidateIntelligence/discoveryScheduler';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';

function priorDays(prices: number[], today = '2026-09-22') {
  const [y, m, d] = today.split('-').map(Number);
  return prices.map((p, i) => {
    const dt = new Date(Date.UTC(y!, m! - 1, d! - (i + 1)));
    const on = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
    return {
      recordedOn: on,
      lastPrice: p,
      minPrice: p,
      listPrice: null as number | null,
      regularPrice: null as number | null,
    };
  });
}

function baseConfig(): BotIngestConfig {
  return {
    profile: 'standard',
    enabled: true,
    botUserId: 'x',
    minDiscountPercent: 20,
    rejectBelowScore: 40,
    titleMinLength: 12,
    titleBlocklistGenericRe: null,
  } as BotIngestConfig;
}

describe('Hunter identity hardening', () => {
  it('same listing / tracking URL variants share SOURCE_ITEM', () => {
    const a = normalizeMlProductId(
      'https://articulo.mercadolibre.com.mx/MLM-41485344-foo?matt_tool=x&utm_source=y',
    );
    const b = normalizeMlProductId('https://articulo.mercadolibre.com.mx/MLM-41485344-bar');
    const c = normalizeMlProductId('MLM-41485344');
    expect(a).toBe('MLM41485344');
    expect(b).toBe('MLM41485344');
    expect(c).toBe('MLM41485344');
  });

  it('different listings (sellers) stay separate identities', () => {
    expect(normalizeMlProductId('MLM10000001')).not.toBe(normalizeMlProductId('MLM10000002'));
  });

  it('catalog /p/ without wid uses catalog id (contamination risk documented)', () => {
    const resolved = resolveMercadoLibreItem(
      'https://www.mercadolibre.com.mx/p/MLM1234567890',
    );
    // When only catalog path exists, itemId may equal catalog — risk for multi-seller.
    expect(resolved.catalogProductId || resolved.itemId).toBeTruthy();
  });

  it('catalog /p/ with wid prefers listing wid as item identity', () => {
    const id = extractMercadoLibreItemId(
      'https://www.mercadolibre.com.mx/p/MLM1111111111?wid=MLM2222222222',
    );
    expect(id).toBe('MLM2222222222');
  });

  it('user-product MLMU is rejected for Price Memory keys (fail-closed)', () => {
    expect(normalizeMlProductId('MLMU1234567890')).toBeNull();
    expect(
      normalizeMlProductId('https://www.mercadolibre.com.mx/up/MLMU1234567890'),
    ).toBeNull();
  });
});

describe('Price Memory corruption / edge inputs (compute contract)', () => {
  it('historyReady rule unchanged: needs ≥4 prior days', () => {
    expect(ML_PRICE_MIN_HISTORY_DAYS).toBe(4);
    const three = computeMlPriceIntel(
      { current: 100, listPrice: null, regularPrice: null },
      priorDays([100, 100, 100]),
      '2026-09-22',
    );
    expect(three.historyReady).toBe(false);
    const four = computeMlPriceIntel(
      { current: 100, listPrice: null, regularPrice: null },
      priorDays([100, 100, 100, 100]),
      '2026-09-22',
    );
    expect(four.historyReady).toBe(true);
  });

  it('timezone day key is America/Mexico_City (not UTC alone)', () => {
    // 2026-09-22T05:00:00Z = Sep 21 evening in Mexico City
    const eveningUtc = new Date('2026-09-22T05:00:00.000Z');
    expect(formatYmdInTz(eveningUtc, ML_PRICE_TZ)).toBe('2026-09-21');
    const morningUtc = new Date('2026-09-22T12:00:00.000Z');
    expect(formatYmdInTz(morningUtc, ML_PRICE_TZ)).toBe('2026-09-22');
  });

  it('outlier single drop does not invent historyReady early', () => {
    const intel = computeMlPriceIntel(
      { current: 100, listPrice: null, regularPrice: null },
      priorDays([1000, 1000, 1000]),
      '2026-09-22',
    );
    expect(intel.historyReady).toBe(false);
    expect(intel.habitual30d).toBeNull();
  });

  it('baseline median resists single outlier when historyReady', () => {
    // 1000,1000,1000,100 → sorted → median of prior lastPrices
    const intel = computeMlPriceIntel(
      { current: 1000, listPrice: null, regularPrice: null },
      priorDays([1000, 1000, 1000, 100]),
      '2026-09-22',
    );
    expect(intel.historyReady).toBe(true);
    // median([1000,1000,1000,100]) = (1000+1000)/2 = 1000
    expect(intel.habitual30d).toBe(1000);
  });

  it('monotonic decline baseline tracks median not first price', () => {
    const intel = computeMlPriceIntel(
      { current: 650, listPrice: null, regularPrice: null },
      priorDays([1000, 900, 800, 700]),
      '2026-09-22',
    );
    expect(intel.historyReady).toBe(true);
    // median 700,800,900,1000 = 850
    expect(intel.habitual30d).toBe(850);
    expect(intel.savingsVsHabitualPct).toBeGreaterThan(0);
  });

  it('volatile series uses median baseline', () => {
    const intel = computeMlPriceIntel(
      { current: 950, listPrice: null, regularPrice: null },
      priorDays([1000, 1500, 900, 1050]),
      '2026-09-22',
    );
    expect(intel.historyReady).toBe(true);
    // sorted 900,1000,1050,1500 → median (1000+1050)/2 = 1025
    expect(intel.habitual30d).toBe(1025);
  });
});

describe('DQE contract: Price Intel signals cannot be ignored', () => {
  it('historyReady=false is preserved even if effectiveDiscount>0 is present', () => {
    const meta: Pick<ParsedOfferMetadata, 'signals'> = {
      signals: {
        historyReady: false,
        samples90d: 2,
        effectiveDiscountPercent: 40,
        suspectedArtificialListPrice: false,
        priceIntelSource: 'aventa_ml',
      },
    };
    const pm = priceMemoryFromParsedMeta(meta);
    expect(pm?.historyReady).toBe(false);
    expect(pm?.samples90d).toBe(2);
    expect(pm?.effectiveDiscountPercent).toBe(40);
  });

  it('historyReady=true + artificial flag flows to DQE negative', () => {
    const meta: ParsedOfferMetadata = {
      canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-x',
      title: 'Producto con título suficientemente largo para pasar',
      store: 'Mercado Libre',
      imageUrl: 'https://http2.mlstatic.com/x.jpg',
      discountPrice: 3300,
      originalPrice: 10000,
      discountPercent: 67,
      signals: {
        historyReady: true,
        samples90d: 5,
        habitual30d: 3375,
        effectiveDiscountPercent: 2,
        suspectedArtificialListPrice: true,
        savingsVsHabitualPct: 2,
        priceIntelSource: 'aventa_ml',
        originalPriceProvenance: 'source_explicit',
        cardDiscountSource: 'pdp',
      },
    };
    const pm = priceMemoryFromParsedMeta(meta);
    expect(pm?.historyReady).toBe(true);
    expect(pm?.suspectedArtificialListPrice).toBe(true);
    const dqe = evaluateDealQualityFromParsedMeta(meta, { source: 'ml_worker' });
    expect(dqe.reasons.some((r) => /artificial|lista/i.test(r)) || dqe.decision !== 'VERIFIED_DEAL').toBe(
      true,
    );
  });
});

describe('S6.1 write-path authority map (static)', () => {
  it('processExternalWorkerBatch calls live S6.1 eligibility before insert', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/bots/ingest/externalWorker.ts'),
      'utf8',
    );
    expect(src).toMatch(/evaluateMachineLiveInsertEligibility/);
    expect(src).toMatch(/insertIngestedOffer/);
    // Gate must appear before write attempts in control flow (both present).
    expect(src.indexOf('evaluateMachineLiveInsertEligibility')).toBeLessThan(
      src.lastIndexOf('insertIngestedOffer'),
    );
  });

  it('P0 closure: S9→S7 bridge requires S6.1 before insertIngestedOffer', () => {
    const bridge = readFileSync(
      resolve(process.cwd(), 'lib/supply/s7Bridge/writePendingViaS7Bridge.ts'),
      'utf8',
    );
    expect(bridge).toMatch(/insertIngestedOffer/);
    expect(bridge).toMatch(/evaluateMachineLiveInsertEligibility|evaluateS7BridgeS61Gate/);
    expect(bridge).toMatch(/S61_BLOCKED|s61_blocked/);
  });

  it('runIngestCycle remains discovery-only (no insertIngestedOffer)', () => {
    const src = readFileSync(resolve(process.cwd(), 'lib/bots/ingest/runIngestCycle.ts'), 'utf8');
    expect(src).not.toMatch(/insertIngestedOffer\s*\(/);
  });

  it('community POST /api/offers is not machine S6.1 path', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/api/offers/route.ts'), 'utf8');
    expect(src).not.toMatch(/evaluateMachineCandidateGate/);
    expect(src).not.toMatch(/evaluateMachineLiveInsertEligibility/);
  });
});

describe('Partial failure fail-closed (gate)', () => {
  it('null meta → not wouldInsert', () => {
    const gate = evaluateMachineCandidateGate({
      url: 'https://articulo.mercadolibre.com.mx/MLM-1',
      meta: null,
      config: baseConfig(),
      verifierDecision: 'pending',
      verifierReasons: [],
      duplicate: null,
      dealScore: null,
    });
    expect(gate.wouldInsert).toBe(false);
  });

  it('missing DQE verified path with listing_card + no history → INSUFFICIENT_HISTORY', () => {
    const intel = computeMlPriceIntel(
      { current: 229, listPrice: 399, regularPrice: null },
      [],
      '2026-09-22',
    );
    const meta = applyMlPriceIntelToMeta(
      {
        canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-59117483-x',
        title: 'Calcetines Unisex Pack Oferta Mercado Libre Mexico',
        store: 'Mercado Libre',
        imageUrl: 'https://http2.mlstatic.com/x.jpg',
        discountPrice: 229,
        originalPrice: 399,
        discountPercent: 43,
        signals: {
          originalPriceProvenance: 'listing_card',
          cardDiscountSource: 'card_strikethrough',
        },
      },
      {
        quote: { current: 229, listPrice: 399, regularPrice: null, currency: 'MXN' },
        intel,
      },
      { preserveLabelDiscount: true },
    );
    const dqe = evaluateDealQualityFromParsedMeta(meta, { source: 'ml_worker' });
    const gate = evaluateMachineCandidateGate({
      url: meta.canonicalUrl,
      meta,
      config: baseConfig(),
      verifierDecision: 'pending',
      verifierReasons: [],
      duplicate: null,
      dealScore: null,
      dealQuality: dqe,
    });
    expect(gate.wouldInsert).toBe(false);
    const trace = buildHunterDecisionTrace({ meta, gate, dealQuality: dqe });
    expect(trace.finalLabel).not.toBe('GOOD');
    expect(trace.historicalBaseline).toBe('INSUFFICIENT_HISTORY');
  });
});

describe('Scheduler cursor advancement (no infinite same plan)', () => {
  it('nextSchedulerState advances offsets and seeds from prior', () => {
    const plan = {
      source: 'mercadolibre_mx' as const,
      pageStrategy: 'page_1_only' as const,
      pages: [1],
      exploitationShare: 0.7,
      explorationShare: 0.3,
      calls: [
        {
          kind: 'q' as const,
          value: 'laptop oferta',
          sort: 'relevance',
          page: 1,
          axis: 'explore' as const,
          dimension: 'query' as const,
        },
        {
          kind: 'cat' as const,
          value: 'MLM1000',
          sort: 'relevance',
          page: 1,
          axis: 'explore' as const,
          dimension: 'category' as const,
        },
      ],
      axisBitmap: { exploit: 0, explore: 0, sticky: 0 },
      runSlot: 3,
      dayKey: '2026-09-22',
      leverage: [] as string[],
      note: 'test',
      classification: 'FACT' as const,
    };
    const next = nextSchedulerState(plan, {
      dayKey: '2026-09-22',
      lastRunSlot: 2,
      lastQueryOffset: 10,
      lastCategoryOffset: 4,
      lastSeedOffset: 5,
      seenQueryKeys: [],
      seenCategoryKeys: [],
      updatedAt: '2026-09-22T00:00:00.000Z',
    });
    expect(next.lastRunSlot).toBe(3);
    expect(next.lastQueryOffset).toBeGreaterThan(10);
    expect(next.lastCategoryOffset).toBeGreaterThan(4);
    expect(next.lastSeedOffset).toBe(6);
    expect(next.seenQueryKeys).toContain('laptop oferta');
  });
});

describe('Replay / idempotency contract documentation', () => {
  it('insert path relies on UNIQUE duplicate detection in insertIngestedOffer source', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/bots/ingest/insertIngestedOffer.ts'),
      'utf8',
    );
    expect(src).toMatch(/duplicate|UNIQUE|findDuplicate|product_fingerprint/i);
    expect(src).toMatch(/assertMachineOfferWriteAuthorized|PRODUCTION_BLOCKED|isMachinePendingWriteEnabled/);
  });
});
