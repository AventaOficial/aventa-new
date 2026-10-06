import { afterEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { persistShadowProjection } from '@/lib/economy/shadow/persistShadowProjection';
import { activeRewardsRule } from '@/lib/rewards/betaCohort';

const CREATOR = '11111111-1111-4111-8111-111111111111';
const CLICKER = '22222222-2222-4222-8222-222222222222';
const MONEY = ['creator_rewards', 'payout_intents', 'reward_payouts', 'affiliate_ledger_entries', 'ledger_settlements'];

type Row = Record<string, unknown>;

function harness(patch?: {
  commission?: Row;
  conversion?: Row | null;
  click?: Row | null;
  offer?: Row | null;
  machine?: boolean;
  enrolled?: boolean;
}) {
  const moneyWrites: string[] = [];
  const projections: Row[] = [];
  const commission = {
    id: 'comm-1',
    conversion_id: 'conv-1',
    status: 'approved',
    gross_commission_cents: 1250,
    ...patch?.commission,
  };
  const conversion =
    patch?.conversion === null
      ? null
      : {
          id: 'conv-1',
          click_id: 'click-1',
          offer_id: 'offer-1',
          attribution_status: 'attributed',
          attribution_meta: { method: 'sub_id' },
          ...patch?.conversion,
        };
  const click =
    patch?.click === null
      ? null
      : {
          id: 'click-1',
          offer_id: 'offer-1',
          clicker_user_id: CLICKER,
          ...patch?.click,
        };
  const offer =
    patch?.offer === null
      ? null
      : {
          id: 'offer-1',
          created_by: CREATOR,
          ...patch?.offer,
        };

  function read(data: unknown) {
    const result = { data, error: null as null };
    const api: Record<string, unknown> = {};
    const self = () => api;
    api.select = self;
    api.eq = self;
    api.order = self;
    api.limit = () => Object.assign(Promise.resolve(result), { maybeSingle: async () => result });
    api.maybeSingle = async () => result;
    return api;
  }

  const sb = {
    from(table: string) {
      if (MONEY.includes(table)) {
        return {
          insert() {
            moneyWrites.push(table);
            throw new Error(`money write ${table}`);
          },
          update() {
            moneyWrites.push(table);
            throw new Error(`money write ${table}`);
          },
        };
      }
      if (table === 'economic_shadow_projections') {
        return {
          select() {
            return read(projections[0] ?? null);
          },
          insert(row: Row) {
            projections.push({ ...row });
            return Promise.resolve({ error: null });
          },
          update(row: Row) {
            if (projections[0]) Object.assign(projections[0], row);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === 'affiliate_commissions') return read(commission);
      if (table === 'affiliate_conversions') return read(conversion);
      if (table === 'reward_outbound_clicks') return read(click);
      if (table === 'offers') return read(offer);
      if (table === 'machine_clients') return read(patch?.machine ? [{ id: 'm1' }] : []);
      if (table === 'rewards_beta_memberships') {
        return read(
          patch?.enrolled === false
            ? null
            : { user_id: CREATOR, status: 'enrolled', rule_version: '2026-10-05', reason: 'test', created_at: '2026-10-01T00:00:00.000Z' },
        );
      }
      return read(null);
    },
  };

  return { sb: sb as unknown as SupabaseClient, projections, moneyWrites, commission };
}

async function project(sb: SupabaseClient) {
  const rule = activeRewardsRule();
  return persistShadowProjection(sb, {
    commissionId: 'comm-1',
    rule: { version: rule.version, creatorShareBps: rule.creatorShareBps },
  });
}

afterEach(() => {
  delete process.env.BOT_INGEST_USER_ID;
  delete process.env.MONEY_PATH_FROZEN;
  delete process.env.REWARDS_PROGRAM_ACTIVE;
  delete process.env.REWARDS_PAYOUT_ENABLED;
});

describe('shadow runtime', () => {
  it('comisión válida', async () => {
    const { sb, projections, moneyWrites } = harness();
    const result = await project(sb);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.observation.reason).toBe('eligible');
    expect(result.observation.withdrawable).toBe(false);
    expect(projections).toHaveLength(1);
    expect(projections[0].observation_kind).toBe('SHADOW_ONLY');
    expect(projections[0].withdrawable).toBe(false);
    expect(moneyWrites).toEqual([]);
  });

  it('comisión duplicada y repetición no crean otra fila', async () => {
    const { sb, projections, moneyWrites } = harness();
    await project(sb);
    const second = await project(sb);
    expect(second.ok && second.reused).toBe(true);
    for (let i = 0; i < 10; i += 1) await project(sb);
    expect(projections).toHaveLength(1);
    expect(moneyWrites).toEqual([]);
  });

  it('self-click', async () => {
    const { sb, moneyWrites } = harness({ click: { clicker_user_id: CREATOR } });
    const result = await project(sb);
    expect(result.ok && result.observation.reason).toBe('self_click');
    expect(moneyWrites).toEqual([]);
  });

  it('anónimo', async () => {
    const { sb, moneyWrites } = harness({ click: { clicker_user_id: null } });
    const result = await project(sb);
    expect(result.ok && result.observation.reason).toBe('anonymous_click');
    expect(moneyWrites).toEqual([]);
  });

  it('atribución de baja confianza', async () => {
    const { sb, moneyWrites } = harness({
      conversion: { attribution_meta: { method: 'product_click_window' } },
    });
    const result = await project(sb);
    expect(result.ok && result.observation.reason).toBe('unattributed');
    expect(moneyWrites).toEqual([]);
  });

  it('actor máquina', async () => {
    const { sb, moneyWrites } = harness({ machine: true });
    const result = await project(sb);
    expect(result.ok && result.observation.reason).toBe('machine_actor');
    expect(moneyWrites).toEqual([]);
  });

  it('actor sistema', async () => {
    process.env.BOT_INGEST_USER_ID = CREATOR;
    const { sb, moneyWrites } = harness();
    const result = await project(sb);
    expect(result.ok && result.observation.reason).toBe('system_actor');
    expect(moneyWrites).toEqual([]);
  });

  it('comisión reversada', async () => {
    const { sb, moneyWrites } = harness({ commission: { status: 'reversed' } });
    const result = await project(sb);
    expect(result.ok && result.observation.reason).toBe('reversed_commission');
    expect(result.ok && result.observation.projectedCreatorCents).toBe(0);
    expect(moneyWrites).toEqual([]);
  });

  it('sin atribución', async () => {
    const { sb, moneyWrites } = harness({ click: null });
    const result = await project(sb);
    expect(result.ok && result.observation.reason).toBe('missing_click');
    expect(moneyWrites).toEqual([]);
  });

  it('oferta distinta entre clic y conversión', async () => {
    const { sb, moneyWrites } = harness({ click: { offer_id: 'offer-other' } });
    const result = await project(sb);
    expect(result.ok && result.observation.reason).toBe('invalid_chain');
    expect(moneyWrites).toEqual([]);
  });

  it('freeze, programa y payout apagados no escriben dinero', async () => {
    process.env.MONEY_PATH_FROZEN = 'true';
    process.env.REWARDS_PROGRAM_ACTIVE = 'false';
    process.env.REWARDS_PAYOUT_ENABLED = 'false';
    const { sb, projections, moneyWrites } = harness();
    const result = await project(sb);
    expect(result.ok).toBe(true);
    expect(projections).toHaveLength(1);
    expect(moneyWrites).toEqual([]);
  });
});
