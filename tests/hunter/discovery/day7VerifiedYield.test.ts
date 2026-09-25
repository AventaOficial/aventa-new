/**
 * Day 7 — VERIFIED-yield funnel, near-ready budget, terminal reasons, automation splits.
 */

import { describe, expect, it } from 'vitest';
import { ML_PRICE_MIN_HISTORY_DAYS } from '@/lib/bots/ingest/mlPriceEngine';
import {
  accumulateAutomationOutcome,
  buildAutomationCycleMetrics,
  classifyAutomationOutcome,
  emptyAutomationCycleCounts,
} from '@/lib/bots/ingest/automationCycleMetrics';
import {
  assignPrimaryTerminalReason,
  isExternalBlockedTerminal,
  isQualityBlockedTerminal,
} from '@/lib/hunter/discovery/verifiedYieldTerminal';
import {
  allocateNearReadyBudget,
  bumpTerminalReason,
  emptyVerifiedYieldFunnel,
  finalizeVerifiedYieldRates,
} from '@/lib/hunter/discovery/verifiedYieldFunnel';
import { computeAcquisitionPriorityBoost } from '@/lib/hunter/offerStandard/prioritizeAcquisitionPool';
import type { IngestItem } from '@/lib/bots/ingest/types';

function ingestItem(daysUntilReady?: number): IngestItem {
  return {
    url: 'https://www.mercadolibre.com.mx/p/MLM123',
    source: 'ml_api',
    sourceDetail: 'test',
    precomputedMeta: {
      canonicalUrl: 'https://www.mercadolibre.com.mx/p/MLM123',
      title: 't',
      store: 'Mercado Libre',
      imageUrl: '',
      discountPrice: 100,
      originalPrice: null,
      discountPercent: 0,
    },
  };
}

describe('Day 7 ML_PRICE_MIN_HISTORY_DAYS contract', () => {
  it('remains 4 — never lowered', () => {
    expect(ML_PRICE_MIN_HISTORY_DAYS).toBe(4);
  });
});

describe('assignPrimaryTerminalReason', () => {
  it('maps mint success to PENDING', () => {
    expect(assignPrimaryTerminalReason({ mintOk: true, dryRun: false })).toBe('PENDING');
  });

  it('maps duplicate before quality blocks', () => {
    expect(
      assignPrimaryTerminalReason({
        duplicate: true,
        reasonCodes: ['INSUFFICIENT_HISTORY'],
      }),
    ).toBe('DUPLICATE');
  });

  it('maps fetch blocked externally', () => {
    const r = assignPrimaryTerminalReason({ fetchBlocked: true, extracted: false });
    expect(r).toBe('FETCH_BLOCKED');
    expect(isExternalBlockedTerminal(r)).toBe(true);
  });

  it('does not let fetchBlocked override DQE when extracted', () => {
    expect(
      assignPrimaryTerminalReason({
        fetchBlocked: true,
        extracted: true,
        identityValid: true,
        dqeDecision: 'POTENTIAL_DEAL',
        s61WouldInsert: false,
        reasonCodes: ['DQE_POTENTIAL_ONLY'],
      }),
    ).toBe('DQE_POTENTIAL');
  });

  it('maps provenance INVALID_ORIGINAL_PRICE', () => {
    expect(
      assignPrimaryTerminalReason({
        extracted: true,
        identityValid: true,
        historyReady: false,
        reasonCodes: ['INVALID_ORIGINAL_PRICE'],
        s61WouldInsert: false,
      }),
    ).toBe('PROVENANCE_FAILURE');
  });

  it('maps insufficient history as quality block', () => {
    const r = assignPrimaryTerminalReason({
      extracted: true,
      identityValid: true,
      historyReady: false,
      reasonCodes: ['INSUFFICIENT_HISTORY'],
    });
    expect(r).toBe('INSUFFICIENT_HISTORY');
    expect(isQualityBlockedTerminal(r)).toBe(true);
  });

  it('maps dry-run would-insert to DRY_RUN_WOULD_INSERT', () => {
    expect(
      assignPrimaryTerminalReason({
        dryRun: true,
        s61WouldInsert: true,
        dqeDecision: 'VERIFIED_DEAL',
      }),
    ).toBe('DRY_RUN_WOULD_INSERT');
  });

  it('maps writer block when s61 would insert but not dry-run', () => {
    expect(
      assignPrimaryTerminalReason({
        dryRun: false,
        s61WouldInsert: true,
        s61QualityDecision: 'VERIFIED_OPPORTUNITY',
      }),
    ).toBe('WRITER_BLOCK');
  });
});

describe('allocateNearReadyBudget', () => {
  const mk = (id: string) => ({ productId: id });

  it('returns empty when maxTargets=0', () => {
    const r = allocateNearReadyBudget({
      oneDayAway: [mk('a')],
      twoDaysAway: [mk('b')],
      threePlusDaysAway: [mk('c')],
      maxTargets: 0,
    });
    expect(r.pickedIds).toEqual([]);
    expect(r.allocation).toEqual({ one: 0, two: 0, threePlus: 0 });
  });

  it('allocates 50/30/20 for max=10', () => {
    const one = Array.from({ length: 20 }, (_, i) => mk(`1-${i}`));
    const two = Array.from({ length: 20 }, (_, i) => mk(`2-${i}`));
    const three = Array.from({ length: 20 }, (_, i) => mk(`3-${i}`));
    const r = allocateNearReadyBudget({
      oneDayAway: one,
      twoDaysAway: two,
      threePlusDaysAway: three,
      maxTargets: 10,
    });
    expect(r.allocation.one).toBe(5);
    expect(r.allocation.two).toBe(3);
    expect(r.allocation.threePlus).toBe(2);
    expect(r.pickedIds.length).toBe(10);
    expect(r.pickedIds.filter((id) => id.startsWith('1-')).length).toBe(5);
    expect(r.pickedIds.filter((id) => id.startsWith('2-')).length).toBe(3);
    expect(r.pickedIds.filter((id) => id.startsWith('3-')).length).toBe(2);
  });

  it('spills to other buckets when one pool is empty', () => {
    const two = Array.from({ length: 10 }, (_, i) => mk(`2-${i}`));
    const three = Array.from({ length: 10 }, (_, i) => mk(`3-${i}`));
    const r = allocateNearReadyBudget({
      oneDayAway: [],
      twoDaysAway: two,
      threePlusDaysAway: three,
      maxTargets: 6,
    });
    expect(r.pickedIds.length).toBe(6);
    expect(r.pickedIds.every((id) => id.startsWith('2-') || id.startsWith('3-'))).toBe(true);
  });
});

describe('verified yield funnel rates', () => {
  it('computes verified_yield, s61_yield, history_block_rate', () => {
    const f = emptyVerifiedYieldFunnel('cycle-1');
    f.identity_valid = 10;
    f.dqe_verified = 4;
    f.s61_pass = 2;
    bumpTerminalReason(f, 'INSUFFICIENT_HISTORY');
    bumpTerminalReason(f, 'INSUFFICIENT_HISTORY');
    bumpTerminalReason(f, 'ARTIFICIAL_LIST_PRICE');
    finalizeVerifiedYieldRates(f);
    expect(f.rates.verified_yield).toBe(0.4);
    expect(f.rates.s61_yield).toBe(0.5);
    expect(f.rates.history_block_rate).toBe(0.2);
    expect(f.rates.artificial_price_rate).toBe(0.1);
  });
});

describe('automation blocked_quality / blocked_external', () => {
  it('classifies external blocks separately from retryable', () => {
    expect(
      classifyAutomationOutcome({ status: 'skipped', skipReason: 'source_blocked' }),
    ).toBe('blocked_external');
    expect(
      classifyAutomationOutcome({ status: 'skipped', skipReason: 'fetch_blocked oauth' }),
    ).toBe('blocked_external');
  });

  it('classifies quality blocks', () => {
    expect(
      classifyAutomationOutcome({ status: 'skipped', skipReason: 'insufficient_history' }),
    ).toBe('blocked_quality');
    expect(
      classifyAutomationOutcome({ status: 'skipped', skipReason: 's61_suppressed dqe_reject' }),
    ).toBe('blocked_quality');
  });

  it('accumulates subtypes into blocked without double-counting terminal_rate', () => {
    let counts = emptyAutomationCycleCounts();
    counts = accumulateAutomationOutcome(counts, 'blocked_quality');
    counts = accumulateAutomationOutcome(counts, 'blocked_external');
    counts = accumulateAutomationOutcome(counts, 'retryable');
    const m = buildAutomationCycleMetrics(counts);
    expect(m.blocked).toBe(2);
    expect(m.blocked_quality).toBe(1);
    expect(m.blocked_external).toBe(1);
    expect(m.terminal_rate).toBe(1);
  });
});

describe('acquisition priority boost by daysUntilReady', () => {
  it('ranks 1d > 2d > 3d (demand only, not DQE)', () => {
    const url = 'https://www.mercadolibre.com.mx/p/MLM123';
    const b0 = computeAcquisitionPriorityBoost(ingestItem(), {
      daysUntilReadyByUrl: { [url]: 0 },
    });
    const b1 = computeAcquisitionPriorityBoost(ingestItem(), {
      daysUntilReadyByUrl: { [url]: 1 },
    });
    const b2 = computeAcquisitionPriorityBoost(ingestItem(), {
      daysUntilReadyByUrl: { [url]: 2 },
    });
    const b3 = computeAcquisitionPriorityBoost(ingestItem(), {
      daysUntilReadyByUrl: { [url]: 3 },
    });
    expect(b0).toBe(20);
    expect(b1).toBe(18);
    expect(b2).toBe(12);
    expect(b3).toBe(8);
    expect(b1).toBeGreaterThan(b2);
    expect(b2).toBeGreaterThan(b3);
  });
});
