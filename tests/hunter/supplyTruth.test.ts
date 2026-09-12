import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { USERS_LOGS_ROLES } from '@/lib/server/requireAdmin';
import { isDayToDayFlagOn } from '@/lib/hunter/dayToDay';
import { HUNTER_METRIC_UNIVERSES } from '@/lib/hunter/metricUniverses';
import { defaultHealthRow } from '@/lib/hunter/healthStore';
import {
  buildSupplyAlerts,
  clampSupplyCounter,
  computePersistedGlobalHealth,
  inferSupplyRunStatus,
  mapAggregateRows,
  normalizeSupplyRunInput,
  persistCommunitySupplyRun,
  persistIngestSupplyRuns,
  persistSupplyRouterReport,
  recordSupplyRun,
  recommendedSupplyTruthAction,
  summarizeWindow,
  supplyLaneForFamily,
  windowSince,
  type SupplyRouterReport,
} from '@/lib/hunter/supply';
import { DEAL_VERIFIER_THRESHOLDS } from '@/lib/verifier/thresholds';
import { AUTONOMOUS_POLICY_V1 } from '@/lib/autonomous/policy';
import { evaluateCommunitySubmission } from '@/lib/hunter/supply/communityPipeline';

const MIGRATION = readFileSync(
  resolve(process.cwd(), 'docs/supabase-migrations/20260911_hunter_supply_runs.sql'),
  'utf8',
);

type Captured = { table: string; rows: unknown[]; rpc?: string; args?: unknown };

function fakeSupabase(
  captured: Captured[],
  insertError: { message?: string; code?: string } | null = null,
  rpcData: unknown = [],
) {
  return {
    from(table: string) {
      return {
        insert(rows: unknown[]) {
          captured.push({ table, rows });
          return Promise.resolve({ error: insertError });
        },
      };
    },
    rpc(name: string, args?: unknown) {
      captured.push({ table: name, rows: [], rpc: name, args });
      return Promise.resolve({ data: rpcData, error: null });
    },
  } as unknown as SupabaseClient;
}

const baseTimes = {
  startedAt: '2026-09-11T18:00:00.000Z',
  finishedAt: '2026-09-11T18:00:08.000Z',
};

describe('FASE 10.2 supply truth', () => {
  it('1. recordSupplyRun inserta una fila normalizada', async () => {
    const captured: Captured[] = [];
    const out = await recordSupplyRun(
      {
        runId: 'run-a',
        sourceId: 'ml_worker',
        sourceFamily: 'external_worker',
        ...baseTimes,
        verifiedDeals: 8,
        candidatesDiscovered: 36,
      },
      { supabase: fakeSupabase(captured), allowInTests: true },
    );
    expect(out).toEqual({ persisted: true, runId: 'run-a', sourceId: 'ml_worker', duplicate: false });
    expect(captured[0]?.table).toBe('hunter_supply_runs');
    const row = (captured[0]?.rows as Array<Record<string, unknown>>)[0];
    expect(row.source_lane).toBe('machine');
    expect(row.verified_deals).toBe(8);
    expect(row.shadow_cycle_id).toBeNull();
  });

  it('2–3. unique run_id+source es idempotente', async () => {
    const captured: Captured[] = [];
    const out = await recordSupplyRun(
      { runId: 'run-a', sourceId: 'ml_worker', sourceFamily: 'external_worker', ...baseTimes },
      { supabase: fakeSupabase(captured, { code: '23505', message: 'duplicate' }), allowInTests: true },
    );
    expect(out).toEqual({ persisted: true, runId: 'run-a', sourceId: 'ml_worker', duplicate: true });
    expect(captured).toHaveLength(1);
  });

  it('4–5. counters inválidos y negativos se clampean', () => {
    expect(clampSupplyCounter(-4)).toBe(0);
    expect(clampSupplyCounter(Number.NaN)).toBe(0);
    expect(clampSupplyCounter(Infinity)).toBe(0);
    const row = normalizeSupplyRunInput({
      runId: 'x',
      sourceId: 'community',
      sourceFamily: 'community',
      ...baseTimes,
      verifiedDeals: -9,
      candidatesDiscovered: 2.7,
      errors: Number.NaN,
    });
    expect(row?.verified_deals).toBe(0);
    expect(row?.candidates_discovered).toBe(3);
    expect(row?.errors).toBe(0);
    expect(row?.source_lane).toBe('community');
  });

  it('6. fallo de DB no rompe supply', async () => {
    const out = await recordSupplyRun(
      { runId: 'z', sourceId: 'ml_worker', sourceFamily: 'external_worker', ...baseTimes },
      { supabase: fakeSupabase([], { code: '57014', message: 'timeout' }), allowInTests: true },
    );
    expect(out.persisted).toBe(false);
    if (!out.persisted) expect(out.reason).toBe('error');
    const skipped = await recordSupplyRun({
      runId: 'z',
      sourceId: 'ml_worker',
      sourceFamily: 'external_worker',
      ...baseTimes,
    });
    expect(skipped).toEqual({ persisted: false, reason: 'test_skip' });
  });

  it('7–8. source family y community vs machine', () => {
    expect(supplyLaneForFamily('community')).toBe('community');
    expect(supplyLaneForFamily('official_api')).toBe('machine');
    expect(inferSupplyRunStatus({ attempted: true, candidates: 0, errors: 0 })).toBe('zero');
    expect(inferSupplyRunStatus({ isolatedFailure: true })).toBe('failed');
  });

  it('9–12. agregación 24h/7d/30d y contribution', () => {
    const now = new Date('2026-09-11T20:00:00.000Z');
    expect(windowSince(now, 'h24').toISOString()).toBe('2026-09-10T20:00:00.000Z');
    expect(windowSince(now, 'd7').toISOString()).toBe('2026-09-04T20:00:00.000Z');
    expect(windowSince(now, 'd30').toISOString()).toBe('2026-08-12T20:00:00.000Z');
    const rows = mapAggregateRows([
      {
        source_id: 'community',
        source_family: 'community',
        source_lane: 'community',
        verified_deals: 15,
        candidates_discovered: 20,
        runs: 20,
      },
      {
        source_id: 'ml_worker',
        source_family: 'external_worker',
        source_lane: 'machine',
        verified_deals: 8,
        candidates_discovered: 36,
        duplicates: 20,
        runs: 2,
      },
      {
        source_id: 'chedraui_mx',
        source_family: 'retailer_public',
        source_lane: 'machine',
        verified_deals: 0,
        candidates_discovered: 4,
        runs: 1,
      },
    ]);
    expect(rows[0]?.sourceId).toBe('community');
    expect(rows[0]?.contributionPct).toBe(65.2);
    expect(rows[1]?.contributionPct).toBe(34.8);
    const w = summarizeWindow('h24', windowSince(now, 'h24').toISOString(), rows);
    expect(w.communityVerified).toBe(15);
    expect(w.machineVerified).toBe(8);
    expect(w.communityPct).toBe(65.2);
  });

  it('13–16. global health, stale, zero production, community compensating', () => {
    const now = new Date('2026-09-11T20:00:00.000Z');
    const healthy = computePersistedGlobalHealth({
      lastActivityAt: '2026-09-11T19:50:00.000Z',
      verified24h: 10,
      communityVerified24h: 4,
      machineVerified24h: 6,
      communityActive24h: true,
      machineHealthy: 1,
      machineDegraded: 0,
      machineDown: 0,
      expectedIntervalMs: 15 * 60 * 1000,
      now,
    });
    expect(healthy.status).toBe('HEALTHY');
    expect(healthy.stale).toBe(false);

    const stale = computePersistedGlobalHealth({
      lastActivityAt: '2026-09-11T18:00:00.000Z',
      verified24h: 4,
      communityVerified24h: 4,
      machineVerified24h: 0,
      communityActive24h: true,
      machineHealthy: 0,
      machineDegraded: 0,
      machineDown: 1,
      expectedIntervalMs: 15 * 60 * 1000,
      now,
    });
    expect(stale.status).toBe('AT_RISK');
    expect(stale.stale).toBe(true);

    const down = computePersistedGlobalHealth({
      lastActivityAt: '2026-09-10T00:00:00.000Z',
      verified24h: 0,
      communityVerified24h: 0,
      machineVerified24h: 0,
      communityActive24h: false,
      machineHealthy: 0,
      machineDegraded: 0,
      machineDown: 2,
      expectedIntervalMs: 15 * 60 * 1000,
      now,
    });
    expect(down.status).toBe('DOWN');

    const zero = recommendedSupplyTruthAction({
      status: 'DEGRADED',
      window: summarizeWindow('h24', now.toISOString(), [
        {
          sourceId: 'ml_worker',
          family: 'external_worker',
          lane: 'machine',
          runs: 1,
          candidates: 36,
          qualified: 10,
          verifiedDeals: 0,
          promotions: 0,
          potentialDeals: 0,
          catalogOnly: 10,
          duplicates: 20,
          rejected: 0,
          pending: 0,
          errors: 0,
          contributionPct: 0,
        },
      ]),
      machineDown: 0,
      machineHealthy: 1,
      sourceQuality: [
        {
          sourceId: 'ml_worker',
          hunterStatus: 'healthy',
          producingCandidates: true,
          producingVerified: false,
        },
      ],
    });
    expect(zero).toMatch(/duplicates|0 verified/i);

    const compensating = recommendedSupplyTruthAction({
      status: 'DEGRADED',
      window: summarizeWindow('h24', now.toISOString(), [
        {
          sourceId: 'community',
          family: 'community',
          lane: 'community',
          runs: 10,
          candidates: 10,
          qualified: 10,
          verifiedDeals: 8,
          promotions: 0,
          potentialDeals: 0,
          catalogOnly: 0,
          duplicates: 0,
          rejected: 0,
          pending: 10,
          errors: 0,
          contributionPct: 100,
        },
      ]),
      machineDown: 2,
      machineHealthy: 0,
      sourceQuality: [],
    });
    expect(compensating).toMatch(/community/i);
  });

  it('17. RLS/security en la migration', () => {
    expect(MIGRATION).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(MIGRATION).toMatch(/REVOKE ALL ON TABLE public\.hunter_supply_runs FROM PUBLIC, anon, authenticated/);
    expect(MIGRATION).toMatch(/GRANT ALL ON TABLE public\.hunter_supply_runs TO service_role/);
    expect(MIGRATION).toMatch(/UNIQUE \(run_id, source_id\)/);
    expect(MIGRATION).not.toMatch(/CREATE POLICY/);
    expect(MIGRATION).toMatch(/hunter_supply_aggregate/);
    expect(MIGRATION).toMatch(/GROUP BY/);
  });

  it('18. admin authorization sigue siendo owner/admin', () => {
    expect(USERS_LOGS_ROLES).toEqual(['owner', 'admin']);
  });

  it('19. no duplicate rows en persist router + community', async () => {
    const captured: Captured[] = [];
    const report = {
      persisted: false,
      published: false,
      inserted: false,
      rewardsTouched: false,
      verifierBypassed: false,
      startedAt: baseTimes.startedAt,
      finishedAt: baseTimes.finishedAt,
      globalStatus: 'DEGRADED',
      recommendedAction: 'x',
      candidatesDiscovered: 2,
      candidatesQualified: 2,
      verifiedDeals: 1,
      promotions: 0,
      catalogOnly: 1,
      duplicates: 1,
      rejected: 0,
      pending: 1,
      sourceFailures: 0,
      communityShare: 50,
      machineShare: 50,
      verifiedDealRate: 50,
      duplicateRate: 50,
      communityVerified: 1,
      machineVerified: 0,
      uniqueCandidates: [],
      duplicateCandidates: [],
      runs: [
        {
          sourceId: 'community',
          family: 'community',
          type: 'community',
          attempted: true,
          skippedReason: null,
          ok: true,
          candidates: 1,
          unique: 1,
          verifiedDeals: 1,
          promotions: 0,
          catalogOnly: 0,
          duplicates: 0,
          errors: 0,
          fallbackFrom: null,
          isolatedFailure: false,
        },
        {
          sourceId: 'ml_worker',
          family: 'external_worker',
          type: 'external_worker',
          attempted: true,
          skippedReason: null,
          ok: true,
          candidates: 1,
          unique: 0,
          verifiedDeals: 0,
          promotions: 0,
          catalogOnly: 0,
          duplicates: 1,
          errors: 0,
          fallbackFrom: null,
          isolatedFailure: false,
        },
      ],
    } as unknown as SupplyRouterReport;
    await persistSupplyRouterReport(report, {
      runId: 'router-1',
      supabase: fakeSupabase(captured),
      allowInTests: true,
    });
    const rows = captured.flatMap((c) => c.rows as unknown[]);
    expect(rows).toHaveLength(2);
  });

  it('20–23. no rewards / offers / autonomous / publish', async () => {
    const ev = evaluateCommunitySubmission({
      title: 'Taladro',
      store: 'ML',
      price: 100,
      originalPrice: 200,
      imageUrl: null,
      offerUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-x-_JM',
    });
    expect(ev.published).toBe(false);
    expect(ev.rewardsTouched).toBe(false);
    expect(ev.persistStatus).toBe('pending');
    const captured: Captured[] = [];
    await persistCommunitySupplyRun({
      runId: 'community:test',
      startedAt: baseTimes.startedAt,
      evaluation: ev,
      insertedPending: true,
      supabase: fakeSupabase(captured),
      allowInTests: true,
    });
    const row = (captured[0]?.rows as Array<Record<string, unknown>>)[0];
    expect(row.source_id).toBe('community');
    expect(row.pending).toBe(1);
    expect(loadBotIngestConfig().legacyAutoApproveWriteEnabled).toBe(false);
    expect(DEAL_VERIFIER_THRESHOLDS.absurdDiscountCap).toBe(85);
    expect(AUTONOMOUS_POLICY_V1.minAutoApproveConfidence).toBe(0.7);
  });

  it('24. hunter health regression + universos + flags', () => {
    expect(HUNTER_METRIC_UNIVERSES.supplyTruth.persistence).toBe('supabase_hunter_supply_runs');
    expect(HUNTER_METRIC_UNIVERSES.sourceHealth.persistence).toBe('supabase_hunter_source_health');
    expect(HUNTER_METRIC_UNIVERSES.autonomousShadowCycle.persistence).toBe(
      'supabase_hunter_shadow_cycles',
    );
    expect(HUNTER_METRIC_UNIVERSES.communityQuality.persistence).toBe('process_memory');
    expect(isDayToDayFlagOn('DAY_TO_DAY_CHEDRAUI_ENABLED')).toBe(false);
    expect(isDayToDayFlagOn('DAY_TO_DAY_BODEGA_ENABLED')).toBe(false);
    expect(isDayToDayFlagOn('DAY_TO_DAY_WALMART_ENABLED')).toBe(false);
    expect(defaultHealthRow('ml_worker').status).toBe('degraded');
  });

  it('ingest zero-candidate y failed source se mapean', async () => {
    const captured: Captured[] = [];
    await persistIngestSupplyRuns({
      runId: 'ingest-1',
      startedAt: baseTimes.startedAt,
      finishedAt: baseTimes.finishedAt,
      sourceStats: {
        ml_worker: {
          collected: 0,
          evaluated: 0,
          inserted: 0,
          duplicate: 0,
          skipped: 0,
          errors: 2,
        },
        amazon_asin: {
          collected: 4,
          evaluated: 0,
          inserted: 0,
          duplicate: 0,
          skipped: 0,
          errors: 0,
        },
      },
      supabase: fakeSupabase(captured),
      allowInTests: true,
    });
    const rows = captured.flatMap((c) => c.rows as Array<Record<string, unknown>>);
    expect(rows.find((r) => r.source_id === 'ml_worker')?.status).toBe('failed');
    expect(rows.find((r) => r.source_id === 'amazon_asin')?.status).toBe('ok');
  });

  it('input inválido no inserta', async () => {
    const captured: Captured[] = [];
    const out = await recordSupplyRun(
      {
        runId: 'bad',
        sourceId: '',
        sourceFamily: 'core',
        startedAt: 'nope',
        finishedAt: 'nope',
      },
      { supabase: fakeSupabase(captured), allowInTests: true },
    );
    expect(out).toEqual({ persisted: false, reason: 'invalid' });
    expect(captured).toHaveLength(0);
  });

  it('alert-ready conditions', () => {
    const empty = summarizeWindow('h24', '2026-09-11T00:00:00.000Z', []);
    const week = summarizeWindow('d7', '2026-09-04T00:00:00.000Z', [
      {
        sourceId: 'community',
        family: 'community',
        lane: 'community',
        runs: 10,
        candidates: 10,
        qualified: 10,
        verifiedDeals: 6,
        promotions: 0,
        potentialDeals: 0,
        catalogOnly: 0,
        duplicates: 0,
        rejected: 0,
        pending: 10,
        errors: 0,
        contributionPct: 100,
      },
    ]);
    const alerts = buildSupplyAlerts({
      window24h: empty,
      window7d: week,
      machineDown: 2,
      machineConfigured: 2,
      sourceQuality: [
        {
          sourceId: 'ml_worker',
          hunterStatus: 'healthy',
          producingCandidates: false,
          producingVerified: false,
        },
      ],
    });
    expect(alerts.noVerifiedDealsForHours).toBe(true);
    expect(alerts.allMachineSourcesDown).toBe(true);
    expect(alerts.communitySupplyCollapse).toBe(true);
    expect(alerts.sourceZeroUnexpected).toContain('ml_worker');
  });
});
