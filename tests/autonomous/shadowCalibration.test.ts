import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AUTONOMOUS_DECISION_POLICY_V1,
  AUTONOMOUS_POLICY_V1,
  decideAutonomous,
  type AutonomousDecisionInput,
} from '@/lib/autonomous';
import {
  agreementRate,
  autoApprovePrecision,
  autoRejectPrecision,
  buildCalibrationSnapshot,
  canApplyHumanOutcome,
  captureHumanModerationOutcome,
  confidenceBucket,
  getShadowCalibration,
  metricWithSample,
  normalizeShadowOutcomeInput,
  recordHumanOutcome,
  recordShadowOutcome,
  recordShadowOutcomeFromAutonomous,
  recommendedCalibrationAction,
  resetCalibrationWriteMetrics,
  resolveCorrelationIdentity,
  reviewApprovalRate,
  reviewRejectRate,
  scoreBucket,
  SHADOW_OUTCOME_TABLE,
  sufficiencyLevel,
} from '@/lib/autonomous/calibration';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { isDayToDayFlagOn } from '@/lib/hunter/dayToDay';
import { HUNTER_METRIC_UNIVERSES } from '@/lib/hunter/metricUniverses';
import { HUNTER_MODULES } from '@/lib/hunter/modules';
import { USERS_LOGS_ROLES } from '@/lib/server/requireAdmin';
import { DEAL_VERIFIER_THRESHOLDS } from '@/lib/verifier/thresholds';
import type { MonetizationReadinessResult } from '@/lib/moderation/monetizationReadiness';
import type { DealCheckResult, DealVerifierChecks, DealVerifierResult } from '@/lib/verifier/types';

const MIGRATION = readFileSync(
  resolve(process.cwd(), 'docs/supabase-migrations/20260912_hunter_shadow_outcomes.sql'),
  'utf8',
);

function src(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

const OFFER_A = '11111111-1111-4111-8111-111111111111';
const OFFER_B = '22222222-2222-4222-8222-222222222222';
const CREATOR_A = '33333333-3333-4333-8333-333333333333';
const CYCLE_A = '44444444-4444-4444-8444-444444444444';

type Captured = {
  op: string;
  table: string;
  rows: unknown[];
  args?: unknown;
  eqs?: Array<[string, unknown]>;
};

type StoreRow = Record<string, unknown> & { id?: string };

function fakeSupabase(opts: {
  captured: Captured[];
  insertError?: { message?: string; code?: string } | null;
  selectError?: { message?: string; code?: string } | null;
  updateError?: { message?: string; code?: string } | null;
  store?: StoreRow[];
  rpc?: Record<string, unknown>;
  rpcError?: { message?: string } | null;
}) {
  const store = opts.store ?? [];
  return {
    from(table: string) {
      return {
        insert(rows: unknown[]) {
          opts.captured.push({ op: 'insert', table, rows });
          if (opts.insertError) return Promise.resolve({ error: opts.insertError });
          for (const row of rows as StoreRow[]) {
            store.push({ id: typeof row.id === 'string' ? row.id : 'row-1', ...row });
          }
          return Promise.resolve({ error: null });
        },
        select() {
          return {
            eq(col: string, val: unknown) {
              const data = store.filter((r) => r[col] === val);
              opts.captured.push({ op: 'select', table, rows: data });
              return Promise.resolve({ data, error: opts.selectError ?? null });
            },
          };
        },
        update(patch: Record<string, unknown>) {
          const eqs: Array<[string, unknown]> = [];
          const chain = {
            eq(col: string, val: unknown) {
              eqs.push([col, val]);
              return chain;
            },
            then(resolve: (v: unknown) => void) {
              opts.captured.push({ op: 'update', table, rows: [patch], eqs });
              if (!opts.updateError) {
                for (const row of store) {
                  if (eqs.every(([col, val]) => row[col] === val)) Object.assign(row, patch);
                }
              }
              resolve({ error: opts.updateError ?? null, data: null });
            },
          };
          return chain;
        },
      };
    },
    rpc(name: string, args?: unknown) {
      opts.captured.push({ op: 'rpc', table: name, rows: [], args });
      if (opts.rpcError) return Promise.resolve({ data: null, error: opts.rpcError });
      return Promise.resolve({ data: opts.rpc?.[name] ?? [], error: null });
    },
  } as unknown as SupabaseClient;
}

function pass(detail: string): DealCheckResult {
  return { status: 'pass', detail };
}
function unknown(detail: string): DealCheckResult {
  return { status: 'unknown', detail };
}

function checks(over: Partial<DealVerifierChecks> = {}): DealVerifierChecks {
  return {
    price: pass('Precios coherentes'),
    discount: pass('Descuento 50% dentro de rango'),
    duplicate: pass('Sin duplicado en pre-check'),
    seller: pass('Amazon rating 4.7 (120 reviews)'),
    availability: unknown('Disponibilidad no verificada (sin fetch extra)'),
    quality: pass('Calidad básica OK'),
    risk: pass('Sin señales de riesgo fuertes'),
    ...over,
  };
}

function verifier(over: Partial<DealVerifierResult> = {}): DealVerifierResult {
  return {
    decision: 'auto_approve',
    score: 85,
    confidence: 0.91,
    reasons: ['Score 85 ≥ umbral auto-approve (78)'],
    checks: checks(),
    breakdown: {
      discount: 62,
      popularity: 80,
      rating: 85,
      category: 100,
      priceAppeal: 70,
      historical: 85,
      total: 85,
    },
    ingestDecision: 'auto_approve',
    duplicateOfferId: null,
    ...over,
  };
}

const readyMonetization: MonetizationReadinessResult = {
  status: 'ready',
  label: 'Lista',
  detail: 'Aventa puede monetizar este enlace.',
};

function perfectInput(over: Partial<AutonomousDecisionInput> = {}): AutonomousDecisionInput {
  return {
    verifier: verifier(),
    thresholds: {
      autoApproveMinScore: 78,
      requireImage: true,
      autoApproveEnabled: true,
    },
    monetization: readyMonetization,
    requiresAffiliateValidation: true,
    source: 'amazon_asin',
    sourceHealth: 'healthy',
    existingModerationStatus: null,
    title: 'Laptop gaming RTX sólida para oficina',
    imageUrl: 'https://m.media-amazon.com/images/I/xx.jpg',
    store: 'Amazon',
    price: 12000,
    discountPercent: 50,
    effectiveDiscountPercent: 50,
    suspectedArtificialListPrice: false,
    ...over,
  };
}

afterEach(() => {
  resetCalibrationWriteMetrics();
});

describe('FASE 11 shadow calibration', () => {
  it('1. persiste snapshot shadow con offer_id y policy version', async () => {
    const captured: Captured[] = [];
    const result = decideAutonomous(perfectInput());
    const out = await recordShadowOutcomeFromAutonomous(
      {
        offerId: OFFER_A,
        result,
        sourceId: 'ml_worker',
        shadowCycleId: CYCLE_A,
        qualification: 'verified_deal',
        creatorId: CREATOR_A,
      },
      { supabase: fakeSupabase({ captured }), allowInTests: true },
    );
    expect(out).toEqual({ persisted: true, offerId: OFFER_A, duplicate: false });
    const row = (captured[0]?.rows as Array<Record<string, unknown>>)[0];
    expect(captured[0]?.table).toBe(SHADOW_OUTCOME_TABLE);
    expect(row.shadow_decision).toBe(result.decision);
    expect(row.human_outcome).toBe('HUMAN_PENDING');
    expect(row.policy_version).toBe(AUTONOMOUS_DECISION_POLICY_V1);
    expect(row.offer_id).toBe(OFFER_A);
    expect(row.score).toBe(result.score);
    expect(JSON.stringify(row)).not.toMatch(/<html|offer_url|canonicalUrl/i);
  });

  it('2. captura outcome humano fiable por offer_id', async () => {
    const store: StoreRow[] = [
      { id: 'row-1', offer_id: OFFER_A, human_outcome: 'UNKNOWN', shadow_decision: 'AUTO_APPROVE' },
    ];
    const captured: Captured[] = [];
    const out = await captureHumanModerationOutcome(OFFER_A, 'approved', {
      supabase: fakeSupabase({ captured, store }),
      allowInTests: true,
    });
    expect(out).toMatchObject({
      applied: true,
      offerId: OFFER_A,
      outcome: 'HUMAN_APPROVED',
      matchConfidence: 'offer_id',
      idempotent: false,
    });
    expect(store[0]?.human_outcome).toBe('HUMAN_APPROVED');
    expect(store[0]?.match_confidence).toBe('offer_id');
  });

  it('3. correlación fiable usa offer_id', () => {
    expect(
      resolveCorrelationIdentity({
        offerId: OFFER_A,
        fingerprint: 'fp-1',
        rowsWithSameOfferId: 1,
        rowsWithSameFingerprint: 3,
        offersWithSameFingerprint: 3,
      }),
    ).toEqual({ matchConfidence: 'offer_id', reason: 'unique_offer_id' });
  });

  it('4. fingerprint compartido es ambiguous', () => {
    expect(
      resolveCorrelationIdentity({
        offerId: null,
        fingerprint: 'same-fp',
        rowsWithSameOfferId: 0,
        rowsWithSameFingerprint: 2,
        offersWithSameFingerprint: 2,
      }),
    ).toEqual({ matchConfidence: 'ambiguous', reason: 'shared_fingerprint' });
    expect(
      resolveCorrelationIdentity({
        offerId: OFFER_A,
        rowsWithSameOfferId: 2,
        rowsWithSameFingerprint: 0,
      }),
    ).toEqual({ matchConfidence: 'ambiguous', reason: 'duplicate_offer_id_rows' });
  });

  it('5. sin identidad → unmatched / no persist', async () => {
    expect(
      resolveCorrelationIdentity({
        offerId: null,
        fingerprint: null,
        rowsWithSameOfferId: 0,
        rowsWithSameFingerprint: 0,
      }),
    ).toEqual({ matchConfidence: 'unmatched', reason: 'no_reliable_identity' });
    expect(
      normalizeShadowOutcomeInput({
        offerId: null,
        shadowDecision: 'AUTO_APPROVE',
        sourceId: 'ml_worker',
      }),
    ).toBeNull();
    const captured: Captured[] = [];
    const missing = await recordHumanOutcome(
      { offerId: OFFER_B, outcome: 'HUMAN_APPROVED' },
      { supabase: fakeSupabase({ captured, store: [] }), allowInTests: true },
    );
    expect(missing).toEqual({ applied: false, reason: 'unmatched' });
    const ambiguous = await recordHumanOutcome(
      { offerId: OFFER_A, outcome: 'HUMAN_APPROVED' },
      {
        supabase: fakeSupabase({
          captured,
          store: [
            { id: 'a', offer_id: OFFER_A, human_outcome: 'UNKNOWN' },
            { id: 'b', offer_id: OFFER_A, human_outcome: 'UNKNOWN' },
          ],
        }),
        allowInTests: true,
      },
    );
    expect(ambiguous).toEqual({ applied: false, reason: 'ambiguous' });
  });

  it('6. AUTO_APPROVE precision excluye UNKNOWN (8/9 no 8/10)', () => {
    const metric = autoApprovePrecision({
      autoApproveHumanApproved: 8,
      autoApproveHumanRejected: 1,
    });
    expect(metric.sampleSize).toBe(9);
    expect(metric.value).toBeCloseTo(8 / 9);
    expect(metric.sufficiency).toBe('insufficient');
    expect(metric.display).toBe('88.9% · n=9 · INSUFFICIENT');
  });

  it('7. AUTO_REJECT precision excluye unknown/pending/snoozed', () => {
    const metric = autoRejectPrecision({
      autoRejectHumanApproved: 1,
      autoRejectHumanRejected: 4,
    });
    expect(metric.sampleSize).toBe(5);
    expect(metric.value).toBeCloseTo(0.8);
  });

  it('8. HUMAN_REVIEW approval/reject rates usan el universo review', () => {
    expect(
      reviewApprovalRate({ humanReview: 100, humanReviewApproved: 70 }).value,
    ).toBeCloseTo(0.7);
    expect(reviewRejectRate({ humanReview: 100, humanReviewRejected: 20 }).value).toBeCloseTo(0.2);
  });

  it('9. disagreement = AA+reject o AR+approve', () => {
    const snap = buildCalibrationSnapshot({
      since: '2026-08-12T00:00:00.000Z',
      summary: {
        shadow_evaluated: 10,
        shadow_matched: 6,
        agreement: 4,
        disagreement: 2,
        auto_approve: 5,
        auto_approve_human_approved: 3,
        auto_approve_human_rejected: 1,
        auto_reject: 2,
        auto_reject_human_approved: 1,
        auto_reject_human_rejected: 1,
        human_review: 3,
        human_review_approved: 2,
        human_review_rejected: 0,
      },
    });
    expect(snap.disagreementRate.sampleSize).toBe(6);
    expect(snap.disagreementRate.value).toBeCloseTo(2 / 6);
    expect(snap.agreementRate.value).toBeCloseTo(4 / 6);
  });

  it('10. reason codes se agregan sin inventar códigos', () => {
    const snap = buildCalibrationSnapshot({
      since: '2026-08-12T00:00:00.000Z',
      reasons: [
        { pair: 'HUMAN_REVIEW+HUMAN_APPROVE', reason_code: 'seller_unknown', count: 9 },
        { pair: 'AUTO_APPROVE+HUMAN_REJECT', reason_code: 'invented_reason', count: 4 },
        { pair: 'NOT_A_PAIR', reason_code: 'missing_image', count: 2 },
      ],
    });
    expect(snap.disagreementReasons).toEqual([
      { pair: 'HUMAN_REVIEW+HUMAN_APPROVE', reasonCode: 'seller_unknown', count: 9 },
    ]);
  });

  it('11. score buckets alineados a 78', () => {
    expect(scoreBucket(39)).toBe('0-39');
    expect(scoreBucket(40)).toBe('40-54');
    expect(scoreBucket(77)).toBe('70-77');
    expect(scoreBucket(78)).toBe('78-84');
    expect(scoreBucket(85)).toBe('85+');
    expect(scoreBucket(null)).toBe('unknown');
  });

  it('12. confidence buckets alineados a 0.7', () => {
    expect(confidenceBucket(0.49)).toBe('0-0.49');
    expect(confidenceBucket(0.5)).toBe('0.50-0.69');
    expect(confidenceBucket(0.69)).toBe('0.50-0.69');
    expect(confidenceBucket(0.7)).toBe('0.70-0.84');
    expect(confidenceBucket(0.85)).toBe('0.85+');
  });

  it('13. source aggregation incluye precision por source', () => {
    const snap = buildCalibrationSnapshot({
      since: '2026-08-12T00:00:00.000Z',
      bySource: [
        {
          source_id: 'community',
          source_family: 'community',
          evaluated: 40,
          matched: 30,
          agreement: 20,
          disagreement: 2,
          auto_approve: 10,
          auto_approve_human_approved: 8,
          auto_approve_human_rejected: 1,
          auto_reject: 5,
          auto_reject_human_approved: 0,
          auto_reject_human_rejected: 4,
          human_review: 25,
          human_review_approved: 18,
          human_review_rejected: 4,
        },
      ],
    });
    expect(snap.bySource[0]?.sourceId).toBe('community');
    expect(snap.bySource[0]?.autoApprovePrecision.sampleSize).toBe(9);
    expect(snap.bySource[0]?.reviewApprovalRate.value).toBeCloseTo(18 / 25);
  });

  it('14. creator aggregation es observación, no reputation', () => {
    const snap = buildCalibrationSnapshot({
      since: '2026-08-12T00:00:00.000Z',
      byCreator: [
        {
          creator_id: CREATOR_A,
          submissions: 6,
          matched: 4,
          agreement: 3,
          auto_approve: 1,
          human_review: 5,
          auto_reject: 0,
          human_approved: 3,
          human_rejected: 1,
        },
      ],
    });
    expect(snap.byCreator[0]?.creatorId).toBe(CREATOR_A);
    expect(snap.byCreator[0]?.agreementRate.sampleSize).toBe(4);
    expect(src('lib/autonomous/calibration/getCalibration.ts')).not.toMatch(
      /recalculateUserReputation|maybeUnlockRewards|from\('offers'\)/,
    );
  });

  it('15. n<20 es insufficient aunque el % sea 100', () => {
    expect(sufficiencyLevel(2)).toBe('insufficient');
    expect(sufficiencyLevel(20)).toBe('early');
    expect(sufficiencyLevel(50)).toBe('moderate');
    expect(sufficiencyLevel(100)).toBe('usable');
    const perfectTiny = metricWithSample(2, 2);
    expect(perfectTiny.value).toBe(1);
    expect(perfectTiny.display).toBe('100% · n=2 · INSUFFICIENT');
  });

  it('16. policy version histórica se guarda y no se cambia', async () => {
    const row = normalizeShadowOutcomeInput({
      offerId: OFFER_A,
      shadowDecision: 'HUMAN_REVIEW',
      sourceId: 'community',
      policyVersion: AUTONOMOUS_DECISION_POLICY_V1,
    });
    expect(row?.policy_version).toBe('AUTONOMOUS_DECISION_POLICY_V1');
    expect(AUTONOMOUS_POLICY_V1.minAutoApproveConfidence).toBe(0.7);
    expect(src('lib/autonomous/policy.ts')).toMatch(/minAutoApproveConfidence: 0\.7/);
    expect(src('lib/autonomous/decide.ts')).not.toMatch(/hunter_shadow_outcomes/);
  });

  it('17–18. append-only + idempotencia', async () => {
    expect(canApplyHumanOutcome('UNKNOWN', 'HUMAN_APPROVED')).toBe(true);
    expect(canApplyHumanOutcome('HUMAN_SNOOZED', 'HUMAN_REJECTED')).toBe(true);
    expect(canApplyHumanOutcome('HUMAN_APPROVED', 'HUMAN_REJECTED')).toBe(false);
    expect(canApplyHumanOutcome('HUMAN_EXPIRED', 'HUMAN_APPROVED')).toBe(false);

    const captured: Captured[] = [];
    const dup = await recordShadowOutcome(
      { offerId: OFFER_A, shadowDecision: 'AUTO_APPROVE', sourceId: 'ml_worker' },
      {
        supabase: fakeSupabase({ captured, insertError: { code: '23505', message: 'duplicate' } }),
        allowInTests: true,
      },
    );
    expect(dup).toEqual({ persisted: true, offerId: OFFER_A, duplicate: true });

    const store: StoreRow[] = [
      { id: 'row-1', offer_id: OFFER_A, human_outcome: 'HUMAN_APPROVED' },
    ];
    const blocked = await recordHumanOutcome(
      { offerId: OFFER_A, outcome: 'HUMAN_REJECTED' },
      { supabase: fakeSupabase({ captured, store }), allowInTests: true },
    );
    expect(blocked).toEqual({ applied: false, reason: 'append_only' });
    expect(store[0]?.human_outcome).toBe('HUMAN_APPROVED');

    const same = await recordHumanOutcome(
      { offerId: OFFER_A, outcome: 'HUMAN_APPROVED' },
      { supabase: fakeSupabase({ captured, store }), allowInTests: true },
    );
    expect(same).toMatchObject({ applied: true, idempotent: true });
  });

  it('19–20. RLS + admin authorization', () => {
    expect(MIGRATION).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(MIGRATION).toMatch(/REVOKE ALL ON TABLE public\.hunter_shadow_outcomes FROM PUBLIC, anon, authenticated/);
    expect(MIGRATION).toMatch(/GRANT ALL ON TABLE public\.hunter_shadow_outcomes TO service_role/);
    expect(MIGRATION).not.toMatch(/CREATE POLICY/);
    expect(MIGRATION).toMatch(/UNIQUE \(offer_id\)/);
    expect(MIGRATION).toMatch(/GROUP BY/);
    expect(MIGRATION).toMatch(/hunter_shadow_calibration_summary/);
    expect(USERS_LOGS_ROLES).toEqual(['owner', 'admin']);
    expect(src('app/api/admin/hunter-health/route.ts')).toMatch(/requireUsersLogs/);
    expect(src('app/api/admin/hunter-health/route.ts')).toMatch(/getShadowCalibration/);
  });

  it('21. fallo de DB no tumba ingest ni moderación', async () => {
    const failed = await recordShadowOutcome(
      { offerId: OFFER_A, shadowDecision: 'AUTO_APPROVE', sourceId: 'ml_worker' },
      {
        supabase: fakeSupabase({ captured: [], insertError: { code: '57014', message: 'timeout' } }),
        allowInTests: true,
      },
    );
    expect(failed).toEqual({ persisted: false, reason: 'error' });
    const skipped = await recordShadowOutcome({
      offerId: OFFER_A,
      shadowDecision: 'AUTO_APPROVE',
      sourceId: 'ml_worker',
    });
    expect(skipped).toEqual({ persisted: false, reason: 'test_skip' });
    const humanFail = await recordHumanOutcome(
      { offerId: OFFER_A, outcome: 'HUMAN_APPROVED' },
      {
        supabase: fakeSupabase({
          captured: [],
          store: [{ id: 'row-1', offer_id: OFFER_A, human_outcome: 'UNKNOWN' }],
          updateError: { message: 'timeout' },
        }),
        allowInTests: true,
      },
    );
    expect(humanFail).toEqual({ applied: false, reason: 'error' });
  });

  it('22–25. no muta status, publish, rewards, commissions ni thresholds', () => {
    for (const rel of [
      'lib/autonomous/calibration/recordShadowOutcome.ts',
      'lib/autonomous/calibration/recordHumanOutcome.ts',
      'lib/autonomous/calibration/getCalibration.ts',
    ]) {
      const text = src(rel);
      expect(text).not.toMatch(/from\('offers'\)/);
      expect(text).not.toMatch(/status:\s*'approved'/);
      expect(text).not.toMatch(/lib\/rewards|lib\/commissions|maybeUnlockRewards/);
    }
    expect(src('app/api/admin/moderate-offer/route.ts')).toMatch(/captureHumanModerationOutcome/);
    expect(src('app/api/admin/moderate-offer/route.ts')).toMatch(/\.eq\('status', 'pending'\)/);
    expect(src('lib/bots/ingest/runIngestCycle.ts')).toMatch(/recordShadowOutcomeFromAutonomous/);
    expect(loadBotIngestConfig().legacyAutoApproveWriteEnabled).toBe(false);
    expect(DEAL_VERIFIER_THRESHOLDS.absurdDiscountCap).toBe(85);
    expect(AUTONOMOUS_POLICY_V1.minAutoApproveConfidence).toBe(0.7);
  });

  it('26. no cambia thresholds y wiring no re-decide', () => {
    expect(src('lib/bots/ingest/runIngestCycle.ts')).toMatch(/recordShadowOutcomeFromAutonomous/);
    expect(src('lib/bots/ingest/externalWorker.ts')).toMatch(/recordShadowOutcomeFromAutonomous/);
    expect(src('lib/bots/ingest/runIngestCycle.ts')).not.toMatch(/decideAutonomous\(/);
    expect(src('lib/bots/ingest/insertIngestedOffer.ts')).not.toMatch(/hunter_shadow_outcomes/);
    expect(isDayToDayFlagOn('DAY_TO_DAY_CHEDRAUI_ENABLED')).toBe(false);
    expect(isDayToDayFlagOn('DAY_TO_DAY_BODEGA_ENABLED')).toBe(false);
    expect(isDayToDayFlagOn('DAY_TO_DAY_WALMART_ENABLED')).toBe(false);
  });

  it('recomendación descriptiva y SQL fail-closed', async () => {
    const empty = buildCalibrationSnapshot({ since: '2026-08-12T00:00:00.000Z' });
    expect(recommendedCalibrationAction(empty)).toMatch(/Not enough matched outcomes/);
    const highTiny = buildCalibrationSnapshot({
      since: '2026-08-12T00:00:00.000Z',
      summary: {
        shadow_evaluated: 9,
        shadow_matched: 9,
        auto_approve_human_approved: 8,
        auto_approve_human_rejected: 1,
        agreement: 8,
        disagreement: 1,
      },
    });
    expect(highTiny.recommendedAction).toMatch(/insufficient/);
    const reviewHeavy = buildCalibrationSnapshot({
      since: '2026-08-12T00:00:00.000Z',
      summary: {
        shadow_evaluated: 40,
        shadow_matched: 30,
        human_review: 25,
        human_review_approved: 18,
      },
      reasons: [{ pair: 'HUMAN_REVIEW+HUMAN_APPROVE', reason_code: 'seller_unknown', count: 12 }],
    });
    expect(reviewHeavy.recommendedAction).toMatch(/seller_unknown|Vendedor/i);

    const captured: Captured[] = [];
    const snap = await getShadowCalibration(
      fakeSupabase({ captured, rpcError: { message: 'missing' } }),
      { since: '2026-08-12T00:00:00.000Z' },
    );
    expect(snap.counts.shadowEvaluated).toBe(0);
    expect(captured.some((c) => c.op === 'rpc')).toBe(true);
    expect(HUNTER_METRIC_UNIVERSES.autonomousCalibration.persistence).toBe(
      'supabase_hunter_shadow_outcomes',
    );
    expect(HUNTER_MODULES.some((mod) => mod.id === 'calibration')).toBe(true);
    expect(src('app/admin/hunter/page.tsx')).toMatch(/Autonomous Calibration/);
  });

  it('agreementRate no incluye HUMAN_REVIEW', () => {
    const rate = agreementRate({ agreement: 10, disagreement: 2 });
    expect(rate.sampleSize).toBe(12);
    expect(rate.value).toBeCloseTo(10 / 12);
  });
});
