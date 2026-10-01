import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { requireCronSecret } from '@/lib/server/cronAuth';
import {
  CONTINUOUS_DISCOVERY_CRON_PATH,
  CONTINUOUS_DISCOVERY_CRON_SCHEDULE,
  resolveContinuousExecutionMode,
  scheduledContinuousCycleId,
} from '@/lib/hunter/discovery/continuousCronContract';
import {
  claimDiscoveryCycle,
  DISCOVERY_CYCLE_LEASE_MS,
} from '@/lib/hunter/discovery/discoveryCycleLease';
import {
  persistDiscoveryCycleSnapshot,
} from '@/lib/hunter/discovery/persistContinuousDiscoveryTruth';
import { runContinuousDiscoveryCycle } from '@/lib/hunter/discovery/continuousDiscoveryCycle';
import { emptyVerifiedYieldFunnel } from '@/lib/hunter/discovery/verifiedYieldFunnel';
import {
  accumulateAutomationOutcome,
  buildAutomationCycleMetrics,
  emptyAutomationCycleCounts,
} from '@/lib/bots/ingest/automationCycleMetrics';
import { isMachinePendingWriteEnabled } from '@/lib/bots/ingest/machineLiveInsertEligibility';
import { ML_PRICE_MIN_HISTORY_DAYS } from '@/lib/bots/ingest/mlPriceEngine';
import type { DiscoveryCycleReport } from '@/lib/hunter/discovery/continuousDiscoveryCycle';

const ROOT = process.cwd();

type Row = Record<string, unknown>;

function memorySnapshots() {
  const rows: Row[] = [];
  const api = {
    from() {
      return {
        insert(row: Row) {
          const exists = rows.some((r) => r.cycle_id === row.cycle_id);
          if (exists) return Promise.resolve({ error: { code: '23505', message: 'duplicate' } });
          rows.push(structuredClone(row));
          return Promise.resolve({ error: null });
        },
        upsert(row: Row) {
          const idx = rows.findIndex((r) => r.cycle_id === row.cycle_id);
          if (idx >= 0) rows[idx] = structuredClone(row);
          else rows.push(structuredClone(row));
          return Promise.resolve({ error: null });
        },
        select() {
          return {
            eq(_col: string, id: string) {
              return {
                maybeSingle() {
                  const found = rows.find((r) => r.cycle_id === id) ?? null;
                  return Promise.resolve({ data: found, error: null });
                },
              };
            },
          };
        },
        update(row: Row) {
          return {
            eq(_col: string, id: string) {
              return {
                filter(expr: string, _op: string, token: string) {
                  return {
                    select() {
                      const found = rows.find((r) => r.cycle_id === id);
                      const payload = (found?.payload ?? {}) as { claim_token?: string };
                      const key = expr.includes('claim_token') ? payload.claim_token : undefined;
                      if (!found || key !== token) return Promise.resolve({ data: [], error: null });
                      Object.assign(found, structuredClone(row));
                      return Promise.resolve({ data: [{ cycle_id: id }], error: null });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { rows, client: api as unknown as SupabaseClient };
}

function snapshotReport(cycleId: string): DiscoveryCycleReport {
  const verifiedYield = emptyVerifiedYieldFunnel(cycleId);
  verifiedYield.discovered = 4;
  verifiedYield.identity_valid = 3;
  verifiedYield.dqe_verified = 1;
  verifiedYield.s61_pass = 1;
  const counts = emptyAutomationCycleCounts();
  return {
    cycle_id: cycleId,
    startedAt: '2026-09-25T17:00:00.000Z',
    finishedAt: '2026-09-25T17:02:00.000Z',
    dryRun: true,
    mintAttempted: false,
    sources: [],
    funnel: {
      cycle_id: cycleId,
      sources_requested: 1,
      sources_succeeded: 1,
      sources_blocked: 0,
      sources_failed: 0,
      sources_empty: 0,
      candidates_discovered: 4,
      candidates_canonicalized: 4,
      duplicates: 0,
      unsupported: 0,
      invalid: 0,
      fetch_attempted: 1,
      fetch_success: 1,
      fetch_blocked: 0,
      fetch_failed: 0,
      extracted: 1,
      identified: 3,
      price_memory_ready: 1,
      price_memory_not_ready: 0,
      offer_standard_pass: 1,
      dqe_verified: 1,
      dqe_potential: 0,
      dqe_blocked: 0,
      dqe_failed: 0,
      s61_pass: 1,
      s61_blocked: 0,
      s7_pass: 0,
      s7_blocked: 0,
      observations_created: 0,
      pending_created: 0,
      dry_run: true,
    },
    cycleFunnel: { cycle_id: cycleId } as DiscoveryCycleReport['cycleFunnel'],
    automation: buildAutomationCycleMetrics(counts),
    prioritizedUrls: [],
    gateSamples: [],
    mintResults: [],
    hunterSourceRuns: [],
    operator_verdict: 'dry-run',
    bySource: {},
    verifiedYield,
    terminalTraces: [],
  };
}

describe('Day9 cron authentication', () => {
  it('rejects a continuous request without a secret', () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'unit-test-cron-secret';
    const req = new NextRequest('http://localhost/api/cron/bot-ingest?mode=continuous');
    expect(requireCronSecret(req)?.status).toBe(401);
    const dedicated = new NextRequest('http://localhost/api/cron/continuous-discovery');
    expect(requireCronSecret(dedicated)?.status).toBe(401);
    process.env.CRON_SECRET = prev;
  });

  it('rejects an invalid bearer secret', () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'unit-test-cron-secret';
    const req = new NextRequest('http://localhost/api/cron/continuous-discovery', {
      headers: { authorization: 'Bearer wrong-secret' },
    });
    expect(requireCronSecret(req)?.status).toBe(401);
    process.env.CRON_SECRET = prev;
  });

  it('accepts the bearer secret Vercel Cron sends', () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'unit-test-cron-secret';
    const req = new NextRequest('http://localhost/api/cron/continuous-discovery', {
      headers: { authorization: 'Bearer unit-test-cron-secret' },
    });
    expect(requireCronSecret(req)).toBeNull();
    process.env.CRON_SECRET = prev;
  });
});

describe('Day9 scheduled cycle id and cron wiring', () => {
  it('builds one Mexico-hour cycle id', () => {
    const id = scheduledContinuousCycleId(new Date('2026-09-25T23:10:00.000Z'));
    expect(id).toBe('continuous-2026-09-25-17');
  });

  it('keeps the Hobby daily schedule on the dedicated path', () => {
    const vercel = readFileSync(join(ROOT, 'vercel.json'), 'utf8');
    expect(vercel).toContain(CONTINUOUS_DISCOVERY_CRON_PATH);
    expect(vercel).toContain(CONTINUOUS_DISCOVERY_CRON_SCHEDULE);
    expect(vercel).not.toMatch(/bot-ingest\?mode=/);
    const route = readFileSync(join(ROOT, 'app/api/cron/continuous-discovery/route.ts'), 'utf8');
    expect(route).toContain('requireCronSecret');
    expect(route).toContain('runContinuousDiscoveryCycle');
    expect(route).toContain('cronSafe: true');
    expect(route).toContain('scheduledContinuousCycleId');
  });
});

describe('Day9 concurrency lease', () => {
  it('lets the first caller run and skips a concurrent caller', async () => {
    const mem = memorySnapshots();
    const now = new Date('2026-09-25T17:00:00.000Z');
    const first = await claimDiscoveryCycle({
      cycleId: 'continuous-2026-09-25-11',
      now,
      supabase: mem.client,
    });
    const second = await claimDiscoveryCycle({
      cycleId: 'continuous-2026-09-25-11',
      now: new Date(now.getTime() + 1000),
      supabase: mem.client,
    });
    expect(first.action).toBe('run');
    expect(second).toEqual({ action: 'skip', reason: 'in_progress' });
    expect(mem.rows).toHaveLength(1);
  });

  it('does not rerun a scheduled cycle that already completed', async () => {
    const mem = memorySnapshots();
    const cycleId = 'continuous-2026-09-25-11';
    mem.rows.push({
      cycle_id: cycleId,
      started_at: '2026-09-25T17:00:00.000Z',
      payload: { status: 'completed', verified_yield: { discovered: 3 }, claim_token: 'owned' },
    });
    const claim = await claimDiscoveryCycle({
      cycleId,
      now: new Date('2026-09-25T17:05:00.000Z'),
      supabase: mem.client,
    });
    expect(claim).toEqual({ action: 'skip', reason: 'completed' });

    const report = await runContinuousDiscoveryCycle({
      cycleId,
      cronSafe: true,
      dryRun: true,
      persistTruth: true,
      leaseSupabase: mem.client,
      now: new Date('2026-09-25T17:05:00.000Z'),
    });
    expect(report.operator_verdict).toContain('already persisted');
    expect(report.funnel.pending_created).toBe(0);
    expect(report.mintAttempted).toBe(false);
    expect(report.automation.automation_rate).toBeNull();
    expect(mem.rows).toHaveLength(1);
    expect((mem.rows[0]?.payload as { verified_yield?: { discovered: number } }).verified_yield?.discovered).toBe(3);
  });

  it('reclaims a stale claim after the lease expires', async () => {
    const mem = memorySnapshots();
    const cycleId = 'continuous-2026-09-25-11';
    const claimedAt = '2026-09-25T17:00:00.000Z';
    mem.rows.push({
      cycle_id: cycleId,
      started_at: claimedAt,
      payload: { status: 'claimed', claim_token: 'old', claimed_at: claimedAt },
    });
    const claim = await claimDiscoveryCycle({
      cycleId,
      now: new Date(Date.parse(claimedAt) + DISCOVERY_CYCLE_LEASE_MS + 1000),
      supabase: mem.client,
    });
    expect(claim.action).toBe('run');
    expect(mem.rows).toHaveLength(1);
    expect((mem.rows[0]?.payload as { claim_token: string }).claim_token).not.toBe('old');
  });

  it('completes the claimed snapshot and refuses a second write', async () => {
    const mem = memorySnapshots();
    const cycleId = 'continuous-2026-09-25-11';
    const claim = await claimDiscoveryCycle({
      cycleId,
      now: new Date('2026-09-25T17:00:00.000Z'),
      supabase: mem.client,
    });
    expect(claim.action).toBe('run');
    const token = claim.action === 'run' ? claim.token : '';
    const report = snapshotReport(cycleId);
    const written = await persistDiscoveryCycleSnapshot(report, {
      claimToken: token,
      supabase: mem.client,
    });
    expect(written).toEqual({ persisted: true });
    const again = await persistDiscoveryCycleSnapshot(
      { ...report, operator_verdict: 'should-not-replace' },
      { claimToken: 'someone-else', supabase: mem.client },
    );
    expect(again.reason).toBe('lease_lost');
    expect((mem.rows[0]?.payload as { operator_verdict: string }).operator_verdict).toBe('dry-run');
    const againClaim = await claimDiscoveryCycle({
      cycleId,
      now: new Date('2026-09-25T17:10:00.000Z'),
      supabase: mem.client,
    });
    expect(againClaim).toEqual({ action: 'skip', reason: 'completed' });
    expect(mem.rows).toHaveLength(1);
  });
});

describe('Day9 production authorities stay closed', () => {
  it('cronSafe cannot mint', () => {
    expect(
      resolveContinuousExecutionMode({ cronSafe: true, dryRun: false, allowStagingMint: true }),
    ).toEqual({ dryRun: true, allowMint: false });
  });

  it('machine mint stays off by default and dry-run does not count as automated production', () => {
    const prev = process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    expect(isMachinePendingWriteEnabled()).toBe(false);
    if (prev === undefined) delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    else process.env.BOT_INGEST_MACHINE_PENDING_WRITES = prev;

    let counts = emptyAutomationCycleCounts();
    counts = accumulateAutomationOutcome(counts, 'blocked', { dryRun: true });
    counts = accumulateAutomationOutcome(counts, 'auto_processed', { dryRun: true });
    const metrics = buildAutomationCycleMetrics(counts);
    expect(metrics.auto_processed).toBe(0);
    expect(metrics.pending_created).toBe(0);
    expect(metrics.automation_rate).toBe(0);
  });

  it('keeps DQE, S6.1, and the sole writer on the existing path', () => {
    expect(ML_PRICE_MIN_HISTORY_DAYS).toBeGreaterThanOrEqual(4);
    const cycle = readFileSync(
      join(ROOT, 'lib/hunter/discovery/continuousDiscoveryCycle.ts'),
      'utf8',
    );
    expect(cycle).toContain('evaluateDealQualityFromParsedMeta');
    expect(cycle).toContain('evaluateMachineCandidateGate');
    expect(cycle).toContain('writePendingViaS7Bridge');
    expect(cycle).not.toContain("from('offers').insert");
    const writer = readFileSync(
      join(ROOT, 'lib/offers/ingestion/ingestOfferObservation.ts'),
      'utf8',
    );
    expect(writer).toContain("from('offers').insert");
    expect(cycle).toContain('status: \'failed\'');
    expect(cycle).toContain('hunter_collect_threw');
  });
});
