import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  beginAutonomousShadowCycle,
  getShadowCycleReport,
  recordAutonomousDecision,
  resetAutonomousDecisionMetrics,
  buildShadowCycleRow,
  shadowCycleRowToReport,
  persistShadowCycleSnapshot,
  readRecentShadowCycles,
  SHADOW_CYCLE_SCHEMA_VERSION,
  SHADOW_CYCLE_TABLE,
  AUTONOMOUS_DECISION_POLICY_V1,
  type AutonomousDecisionResult,
} from '@/lib/autonomous';

const CHECK_KEYS = [
  'verifierDecision',
  'score',
  'confidence',
  'critical',
  'duplicate',
  'price',
  'discount',
  'quality',
  'image',
  'seller',
  'availability',
  'risk',
  'monetization',
  'affiliate',
  'sourceHealth',
  'moderation',
  'contradictions',
] as const;

function result(
  decision: AutonomousDecisionResult['decision'],
  opts: {
    confidence?: number;
    score?: number;
    duplicate?: 'pass' | 'fail' | 'unknown';
    reasons?: string[];
  } = {}
): AutonomousDecisionResult {
  const checks = Object.fromEntries(
    CHECK_KEYS.map((k) => [k, { status: 'pass' as const, detail: 'test' }])
  ) as unknown as AutonomousDecisionResult['checks'];
  checks.duplicate = { status: opts.duplicate ?? 'pass', detail: 'test' } as never;
  return {
    decision,
    confidence: opts.confidence ?? 0.8,
    score: opts.score ?? 80,
    reasons: opts.reasons ?? [],
    checks,
    policyVersion: AUTONOMOUS_DECISION_POLICY_V1,
    generatedAt: '2026-09-08T10:00:00.000Z',
  };
}

type Captured = { table: string; rows: unknown[] };

function fakeSupabase(captured: Captured[], insertError: { message?: string; code?: string } | null = null) {
  return {
    from(table: string) {
      return {
        insert(rows: unknown[]) {
          captured.push({ table, rows });
          return Promise.resolve({ error: insertError });
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe('shadow cycle snapshot', () => {
  beforeEach(() => {
    resetAutonomousDecisionMetrics();
  });

  it('ciclo vacío: no persiste y no inventa filas', async () => {
    beginAutonomousShadowCycle(new Date('2026-09-08T10:00:00Z'));
    const report = getShadowCycleReport(new Date('2026-09-08T10:05:00Z'));
    expect(report.evaluated).toBe(0);
    expect(report.autonomousPct).toBe(0);
    expect(report.avgScore).toBeNull();

    const captured: Captured[] = [];
    const outcome = await persistShadowCycleSnapshot({ supabase: fakeSupabase(captured) });
    expect(outcome).toEqual({ persisted: false, reason: 'empty_cycle' });
    expect(captured).toHaveLength(0);
  });

  it('mezcla de decisiones: cuenta, porcentajes y promedios del ciclo', () => {
    beginAutonomousShadowCycle(new Date('2026-09-08T10:00:00Z'));
    recordAutonomousDecision(result('AUTO_APPROVE', { score: 90, confidence: 0.9 }), 'ml_worker');
    recordAutonomousDecision(result('AUTO_APPROVE', { score: 86, confidence: 0.9 }), 'ml_worker');
    recordAutonomousDecision(
      result('HUMAN_REVIEW', { score: 60, confidence: 0.5, duplicate: 'unknown' }),
      'ml_api'
    );
    recordAutonomousDecision(result('AUTO_REJECT', { score: 20, confidence: 0.4, duplicate: 'fail' }), 'ml_api');

    const report = getShadowCycleReport(new Date('2026-09-08T10:05:00Z'));
    expect(report.evaluated).toBe(4);
    expect(report.autoApprove).toBe(2);
    expect(report.humanReview).toBe(1);
    expect(report.autoReject).toBe(1);
    expect(report.autoApprovePct).toBe(50);
    expect(report.humanReviewPct).toBe(25);
    expect(report.autoRejectPct).toBe(25);
    expect(report.autonomousPct).toBe(75);
    expect(report.avgScore).toBe(64);
    expect(report.duplicatePass).toBe(2);
    expect(report.duplicateFail).toBe(1);
    expect(report.duplicateUnknown).toBe(1);
    expect(report.policyVersion).toBe(AUTONOMOUS_DECISION_POLICY_V1);
    expect(report.schemaVersion).toBe(SHADOW_CYCLE_SCHEMA_VERSION);
  });

  it('bySource tiene alcance de ciclo, no de proceso', () => {
    beginAutonomousShadowCycle(new Date('2026-09-08T10:00:00Z'));
    recordAutonomousDecision(result('AUTO_APPROVE'), 'ml_worker');
    const first = getShadowCycleReport();
    expect(first.bySource.ml_worker?.evaluated).toBe(1);

    beginAutonomousShadowCycle(new Date('2026-09-08T11:00:00Z'));
    recordAutonomousDecision(result('HUMAN_REVIEW'), 'ml_api');
    const second = getShadowCycleReport();

    expect(second.bySource.ml_worker).toBeUndefined();
    expect(second.bySource.ml_api_legacy?.humanReview).toBe(1);
    expect(second.evaluated).toBe(1);
    expect(second.cycleId).not.toBe(first.cycleId);
  });

  it('topReasons del ciclo solo agrupa HUMAN_REVIEW', () => {
    beginAutonomousShadowCycle();
    recordAutonomousDecision(
      result('HUMAN_REVIEW', { duplicate: 'unknown' }),
      'ml_worker',
      { imageUrl: null }
    );
    const report = getShadowCycleReport();
    expect(report.topReasons.length).toBeGreaterThan(0);
    for (const r of report.topReasons) {
      expect(r.count).toBeGreaterThan(0);
      expect(typeof r.code).toBe('string');
    }
  });

  it('persiste una sola fila append-only en la tabla del contrato', async () => {
    beginAutonomousShadowCycle(new Date('2026-09-08T10:00:00Z'));
    recordAutonomousDecision(result('AUTO_APPROVE'), 'ml_worker');

    const captured: Captured[] = [];
    const outcome = await persistShadowCycleSnapshot({
      supabase: fakeSupabase(captured),
      now: new Date('2026-09-08T10:05:00Z'),
    });

    expect(outcome.persisted).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0]!.table).toBe(SHADOW_CYCLE_TABLE);
    expect(captured[0]!.rows).toHaveLength(1);

    const row = captured[0]!.rows[0] as Record<string, unknown>;
    expect(row.evaluated).toBe(1);
    expect(row.auto_approve).toBe(1);
    expect(row.policy_version).toBe(AUTONOMOUS_DECISION_POLICY_V1);
    expect(row.schema_version).toBe(SHADOW_CYCLE_SCHEMA_VERSION);
    expect(row.finished_at).toBe('2026-09-08T10:05:00.000Z');
    expect(String(row.cycle_id)).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('la fila no lleva URLs, títulos ni candidatos individuales', async () => {
    beginAutonomousShadowCycle();
    recordAutonomousDecision(result('AUTO_APPROVE'), 'ml_worker', {
      imageUrl: 'https://cdn.example.com/x.jpg',
      sourceDetail: 'worker:ml',
    });

    const captured: Captured[] = [];
    await persistShadowCycleSnapshot({ supabase: fakeSupabase(captured) });
    const serialized = JSON.stringify(captured[0]!.rows[0]);

    expect(serialized).not.toContain('http');
    expect(serialized).not.toContain('recent');
  });

  it('no persiste dos veces el mismo ciclo por llamadas repetidas de distintos ciclos', async () => {
    const captured: Captured[] = [];
    beginAutonomousShadowCycle();
    recordAutonomousDecision(result('AUTO_APPROVE'), 'ml_worker');
    const a = await persistShadowCycleSnapshot({ supabase: fakeSupabase(captured) });

    beginAutonomousShadowCycle();
    recordAutonomousDecision(result('AUTO_REJECT'), 'ml_worker');
    const b = await persistShadowCycleSnapshot({ supabase: fakeSupabase(captured) });

    expect(a.persisted && b.persisted).toBe(true);
    const ids = captured.map((c) => (c.rows[0] as Record<string, unknown>).cycle_id);
    expect(new Set(ids).size).toBe(2);
  });

  it('fail-closed: error de tabla ausente no lanza', async () => {
    beginAutonomousShadowCycle();
    recordAutonomousDecision(result('AUTO_APPROVE'), 'ml_worker');
    const captured: Captured[] = [];
    const outcome = await persistShadowCycleSnapshot({
      supabase: fakeSupabase(captured, { code: '42P01', message: 'relation does not exist' }),
    });
    expect(outcome).toEqual({ persisted: false, reason: 'table_missing' });
  });

  it('fail-closed: sin cliente supabase no lanza y no persiste', async () => {
    beginAutonomousShadowCycle();
    recordAutonomousDecision(result('AUTO_APPROVE'), 'ml_worker');
    const outcome = await persistShadowCycleSnapshot({ supabase: null });
    expect(outcome).toEqual({ persisted: false, reason: 'no_client' });
  });

  it('getShadowCycleReport no muta el ciclo en curso', () => {
    beginAutonomousShadowCycle();
    recordAutonomousDecision(result('AUTO_APPROVE'), 'ml_worker');
    const a = getShadowCycleReport();
    const b = getShadowCycleReport();
    expect(b.evaluated).toBe(a.evaluated);
    expect(b.cycleId).toBe(a.cycleId);
  });

  it('row ↔ report ida y vuelta conserva los campos del contrato', () => {
    beginAutonomousShadowCycle();
    recordAutonomousDecision(result('AUTO_APPROVE', { score: 90 }), 'ml_worker');
    const report = getShadowCycleReport();
    const roundTrip = shadowCycleRowToReport(
      buildShadowCycleRow(report) as unknown as Record<string, unknown>
    );
    expect(roundTrip).toEqual(report);
  });

  it('lectura admin devuelve [] si la tabla falla', async () => {
    const supabase = {
      from() {
        return {
          select() {
            return {
              order() {
                return { limit: () => Promise.resolve({ data: null, error: { message: 'boom' } }) };
              },
            };
          },
        };
      },
    } as unknown as SupabaseClient;
    expect(await readRecentShadowCycles(supabase, 2)).toEqual([]);
    expect(await readRecentShadowCycles(null, 2)).toEqual([]);
  });

  it('no toca sistemas productivos: solo escribe en su propia tabla', async () => {
    beginAutonomousShadowCycle();
    recordAutonomousDecision(result('AUTO_APPROVE'), 'ml_worker');
    const captured: Captured[] = [];
    await persistShadowCycleSnapshot({ supabase: fakeSupabase(captured) });
    expect(captured.every((c) => c.table === SHADOW_CYCLE_TABLE)).toBe(true);
  });

  it('no expone mutadores de update/delete del snapshot', async () => {
    const mod = await import('@/lib/autonomous/shadowCyclePersistence');
    const names = Object.keys(mod).join(' ').toLowerCase();
    expect(names).not.toContain('update');
    expect(names).not.toContain('delete');
    expect(vi.isMockFunction(mod.persistShadowCycleSnapshot)).toBe(false);
  });
});
