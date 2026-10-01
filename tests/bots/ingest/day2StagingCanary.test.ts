import { describe, expect, it } from 'vitest';
import {
  accumulateAutomationOutcome,
  buildAutomationCycleMetrics,
  classifyAutomationOutcome,
  emptyAutomationCycleCounts,
  metricsFromWorkerResults,
} from '@/lib/bots/ingest/automationCycleMetrics';
import {
  assertDay2StagingWritable,
  classifyDay2Candidate,
  readDay2SafetySnapshot,
} from '@/lib/bots/ingest/day2StagingCanary';
import {
  pickNearReadyTargets,
  rankNearReadyTargets,
  type NearReadyStickyTarget,
} from '@/lib/hunter/supply/nearReadySticky';
import { ML_PRICE_MIN_HISTORY_DAYS } from '@/lib/bots/ingest/mlPriceEngine';

describe('Day2 automation cycle metrics', () => {
  it('counts automation_rate only for auto_processed (pending mint)', () => {
    let counts = emptyAutomationCycleCounts();
    counts = accumulateAutomationOutcome(counts, 'auto_processed', { pendingCreated: true });
    counts = accumulateAutomationOutcome(counts, 'blocked');
    counts = accumulateAutomationOutcome(counts, 'duplicate');
    const metrics = buildAutomationCycleMetrics(counts);
    expect(metrics.candidate_count).toBe(3);
    expect(metrics.auto_processed).toBe(1);
    expect(metrics.pending_created).toBe(1);
    expect(metrics.automation_rate).toBeCloseTo(1 / 3, 4);
  });

  it('does not call discovery alone automated', () => {
    expect(
      classifyAutomationOutcome({ status: 'skipped', skipReason: 'dry_run' }),
    ).toBe('blocked');
    expect(
      classifyAutomationOutcome({ status: 'inserted', pendingCreated: true }),
    ).toBe('auto_processed');
  });

  it('aggregates worker results', () => {
    const m = metricsFromWorkerResults([
      { status: 'inserted' },
      { status: 'duplicate' },
      { status: 'skipped', skipReason: 's61_gate:SUPPRESSED:x' },
      { status: 'error', skipReason: 'fail_closed' },
    ]);
    expect(m.auto_processed).toBe(1);
    expect(m.duplicates).toBe(1);
    expect(m.blocked).toBe(1);
    expect(m.failed).toBe(1);
    expect(m.automation_rate).toBe(0.25);
  });
});

describe('Day2 staging safety', () => {
  it('refuses non-staging and money-on flags', () => {
    const bad = readDay2SafetySnapshot({
      AVENTA_SUPABASE_TARGET: 'production',
      AVENTA_EXPECTED_SUPABASE_REF: 'oojshofrpbfwsiypcecr',
      NEXT_PUBLIC_SUPABASE_URL: 'https://oojshofrpbfwsiypcecr.supabase.co',
    } as NodeJS.ProcessEnv);
    expect(assertDay2StagingWritable(bad).ok).toBe(false);

    const money = readDay2SafetySnapshot({
      AVENTA_SUPABASE_TARGET: 'staging',
      AVENTA_EXPECTED_SUPABASE_REF: 'oojshofrpbfwsiypcecr',
      NEXT_PUBLIC_SUPABASE_URL: 'https://oojshofrpbfwsiypcecr.supabase.co',
      REWARDS_PROGRAM_ACTIVE: 'true',
    } as NodeJS.ProcessEnv);
    expect(assertDay2StagingWritable(money).ok).toBe(false);

    const ok = readDay2SafetySnapshot({
      AVENTA_SUPABASE_TARGET: 'staging',
      AVENTA_EXPECTED_SUPABASE_REF: 'oojshofrpbfwsiypcecr',
      NEXT_PUBLIC_SUPABASE_URL: 'https://oojshofrpbfwsiypcecr.supabase.co',
      REWARDS_PROGRAM_ACTIVE: 'false',
      COMMISSION_PROGRAM_ACTIVE: 'false',
      SETTLEMENT_BRIDGE_ENABLED: 'false',
      DISTRIBUTION_ENGINE_ENABLED: 'false',
    } as NodeJS.ProcessEnv);
    expect(assertDay2StagingWritable(ok).ok).toBe(true);
  });

  it('refuses when writes flag already ON', () => {
    const snap = readDay2SafetySnapshot({
      AVENTA_SUPABASE_TARGET: 'staging',
      AVENTA_EXPECTED_SUPABASE_REF: 'oojshofrpbfwsiypcecr',
      NEXT_PUBLIC_SUPABASE_URL: 'https://oojshofrpbfwsiypcecr.supabase.co',
      BOT_INGEST_MACHINE_PENDING_WRITES: 'true',
    } as NodeJS.ProcessEnv);
    expect(assertDay2StagingWritable(snap).ok).toBe(false);
  });
});

describe('Day2 candidate classification', () => {
  it('READY only when live inserted', () => {
    expect(
      classifyDay2Candidate({
        extracted: true,
        identified: true,
        historyReady: true,
        offerStandardRanked: true,
        dqePass: true,
        s61Pass: true,
        liveStatus: 'inserted',
      }),
    ).toBe('READY');
  });

  it('PARTIAL when identified but not history/s61', () => {
    expect(
      classifyDay2Candidate({
        extracted: true,
        identified: true,
        historyReady: false,
        offerStandardRanked: true,
        dqePass: false,
        s61Pass: false,
      }),
    ).toBe('PARTIAL');
  });

  it('DUPLICATE and BLOCKED paths', () => {
    expect(
      classifyDay2Candidate({
        extracted: true,
        identified: true,
        historyReady: true,
        offerStandardRanked: true,
        dqePass: true,
        s61Pass: true,
        liveStatus: 'duplicate',
      }),
    ).toBe('DUPLICATE');
    expect(
      classifyDay2Candidate({
        extracted: true,
        identified: true,
        historyReady: true,
        offerStandardRanked: true,
        dqePass: true,
        s61Pass: true,
        liveStatus: 'skipped',
        skipReason: 'BOT_INGEST_MACHINE_PENDING_WRITES_off',
      }),
    ).toBe('BLOCKED');
  });
});

describe('near-ready sticky ranking', () => {
  it('does not lower ML_PRICE_MIN_HISTORY_DAYS', () => {
    expect(ML_PRICE_MIN_HISTORY_DAYS).toBe(4);
  });

  it('prioritizes one-day-away before deeper gaps', () => {
    const targets: NearReadyStickyTarget[] = [
      {
        productId: 'MLM2',
        priorDays: 1,
        daysUntilReady: 3,
        lastObservedOn: '2026-09-20',
        lastPrice: 100,
        hoursSinceObserved: 40,
        marketplace: 'mercadolibre',
      },
      {
        productId: 'MLM1',
        priorDays: 3,
        daysUntilReady: 1,
        lastObservedOn: '2026-09-22',
        lastPrice: 200,
        hoursSinceObserved: 30,
        marketplace: 'mercadolibre',
      },
    ];
    const ranked = rankNearReadyTargets(targets);
    expect(ranked[0]?.productId).toBe('MLM1');
    const { picked, budgetLimited } = pickNearReadyTargets(ranked, 1);
    expect(picked).toHaveLength(1);
    expect(picked[0]?.productId).toBe('MLM1');
    expect(budgetLimited).toBe(1);
  });
});
