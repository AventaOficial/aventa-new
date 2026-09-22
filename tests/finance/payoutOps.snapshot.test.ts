import { describe, expect, it } from 'vitest';
import { buildPayoutBatchPreview } from '@/lib/finance/payoutOps/batchPreview';
import { composePayoutOpsSnapshot } from '@/lib/finance/payoutOps/composeSnapshot';
import { computeAutomationScore } from '@/lib/finance/payoutOps/automationScore';
import { buildExceptionQueue } from '@/lib/finance/payoutOps/exceptions';
import { buildRunbook } from '@/lib/finance/payoutOps/runbook';
import { buildPipelineStages, classifyDisburse, classifyIngest } from '@/lib/finance/payoutOps/stages';
import { describePayoutProvider } from '@/lib/finance/payoutOps/runtime';
import type {
  PayoutOpsData,
  PayoutOpsRuntime,
  PayeeProfileLite,
} from '@/lib/finance/payoutOps/types';

const VALID_CLABE = '032180000118359719';
const NOW = '2026-09-21T12:00:00Z';
const PERIOD = '2026-09-01T00:00:00Z';

function runtime(over: Partial<PayoutOpsRuntime> = {}): PayoutOpsRuntime {
  return {
    productionRuntime: true,
    moneyPathFrozen: true,
    settlementBridgeEnabled: false,
    rewardsProgramActive: false,
    payoutProvider: { configured: null, mode: 'forbidden_production', detail: 'prod' },
    activationVerdict: 'SAFE_FROZEN',
    remainingBlockers: ['network_ingest_evidence'],
    ...over,
  };
}

function profile(id: string, over: Partial<PayeeProfileLite> = {}): PayeeProfileLite {
  return {
    id,
    legalName: 'Creador Ejemplo Uno',
    rfc: 'CEUN900101AB1',
    clabe: VALID_CLABE,
    fiscalUpdatedAt: '2026-01-01T00:00:00Z',
    termsAcceptedAt: '2026-01-01T00:00:00Z',
    termsVersion: '2026-08-30',
    displayName: `user-${id}`,
    ...over,
  };
}

function data(over: Partial<PayoutOpsData> = {}): PayoutOpsData {
  return {
    now: NOW,
    periodStart: PERIOD,
    ledger: [],
    commissions: [],
    rewards: [],
    intents: [],
    payouts: [],
    clawbacks: [],
    profiles: new Map(),
    duplicateRfcs: new Set(),
    tables: {
      affiliate_ledger_entries: true,
      affiliate_commissions: true,
      creator_rewards: true,
      payout_intents: true,
      reward_payouts: true,
      reward_clawback_adjustments: true,
    },
    ...over,
  };
}

const reward = (id: string, creator: string, cents: number, status = 'AVAILABLE', extra: Record<string, unknown> = {}) => ({
  id,
  creator_id: creator,
  creator_share_cents: cents,
  gross_commission_cents: Math.round(cents / 0.4),
  status,
  hold_until: '2026-08-01T00:00:00Z',
  payout_id: null,
  fraud_flags: [],
  created_at: '2026-09-05T00:00:00Z',
  ...extra,
});

describe('buildPayoutBatchPreview', () => {
  it('agrupa por creador, aplica gates y excluye en vuelo', () => {
    const d = data({
      rewards: [
        reward('r1', 'A', 15_000),
        reward('r2', 'A', 15_000),
        reward('r3', 'B', 30_000),
        reward('r4', 'C', 5_000),
        reward('r5', 'D', 40_000),
      ],
      intents: [
        {
          id: 'i1',
          reward_id: 'r5',
          creator_id: 'D',
          amount_cents: 40_000,
          status: 'RESERVED',
          provider: 'stub',
          reserved_at: NOW,
          submitted_at: null,
          resolved_at: null,
          created_at: NOW,
        },
      ],
      payouts: [
        { id: 'p1', user_id: 'A', amount_cents: 10_000, status: 'completed', paid_at: '2026-06-01T00:00:00Z', created_at: '2026-06-01T00:00:00Z' },
      ],
      profiles: new Map([
        ['A', profile('A')],
        ['B', profile('B', { clabe: null })],
        ['C', profile('C')],
      ]),
    });

    const b = buildPayoutBatchPreview(d, runtime(), { minPayoutCents: 20_000, requiredTermsVersion: '2026-08-30' });

    expect(b.periodLabel).toBe('2026-09');
    expect(b.lines).toHaveLength(3);
    const byId = Object.fromEntries(b.lines.map((l) => [l.creatorId, l]));
    expect(byId.A.amountCents).toBe(30_000);
    expect(byId.A.rewardCount).toBe(2);
    expect(byId.A.gate.decision).toBe('pass');
    expect(byId.B.gate.decision).toBe('fail');
    expect(byId.C.gate.decision).toBe('carry');
    expect(b.totals.inFlightCount).toBe(1);
    expect(b.totals.inFlightCents).toBe(40_000);
    expect(b.totals.payableCents).toBe(30_000);
    expect(b.totals.blockedCents).toBe(30_000);
    expect(b.totals.carryCents).toBe(5_000);
    expect(b.lines[0].creatorId).toBe('A'); // pass primero
  });

  it('readyToRelease siempre false con freeze/programa OFF y lista bloqueos', () => {
    const d = data({
      rewards: [reward('r1', 'A', 30_000)],
      payouts: [{ id: 'p', user_id: 'A', amount_cents: 1, status: 'completed', paid_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' }],
      profiles: new Map([['A', profile('A')]]),
    });
    const b = buildPayoutBatchPreview(d, runtime(), { minPayoutCents: 20_000, requiredTermsVersion: '2026-08-30' });
    expect(b.readyToRelease).toBe(false);
    expect(b.releaseBlockers).toEqual(
      expect.arrayContaining(['money_path_frozen', 'rewards_program_off', 'payout_provider_not_ready']),
    );
  });

  it('readyToRelease true solo con runtime abierto, proveedor y 0 review', () => {
    const d = data({
      rewards: [reward('r1', 'A', 30_000)],
      payouts: [{ id: 'p', user_id: 'A', amount_cents: 1, status: 'completed', paid_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' }],
      profiles: new Map([['A', profile('A')]]),
    });
    const rt = runtime({
      productionRuntime: false,
      moneyPathFrozen: false,
      rewardsProgramActive: true,
      payoutProvider: { configured: 'real', mode: 'real', detail: 'ok' },
    });
    const b = buildPayoutBatchPreview(d, rt, { minPayoutCents: 20_000, requiredTermsVersion: '2026-08-30' });
    expect(b.readyToRelease).toBe(true);
    expect(b.releaseBlockers).toEqual([]);
  });
});

describe('stages + automation score', () => {
  it('ingest blocked sin evidencia, semi con CSV, auto con API', () => {
    expect(classifyIngest(data()).level).toBe('blocked');
    const csv = data({
      ledger: [
        { id: 'l1', amount_cents: 1000, status: 'accrued', source: 'csv_import', external_ref: 'AMZ-1', notes: null, meta: null, tracking_tag: null, attributable: true, creator_id: 'A', created_at: NOW },
      ],
    });
    expect(classifyIngest(csv).level).toBe('semi');
    // Evidencia Amazon importada por el Centro de Pagos (V2) llega como commissions csv_import → semi.
    const csvCommissions = data({
      commissions: [{ id: 'c0', status: 'approved', gross_commission_cents: 5196, ledger_entry_id: null, source: 'csv_import', created_at: NOW }],
    });
    expect(classifyIngest(csvCommissions).level).toBe('semi');
    expect(classifyIngest(csvCommissions).reason).toContain('Amazon');
    const api = data({
      commissions: [{ id: 'c1', status: 'approved', gross_commission_cents: 1000, ledger_entry_id: 'l1', source: 'api', created_at: NOW }],
    });
    expect(classifyIngest(api).level).toBe('auto');
    const manual = data({
      commissions: [{ id: 'c2', status: 'approved', gross_commission_cents: 1000, ledger_entry_id: null, source: 'manual', created_at: NOW }],
    });
    expect(classifyIngest(manual).level).toBe('blocked');
  });

  it('disburse depende del proveedor', () => {
    expect(classifyDisburse(runtime()).level).toBe('blocked');
    expect(classifyDisburse(runtime({ payoutProvider: { configured: 'manual_spei', mode: 'manual_spei', detail: '' } })).level).toBe('manual');
    expect(classifyDisburse(runtime({ payoutProvider: { configured: 'real', mode: 'real', detail: '' } })).level).toBe('semi');
  });

  it('score interno > end-to-end cuando disburse está bloqueado', () => {
    const stages = buildPipelineStages(
      data(),
      runtime(),
      { creatorShareBps: 4000, holdDays: 60, minPayoutCents: 20_000 },
      { payableCents: 0, payableCount: 0, reviewCount: 0, blockedCount: 0, carryCount: 0 },
    );
    expect(stages).toHaveLength(6);
    expect(stages.map((s) => s.id)).toEqual(['ingest', 'split', 'hold', 'batch', 'disburse', 'reconcile']);
    const score = computeAutomationScore(stages);
    expect(score.internalPct).toBeGreaterThan(score.endToEndPct);
    expect(score.byStage.disburse).toBe('blocked');
    expect(score.explanation.length).toBeGreaterThan(0);
  });

  it('con evidencia CSV + proveedor real el end-to-end sube claramente', () => {
    const rt = runtime({ productionRuntime: false, moneyPathFrozen: false, payoutProvider: { configured: 'real', mode: 'real', detail: '' } });
    const d = data({
      ledger: [{ id: 'l1', amount_cents: 1000, status: 'accrued', source: 'csv_import', external_ref: 'AMZ-1', notes: null, meta: null, tracking_tag: null, attributable: true, creator_id: 'A', created_at: NOW }],
    });
    const stages = buildPipelineStages(d, rt, { creatorShareBps: 4000, holdDays: 60, minPayoutCents: 20_000 }, { payableCents: 0, payableCount: 0, reviewCount: 0, blockedCount: 0, carryCount: 0 });
    const score = computeAutomationScore(stages);
    expect(score.endToEndPct).toBeGreaterThanOrEqual(60);
  });
});

describe('runbook + exceptions', () => {
  it('runbook: aprobación bloqueada por freeze; SPEI bloqueado sin proveedor', () => {
    const b = buildPayoutBatchPreview(data(), runtime(), { minPayoutCents: 20_000, requiredTermsVersion: 'v' });
    const steps = buildRunbook(data(), runtime(), b);
    const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
    expect(steps).toHaveLength(9);
    expect(byId.approve.status).toBe('blocked');
    expect(byId.disburse.status).toBe('blocked');
    expect(byId.evidence.status).toBe('pending');
    expect(byId.fiscal.status).toBe('na');
  });

  it('runbook: settle blocked si hay approved sin ledger y bridge OFF', () => {
    const d = data({
      commissions: [{ id: 'c1', status: 'approved', gross_commission_cents: 100, ledger_entry_id: null, source: 'x', created_at: NOW }],
    });
    const b = buildPayoutBatchPreview(d, runtime(), { minPayoutCents: 20_000, requiredTermsVersion: 'v' });
    const steps = buildRunbook(d, runtime(), b);
    expect(steps.find((s) => s.id === 'settle')?.status).toBe('blocked');
  });

  it('excepciones: intents fallidos críticos, stale, fraude, clawback, no atribuible', () => {
    const d = data({
      intents: [
        { id: 'f1', reward_id: 'r9', creator_id: 'Z', amount_cents: 100, status: 'FAILED', provider: 'stub', reserved_at: NOW, submitted_at: NOW, resolved_at: NOW, created_at: NOW },
        { id: 's1', reward_id: 'r8', creator_id: 'Z', amount_cents: 100, status: 'SUBMITTED', provider: 'stub', reserved_at: '2026-09-10T00:00:00Z', submitted_at: '2026-09-10T00:00:00Z', resolved_at: null, created_at: '2026-09-10T00:00:00Z' },
      ],
      rewards: [reward('r1', 'A', 30_000, 'AVAILABLE', { fraud_flags: ['self_click'] })],
      clawbacks: [{ id: 'cb', reward_id: 'r1', adjustment_amount_cents: -500, status: 'pending', created_at: NOW }],
      ledger: [
        { id: 'l1', amount_cents: 700, status: 'accrued', source: 'csv_import', external_ref: 'AMZ-9', notes: null, meta: null, tracking_tag: null, attributable: false, creator_id: null, created_at: NOW },
        { id: 'l2', amount_cents: 700, status: 'accrued', source: 'manual', external_ref: 'qa-ledger-qa-1', notes: null, meta: null, tracking_tag: null, attributable: true, creator_id: 'A', created_at: NOW },
      ],
      profiles: new Map([['A', profile('A')]]),
    });
    const b = buildPayoutBatchPreview(d, runtime(), { minPayoutCents: 20_000, requiredTermsVersion: '2026-08-30' });
    const ex = buildExceptionQueue(d, b);
    const kinds = ex.map((e) => e.kind);
    expect(ex[0].severity).toBe('critical');
    expect(kinds).toEqual(
      expect.arrayContaining([
        'intent_failed',
        'intent_stale',
        'reward_fraud_flags',
        'clawback_pending',
        'payee_gate_review',
        'ledger_unattributed',
        'ledger_synthetic',
      ]),
    );
  });

  it('snapshot compone todo sin tocar dinero', () => {
    const snap = composePayoutOpsSnapshot(data(), runtime(), 'owner');
    expect(snap.role).toBe('owner');
    expect(snap.stages).toHaveLength(6);
    expect(snap.runbook).toHaveLength(9);
    expect(snap.batch.readyToRelease).toBe(false);
    expect(snap.config.creatorShareBps).toBe(4000);
    expect(snap.config.minPayoutCents).toBe(20_000);
  });
});

describe('describePayoutProvider', () => {
  it('producción siempre forbidden', () => {
    expect(describePayoutProvider({ PAYOUT_PROVIDER: 'real' } as NodeJS.ProcessEnv, true).mode).toBe('forbidden_production');
  });
  it('fuera de producción: none / modos / real requiere credenciales', () => {
    expect(describePayoutProvider({} as NodeJS.ProcessEnv, false).mode).toBe('none');
    expect(describePayoutProvider({ PAYOUT_PROVIDER: 'manual_spei' } as NodeJS.ProcessEnv, false).mode).toBe('manual_spei');
    expect(describePayoutProvider({ PAYOUT_PROVIDER: 'real' } as NodeJS.ProcessEnv, false).mode).toBe('invalid');
    expect(
      describePayoutProvider(
        { PAYOUT_PROVIDER: 'real', PAYOUT_PROVIDER_API_URL: 'https://x', PAYOUT_PROVIDER_API_KEY: 'k' } as NodeJS.ProcessEnv,
        false,
      ).mode,
    ).toBe('real');
    expect(describePayoutProvider({ PAYOUT_PROVIDER: 'nope' } as NodeJS.ProcessEnv, false).mode).toBe('invalid');
  });
});
