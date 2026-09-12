import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';
import { AUTONOMOUS_DECISION_POLICY_V1, AUTONOMOUS_POLICY_V1 } from '@/lib/autonomous';
import {
  buildCalibrationSnapshot,
  buildCollectionHealth,
  canApplyHumanOutcome,
  captureAutomaticExpireOutcome,
  captureHumanModerationOutcome,
  collectionStatus,
  matchRate,
  normalizeShadowOutcomeInput,
  recordHumanOutcome,
  recordShadowOutcome,
  resetCalibrationWriteMetrics,
  resolveCorrelationIdentity,
  timeToDecisionSeconds,
} from '@/lib/autonomous/calibration';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { isDayToDayFlagOn } from '@/lib/hunter/dayToDay';
import { HUNTER_METRIC_UNIVERSES } from '@/lib/hunter/metricUniverses';
import { USERS_LOGS_ROLES } from '@/lib/server/requireAdmin';
import { DEAL_VERIFIER_THRESHOLDS } from '@/lib/verifier/thresholds';

const MIGRATION = readFileSync(
  resolve(process.cwd(), 'docs/supabase-migrations/20260913_hunter_shadow_calibration_collection.sql'),
  'utf8',
);

function src(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

const OFFER_A = '11111111-1111-4111-8111-111111111111';

type Captured = { op: string; table: string; rows: unknown[] };
type StoreRow = Record<string, unknown> & { id?: string };

function fakeSupabase(opts: {
  captured: Captured[];
  insertError?: { message?: string; code?: string } | null;
  updateError?: { message?: string; code?: string } | null;
  store?: StoreRow[];
}) {
  const store = opts.store ?? [];
  return {
    from(table: string) {
      return {
        insert(rows: unknown[]) {
          opts.captured.push({ op: 'insert', table, rows });
          if (opts.insertError) return Promise.resolve({ error: opts.insertError });
          for (const row of rows as StoreRow[]) {
            store.push({ id: 'row-1', ...row });
          }
          return Promise.resolve({ error: null });
        },
        select() {
          return {
            eq(col: string, val: unknown) {
              return Promise.resolve({
                data: store.filter((r) => r[col] === val),
                error: null,
              });
            },
          };
        },
        update(patch: Record<string, unknown>) {
          const chain = {
            eq() {
              return chain;
            },
            then(resolve: (v: unknown) => void) {
              opts.captured.push({ op: 'update', table, rows: [patch] });
              if (!opts.updateError) {
                for (const row of store) Object.assign(row, patch);
              }
              resolve({ error: opts.updateError ?? null, data: null });
            },
          };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient;
}

afterEach(() => {
  resetCalibrationWriteMetrics();
});

describe('FASE 11.1 calibration data collection', () => {
  it('1. snapshot shadow → offer_id + pending + policy', async () => {
    const captured: Captured[] = [];
    const out = await recordShadowOutcome(
      {
        offerId: OFFER_A,
        shadowDecision: 'HUMAN_REVIEW',
        sourceId: 'ml_worker',
        score: 71,
        confidence: 0.62,
        policyVersion: AUTONOMOUS_DECISION_POLICY_V1,
      },
      { supabase: fakeSupabase({ captured }), allowInTests: true },
    );
    expect(out).toEqual({ persisted: true, offerId: OFFER_A, duplicate: false });
    const row = (captured[0]?.rows as Array<Record<string, unknown>>)[0];
    expect(row.offer_id).toBe(OFFER_A);
    expect(row.human_outcome).toBe('HUMAN_PENDING');
    expect(row.policy_version).toBe('AUTONOMOUS_DECISION_POLICY_V1');
    expect(row.score).toBe(71);
    expect(row.confidence).toBe(0.62);
  });

  it('2–5. approve / reject / snooze / expire humano', async () => {
    const store: StoreRow[] = [
      { id: 'row-1', offer_id: OFFER_A, human_outcome: 'HUMAN_PENDING' },
    ];
    const approved = await captureHumanModerationOutcome(OFFER_A, 'approved', {
      supabase: fakeSupabase({ captured: [], store: [{ ...store[0] }] }),
      allowInTests: true,
    });
    expect(approved).toMatchObject({ applied: true, outcome: 'HUMAN_APPROVED' });

    const rejected = await captureHumanModerationOutcome(OFFER_A, 'rejected', {
      supabase: fakeSupabase({ captured: [], store: [{ id: 'row-1', offer_id: OFFER_A, human_outcome: 'HUMAN_PENDING' }] }),
      allowInTests: true,
    });
    expect(rejected).toMatchObject({ applied: true, outcome: 'HUMAN_REJECTED' });

    const snoozedStore: StoreRow[] = [{ id: 'row-1', offer_id: OFFER_A, human_outcome: 'HUMAN_PENDING' }];
    const snoozed = await captureHumanModerationOutcome(OFFER_A, 'snoozed', {
      supabase: fakeSupabase({ captured: [], store: snoozedStore }),
      allowInTests: true,
    });
    expect(snoozed).toMatchObject({ applied: true, outcome: 'HUMAN_SNOOZED' });
    expect(snoozedStore[0]?.matched_at).toBeNull();

    const expiredStore: StoreRow[] = [{ id: 'row-1', offer_id: OFFER_A, human_outcome: 'HUMAN_PENDING' }];
    const expired = await captureHumanModerationOutcome(OFFER_A, 'expired', {
      supabase: fakeSupabase({ captured: [], store: expiredStore }),
      allowInTests: true,
    });
    expect(expired).toMatchObject({ applied: true, outcome: 'HUMAN_EXPIRED' });
  });

  it('6. expire automático no es HUMAN_EXPIRED', async () => {
    const store: StoreRow[] = [{ id: 'row-1', offer_id: OFFER_A, human_outcome: 'HUMAN_PENDING' }];
    const out = await captureAutomaticExpireOutcome(OFFER_A, {
      supabase: fakeSupabase({ captured: [], store }),
      allowInTests: true,
    });
    expect(out).toMatchObject({ applied: true, outcome: 'UNKNOWN' });
    expect(store[0]?.human_actor_kind).toBe('system_lifecycle');
    expect(store[0]?.human_outcome).toBe('UNKNOWN');
    expect(src('lib/offers/runOfferHealthBatch.ts')).toMatch(/captureAutomaticExpireOutcome/);
    expect(src('app/api/admin/expire-offer/route.ts')).toMatch(/captureHumanModerationOutcome\(offerId, 'expired'\)/);
  });

  it('7–9. idempotencia y terminal', async () => {
    const store: StoreRow[] = [{ id: 'row-1', offer_id: OFFER_A, human_outcome: 'HUMAN_APPROVED' }];
    const again = await captureHumanModerationOutcome(OFFER_A, 'approved', {
      supabase: fakeSupabase({ captured: [], store }),
      allowInTests: true,
    });
    expect(again).toMatchObject({ applied: true, idempotent: true });
    const blocked = await captureHumanModerationOutcome(OFFER_A, 'rejected', {
      supabase: fakeSupabase({ captured: [], store }),
      allowInTests: true,
    });
    expect(blocked).toEqual({ applied: false, reason: 'append_only' });
    expect(canApplyHumanOutcome('HUMAN_APPROVED', 'HUMAN_REJECTED')).toBe(false);
    expect(src('app/api/admin/moderate-offer/route.ts')).toMatch(/La oferta ya fue moderada/);
  });

  it('10–12. unknown / ambiguous / no backfill', () => {
    expect(
      resolveCorrelationIdentity({
        offerId: null,
        fingerprint: null,
        rowsWithSameOfferId: 0,
        rowsWithSameFingerprint: 0,
      }).matchConfidence,
    ).toBe('unmatched');
    expect(
      resolveCorrelationIdentity({
        offerId: null,
        fingerprint: 'fp',
        rowsWithSameOfferId: 0,
        rowsWithSameFingerprint: 2,
        offersWithSameFingerprint: 2,
      }).matchConfidence,
    ).toBe('ambiguous');
    expect(src('lib/autonomous/calibration/getCalibration.ts')).not.toMatch(/hunter_shadow_cycles/);
    expect(src('lib/autonomous/calibration/collection.ts')).not.toMatch(/moderation_logs/);
    expect(MIGRATION).not.toMatch(/INSERT INTO public\.hunter_shadow_outcomes/);
  });

  it('13–16. match rate, sample, awaiting, lag', () => {
    expect(matchRate(3, 10).display).toBe('30% · n=10 · INSUFFICIENT');
    expect(matchRate(0, 0).display).toBe('n=0 · INSUFFICIENT');
    expect(collectionStatus({ shadowSnapshots: 0, matched: 0 })).toBe('NO_DATA');
    expect(collectionStatus({ shadowSnapshots: 12, matched: 3 })).toBe('LOW_DATA');
    expect(collectionStatus({ shadowSnapshots: 80, matched: 25 })).toBe('COLLECTING');
    expect(collectionStatus({ shadowSnapshots: 10, matched: 2, readError: true })).toBe('ERROR');
    const health = buildCollectionHealth({
      since: '2020-01-01T00:00:00.000Z',
      collection: {
        shadow_snapshots: 100,
        offers_with_shadow: 100,
        offers_with_human_outcome: 70,
        matched: 70,
        pending_outcomes: 30,
        unknown_outcomes: 0,
        approved_outcomes: 50,
        rejected_outcomes: 20,
        last_shadow_at: '2026-09-12T00:00:00.000Z',
        last_human_at: '2026-09-12T01:00:00.000Z',
        avg_time_to_decision_seconds: 3600,
      },
    });
    expect(health.awaitingOutcomes).toBe(30);
    expect(health.matchRate.sampleSize).toBe(100);
    expect(health.sufficiency).toBe('moderate');
    expect(timeToDecisionSeconds('2026-09-12T00:00:00.000Z', '2026-09-12T01:00:00.000Z')).toBe(3600);
    expect(timeToDecisionSeconds('2026-09-12T01:00:00.000Z', '2026-09-12T00:00:00.000Z')).toBeNull();
  });

  it('17–19. source / decision / reason breakdown', () => {
    const health = buildCollectionHealth({
      since: '2020-01-01T00:00:00.000Z',
      collection: { shadow_snapshots: 8, offers_with_shadow: 8, matched: 4 },
      byDecision: [
        {
          shadow_decision: 'HUMAN_REVIEW',
          snapshots: 8,
          matched: 4,
          approved: 3,
          rejected: 1,
          pending: 4,
          unknown_outcomes: 0,
        },
      ],
      bySource: [
        {
          source_id: 'community',
          source_family: 'community',
          source_lane: 'community',
          evaluated: 5,
          matched: 3,
          approved: 2,
          rejected: 1,
          pending: 2,
        },
        {
          source_id: 'ml_worker',
          source_family: 'external_worker',
          source_lane: 'machine',
          evaluated: 3,
          matched: 1,
          approved: 1,
          rejected: 0,
          pending: 2,
        },
      ],
      reasonOutcomes: [
        { reason_code: 'seller_unknown', count: 6, approved: 4, rejected: 1, unknown_outcomes: 1 },
        { reason_code: 'invented', count: 9, approved: 9, rejected: 0, unknown_outcomes: 0 },
      ],
    });
    expect(health.byDecision[0]?.decision).toBe('HUMAN_REVIEW');
    expect(health.bySource[0]?.sourceLane).toBe('community');
    expect(health.bySource[1]?.matchRate.sampleSize).toBe(3);
    expect(health.reasonOutcomes.map((r) => r.reasonCode)).toEqual(['seller_unknown']);
  });

  it('20–22. buckets, policy, no new reason codes', () => {
    const snap = buildCalibrationSnapshot({
      since: '2026-08-12T00:00:00.000Z',
      scoreBuckets: [{ bucket: '70-77', evaluated: 4, matched: 2, agreement: 1, disagreement: 1 }],
      confidenceBuckets: [{ bucket: '0.50-0.69', evaluated: 4, matched: 2, agreement: 1, disagreement: 0 }],
    });
    expect(snap.scoreBuckets[0]?.bucket).toBe('70-77');
    expect(snap.confidenceBuckets[0]?.bucket).toBe('0.50-0.69');
    expect(snap.policyVersion).toBe(AUTONOMOUS_DECISION_POLICY_V1);
    expect(normalizeShadowOutcomeInput({
      offerId: OFFER_A,
      shadowDecision: 'AUTO_REJECT',
      sourceId: 'ml_worker',
    })?.policy_version).toBe('AUTONOMOUS_DECISION_POLICY_V1');
    expect(src('lib/autonomous/policy.ts')).toMatch(/minAutoApproveConfidence: 0\.7/);
  });

  it('23–24. fallo DB no rompe ingest ni moderación', async () => {
    const shadow = await recordShadowOutcome(
      { offerId: OFFER_A, shadowDecision: 'HUMAN_REVIEW', sourceId: 'ml_worker' },
      { supabase: fakeSupabase({ captured: [], insertError: { message: 'timeout' } }), allowInTests: true },
    );
    expect(shadow.persisted).toBe(false);
    const human = await recordHumanOutcome(
      { offerId: OFFER_A, outcome: 'HUMAN_APPROVED' },
      {
        supabase: fakeSupabase({
          captured: [],
          store: [{ id: 'row-1', offer_id: OFFER_A, human_outcome: 'HUMAN_PENDING' }],
          updateError: { message: 'timeout' },
        }),
        allowInTests: true,
      },
    );
    expect(human).toEqual({ applied: false, reason: 'error' });
    expect(src('lib/bots/ingest/runIngestCycle.ts')).toMatch(/void recordShadowOutcomeFromAutonomous/);
    expect(src('app/api/admin/moderate-offer/route.ts')).toMatch(/void captureHumanModerationOutcome/);
  });

  it('25–30. no status / auto-approve / publish / rewards / commissions', () => {
    for (const rel of [
      'lib/autonomous/calibration/collection.ts',
      'lib/autonomous/calibration/persistMetrics.ts',
      'lib/offers/runOfferHealthBatch.ts',
    ]) {
      const text = src(rel);
      expect(text).not.toMatch(/legacyAutoApproveWriteEnabled\s*=\s*true/);
      expect(text).not.toMatch(/lib\/rewards|maybeUnlockRewards|lib\/commissions/);
    }
    expect(src('lib/autonomous/calibration/collection.ts')).not.toMatch(/from\('offers'\)/);
    expect(loadBotIngestConfig().legacyAutoApproveWriteEnabled).toBe(false);
    expect(DEAL_VERIFIER_THRESHOLDS.absurdDiscountCap).toBe(85);
    expect(AUTONOMOUS_POLICY_V1.minAutoApproveConfidence).toBe(0.7);
    expect(isDayToDayFlagOn('DAY_TO_DAY_CHEDRAUI_ENABLED')).toBe(false);
  });

  it('31–33. auth, RLS, idempotency de snapshot', async () => {
    expect(USERS_LOGS_ROLES).toEqual(['owner', 'admin']);
    expect(src('app/api/admin/hunter-health/route.ts')).toMatch(/requireUsersLogs/);
    expect(src('docs/supabase-migrations/20260912_hunter_shadow_outcomes.sql')).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(src('docs/supabase-migrations/20260912_hunter_shadow_outcomes.sql')).not.toMatch(/CREATE POLICY/);
    const dup = await recordShadowOutcome(
      { offerId: OFFER_A, shadowDecision: 'HUMAN_REVIEW', sourceId: 'ml_worker' },
      {
        supabase: fakeSupabase({ captured: [], insertError: { code: '23505', message: 'duplicate' } }),
        allowInTests: true,
      },
    );
    expect(dup).toEqual({ persisted: true, offerId: OFFER_A, duplicate: true });
  });

  it('34–35. zero division y dataset vacío', () => {
    const empty = buildCollectionHealth({ since: '2020-01-01T00:00:00.000Z' });
    expect(empty.status).toBe('NO_DATA');
    expect(empty.matchRate.value).toBeNull();
    expect(empty.matchRate.sampleSize).toBe(0);
    expect(empty.alerts.noNewShadowSnapshots).toBe(true);
    expect(empty.alerts.noHumanOutcomes).toBe(true);
    expect(HUNTER_METRIC_UNIVERSES.autonomousCalibration.collection).toMatch(/Awaiting/);
    expect(src('app/admin/hunter/page.tsx')).toMatch(/Calibration Data/);
    expect(MIGRATION).toMatch(/hunter_shadow_calibration_collection/);
    expect(MIGRATION).toMatch(/DROP FUNCTION IF EXISTS public\.hunter_shadow_calibration_by_source/);
    expect(MIGRATION).toMatch(/GROUP BY/);
    expect(MIGRATION).not.toMatch(/CREATE TABLE/);
  });
});
