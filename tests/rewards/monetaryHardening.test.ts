import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { encodeAventaSubId } from '../../lib/rewards/adapters/types';
import { assignManualLedgerAttribution } from '../../lib/rewards/manualAttribution';
import { createPaidRewardClawbackAdjustment } from '../../lib/rewards/clawback';
import {
  reconcileRewardsForLedgerStatus,
} from '../../lib/rewards/ledgerReconciliation';
import {
  cancelReward,
  createRewardFromLedgerEntry,
  reverseReward,
} from '../../lib/rewards/rewardsEngine';
import { createManualRewardPayout } from '../../lib/rewards/payout';
import { tryCreateRewardFromLedgerRow } from '../../lib/rewards/processLedger';
import { REWARDS_MIN_PAYOUT_CENTS } from '../../lib/rewards/config';

const OFFER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CREATOR = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const WRONG_CREATOR = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const CLICK = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const LEDGER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const REWARD = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const ACTOR = '11111111-1111-1111-1111-111111111111';

type TableHandler = (table: string, op: string, filters: Record<string, unknown>) => unknown;

function chainable(resolver: () => Promise<{ data: unknown; error: unknown }>) {
  const builder: Record<string, unknown> = {};
  const methods = [
    'select',
    'insert',
    'update',
    'eq',
    'in',
    'lte',
    'gte',
    'order',
    'limit',
    'maybeSingle',
    'single',
  ];
  for (const m of methods) {
    builder[m] = vi.fn().mockReturnValue(builder);
  }
  builder.maybeSingle = vi.fn().mockImplementation(resolver);
  builder.single = vi.fn().mockImplementation(resolver);
  builder.then = (onFulfilled: (v: unknown) => unknown) =>
    resolver().then(onFulfilled);
  return builder;
}

function makeSupabase(handler: TableHandler): SupabaseClient {
  const auditInserts: unknown[] = [];
  const from = vi.fn((table: string) => {
    if (table === 'reward_audit_log') {
      return {
        insert: vi.fn((payload: unknown) => {
          auditInserts.push(payload);
          return Promise.resolve({ error: null });
        }),
      };
    }

    const filters: Record<string, unknown> = {};
    let op = 'select';

    const resolve = async () => {
      const result = handler(table, op, filters);
      if (result && typeof result === 'object' && 'data' in (result as object)) {
        return result as { data: unknown; error: unknown };
      }
      return { data: result ?? null, error: null };
    };

    const builder = chainable(resolve) as Record<string, unknown>;
    builder.insert = vi.fn((payload: unknown) => {
      op = 'insert';
      filters.payload = payload;
      return chainable(async () => {
        const result = handler(table, 'insert', { ...filters, payload });
        if (result && typeof result === 'object' && 'data' in (result as object)) {
          return result as { data: unknown; error: unknown };
        }
        return { data: result ?? { id: REWARD }, error: null };
      });
    });
    builder.update = vi.fn((payload: unknown) => {
      op = 'update';
      filters.updatePayload = payload;
      return builder;
    });
    builder.eq = vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return builder;
    });
    builder.in = vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return builder;
    });
    builder.order = vi.fn().mockReturnValue(builder);
    return builder;
  });

  const rpc = vi.fn();
  return { from, rpc, _auditInserts: auditInserts } as unknown as SupabaseClient & {
    _auditInserts: unknown[];
    rpc: ReturnType<typeof vi.fn>;
  };
}

describe('Monetary hardening — atribución manual', () => {
  const prevRewards = process.env.REWARDS_PROGRAM_ACTIVE;

  beforeEach(() => {
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
  });

  afterEach(() => {
    if (prevRewards !== undefined) process.env.REWARDS_PROGRAM_ACTIVE = prevRewards;
    else delete process.env.REWARDS_PROGRAM_ACTIVE;
  });

  it('atribución manual correcta con creator derivado de offers.created_by', async () => {
    const supabase = makeSupabase((table, op, filters) => {
      if (table === 'affiliate_ledger_entries' && op === 'select') {
        return {
          data: {
            id: LEDGER,
            network: 'amazon',
            amount_cents: 10_000,
            status: 'confirmed',
            meta: {},
          },
          error: null,
        };
      }
      if (table === 'creator_rewards' && op === 'select') return { data: null, error: null };
      if (table === 'offers' && filters.id === OFFER) {
        return {
          data: { id: OFFER, created_by: CREATOR, status: 'approved' },
          error: null,
        };
      }
      if (table === 'offers' && op === 'select') {
        return {
          data: { id: OFFER, created_by: CREATOR, status: 'approved', created_at: '2026-07-01T00:00:00Z' },
          error: null,
        };
      }
      if (table === 'profiles') {
        return {
          data: {
            reward_program_unlocked_at: '2026-06-01T00:00:00Z',
            welcome_offer_id: OFFER,
          },
          error: null,
        };
      }
      if (table === 'creator_rewards' && op === 'insert') {
        return { data: { id: REWARD }, error: null };
      }
      if (table === 'reward_outbound_clicks') return { data: null, error: null };
      return { data: null, error: null };
    });

    const result = await assignManualLedgerAttribution(supabase, {
      ledgerEntryId: LEDGER,
      offerId: OFFER,
      actorId: ACTOR,
      reason: 'staff_review',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rewardId).toBe(REWARD);
  });

  it('creator_id enviado que no coincide con offers.created_by → rechazo en matcher', async () => {
    const supabase = makeSupabase((table) => {
      if (table === 'offers') {
        return { data: { id: OFFER, created_by: CREATOR }, error: null };
      }
      return { data: null, error: null };
    });

    const { resolveCommissionAttribution } = await import('../../lib/rewards/attribution/matcher');
    const result = await resolveCommissionAttribution(supabase, {
      id: LEDGER,
      network: 'amazon',
      amount_cents: 1000,
      status: 'confirmed',
      offer_id: OFFER,
      creator_id: WRONG_CREATOR,
    });
    expect(result.matched).toBe(false);
    if (!result.matched) expect(result.reason).toBe('creator_offer_mismatch');
  });

  it('duplicación de atribución manual → rechazo', async () => {
    const supabase = makeSupabase((table, op) => {
      if (table === 'affiliate_ledger_entries' && op === 'select') {
        return {
          data: {
            id: LEDGER,
            network: 'amazon',
            amount_cents: 5000,
            status: 'confirmed',
            meta: {},
          },
          error: null,
        };
      }
      if (table === 'creator_rewards' && op === 'select') {
        return { data: { id: REWARD }, error: null };
      }
      return { data: null, error: null };
    });

    const result = await assignManualLedgerAttribution(supabase, {
      ledgerEntryId: LEDGER,
      offerId: OFFER,
      actorId: ACTOR,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toContain('Ya existe');
    }
  });
});

describe('Monetary hardening — VOID/REVERSED ledger', () => {
  it('ledger VOID antes de reward → no reward', async () => {
    const supabase = makeSupabase(() => ({ data: null, error: null }));
    const result = await createRewardFromLedgerEntry(
      supabase,
      {
        id: LEDGER,
        network: 'amazon',
        amount_cents: 1000,
        status: 'void',
      },
      { force: true },
    );
    expect(result.created).toBe(false);
    if (!result.created) expect(result.reason).toBe('commission_void');
  });

  it('ledger VOID después de VALIDATING → CANCELLED', async () => {
    let updatedStatus: string | null = null;
    const supabase = makeSupabase((table, op, filters) => {
      if (table === 'affiliate_ledger_entries') {
        return { data: { id: LEDGER, status: 'void', amount_cents: 1000 }, error: null };
      }
      if (table === 'creator_rewards' && op === 'select') {
        return { data: { id: REWARD, status: 'VALIDATING', creator_share_cents: 400 }, error: null };
      }
      if (table === 'creator_rewards' && op === 'update') {
        updatedStatus = (filters.updatePayload as { status?: string })?.status ?? null;
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });

    const result = await reconcileRewardsForLedgerStatus(supabase, LEDGER, ACTOR, 'void_import');
    expect(result.action).toBe('cancelled');
    expect(updatedStatus).toBe('CANCELLED');
  });

  it('ledger REVERSED después de AVAILABLE → REVERSED', async () => {
    let updatedStatus: string | null = null;
    const supabase = makeSupabase((table, op, filters) => {
      if (table === 'affiliate_ledger_entries') {
        return { data: { id: LEDGER, status: 'reversed', amount_cents: 1000 }, error: null };
      }
      if (table === 'creator_rewards' && op === 'select') {
        return { data: { id: REWARD, status: 'AVAILABLE', creator_share_cents: 400 }, error: null };
      }
      if (table === 'creator_rewards' && op === 'update') {
        updatedStatus = (filters.updatePayload as { status?: string })?.status ?? null;
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });

    const result = await reconcileRewardsForLedgerStatus(supabase, LEDGER, ACTOR, 'reversed_import');
    expect(result.action).toBe('reversed');
    expect(updatedStatus).toBe('REVERSED');
  });

  it('tryCreateRewardFromLedgerRow con void reconcilia sin crear', async () => {
    const supabase = makeSupabase((table) => {
      if (table === 'affiliate_ledger_entries') {
        return { data: { id: LEDGER, status: 'void', amount_cents: 1000 }, error: null };
      }
      if (table === 'creator_rewards') return { data: null, error: null };
      return { data: null, error: null };
    });

    const result = await tryCreateRewardFromLedgerRow(supabase, {
      id: LEDGER,
      network: 'amazon',
      amount_cents: 1000,
      status: 'void',
    });
    expect(result.created).toBe(false);
    expect(result.reason).toBe('commission_void');
  });
});

describe('Monetary hardening — PAID / clawback', () => {
  it('PAID no puede cambiar directamente a REVERSED', async () => {
    const supabase = makeSupabase((table, op) => {
      if (table === 'creator_rewards' && op === 'select') {
        return { data: { status: 'PAID' }, error: null };
      }
      return { data: null, error: null };
    });

    const ok = await reverseReward(supabase, REWARD, ACTOR, 'admin_reverse');
    expect(ok).toBe(false);
  });

  it('cancelReward tampoco cancela PAID', async () => {
    const supabase = makeSupabase((table, op) => {
      if (table === 'creator_rewards' && op === 'select') {
        return { data: { status: 'PAID' }, error: null };
      }
      return { data: null, error: null };
    });

    const ok = await cancelReward(supabase, REWARD, ACTOR, 'admin_cancel');
    expect(ok).toBe(false);
  });

  it('clawback sobre PAID queda auditado y reward permanece PAID', async () => {
    const sb = makeSupabase((table, op, filters) => {
      if (table === 'creator_rewards' && op === 'select') {
        return {
          data: {
            id: REWARD,
            status: 'PAID',
            creator_share_cents: 4000,
            ledger_entry_id: LEDGER,
            payout_id: 'payout-1',
            creator_id: CREATOR,
            gross_commission_cents: 10_000,
          },
          error: null,
        };
      }
      if (table === 'reward_clawback_adjustments' && op === 'select') {
        return { data: null, error: null };
      }
      if (table === 'reward_clawback_adjustments' && op === 'insert') {
        return { data: { id: 'adj-1' }, error: null };
      }
      return { data: null, error: null };
    });

    const result = await createPaidRewardClawbackAdjustment(sb, {
      rewardId: REWARD,
      actorId: ACTOR,
      reason: 'comisión void post-pago',
      ledgerEntryId: LEDGER,
    });

    expect(result.ok).toBe(true);
    const auditSb = sb as SupabaseClient & { _auditInserts: unknown[] };
    expect(auditSb._auditInserts.length).toBeGreaterThan(0);
  });

  it('ledger void con reward PAID → clawback pendiente', async () => {
    const supabase = makeSupabase((table, op) => {
      if (table === 'affiliate_ledger_entries') {
        return { data: { id: LEDGER, status: 'void', amount_cents: 1000 }, error: null };
      }
      if (table === 'creator_rewards' && op === 'select') {
        return {
          data: { id: REWARD, status: 'PAID', creator_share_cents: 4000, payout_id: 'p1' },
          error: null,
        };
      }
      if (table === 'reward_clawback_adjustments' && op === 'select') {
        return { data: null, error: null };
      }
      if (table === 'reward_clawback_adjustments' && op === 'insert') {
        return { data: { id: 'adj-2' }, error: null };
      }
      return { data: null, error: null };
    });

    const result = await reconcileRewardsForLedgerStatus(supabase, LEDGER, ACTOR, 'void_after_paid');
    expect(result.action).toBe('clawback_pending');
  });
});

describe('Monetary hardening — payout atómico', () => {
  it('reward AVAILABLE < $200 → no payout', async () => {
    const supabase = makeSupabase((table) => {
      if (table === 'creator_rewards') {
        return {
          data: [{ id: 'r1', creator_share_cents: 5000, creator_id: CREATOR, status: 'AVAILABLE' }],
          error: null,
        };
      }
      return { data: null, error: null };
    });

    const result = await createManualRewardPayout(supabase, {
      userId: CREATOR,
      amountCents: 5000,
      speiReference: 'SPEI123456',
      createdBy: ACTOR,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('mínimo');
  });

  it('rewards de otro creator → rechazo', async () => {
    const supabase = makeSupabase((table, _op, filters) => {
      if (table === 'creator_rewards') {
        if (filters.id === 'r1' || filters.status === 'AVAILABLE') {
          return {
            data: [
              { id: 'r1', creator_share_cents: REWARDS_MIN_PAYOUT_CENTS, creator_id: WRONG_CREATOR, status: 'AVAILABLE' },
            ],
            error: null,
          };
        }
        return {
          data: [
            { id: 'r1', creator_share_cents: REWARDS_MIN_PAYOUT_CENTS, creator_id: CREATOR, status: 'AVAILABLE' },
          ],
          error: null,
        };
      }
      return { data: null, error: null };
    });

    const result = await createManualRewardPayout(supabase, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'SPEI123456',
      createdBy: ACTOR,
      rewardIds: ['r1'],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('otro creador');
  });

  it('payout RPC fallido → error mapeado (rollback implícito en RPC)', async () => {
    const sb = makeSupabase((table, _op, filters) => {
      if (table === 'creator_rewards') {
        if (filters.status === 'AVAILABLE' || filters.id) {
          return {
            data: [
              { id: 'r1', creator_share_cents: REWARDS_MIN_PAYOUT_CENTS, creator_id: CREATOR, status: 'AVAILABLE' },
            ],
            error: null,
          };
        }
        return {
          data: [
            { id: 'r1', creator_share_cents: REWARDS_MIN_PAYOUT_CENTS, creator_id: CREATOR, status: 'AVAILABLE' },
          ],
          error: null,
        };
      }
      return { data: null, error: null };
    }) as SupabaseClient & { rpc: ReturnType<typeof vi.fn> };

    sb.rpc.mockResolvedValue({ data: null, error: { message: 'amount_mismatch' } });

    const result = await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'SPEI123456789',
      createdBy: ACTOR,
      rewardIds: ['r1'],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('exactamente');
  });

  it('reward AVAILABLE >= $200 → payout vía RPC atómico', async () => {
    const sb = makeSupabase((table, _op, filters) => {
      if (table === 'creator_rewards') {
        if (filters.status === 'AVAILABLE' || filters.id) {
          return {
            data: [
              { id: 'r1', creator_share_cents: REWARDS_MIN_PAYOUT_CENTS, creator_id: CREATOR, status: 'AVAILABLE' },
            ],
            error: null,
          };
        }
        return {
          data: [
            { id: 'r1', creator_share_cents: REWARDS_MIN_PAYOUT_CENTS, creator_id: CREATOR, status: 'AVAILABLE' },
          ],
          error: null,
        };
      }
      return { data: null, error: null };
    }) as SupabaseClient & { rpc: ReturnType<typeof vi.fn> };

    sb.rpc.mockResolvedValue({
      data: { ok: true, payout_id: 'payout-99', paid_reward_ids: ['r1'] },
      error: null,
    });

    const result = await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'SPEI123456789',
      createdBy: ACTOR,
      rewardIds: ['r1'],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payoutId).toBe('payout-99');
      expect(sb.rpc).toHaveBeenCalledWith('execute_reward_payout', expect.any(Object));
    }
  });
});

describe('Monetary hardening — confianza de atribución', () => {
  const prevRewards = process.env.REWARDS_PROGRAM_ACTIVE;

  beforeEach(() => {
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
  });

  afterEach(() => {
    if (prevRewards !== undefined) process.env.REWARDS_PROGRAM_ACTIVE = prevRewards;
    else delete process.env.REWARDS_PROGRAM_ACTIVE;
  });

  it('ML MEDIUM → pending_staff_review, no reward automático', async () => {
    let flagged = false;
    const supabase = makeSupabase((table, op) => {
      if (table === 'reward_outbound_clicks') {
        return {
          data: [{ id: CLICK, offer_id: OFFER, created_at: new Date().toISOString() }],
          error: null,
        };
      }
      if (table === 'offers') {
        return {
          data: { id: OFFER, created_by: CREATOR, status: 'approved', created_at: '2026-07-01T00:00:00Z' },
          error: null,
        };
      }
      if (table === 'profiles') {
        return {
          data: { reward_program_unlocked_at: '2026-06-01T00:00:00Z', welcome_offer_id: OFFER },
          error: null,
        };
      }
      if (table === 'creator_rewards' && op === 'select') return { data: null, error: null };
      if (table === 'affiliate_ledger_entries' && op === 'update') {
        flagged = true;
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });

    const result = await createRewardFromLedgerEntry(supabase, {
      id: LEDGER,
      network: 'mercadolibre',
      amount_cents: 8000,
      status: 'confirmed',
      external_ref: 'MLM123456',
      product_hint: 'MLM123456',
      created_at: new Date().toISOString(),
    });

    expect(result.created).toBe(false);
    if (!result.created) expect(result.reason).toBe('pending_staff_review');
    expect(flagged).toBe(true);
  });

  it('Amazon HIGH (sub-id) → puede crear reward', async () => {
    const subId = encodeAventaSubId(OFFER, CLICK);
    const supabase = makeSupabase((table, op) => {
      if (table === 'reward_outbound_clicks') {
        return { data: { id: CLICK, offer_id: OFFER, clicker_user_id: 'other-user' }, error: null };
      }
      if (table === 'offers') {
        return {
          data: { id: OFFER, created_by: CREATOR, status: 'approved', created_at: '2026-07-01T00:00:00Z' },
          error: null,
        };
      }
      if (table === 'profiles') {
        return {
          data: { reward_program_unlocked_at: '2026-06-01T00:00:00Z', welcome_offer_id: OFFER },
          error: null,
        };
      }
      if (table === 'creator_rewards' && op === 'select') return { data: null, error: null };
      if (table === 'creator_rewards' && op === 'insert') {
        return { data: { id: REWARD }, error: null };
      }
      return { data: null, error: null };
    });

    const result = await createRewardFromLedgerEntry(supabase, {
      id: LEDGER,
      network: 'amazon',
      amount_cents: 10_000,
      status: 'confirmed',
      sub_id_raw: subId,
    });

    expect(result.created).toBe(true);
  });
});

describe('Monetary hardening — flags OFF', () => {
  const prevRewards = process.env.REWARDS_PROGRAM_ACTIVE;
  const prevLegacy = process.env.COMMISSION_PROGRAM_ACTIVE;

  beforeEach(() => {
    delete process.env.REWARDS_PROGRAM_ACTIVE;
    process.env.COMMISSION_PROGRAM_ACTIVE = 'false';
  });

  afterEach(() => {
    if (prevRewards !== undefined) process.env.REWARDS_PROGRAM_ACTIVE = prevRewards;
    else delete process.env.REWARDS_PROGRAM_ACTIVE;
    if (prevLegacy !== undefined) process.env.COMMISSION_PROGRAM_ACTIVE = prevLegacy;
    else delete process.env.COMMISSION_PROGRAM_ACTIVE;
  });

  it('flags OFF → ningún reward real', async () => {
    const supabase = makeSupabase(() => ({ data: null, error: null }));
    const result = await createRewardFromLedgerEntry(supabase, {
      id: LEDGER,
      network: 'amazon',
      amount_cents: 10_000,
      status: 'confirmed',
      sub_id_raw: encodeAventaSubId(OFFER, CLICK),
    });
    expect(result.created).toBe(false);
    if (!result.created) expect(result.reason).toBe('program_inactive');
  });
});
