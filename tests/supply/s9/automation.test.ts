import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { runSupplyAutomation } from '@/lib/supply/automation';
import type { SupplyAutomationCandidate } from '@/lib/supply/automation';
import type { OpportunityEvaluation } from '@/lib/supply/intelligence/types';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';

const MACHINE_AUTHOR = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function opportunityEval(
  url: string,
  decision: OpportunityEvaluation['decision'] = 'OPPORTUNITY',
): OpportunityEvaluation {
  return {
    candidateUrl: url,
    productFingerprint: `fp:${url}`,
    decision,
    score: {
      value: decision === 'OPPORTUNITY' ? 85 : 20,
      confidence: decision === 'OPPORTUNITY' ? 0.9 : 0.2,
      reasonCodes:
        decision === 'OPPORTUNITY' ? ['VERIFIED_OPPORTUNITY'] : ['PARTIAL_EVIDENCE'],
      breakdown: {
        priceEvidence: 40,
        discountMagnitude: 20,
        historySupport: 10,
        qualitySignals: 10,
      },
    },
    evidence: {
      salePrice: {
        amount: 400,
        kind: 'listing_card',
        source: 'test',
        observedAt: new Date().toISOString(),
        trusted: true,
      },
      referencePrice: {
        amount: 900,
        kind: 'listing_card',
        source: 'test',
        observedAt: new Date().toISOString(),
        trusted: true,
      },
      discountPercent: 55,
      evidenceLevel: 'strong_card',
      historyReady: true,
      suspectedArtificialListPrice: false,
      hasImage: true,
      productFingerprint: `fp:${url}`,
      signals: {
        originalPriceProvenance: 'listing_card',
        cardDiscountSource: 'card_strikethrough',
      },
    },
    evaluatedAt: new Date().toISOString(),
    dryRun: true,
    adapterNotes: [],
  };
}

function candidate(
  key: string,
  url: string,
  sourceId = 'hunter_a',
): SupplyAutomationCandidate {
  return {
    candidateKey: key,
    sourceId,
    hunterId: 'test_hunter',
    opportunity: {
      url,
      canonicalUrl: url,
      title: `Offer ${key}`,
      imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_test.jpg',
      salePrice: 400,
      declaredOriginalPrice: 900,
      store: 'Mercado Libre',
      signals: {
        originalPriceProvenance: 'listing_card',
        cardDiscountSource: 'card_strikethrough',
      },
    },
  };
}

function mockConfig(): BotIngestConfig {
  return {
    botUserId: MACHINE_AUTHOR,
    botUserIdTech: null,
    botUserIdStaples: null,
    botAuthorDualMode: false,
    titleBlocklistGenericRe: /$a/,
    titleBlocklistSpamRe: /$a/,
  } as unknown as BotIngestConfig;
}

describe('S9 runSupplyAutomation', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...prev,
      NODE_ENV: 'test',
      SUPPLY_AUTOMATION_ENABLED: 'true',
      S9_MAX_WRITES_PER_RUN: '5',
      S9_MAX_CANDIDATES_PER_RUN: '20',
      S9_MAX_WRITES_PER_SOURCE: '5',
    };
    delete process.env.VERCEL_ENV;
    delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it('dry/live decision fingerprint equivalence', async () => {
    const cands = [
      candidate('a', 'https://articulo.mercadolibre.com.mx/MLM-111'),
      candidate('b', 'https://articulo.mercadolibre.com.mx/MLM-222'),
    ];
    const evaluate = vi.fn(async (opp: { url: string }) =>
      opportunityEval(opp.url, 'OPPORTUNITY'),
    );
    const checkDuplicate = vi.fn(async () => ({
      isDuplicate: false,
      kind: null,
    }));
    const writePending = vi.fn(async () => ({
      ok: true as const,
      offerId: 'offer-1',
    }));

    const dry = await runSupplyAutomation(
      { runId: 'dry-1', mode: 'dry_run', candidates: cands, skipAdapterFetch: true },
      { evaluate, checkDuplicate, config: mockConfig() },
    );
    const live = await runSupplyAutomation(
      { runId: 'live-1', mode: 'execute', candidates: cands, skipAdapterFetch: true },
      { evaluate, checkDuplicate, writePending, config: mockConfig() },
    );

    expect(dry.decisionFingerprint).toBe(live.decisionFingerprint);
    expect(dry.metrics.eligible).toBe(2);
    expect(live.metrics.write_success).toBe(2);
    expect(writePending).toHaveBeenCalledTimes(2);
  });

  it('same URL from two hunters → one ELIGIBLE, one DUPLICATE', async () => {
    const url = 'https://articulo.mercadolibre.com.mx/MLM-SAME';
    const cands = [
      candidate('h1', url, 'chatgpt'),
      candidate('h2', url, 'grok'),
    ];
    const evaluate = vi.fn(async () => opportunityEval(url));
    const dry = await runSupplyAutomation(
      { runId: 'dup-1', mode: 'dry_run', candidates: cands },
      {
        evaluate,
        checkDuplicate: async () => ({ isDuplicate: false, kind: null }),
        config: mockConfig(),
      },
    );
    expect(dry.outcomes[0].policyDecision.code).toBe('ELIGIBLE');
    expect(dry.outcomes[1].policyDecision.code).toBe('DUPLICATE');
    expect(dry.metrics.duplicates).toBe(1);
  });

  it('cap: max writes per run', async () => {
    process.env.S9_MAX_WRITES_PER_RUN = '1';
    const cands = [
      candidate('a', 'https://articulo.mercadolibre.com.mx/MLM-A'),
      candidate('b', 'https://articulo.mercadolibre.com.mx/MLM-B'),
    ];
    const evaluate = vi.fn(async (opp: { url: string }) => opportunityEval(opp.url));
    const dry = await runSupplyAutomation(
      { runId: 'cap-1', mode: 'dry_run', candidates: cands, cliCap: 100 },
      {
        evaluate,
        checkDuplicate: async () => ({ isDuplicate: false, kind: null }),
        config: mockConfig(),
      },
    );
    expect(dry.outcomes[0].policyDecision.code).toBe('ELIGIBLE');
    expect(dry.outcomes[1].policyDecision.code).toBe('BUDGET_REJECTED');
  });

  it('S9 disabled → no writes', async () => {
    process.env.SUPPLY_AUTOMATION_ENABLED = 'false';
    const writePending = vi.fn();
    const r = await runSupplyAutomation(
      {
        runId: 'off-1',
        mode: 'execute',
        candidates: [candidate('a', 'https://articulo.mercadolibre.com.mx/MLM-X')],
      },
      {
        evaluate: async () =>
          opportunityEval('https://articulo.mercadolibre.com.mx/MLM-X'),
        writePending,
        config: mockConfig(),
      },
    );
    expect(r.outcomes[0].policyDecision.code).toBe('S9_DISABLED');
    expect(writePending).not.toHaveBeenCalled();
  });

  it('production firewall', async () => {
    process.env.VERCEL_ENV = 'production';
    const writePending = vi.fn();
    const r = await runSupplyAutomation(
      {
        runId: 'prod-1',
        mode: 'execute',
        candidates: [candidate('a', 'https://articulo.mercadolibre.com.mx/MLM-P')],
      },
      { writePending, config: mockConfig() },
    );
    expect(r.metrics.by_code.PRODUCTION_BLOCKED).toBe(1);
    expect(writePending).not.toHaveBeenCalled();
  });

  it('S8 failure fail-closed', async () => {
    const r = await runSupplyAutomation(
      {
        runId: 's8fail',
        mode: 'dry_run',
        candidates: [candidate('a', 'https://articulo.mercadolibre.com.mx/MLM-F')],
      },
      {
        evaluate: async () => {
          throw new Error('adapter_down');
        },
        config: mockConfig(),
      },
    );
    expect(r.outcomes[0].policyDecision.code).toBe('S8_FAILURE');
  });

  it('retry after success → duplicate via checkDuplicate', async () => {
    const url = 'https://articulo.mercadolibre.com.mx/MLM-RETRY';
    let calls = 0;
    const checkDuplicate = vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? { isDuplicate: false, kind: null }
        : { isDuplicate: true, kind: 'url' };
    });
    const evaluate = vi.fn(async () => opportunityEval(url));
    const writePending = vi.fn(async () => ({ ok: true as const, offerId: 'o1' }));

    const first = await runSupplyAutomation(
      { runId: 'r1', mode: 'execute', candidates: [candidate('a', url)] },
      { evaluate, checkDuplicate, writePending, config: mockConfig() },
    );
    const second = await runSupplyAutomation(
      { runId: 'r2', mode: 'execute', candidates: [candidate('a', url)] },
      { evaluate, checkDuplicate, writePending, config: mockConfig() },
    );

    expect(first.metrics.write_success).toBe(1);
    expect(second.outcomes[0].policyDecision.code).toBe('DUPLICATE');
    expect(writePending).toHaveBeenCalledTimes(1);
  });
});
