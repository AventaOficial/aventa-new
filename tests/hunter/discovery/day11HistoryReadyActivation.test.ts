/**
 * Day 11 — historyReady activation measurement tests.
 * Does not relax ML_PRICE_MIN_HISTORY_DAYS, DQE, or S6.1.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ML_PRICE_MIN_HISTORY_DAYS } from '@/lib/bots/ingest/mlPriceEngine';
import {
  buildHistoryReadyActivationFromTraces,
  emptyHistoryReadyCensus,
  isApproxActivatedToday,
  isHistoryReadyFromDistinctDays,
  DAY10_PRODUCTION_BASELINE,
} from '@/lib/hunter/discovery/historyReadyActivation';
import type { VerifiedYieldCandidateTrace } from '@/lib/hunter/discovery/verifiedYieldTerminal';
import { isMachinePendingWriteEnabled } from '@/lib/bots/ingest/machineLiveInsertEligibility';

const ROOT = process.cwd();

function trace(
  partial: Partial<VerifiedYieldCandidateTrace>,
): VerifiedYieldCandidateTrace {
  return {
    url: partial.url ?? 'https://example.com/x',
    sourceId: partial.sourceId ?? 'sticky_history_ready',
    productId: partial.productId ?? 'MLM1',
    daysUntilReady: partial.daysUntilReady ?? 0,
    priorDays: partial.priorDays ?? 4,
    historyReady: partial.historyReady ?? true,
    dqeDecision: partial.dqeDecision ?? null,
    s61Decision: partial.s61Decision ?? null,
    reasonCodes: partial.reasonCodes ?? [],
    primaryTerminalReason: partial.primaryTerminalReason ?? 'OTHER',
  };
}

describe('Day11 historyReady detection', () => {
  it('requires 4 distinct days; same-day does not count as new day', () => {
    expect(ML_PRICE_MIN_HISTORY_DAYS).toBe(4);
    expect(isHistoryReadyFromDistinctDays(3)).toBe(false);
    expect(isHistoryReadyFromDistinctDays(4)).toBe(true);
    expect(isHistoryReadyFromDistinctDays(5)).toBe(true);
    // Conceptual: 2 observations same day → still 1 distinct day
    expect(isHistoryReadyFromDistinctDays(1)).toBe(false);
  });

  it('approx activated today = tip today + exactly 3 prior distinct days', () => {
    expect(
      isApproxActivatedToday({
        distinctDaysBeforeToday: 3,
        observedToday: true,
      }),
    ).toBe(true);
    expect(
      isApproxActivatedToday({
        distinctDaysBeforeToday: 4,
        observedToday: true,
      }),
    ).toBe(false);
    expect(
      isApproxActivatedToday({
        distinctDaysBeforeToday: 3,
        observedToday: false,
      }),
    ).toBe(false);
  });
});

describe('Day11 funnel rates', () => {
  it('computes historyReady_to_s61_yield and source breakdown', () => {
    const traces = [
      trace({
        productId: 'A',
        dqeDecision: 'VERIFIED_DEAL',
        s61Decision: 'VERIFIED_OPPORTUNITY',
        primaryTerminalReason: 'DRY_RUN_WOULD_INSERT',
        sourceId: 'sticky_history_ready',
      }),
      trace({
        productId: 'B',
        dqeDecision: 'POTENTIAL_DEAL',
        s61Decision: null,
        primaryTerminalReason: 'DQE_POTENTIAL',
        sourceId: 'sticky_near_ready',
      }),
      trace({
        productId: 'C',
        historyReady: false,
        dqeDecision: 'VERIFIED_DEAL',
        s61Decision: 'VERIFIED_OPPORTUNITY',
        primaryTerminalReason: 'PROVENANCE_FAILURE',
        sourceId: 'ml_api_legacy',
      }),
      trace({
        productId: 'D',
        dqeDecision: 'VERIFIED_DEAL',
        s61Decision: null,
        primaryTerminalReason: 'PROVENANCE_FAILURE',
        sourceId: 'sticky_history_ready',
      }),
    ];
    const report = buildHistoryReadyActivationFromTraces(
      traces,
      emptyHistoryReadyCensus(),
      { activatedProductIds: new Set(['A']) },
    );
    expect(report.evaluated.history_ready_candidates).toBe(3);
    expect(report.evaluated.history_ready_activated_flag).toBe(1);
    expect(report.evaluated.dqe_verified).toBe(2);
    expect(report.evaluated.s61_pass).toBe(1);
    expect(report.evaluated.provenance_failure).toBe(1);
    expect(report.rates.historyReady_to_s61_yield).toBe(0.3333);
    expect(report.rates.overall_verified_yield).toBe(0.6667);
    expect(report.rates.provenance_failure_rate).toBe(0.3333);
    expect(report.rates.quality_block_rate).toBe(0.6667); // DQE_POTENTIAL + PROVENANCE
    expect(report.by_source.sticky_history_ready?.s61_pass).toBe(1);
    expect(report.day10_baseline).toEqual(DAY10_PRODUCTION_BASELINE);
  });

  it('does not inflate when no historyReady candidates', () => {
    const report = buildHistoryReadyActivationFromTraces(
      [trace({ historyReady: false })],
      emptyHistoryReadyCensus(),
    );
    expect(report.evaluated.history_ready_candidates).toBe(0);
    expect(report.rates.historyReady_to_s61_yield).toBeNull();
  });

  it('preserves terminal reason attribution per candidate', () => {
    const report = buildHistoryReadyActivationFromTraces(
      [
        trace({
          productId: 'H1',
          primaryTerminalReason: 'INSUFFICIENT_HISTORY',
        }),
        trace({
          productId: 'H2',
          primaryTerminalReason: 'ARTIFICIAL_LIST_PRICE',
        }),
      ],
      emptyHistoryReadyCensus(),
    );
    expect(report.evaluated.insufficient_history).toBe(1);
    expect(report.evaluated.artificial_price).toBe(1);
    expect(report.rates.history_block_rate).toBe(0.5);
    expect(report.rates.artificial_price_rate).toBe(0.5);
  });
});

describe('Day11 reacquisition + durable truth', () => {
  it('wires sticky_history_ready collect + reactivation selector', () => {
    const sticky = readFileSync(
      join(ROOT, 'lib/hunter/discovery/stickyNearReadySource.ts'),
      'utf8',
    );
    expect(sticky).toMatch(/collectHistoryReadyReactivationCandidates/);
    expect(sticky).toMatch(/selectHistoryReadyReactivationTargets/);
    expect(sticky).toMatch(/pool_activated_today/);
    expect(sticky).toMatch(/cooldown_skipped/);
    const reactivation = readFileSync(
      join(ROOT, 'lib/hunter/discovery/historyReadyReactivation.ts'),
      'utf8',
    );
    expect(reactivation).toMatch(/prior < min/);
    expect(reactivation).toMatch(/activatedToday/);
    expect(reactivation).not.toMatch(/recorded_on\s*=/);
  });

  it('wires sticky_history_ready + persists history_ready_activation and deadline_budget', () => {
    const cycle = readFileSync(
      join(ROOT, 'lib/hunter/discovery/continuousDiscoveryCycle.ts'),
      'utf8',
    );
    expect(cycle).toMatch(/collectHistoryReadyReactivationCandidates/);
    expect(cycle).toMatch(/STICKY_HISTORY_READY_SOURCE_ID/);
    expect(cycle).toMatch(/buildHistoryReadyActivationFromTraces/);
    const persist = readFileSync(
      join(ROOT, 'lib/hunter/discovery/persistContinuousDiscoveryTruth.ts'),
      'utf8',
    );
    expect(persist).toMatch(/history_ready_activation/);
    expect(persist).toMatch(/deadline_budget/);
    expect(persist).not.toMatch(/from\('offers'\)\.insert/);
  });

  it('idempotency contracts remain: UNIQUE cycle_id + lease claim + same-day PM', () => {
    const lease = readFileSync(
      join(ROOT, 'lib/hunter/discovery/discoveryCycleLease.ts'),
      'utf8',
    );
    expect(lease).toMatch(/claimDiscoveryCycle/);
    const persist = readFileSync(
      join(ROOT, 'lib/hunter/discovery/persistContinuousDiscoveryTruth.ts'),
      'utf8',
    );
    expect(persist).toMatch(/cycle_id/);
    expect(persist).toMatch(/claimToken|lease/);
  });
});

describe('Day11 safety invariants', () => {
  it('does not lower history days; machine mint default OFF', () => {
    expect(ML_PRICE_MIN_HISTORY_DAYS).toBe(4);
    const prev = process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    expect(isMachinePendingWriteEnabled()).toBe(false);
    if (prev === undefined) delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    else process.env.BOT_INGEST_MACHINE_PENDING_WRITES = prev;
  });

  it('sole writer remains unique; DQE/S6.1 thresholds not edited by Day11', () => {
    const writer = readFileSync(
      join(ROOT, 'lib/offers/ingestion/ingestOfferObservation.ts'),
      'utf8',
    );
    expect(writer).toMatch(/from\('offers'\)\.insert/);
    const dqe = readFileSync(
      join(ROOT, 'lib/hunter/discovery/historyReadyActivation.ts'),
      'utf8',
    );
    expect(dqe).not.toMatch(/VERIFIED_DEAL_THRESHOLD|MIN_DISCOUNT/);
    expect(dqe).toMatch(/Does NOT change ML_PRICE_MIN_HISTORY_DAYS/);
  });

  it('dry-run safety: canary does not enable mint', () => {
    const canary = readFileSync(
      join(ROOT, 'scripts/day11-historyready-activation-canary.ts'),
      'utf8',
    );
    expect(canary).not.toMatch(/BOT_INGEST_MACHINE_PENDING_WRITES\s*=\s*['"]true['"]/);
    expect(canary).toMatch(/ML_PRICE_MIN_HISTORY_DAYS/);
  });
});
