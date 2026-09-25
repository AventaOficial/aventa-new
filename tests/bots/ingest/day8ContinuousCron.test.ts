import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { requireCronSecret } from '@/lib/server/cronAuth';
import {
  resolveContinuousExecutionMode,
  scheduledContinuousCycleId,
} from '@/lib/hunter/discovery/continuousCronContract';
import { ML_PRICE_MIN_HISTORY_DAYS } from '@/lib/bots/ingest/mlPriceEngine';
import {
  accumulateAutomationOutcome,
  buildAutomationCycleMetrics,
  emptyAutomationCycleCounts,
} from '@/lib/bots/ingest/automationCycleMetrics';
import { isMachinePendingWriteEnabled } from '@/lib/bots/ingest/machineLiveInsertEligibility';

const ROOT = process.cwd();

describe('Day8 continuous cron auth', () => {
  it('rejects missing secret with 401', () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'unit-test-cron-secret';
    const req = new NextRequest('http://localhost/api/cron/bot-ingest?mode=continuous');
    const denied = requireCronSecret(req);
    expect(denied?.status).toBe(401);
    process.env.CRON_SECRET = prev;
  });

  it('rejects query-string secrets', () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'unit-test-cron-secret';
    const req = new NextRequest(
      'http://localhost/api/cron/bot-ingest?mode=continuous&secret=unit-test-cron-secret',
    );
    expect(requireCronSecret(req)?.status).toBe(401);
    process.env.CRON_SECRET = prev;
  });

  it('accepts bearer matching CRON_SECRET', () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'unit-test-cron-secret';
    const req = new NextRequest('http://localhost/api/cron/bot-ingest?mode=continuous', {
      headers: { authorization: 'Bearer unit-test-cron-secret' },
    });
    expect(requireCronSecret(req)).toBeNull();
    process.env.CRON_SECRET = prev;
  });
});

describe('Day8 continuous cron fail-closed mint', () => {
  it('cronSafe forces dry-run and forbids mint even if allowStagingMint is true', () => {
    const mode = resolveContinuousExecutionMode({
      cronSafe: true,
      dryRun: false,
      allowStagingMint: true,
    });
    expect(mode).toEqual({ dryRun: true, allowMint: false });
  });

  it('manual non-cron can still request staging mint only when dryRun is false', () => {
    expect(
      resolveContinuousExecutionMode({ dryRun: false, allowStagingMint: true }),
    ).toEqual({ dryRun: false, allowMint: true });
    expect(resolveContinuousExecutionMode({ dryRun: true, allowStagingMint: true })).toEqual({
      dryRun: true,
      allowMint: false,
    });
  });

  it('machine pending writes default OFF', () => {
    const prev = process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    expect(isMachinePendingWriteEnabled()).toBe(false);
    if (prev === undefined) delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    else process.env.BOT_INGEST_MACHINE_PENDING_WRITES = prev;
  });

  it('does not lower history days', () => {
    expect(ML_PRICE_MIN_HISTORY_DAYS).toBe(4);
  });
});

describe('Day8 scheduled cycle idempotency key', () => {
  it('is stable within the same Mexico hour', () => {
    const a = new Date('2026-09-25T18:05:00.000Z');
    const b = new Date('2026-09-25T18:40:00.000Z');
    expect(scheduledContinuousCycleId(a)).toBe(scheduledContinuousCycleId(b));
    expect(scheduledContinuousCycleId(a)).toMatch(/^continuous-\d{4}-\d{2}-\d{2}-\d{2}$/);
  });

  it('changes when the Mexico hour changes', () => {
    const a = new Date('2026-09-25T18:05:00.000Z');
    const b = new Date('2026-09-25T19:05:00.000Z');
    expect(scheduledContinuousCycleId(a)).not.toBe(scheduledContinuousCycleId(b));
  });
});

describe('Day8 scheduler wiring', () => {
  it('registers hourly continuous discovery without removing existing crons', () => {
    const vercel = readFileSync(join(ROOT, 'vercel.json'), 'utf8');
    expect(vercel).toMatch(/\/api\/cron\/continuous-discovery/);
    expect(vercel).toMatch(/"schedule": "0 \* \* \* \*"/);
    expect(vercel).not.toMatch(/bot-ingest\?mode=continuous/);
    expect(vercel).toMatch(/\/api\/cron\/pm-freshness/);
    expect(vercel).toMatch(/\/api\/cron\/supply-engine/);
  });

  it('dedicated cron route is cronSafe and uses existing auth', () => {
    const src = readFileSync(join(ROOT, 'app/api/cron/continuous-discovery/route.ts'), 'utf8');
    expect(src).toMatch(/requireCronSecret/);
    expect(src).toMatch(/cronSafe:\s*true/);
    expect(src).toMatch(/scheduledContinuousCycleId/);
    expect(src).toMatch(/allowStagingMint:\s*false/);
    expect(src).not.toMatch(/withMachinePendingWritesEnabled/);
  });

  it('sole writer remains the only offers.insert', () => {
    const src = readFileSync(
      join(ROOT, 'lib/offers/ingestion/ingestOfferObservation.ts'),
      'utf8',
    );
    expect(src).toMatch(/from\('offers'\)\.insert/);
    const persist = readFileSync(
      join(ROOT, 'lib/hunter/discovery/persistContinuousDiscoveryTruth.ts'),
      'utf8',
    );
    expect(persist).not.toMatch(/from\('offers'\)\.insert/);
  });

  it('dry-run does not inflate automation_rate', () => {
    let counts = emptyAutomationCycleCounts();
    counts = accumulateAutomationOutcome(counts, 'blocked', { dryRun: true });
    counts = accumulateAutomationOutcome(counts, 'blocked_quality', { dryRun: true });
    const m = buildAutomationCycleMetrics(counts);
    expect(m.auto_processed).toBe(0);
    expect(m.automation_rate).toBe(0);
    expect(m.pending_created).toBe(0);
  });
});
