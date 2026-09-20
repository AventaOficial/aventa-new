import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  evaluateSupplyPolicy,
  resolveSupplyAutomationCaps,
  isSupplyAutomationEnabled,
  S9_HARD_MAX_WRITES_PER_RUN,
} from '@/lib/supply/policy';
import type { OpportunityEvaluation } from '@/lib/supply/intelligence/types';

function evalFixture(
  over: Partial<OpportunityEvaluation> & {
    decision?: OpportunityEvaluation['decision'];
  } = {},
): OpportunityEvaluation {
  return {
    candidateUrl: 'https://articulo.mercadolibre.com.mx/MLM-123',
    productFingerprint: 'fp1',
    decision: over.decision ?? 'OPPORTUNITY',
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
      ...(over.score ?? {}),
    },
    evidence: {
      salePrice: {
        amount: 500,
        kind: 'listing_card',
        source: 'test',
        observedAt: new Date().toISOString(),
        trusted: true,
      },
      referencePrice: {
        amount: 1000,
        kind: 'listing_card',
        source: 'test',
        observedAt: new Date().toISOString(),
        trusted: true,
      },
      discountPercent: 50,
      evidenceLevel: 'strong_card',
      historyReady: true,
      suspectedArtificialListPrice: false,
      hasImage: true,
      productFingerprint: 'fp1',
      signals: {},
      ...(over.evidence ?? {}),
    },
    evaluatedAt: new Date().toISOString(),
    dryRun: true,
    adapterNotes: [],
    ...over,
  };
}

const enabledEnv = {
  SUPPLY_AUTOMATION_ENABLED: 'true',
  NODE_ENV: 'test',
  VERCEL_ENV: 'preview',
} as NodeJS.ProcessEnv;

describe('S9 policy', () => {
  const prev = { ...process.env };
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.VERCEL_ENV;
  });
  afterEach(() => {
    process.env = { ...prev };
  });

  it('SUPPLY_AUTOMATION_ENABLED defaults off', () => {
    expect(isSupplyAutomationEnabled({})).toBe(false);
  });

  it('caps: CLI cannot raise hard max', () => {
    const caps = resolveSupplyAutomationCaps(
      { ...enabledEnv, S9_MAX_WRITES_PER_RUN: '5' },
      100,
    );
    expect(caps?.maxWritesPerRun).toBe(S9_HARD_MAX_WRITES_PER_RUN);
  });

  it('caps: CLI can only lower', () => {
    const caps = resolveSupplyAutomationCaps(enabledEnv, 2);
    expect(caps?.maxWritesPerRun).toBe(2);
  });

  it('invalid caps env → null', () => {
    expect(
      resolveSupplyAutomationCaps({
        ...enabledEnv,
        S9_MAX_WRITES_PER_RUN: 'nope',
      }),
    ).toBeNull();
  });

  it('S9 disabled → S9_DISABLED', () => {
    const d = evaluateSupplyPolicy({
      evaluation: evalFixture(),
      env: { SUPPLY_AUTOMATION_ENABLED: 'false' },
      mode: 'dry_run',
    });
    expect(d.code).toBe('S9_DISABLED');
    expect(d.eligible).toBe(false);
  });

  it('OPPORTUNITY + trusted ref → ELIGIBLE (dry)', () => {
    const d = evaluateSupplyPolicy({
      evaluation: evalFixture(),
      env: enabledEnv,
      mode: 'dry_run',
    });
    expect(d.code).toBe('ELIGIBLE');
    expect(d.eligible).toBe(true);
  });

  it('S8 REJECT → LOW_QUALITY', () => {
    const d = evaluateSupplyPolicy({
      evaluation: evalFixture({
        decision: 'REJECT',
        score: {
          value: 10,
          confidence: 0.2,
          reasonCodes: ['INVALID_SALE_PRICE'],
          breakdown: {
            priceEvidence: 0,
            discountMagnitude: 0,
            historySupport: 0,
            qualitySignals: 0,
          },
        },
      }),
      env: enabledEnv,
      mode: 'dry_run',
    });
    expect(d.code).toBe('LOW_QUALITY');
  });

  it('S8 PARTIAL → SUPPRESSED', () => {
    const d = evaluateSupplyPolicy({
      evaluation: evalFixture({ decision: 'PARTIAL' }),
      env: enabledEnv,
      mode: 'dry_run',
    });
    expect(d.code).toBe('SUPPRESSED');
  });

  it('duplicate → DUPLICATE', () => {
    const d = evaluateSupplyPolicy({
      evaluation: evalFixture(),
      env: enabledEnv,
      isDuplicate: true,
      duplicateKind: 'url',
      mode: 'dry_run',
    });
    expect(d.code).toBe('DUPLICATE');
  });

  it('budget → BUDGET_REJECTED', () => {
    const d = evaluateSupplyPolicy({
      evaluation: evalFixture(),
      env: enabledEnv,
      writesUsedThisRun: 5,
      mode: 'dry_run',
    });
    expect(d.code).toBe('BUDGET_REJECTED');
  });

  it('missing image → INVALID_PROVENANCE', () => {
    const d = evaluateSupplyPolicy({
      evaluation: evalFixture({
        evidence: {
          ...evalFixture().evidence,
          hasImage: false,
        },
      }),
      env: enabledEnv,
      mode: 'dry_run',
    });
    expect(d.code).toBe('INVALID_PROVENANCE');
    expect(d.reasons).toContain('missing_image');
  });

  it('untrusted reference → INVALID_PROVENANCE', () => {
    const base = evalFixture();
    const d = evaluateSupplyPolicy({
      evaluation: evalFixture({
        evidence: {
          ...base.evidence,
          referencePrice: {
            amount: 1000,
            kind: 'candidate_declared',
            source: 'hunter',
            observedAt: new Date().toISOString(),
            trusted: false,
          },
        },
      }),
      env: enabledEnv,
      mode: 'dry_run',
    });
    expect(d.code).toBe('INVALID_PROVENANCE');
  });

  it('execute without machine writes → S7_WRITES_DISABLED', () => {
    const d = evaluateSupplyPolicy({
      evaluation: evalFixture(),
      env: enabledEnv,
      mode: 'execute',
      machinePendingWritesEnabled: false,
    });
    expect(d.code).toBe('S7_WRITES_DISABLED');
  });

  it('S8 failure → S8_FAILURE', () => {
    const d = evaluateSupplyPolicy({
      evaluation: null,
      evaluationError: 'adapter_timeout',
      env: enabledEnv,
      mode: 'dry_run',
    });
    expect(d.code).toBe('S8_FAILURE');
  });

  it('malformed missing url → MALFORMED_INPUT', () => {
    const d = evaluateSupplyPolicy({
      evaluation: evalFixture({ candidateUrl: '' }),
      env: enabledEnv,
      mode: 'dry_run',
    });
    expect(d.code).toBe('MALFORMED_INPUT');
  });
});
