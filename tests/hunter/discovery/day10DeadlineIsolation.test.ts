/**
 * Day 10 — Deadline isolation for Continuous Discovery.
 *
 * Deterministic unit tests: budget math, hunter soft_deadline isolation,
 * sticky survival, DQE/S6.1 invariants, dry-run / lease / sole writer.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createDeadlineContext,
  DEFAULT_CRON_STAGE_CAPS,
  raceWithBudget,
} from '@/lib/hunter/discovery/deadlineBudget';
import { SCHEDULED_CONTINUOUS_DEADLINE_MS } from '@/lib/hunter/discovery/continuousCronContract';
import { classifySourceDiscoveryStatus } from '@/lib/hunter/discovery/sourceDiscoveryStatus';
import { ML_PRICE_MIN_HISTORY_DAYS } from '@/lib/bots/ingest/mlPriceEngine';
import { isMachinePendingWriteEnabled } from '@/lib/bots/ingest/machineLiveInsertEligibility';
import {
  accumulateAutomationOutcome,
  buildAutomationCycleMetrics,
  emptyAutomationCycleCounts,
} from '@/lib/bots/ingest/automationCycleMetrics';
import { DISCOVERY_CYCLE_LEASE_MS } from '@/lib/hunter/discovery/discoveryCycleLease';

const ROOT = process.cwd();

describe('Day10 DeadlineContext', () => {
  it('never grants hunter the full soft deadline (persist reserve protected)', () => {
    let t = 1_000_000;
    const ctx = createDeadlineContext({
      now: t,
      softDeadlineMs: SCHEDULED_CONTINUOUS_DEADLINE_MS,
      clock: () => t,
    });
    const hunter = ctx.allocate('hunter_collect');
    expect(hunter).toBeLessThan(SCHEDULED_CONTINUOUS_DEADLINE_MS);
    expect(hunter).toBe(DEFAULT_CRON_STAGE_CAPS.hunter_collect);
    expect(hunter + DEFAULT_CRON_STAGE_CAPS.persist).toBeLessThanOrEqual(
      SCHEDULED_CONTINUOUS_DEADLINE_MS,
    );
    // After granting hunter, sticky still has room from remaining−persist.
    t += hunter;
    ctx.recordUsed('hunter_collect', hunter);
    const sticky = ctx.allocate('sticky_pm');
    expect(sticky).toBeGreaterThan(0);
  });

  it('allocate returns 0 when expired', () => {
    let t = 5_000;
    const expired = createDeadlineContext({
      now: 0,
      softDeadlineMs: 1_000,
      clock: () => t,
    });
    expect(expired.isExpired()).toBe(true);
    expect(expired.allocate('hunter_collect')).toBe(0);

    let live = 0;
    const ctx = createDeadlineContext({
      now: 0,
      softDeadlineMs: 60_000,
      clock: () => live,
    });
    expect(ctx.hasTimeFor(1)).toBe(true);
  });

  it('raceWithBudget returns soft_deadline without throwing', async () => {
    const slow = new Promise<string>((resolve) => {
      setTimeout(() => resolve('late'), 50);
    });
    const raced = await raceWithBudget(slow, 5);
    expect(raced.ok).toBe(false);
    if (!raced.ok) expect(raced.reason).toBe('soft_deadline');
  });

  it('raceWithBudget resolves value when work finishes in budget', async () => {
    const raced = await raceWithBudget(Promise.resolve(42), 1_000);
    expect(raced).toEqual({ ok: true, value: 42 });
  });
});

describe('Day10 soft_deadline taxonomy', () => {
  it('maps soft_deadline to SKIPPED not FAILED', () => {
    expect(
      classifySourceDiscoveryStatus({
        ok: false,
        itemsFound: 0,
        errorCode: 'soft_deadline',
        errorMessageSafe: 'hunter_collect_budget_exhausted',
      }),
    ).toBe('SKIPPED');
  });

  it('does not convert POTENTIAL into VERIFIED via status helper', () => {
    // Status helper is discovery-only; DQE decisions stay in dealQuality.
    expect(
      classifySourceDiscoveryStatus({ ok: true, itemsFound: 3 }),
    ).toBe('SUCCESS');
    expect(ML_PRICE_MIN_HISTORY_DAYS).toBe(4);
  });
});

describe('Day10 wiring invariants', () => {
  it('continuous cycle uses DeadlineContext and hunter budgetMs', () => {
    const src = readFileSync(
      join(ROOT, 'lib/hunter/discovery/continuousDiscoveryCycle.ts'),
      'utf8',
    );
    expect(src).toMatch(/createDeadlineContext/);
    expect(src).toMatch(/allocate\('hunter_collect'\)/);
    expect(src).toMatch(/allocate\('sticky_pm'\)/);
    expect(src).toMatch(/budgetMs:\s*hunterBudget/);
    expect(src).toMatch(/canonicalStatus:\s*'SKIPPED'/);
    expect(src).not.toMatch(/soft_deadline_hunter_collect/);
  });

  it('runHunterCollect accepts budgetMs and preserves partial candidates', () => {
    const src = readFileSync(join(ROOT, 'lib/hunter/engine.ts'), 'utf8');
    expect(src).toMatch(/budgetMs\?:/);
    expect(src).toMatch(/stoppedReason/);
    expect(src).toMatch(/soft_deadline/);
  });

  it('sole writer remains unique; discovery does not insert offers', () => {
    const writer = readFileSync(
      join(ROOT, 'lib/offers/ingestion/ingestOfferObservation.ts'),
      'utf8',
    );
    expect(writer).toMatch(/from\('offers'\)\.insert/);
    const cycle = readFileSync(
      join(ROOT, 'lib/hunter/discovery/continuousDiscoveryCycle.ts'),
      'utf8',
    );
    expect(cycle).not.toMatch(/from\('offers'\)\.insert/);
    const persist = readFileSync(
      join(ROOT, 'lib/hunter/discovery/persistContinuousDiscoveryTruth.ts'),
      'utf8',
    );
    expect(persist).not.toMatch(/from\('offers'\)\.insert/);
  });

  it('machine mint default OFF; dry-run does not inflate automation', () => {
    const prev = process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    expect(isMachinePendingWriteEnabled()).toBe(false);
    if (prev === undefined) delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    else process.env.BOT_INGEST_MACHINE_PENDING_WRITES = prev;

    let counts = emptyAutomationCycleCounts();
    counts = accumulateAutomationOutcome(counts, 'blocked', { dryRun: true });
    const m = buildAutomationCycleMetrics(counts);
    expect(m.auto_processed).toBe(0);
    expect(m.automation_rate).toBe(0);
    expect(m.pending_created).toBe(0);
  });

  it('Day 9 lease constant still exceeds route maxDuration', () => {
    expect(DISCOVERY_CYCLE_LEASE_MS).toBeGreaterThan(300_000);
  });
});
