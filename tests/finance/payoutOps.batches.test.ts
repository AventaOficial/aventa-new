import { describe, expect, it } from 'vitest';
import {
  buildBatchInsert,
  canApproveBatch,
  releaseBlockersFor,
} from '@/lib/finance/payoutOps/batches';
import { evaluateAutoRelease } from '@/lib/finance/payoutOps/autoRelease';
import { buildBatchExportCsv, buildPaidExportCsv, csvEscape, maskClabe } from '@/lib/finance/payoutOps/exportCsv';
import type { BatchPreview, PayeeProfileLite, PayoutOpsRuntime, PipelineStage } from '@/lib/finance/payoutOps/types';

const runtimeFrozen: PayoutOpsRuntime = {
  productionRuntime: true,
  moneyPathFrozen: true,
  settlementBridgeEnabled: false,
  rewardsProgramActive: false,
  payoutProvider: { configured: null, mode: 'none', detail: '' },
  activationVerdict: 'SAFE_FROZEN',
  remainingBlockers: [],
};

const runtimeOpen: PayoutOpsRuntime = {
  ...runtimeFrozen,
  moneyPathFrozen: false,
  rewardsProgramActive: true,
  payoutProvider: { configured: 'spei_real', mode: 'real', detail: '' },
  activationVerdict: 'READY_FOR_CONTROLLED_ACTIVATION',
};

const preview: BatchPreview = {
  periodLabel: '2026-09',
  minPayoutCents: 20000,
  lines: [
    {
      creatorId: 'c1',
      displayName: 'Ana',
      amountCents: 50000,
      rewardCount: 2,
      rewardIds: ['r1', 'r2'],
      gate: { decision: 'pass', codes: [], reasons: [] },
    },
    {
      creatorId: 'c2',
      displayName: 'Beto, "El Rey"',
      amountCents: 30000,
      rewardCount: 1,
      rewardIds: ['r3'],
      gate: { decision: 'review', codes: ['first_payout'], reasons: ['Primer pago.'] },
    },
  ],
  totals: {
    payableCents: 50000,
    payableCount: 1,
    reviewCents: 30000,
    reviewCount: 1,
    blockedCents: 0,
    blockedCount: 0,
    carryCents: 0,
    carryCount: 0,
    inFlightCents: 0,
    inFlightCount: 0,
  },
  readyToRelease: false,
  releaseBlockers: ['money_path_frozen'],
};

describe('batches — construcción y reglas puras', () => {
  it('buildBatchInsert congela totales, config y líneas con decisión', () => {
    const { batch, lines } = buildBatchInsert(
      preview,
      { minPayoutCents: 20000, creatorShareBps: 4000 },
      { id: 'u1', role: 'finance' },
      'cierre septiembre',
    );
    expect(batch).toMatchObject({
      period_key: '2026-09',
      status: 'draft',
      payable_cents: 50000,
      payable_count: 1,
      review_count: 1,
      min_payout_cents: 20000,
      creator_share_bps: 4000,
      prepared_by: 'u1',
      notes: 'cierre septiembre',
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ creator_id: 'c1', decision: 'pass', reward_ids: ['r1', 'r2'] });
    expect(lines[1].gate_codes).toEqual(['first_payout']);
  });

  it('regla de dos personas: el preparador no aprueba, salvo owner con force', () => {
    const draft = { status: 'draft' as const, prepared_by: 'u1' };
    expect(canApproveBatch(draft, { id: 'u2', role: 'finance' }, false)).toEqual({ ok: true, selfApproved: false });
    expect(canApproveBatch(draft, { id: 'u1', role: 'finance' }, false)).toEqual({ ok: false, reason: 'two_person_rule' });
    expect(canApproveBatch(draft, { id: 'u1', role: 'finance' }, true)).toEqual({ ok: false, reason: 'two_person_rule' });
    expect(canApproveBatch(draft, { id: 'u1', role: 'owner' }, false)).toEqual({ ok: false, reason: 'two_person_rule' });
    expect(canApproveBatch(draft, { id: 'u1', role: 'owner' }, true)).toEqual({ ok: true, selfApproved: true });
    expect(canApproveBatch({ status: 'approved', prepared_by: 'u1' }, { id: 'u2', role: 'owner' }, false)).toEqual({
      ok: false,
      reason: 'batch_not_draft:approved',
    });
  });

  it('releaseBlockersFor: congelado en prod bloquea; abierto con proveedor real libera', () => {
    const approved = { status: 'approved' as const, payable_count: 1 };
    expect(releaseBlockersFor(approved, runtimeFrozen)).toEqual(
      expect.arrayContaining(['money_path_frozen', 'rewards_program_off', 'payout_provider_not_ready']),
    );
    expect(releaseBlockersFor(approved, runtimeOpen)).toEqual([]);
    expect(releaseBlockersFor({ status: 'draft', payable_count: 0 }, runtimeOpen)).toEqual([
      'batch_not_approved:draft',
      'no_payable_lines',
    ]);
  });
});

describe('autoRelease — política pura', () => {
  const stages = (ingest: PipelineStage['automation']): PipelineStage[] => [
    {
      id: 'ingest',
      order: 1,
      title: 'Entra',
      question: '',
      actor: 'sistema',
      automation: ingest,
      automationReason: '',
      nextUnlock: '',
      live: true,
      metrics: [],
    },
  ];

  it('apagado por default y bloqueado en producción congelada', () => {
    const ev = evaluateAutoRelease(runtimeFrozen, preview, stages('blocked'), {});
    expect(ev.enabled).toBe(false);
    expect(ev.eligible).toBe(false);
    expect(ev.blockers).toEqual(
      expect.arrayContaining([
        'auto_release_disabled',
        'money_path_frozen',
        'rewards_program_off',
        'provider_not_real',
        'ingest_evidence_missing',
        'review_pending',
      ]),
    );
    expect(ev.policy.length).toBeGreaterThan(3);
  });

  it('elegible solo con env ON, runtime abierto, evidencia y sin revisiones', () => {
    const clean: BatchPreview = { ...preview, totals: { ...preview.totals, reviewCount: 0 } };
    const ev = evaluateAutoRelease(runtimeOpen, clean, stages('semi'), { PAYOUT_AUTO_RELEASE_ENABLED: 'true' });
    expect(ev).toMatchObject({ enabled: true, eligible: true, blockers: [] });
    const withReview = evaluateAutoRelease(runtimeOpen, preview, stages('semi'), { PAYOUT_AUTO_RELEASE_ENABLED: '1' });
    expect(withReview.eligible).toBe(false);
    expect(withReview.blockers).toEqual(['review_pending']);
  });
});

describe('exportCsv — contador', () => {
  it('escapa comillas/comas y enmascara CLABE', () => {
    expect(csvEscape('Beto, "El Rey"')).toBe('"Beto, ""El Rey"""');
    expect(csvEscape(null)).toBe('');
    expect(maskClabe('012345678901234567')).toBe('**************4567');
    expect(maskClabe(null)).toBe('');
  });

  it('buildBatchExportCsv incluye BOM, headers y fiscal por creador', () => {
    const profiles = new Map<string, PayeeProfileLite>([
      [
        'c1',
        {
          id: 'c1',
          legalName: 'Ana Pérez',
          rfc: 'PEAA900101AAA',
          clabe: '012345678901234567',
          fiscalUpdatedAt: null,
          termsAcceptedAt: null,
          termsVersion: null,
          displayName: 'Ana',
        },
      ],
    ]);
    const csv = buildBatchExportCsv(preview, profiles);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toContain('periodo,creator_id,nombre,nombre_legal,rfc,clabe_mascara,monto_mxn');
    expect(lines[1]).toBe('2026-09,c1,Ana,Ana Pérez,PEAA900101AAA,**************4567,500.00,50000,2,pass,,');
    expect(lines[2]).toContain('"Beto, ""El Rey"""');
    expect(lines[2]).toContain('review,first_payout,Primer pago.');
  });

  it('buildPaidExportCsv ordena por fecha', () => {
    const csv = buildPaidExportCsv(
      [
        { paidAt: '2026-09-20T00:00:00Z', creatorId: 'b', legalName: null, rfc: null, clabe: null, amountCents: 100, currency: 'MXN', reference: 'R2', source: 'payout_intent', provider: 'spei' },
        { paidAt: '2026-09-10T00:00:00Z', creatorId: 'a', legalName: 'A', rfc: 'X', clabe: '1234', amountCents: 200, currency: 'MXN', reference: 'R1', source: 'reward_payout', provider: null },
      ],
      '2026-09',
    );
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain(',a,A,X,**************1234,2.00,200,MXN,R1,reward_payout,');
    expect(lines[2]).toContain(',b,,,,1.00,100,MXN,R2,payout_intent,spei');
  });
});
