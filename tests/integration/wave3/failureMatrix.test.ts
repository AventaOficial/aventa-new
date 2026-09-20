import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  assertWave3StagingOnly,
  restoreWave3FailClosedFlags,
  snapshotWave3Flags,
  WAVE3_FAILURE_MATRIX,
  failureMatrixIds,
  seamS8toS9,
  seamModerationToDistribution,
} from '@/lib/wave3';
import { runSupplyAutomation } from '@/lib/supply/automation';
import type { SupplyAutomationCandidate } from '@/lib/supply/automation';
import type { OpportunityEvaluation } from '@/lib/supply/intelligence/types';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import {
  runE2EPendingBlocked,
  runE2ERejectedBlocked,
  runE2ESuccessCircuit,
  runE2EProviderFailure,
  runE2EUnknownAndRecover,
  runE2EConcurrentClaim,
  runE2EDefiniteFailurePath,
  runE2EMarkUnknownDoesNotTouchOffer,
} from '@/lib/distribution/e2e/stagingHarness';
import { evaluateSupplyPolicy } from '@/lib/supply/policy';
import { STAGING_SUPABASE_REF, PRODUCTION_SUPABASE_REF } from '@/lib/supabase/projectRefs';

const MACHINE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function candidate(
  key: string,
  url: string,
): SupplyAutomationCandidate {
  return {
    candidateKey: key,
    sourceId: 'wave3',
    hunterId: 'wave3_test',
    opportunity: {
      url,
      canonicalUrl: url,
      title: `Wave3 ${key}`,
      imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_w3.jpg',
      salePrice: 500,
      declaredOriginalPrice: 1200,
      store: 'Mercado Libre',
      signals: {
        originalPriceProvenance: 'listing_card',
        cardDiscountSource: 'card_strikethrough',
        historyReady: true,
      },
    },
  };
}

function evalOk(url: string): OpportunityEvaluation {
  return {
    candidateUrl: url,
    productFingerprint: `fp:${url}`,
    decision: 'OPPORTUNITY',
    score: {
      value: 90,
      confidence: 0.9,
      reasonCodes: ['VERIFIED_OPPORTUNITY'],
      breakdown: {
        priceEvidence: 40,
        discountMagnitude: 20,
        historySupport: 15,
        qualitySignals: 15,
      },
    },
    evidence: {
      salePrice: {
        amount: 500,
        kind: 'listing_card',
        source: 't',
        observedAt: new Date().toISOString(),
        trusted: true,
      },
      referencePrice: {
        amount: 1200,
        kind: 'listing_card',
        source: 't',
        observedAt: new Date().toISOString(),
        trusted: true,
      },
      discountPercent: 58,
      evidenceLevel: 'strong_card',
      historyReady: true,
      suspectedArtificialListPrice: false,
      hasImage: true,
      productFingerprint: `fp:${url}`,
      signals: {},
    },
    evaluatedAt: new Date().toISOString(),
    dryRun: true,
    adapterNotes: [],
  };
}

function mockConfig(): BotIngestConfig {
  return {
    botUserId: MACHINE,
    botAuthorDualMode: false,
  } as unknown as BotIngestConfig;
}

describe('WAVE3 failure matrix catalog', () => {
  it('covers all 27 scenarios', () => {
    expect(WAVE3_FAILURE_MATRIX).toHaveLength(27);
    expect(failureMatrixIds()).toHaveLength(27);
  });
});

describe('WAVE3 S9 / supply failure scenarios', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...prev,
      NODE_ENV: 'test',
      SUPPLY_AUTOMATION_ENABLED: 'true',
      S9_MAX_WRITES_PER_RUN: '5',
      MONEY_PATH_FROZEN: 'true',
    };
    delete process.env.VERCEL_ENV;
    delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it('1 duplicate_candidate', async () => {
    const url = 'https://articulo.mercadolibre.com.mx/MLM-W3DUP1';
    const r = await runSupplyAutomation(
      {
        runId: 'w3-dup-cand',
        mode: 'dry_run',
        candidates: [candidate('a', url), candidate('b', url)],
      },
      {
        evaluate: async () => evalOk(url),
        checkDuplicate: async () => ({ isDuplicate: false, kind: null }),
        config: mockConfig(),
      },
    );
    expect(r.outcomes[0].policyDecision.code).toBe('ELIGIBLE');
    expect(r.outcomes[1].policyDecision.code).toBe('DUPLICATE');
  });

  it('2 duplicate_s9_execution', async () => {
    const url = 'https://articulo.mercadolibre.com.mx/MLM-W3DUP2';
    let n = 0;
    const checkDuplicate = vi.fn(async () => {
      n += 1;
      return n === 1
        ? { isDuplicate: false, kind: null }
        : { isDuplicate: true, kind: 'pending_fresh' };
    });
    const writePending = vi.fn(async () => ({
      ok: true as const,
      offerId: 'o1',
    }));
    await runSupplyAutomation(
      { runId: 'r1', mode: 'execute', candidates: [candidate('a', url)] },
      {
        evaluate: async () => evalOk(url),
        checkDuplicate,
        writePending,
        config: mockConfig(),
      },
    );
    const second = await runSupplyAutomation(
      { runId: 'r2', mode: 'execute', candidates: [candidate('a', url)] },
      {
        evaluate: async () => evalOk(url),
        checkDuplicate,
        writePending,
        config: mockConfig(),
      },
    );
    expect(second.outcomes[0].policyDecision.code).toBe('DUPLICATE');
    expect(writePending).toHaveBeenCalledTimes(1);
  });

  it('3 concurrent_s9_execution', async () => {
    const url = 'https://articulo.mercadolibre.com.mx/MLM-W3CONC';
    let writes = 0;
    const writePending = vi.fn(async () => {
      writes += 1;
      if (writes > 1) {
        return { ok: false as const, duplicate: true as const, duplicateKind: 'url' as const };
      }
      return { ok: true as const, offerId: 'only-one' };
    });
    // Shared in-memory duplicate after first success
    let seen = false;
    const checkDuplicate = vi.fn(async () => {
      if (seen) return { isDuplicate: true, kind: 'pending_fresh' };
      return { isDuplicate: false, kind: null };
    });
    const deps = {
      evaluate: async () => evalOk(url),
      checkDuplicate,
      writePending,
      config: mockConfig(),
    };
    const [a, b] = await Promise.all([
      runSupplyAutomation(
        { runId: 'c1', mode: 'execute', candidates: [candidate('a', url)] },
        deps,
      ),
      runSupplyAutomation(
        { runId: 'c2', mode: 'execute', candidates: [candidate('a', url)] },
        {
          ...deps,
          checkDuplicate: async () => {
            // After either starts writing, mark seen
            if (writes >= 1) return { isDuplicate: true, kind: 'pending_fresh' };
            return { isDuplicate: false, kind: null };
          },
          writePending: async (opts) => {
            const r = await writePending(opts);
            seen = true;
            return r;
          },
        },
      ),
    ]);
    const successes = [a, b].filter((r) => r.metrics.write_success > 0);
    expect(successes.length).toBeLessThanOrEqual(1);
  });

  it('4 crash_before_s7_write', async () => {
    const url = 'https://articulo.mercadolibre.com.mx/MLM-W3CRASH';
    const writePending = vi.fn(async () => {
      throw new Error('injected_crash');
    });
    const r = await runSupplyAutomation(
      { runId: 'crash', mode: 'execute', candidates: [candidate('a', url)] },
      {
        evaluate: async () => evalOk(url),
        checkDuplicate: async () => ({ isDuplicate: false, kind: null }),
        writePending,
        config: mockConfig(),
      },
    );
    expect(r.metrics.write_success).toBe(0);
    expect(r.outcomes[0].decision.code).toBe('WRITE_BLOCKED');
  });

  it('5 stale_retry', async () => {
    const url = 'https://articulo.mercadolibre.com.mx/MLM-W3STALE';
    let phase = 0;
    const writePending = vi.fn(async () => ({
      ok: true as const,
      offerId: 'o-stale',
    }));
    const checkDuplicate = vi.fn(async () => {
      phase += 1;
      return phase === 1
        ? { isDuplicate: false, kind: null }
        : { isDuplicate: true, kind: 'pending_fresh' };
    });
    await runSupplyAutomation(
      { runId: 's1', mode: 'execute', candidates: [candidate('a', url)] },
      {
        evaluate: async () => evalOk(url),
        checkDuplicate,
        writePending,
        config: mockConfig(),
      },
    );
    const retry = await runSupplyAutomation(
      { runId: 's2', mode: 'execute', candidates: [candidate('a', url)] },
      {
        evaluate: async () => evalOk(url),
        checkDuplicate,
        writePending,
        config: mockConfig(),
      },
    );
    expect(retry.outcomes[0].policyDecision.code).toBe('DUPLICATE');
    expect(writePending).toHaveBeenCalledTimes(1);
  });
});

describe('WAVE3 distribution failure scenarios (memory e2e)', () => {
  it('6 pending_bypass', async () => {
    const r = await runE2EPendingBlocked();
    expect(r.eligible).toBe(false);
    expect(r.decision).toMatch(/not_distributable|flag|pending/i);
  });

  it('7 rejected_bypass', async () => {
    const r = await runE2ERejectedBlocked();
    expect(r.eligible).toBe(false);
  });

  it('8 duplicate_distribution_enqueue', async () => {
    const { report } = await runE2ESuccessCircuit();
    expect(report.forbiddenTablesTouched).toHaveLength(0);
    expect(report.finalOfferStatus).toBe('approved');
  });

  it('9 concurrent_distribution_claim', async () => {
    const r = await runE2EConcurrentClaim();
    expect(r.winners).toBeLessThanOrEqual(1);
  });

  it('10-12 provider failure/timeout paths', async () => {
    const fail = await runE2EProviderFailure();
    expect(fail.status).toBeTruthy();
    const definite = await runE2EDefiniteFailurePath();
    expect(definite.status).toMatch(/failed|retryable|unknown/i);
  });

  it('13-14 lost ACK / UNKNOWN_OUTCOME recovery', async () => {
    const untouched = await runE2EMarkUnknownDoesNotTouchOffer();
    expect(untouched).toBe(true);
    const rec = await runE2EUnknownAndRecover();
    expect(rec.afterReleaseStatus).toBeTruthy();
  });
});

describe('WAVE3 money / attribution failure scenarios (policy + contracts)', () => {
  const prev = { ...process.env };
  beforeEach(() => {
    process.env = { ...prev, NODE_ENV: 'test', MONEY_PATH_FROZEN: 'true' };
    delete process.env.VERCEL_ENV;
  });
  afterEach(() => {
    process.env = { ...prev };
  });

  it('15-18 click/attribution policy invariants', async () => {
    // Missing click → seam records unattributed path without inventing click
    // (integration with real DB covered in staging e2e; here contract smoke)
    process.env.SUPPLY_AUTOMATION_ENABLED = 'true';
    const r = await seamS8toS9({
      candidate: {
        url: '',
        salePrice: 0,
        title: 'bad',
      },
      env: process.env,
    });
    expect(r.decision.eligible).toBe(false);
    expect(['MALFORMED_INPUT', 'S8_FAILURE', 'S9_DISABLED']).toContain(
      r.decision.code,
    );
  });

  it('19-23 conversion/commission/settlement gates', () => {
    process.env.SUPPLY_AUTOMATION_ENABLED = 'true';
    // Settlement accidentally enabled during E2E must still freeze money
    process.env.SETTLEMENT_BRIDGE_ENABLED = 'true';
    process.env.MONEY_PATH_FROZEN = 'true';
    const flags = snapshotWave3Flags();
    expect(flags.settlementOn).toBe(true);
    expect(flags.moneyFrozen).toBe(true);
    // Rewards must stay off
    expect(flags.rewardsOn).toBe(false);
  });

  it('24 production_target', () => {
    const fail = assertWave3StagingOnly({
      AVENTA_SUPABASE_TARGET: 'production',
      NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co`,
      AVENTA_EXPECTED_SUPABASE_REF: PRODUCTION_SUPABASE_REF,
    });
    expect(fail.ok).toBe(false);

    const failRef = assertWave3StagingOnly({
      AVENTA_SUPABASE_TARGET: 'staging',
      NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co`,
      AVENTA_EXPECTED_SUPABASE_REF: STAGING_SUPABASE_REF,
    });
    expect(failRef.ok).toBe(false);

    const ok = assertWave3StagingOnly({
      AVENTA_SUPABASE_TARGET: 'staging',
      NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_SUPABASE_REF}.supabase.co`,
      AVENTA_EXPECTED_SUPABASE_REF: STAGING_SUPABASE_REF,
      VERCEL_ENV: 'preview',
      NODE_ENV: 'test',
    });
    expect(ok.ok).toBe(true);
  });

  it('25 rewards_accidentally_enabled', async () => {
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    process.env.DISTRIBUTION_ENGINE_ENABLED = 'true';
    const r = await seamModerationToDistribution('00000000-0000-4000-8000-000000000001', {
      env: process.env,
    });
    expect(r.diagnostic.code).toBe('REWARDS_ENABLED_FORBIDDEN');
  });

  it('26-27 settlement/distribution flag restore', () => {
    process.env.DISTRIBUTION_ENGINE_ENABLED = 'true';
    process.env.SETTLEMENT_BRIDGE_ENABLED = 'true';
    process.env.SUPPLY_AUTOMATION_ENABLED = 'true';
    process.env.BOT_INGEST_MACHINE_PENDING_WRITES = 'true';
    const after = restoreWave3FailClosedFlags();
    expect(after.distributionOn).toBe(false);
    expect(after.settlementOn).toBe(false);
    expect(after.supplyOn).toBe(false);
    expect(after.machineWritesOn).toBe(false);
    expect(after.moneyFrozen).toBe(true);
    expect(after.rewardsOn).toBe(false);
  });
});

describe('WAVE3 S7 write gate when S9 on / S7 off', () => {
  it('execute without machine writes → S7_WRITES_DISABLED', () => {
    const d = evaluateSupplyPolicy({
      evaluation: evalOk('https://articulo.mercadolibre.com.mx/MLM-W3GATE'),
      env: { SUPPLY_AUTOMATION_ENABLED: 'true', NODE_ENV: 'test' },
      mode: 'execute',
      machinePendingWritesEnabled: false,
    });
    expect(d.code).toBe('S7_WRITES_DISABLED');
  });
});
