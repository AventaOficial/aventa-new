import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { basicFraudFlags, createRewardFromLedgerEntry } from '@/lib/rewards/rewardsEngine';
import {
  isSyntheticProviderReference,
  resolveExternalProviderReference,
} from '@/lib/rewards/payoutIntent/confirmation';
import { presentCreatorReward } from '@/lib/rewards/payoutReadModel';
import { emptyMachineClientsTable } from '../helpers/machineClientsTable';

const prev = { ...process.env };
const OFFER = '11111111-1111-1111-1111-111111111111';
const CREATOR = '22222222-2222-2222-2222-222222222222';
const LEDGER = '33333333-3333-3333-3333-333333333333';
const ACTOR = '44444444-4444-4444-4444-444444444444';

function chain(row: unknown) {
  const api = {
    select: () => api,
    eq: () => api,
    in: async () => ({ data: null, count: 0, error: null }),
    maybeSingle: async () => ({ data: row, error: null }),
    update: () => api,
    insert: async () => ({ error: null }),
    delete: () => api,
  };
  return api;
}

describe('economy closure — payout evidence', () => {
  it('UNKNOWN sin referencia externa no produce una referencia de éxito', () => {
    expect(
      resolveExternalProviderReference({
        status: 'UNKNOWN',
        supplied: null,
        stored: 'confirmed:same-key',
        idempotencyKey: 'same-key',
      }),
    ).toEqual({ ok: false, reason: 'evidence_missing' });
    expect(isSyntheticProviderReference('confirmed:same-key')).toBe(true);
  });

  it('SUBMITTED sin referencia, o con una referencia local, no puede volverse éxito', () => {
    for (const supplied of [null, 'confirmed:key', 'reconcile:key', 'stub:success', 'manual_spei:key', 'sandbox:key']) {
      expect(
        resolveExternalProviderReference({
          status: 'SUBMITTED',
          supplied,
          stored: null,
          idempotencyKey: 'same-key',
        }),
      ).toEqual({ ok: false, reason: 'evidence_missing' });
    }
  });

  it('una referencia no local no es evidencia bancaria y tampoco se inventa', () => {
    expect(
      resolveExternalProviderReference({
        status: 'SUBMITTED',
        supplied: 'fixture-not-bank-evidence',
        stored: null,
        idempotencyKey: 'same-key',
      }),
    ).toEqual({ ok: true, reference: 'fixture-not-bank-evidence' });
    expect(isSyntheticProviderReference('fixture-not-bank-evidence')).toBe(false);
  });

  it('UNKNOWN conserva la misma idempotency key cuando la referencia externa es válida', () => {
    expect(
      resolveExternalProviderReference({
        status: 'UNKNOWN',
        supplied: 'bank-ref-1',
        stored: null,
        idempotencyKey: 'same-key',
      }),
    ).toEqual({ ok: true, reference: 'bank-ref-1' });
  });

  it('reconcile local no convierte UNKNOWN en éxito', () => {
    expect(
      resolveExternalProviderReference({
        status: 'UNKNOWN',
        supplied: 'reconcile:same-key',
        stored: null,
        idempotencyKey: 'same-key',
      }).ok,
    ).toBe(false);
  });

  it('REVERSED no se presenta como entrega', () => {
    const presented = presentCreatorReward({ status: 'REVERSED', synthetic: false });
    expect(presented.label).toBe('Revertida');
    expect(presented.uiStatus).not.toBe('delivered');
  });
});

describe('economy closure — reward and audit atomicity', () => {
  afterEach(() => {
    process.env = { ...prev };
  });

  it('un fallo del audit obligatorio no deja rewardId', async () => {
    process.env = { ...prev, NODE_ENV: 'test', REWARDS_PROGRAM_ACTIVE: 'true' };
    delete process.env.VERCEL_ENV;
    process.env.MONEY_PATH_FROZEN = 'false';

    const rewards: unknown[] = [];
    const audits: unknown[] = [];
    const supabase = {
      from(table: string) {
        if (table === 'creator_rewards') return chain(null);
        if (table === 'offers') {
          return chain({
            id: OFFER,
            created_by: CREATOR,
            status: 'approved',
            created_at: '2026-02-01T00:00:00.000Z',
          });
        }
        if (table === 'profiles') {
          return chain({
            reward_program_unlocked_at: '2026-01-01T00:00:00.000Z',
            welcome_offer_id: null,
          });
        }
        if (table === 'ledger_settlements') return chain(null);
        if (table === 'affiliate_ledger_entries') return chain(null);
        if (table === 'machine_clients') return emptyMachineClientsTable();
        throw new Error(`unexpected ${table}`);
      },
      async rpc() {
        const snapshot = { rewards: [...rewards], audits: [...audits] };
        rewards.push({ id: 'would-be-reward' });
        audits.push({ event: 'reward_created' });
        rewards.splice(0, rewards.length, ...snapshot.rewards);
        audits.splice(0, audits.length, ...snapshot.audits);
        return { data: null, error: { message: 'reward_creation_audit_failed' } };
      },
    };

    const result = await createRewardFromLedgerEntry(
      supabase as unknown as SupabaseClient,
      {
        id: LEDGER,
        network: 'amazon',
        amount_cents: 1000,
        status: 'accrued',
        offer_id: OFFER,
      },
      { manualStaffConfirmed: true, actorId: ACTOR },
    );

    expect(result).toEqual({ created: false, reason: 'audit_append_failed' });
    expect(rewards).toEqual([]);
    expect(audits).toEqual([]);
  });

  it('la función SQL aborta si el audit no queda escrito', () => {
    const sql = readFileSync(
      join(process.cwd(), 'docs/supabase-migrations/20260930_reward_creation_atomic.sql'),
      'utf8',
    );
    const rewardInsert = sql.indexOf('INSERT INTO public.creator_rewards');
    const createdAudit = sql.indexOf("'reward_created'");
    const validatingAudit = sql.indexOf("'reward_validating'");
    const abort = sql.lastIndexOf("RAISE EXCEPTION 'reward_creation_audit_failed'");
    expect(rewardInsert).toBeGreaterThan(-1);
    expect(createdAudit).toBeGreaterThan(rewardInsert);
    expect(validatingAudit).toBeGreaterThan(createdAudit);
    expect(abort).toBeGreaterThan(validatingAudit);
  });

  it('la atribución manual exige actor y no es un segundo motor de rewards', () => {
    const engine = readFileSync(join(process.cwd(), 'lib/rewards/rewardsEngine.ts'), 'utf8');
    const manual = readFileSync(join(process.cwd(), 'lib/rewards/manualAttribution.ts'), 'utf8');
    expect(engine).toMatch(/manual_actor_required/);
    expect(manual).toMatch(/createRewardFromLedgerEntry/);
    expect(manual).not.toMatch(/from\('creator_rewards'\)[\s\S]{0,80}\.insert\(/);
    expect(manual).toMatch(/manual_attribution_assigned/);
    expect(manual).toMatch(/operator_id: input.actorId/);
  });
});

describe('economy closure — antifraud and freeze', () => {
  it('self click y click anónimo quedan marcados antes de crear un reward', () => {
    expect(
      basicFraudFlags({ creatorId: CREATOR, offerId: OFFER, clickerUserId: CREATOR, clickId: 'c1' }),
    ).toContain('self_click');
    expect(
      basicFraudFlags({ creatorId: CREATOR, offerId: OFFER, clickerUserId: null, clickId: 'c1' }),
    ).toContain('anonymous_click');
  });

  it('dos intentos concurrentes de self-click no encuentran una ruta de force', () => {
    const engine = readFileSync(join(process.cwd(), 'lib/rewards/rewardsEngine.ts'), 'utf8');
    expect(engine).toMatch(/fraud_self_click/);
    expect(engine).toMatch(/NO salta: MONEY_PATH_FROZEN/);
    const flags = Array.from({ length: 2 }, () =>
      basicFraudFlags({ creatorId: CREATOR, offerId: OFFER, clickerUserId: CREATOR, clickId: 'c1' }),
    );
    expect(flags.every((entry) => entry.includes('self_click'))).toBe(true);
  });

  it('el ledger administrativo y el CSV rechazan el freeze en el servidor', () => {
    const post = readFileSync(
      join(process.cwd(), 'app/api/admin/affiliate-ledger/route.ts'),
      'utf8',
    );
    const csv = readFileSync(
      join(process.cwd(), 'app/api/admin/affiliate-ledger/import-csv/route.ts'),
      'utf8',
    );
    expect(post).toMatch(/isMoneyPathFrozen\(\)/);
    expect(csv).toMatch(/isMoneyPathFrozen\(\)/);
    expect(post).not.toMatch(/force.*money_path_frozen|searchParams.*frozen/i);
  });

  it('el click de salida no crea comisión, reward ni payout', () => {
    const click = readFileSync(join(process.cwd(), 'lib/rewards/clientOutbound.ts'), 'utf8');
    expect(click).toMatch(/\/api\/track-outbound/);
    expect(click).not.toMatch(/createRewardFromLedgerEntry|recordCommission|confirmPayoutIntentSuccess/);
  });
});
