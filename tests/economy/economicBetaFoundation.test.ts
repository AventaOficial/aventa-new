import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decideCrossSourceOrder } from '@/lib/economy/shadow/crossSourceOrder';
import { observeExplicitOrderIdentity } from '@/lib/economy/shadow/crossSourceOrder';
import { persistShadowProjection } from '@/lib/economy/shadow/persistShadowProjection';
import { evaluateShadowEligibility, type ShadowChainEvidence, type ShadowRule } from '@/lib/economy/shadow/shadowEligibility';
import { reversalRate } from '@/lib/economy/beta/economicBetaReport';
import { createRewardFromLedgerEntry } from '@/lib/rewards/rewardsEngine';
import { reservePayoutIntent } from '@/lib/rewards/payoutIntent/engine';

const RULE: ShadowRule = { version: '2026-10-05', creatorShareBps: 4000 };
const CREATOR = '11111111-1111-4111-8111-111111111111';
const CLICKER = '22222222-2222-4222-8222-222222222222';
const HUNTER = '33333333-3333-4333-8333-333333333333';

const envSnap = {
  MONEY_PATH_FROZEN: process.env.MONEY_PATH_FROZEN,
  VERCEL_ENV: process.env.VERCEL_ENV,
  NODE_ENV: process.env.NODE_ENV,
  BOT_INGEST_USER_ID: process.env.BOT_INGEST_USER_ID,
};

afterEach(() => {
  for (const [key, value] of Object.entries(envSnap)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

type Row = Record<string, unknown>;

function memory(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]),
  );
  const writes: string[] = [];
  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    let orderCol: string | null = null;
    let orderAsc = true;
    const matched = () => {
      const rows = [...(tables[table] ?? [])];
      if (orderCol) {
        rows.sort((a, b) => String(a[orderCol]).localeCompare(String(b[orderCol])) * (orderAsc ? 1 : -1));
      }
      return rows.filter((row) => filters.every(([column, value]) => row[column] === value));
    };
    const api = {
      select() {
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return api;
      },
      order(column: string, options?: { ascending?: boolean }) {
        orderCol = column;
        orderAsc = options?.ascending !== false;
        return api;
      },
      limit() {
        return api;
      },
      maybeSingle: async () => ({ data: matched()[0] ?? null, error: null }),
      insert(row: Row) {
        writes.push(`${table}.insert`);
        const list = tables[table] ?? [];
        list.push({ id: crypto.randomUUID(), ...row });
        tables[table] = list;
        return Promise.resolve({ data: row, error: null });
      },
      update(patch: Row) {
        return {
          eq: async (column: string, value: unknown) => {
            writes.push(`${table}.update`);
            const list = tables[table] ?? [];
            const index = list.findIndex((row) => row[column] === value);
            if (index >= 0) list[index] = { ...list[index], ...patch };
            return { error: null };
          },
        };
      },
      then(resolve: (value: { data: Row[]; error: null }) => unknown) {
        return Promise.resolve({ data: matched(), error: null }).then(resolve);
      },
    };
    return api;
  };
  return { client: { from } as unknown as SupabaseClient, tables, writes };
}

function chain(overrides: Partial<ShadowChainEvidence> = {}): ShadowChainEvidence {
  return {
    commission: {
      id: 'c1',
      conversionId: 'v1',
      status: 'approved',
      grossCommissionCents: 10_000,
    },
    conversion: {
      id: 'v1',
      clickId: 'k1',
      offerId: 'o1',
      attributionStatus: 'attributed',
    },
    click: { id: 'k1', offerId: 'o1', clickerUserId: CLICKER },
    offer: { id: 'o1', creatorUserId: CREATOR },
    actorType: 'HUMAN',
    membershipStatus: 'enrolled',
    attributionMethod: 'sub_id',
    ...overrides,
  };
}

function seeded(patch: Record<string, Row[]> = {}) {
  return memory({
    affiliate_commissions: [
      { id: 'c1', conversion_id: 'v1', status: 'approved', gross_commission_cents: 10_000 },
    ],
    affiliate_conversions: [
      {
        id: 'v1',
        click_id: 'k1',
        offer_id: 'o1',
        attribution_status: 'attributed',
        attribution_meta: { method: 'sub_id' },
      },
    ],
    reward_outbound_clicks: [{ id: 'k1', offer_id: 'o1', clicker_user_id: CLICKER }],
    offers: [{ id: 'o1', created_by: CREATOR }],
    rewards_beta_memberships: [
      {
        user_id: CREATOR,
        status: 'enrolled',
        rule_version: '2026-10-05',
        reason: 'beta',
        created_at: '2026-10-06T00:00:00.000Z',
      },
    ],
    machine_clients: [],
    economic_shadow_projections: [],
    economic_order_reconciliation_candidates: [],
    ...patch,
  });
}

describe('shadow eligibility', () => {
  it('proyecta a un humano enrolled', () => {
    const observation = evaluateShadowEligibility(chain(), RULE);
    expect(observation.eligibilityStatus).toBe('eligible');
    expect(observation.projectedCreatorCents).toBe(4000);
    expect(observation.projectedPlatformCents).toBe(6000);
    expect(observation.withdrawable).toBe(false);
    expect(observation.observationKind).toBe('SHADOW_ONLY');
    expect(observation.ruleVersion).toBe('2026-10-05');
  });

  it('rechaza máquina, sistema, self-click, anónimo y huecos', () => {
    expect(evaluateShadowEligibility(chain({ actorType: 'MACHINE_HUNTER' }), RULE).reason).toBe('machine_actor');
    expect(evaluateShadowEligibility(chain({ actorType: 'SYSTEM' }), RULE).reason).toBe('system_actor');
    expect(evaluateShadowEligibility(chain({ click: { id: 'k1', offerId: 'o1', clickerUserId: CREATOR } }), RULE).reason).toBe('self_click');
    expect(evaluateShadowEligibility(chain({ click: { id: 'k1', offerId: 'o1', clickerUserId: null } }), RULE).reason).toBe('anonymous_click');
    expect(evaluateShadowEligibility(chain({ click: null, conversion: { id: 'v1', clickId: null, offerId: 'o1', attributionStatus: 'attributed' } }), RULE).reason).toBe('missing_click');
    expect(evaluateShadowEligibility(chain({ offer: { id: 'o1', creatorUserId: null } }), RULE).reason).toBe('missing_creator');
    expect(evaluateShadowEligibility(chain({ commission: { id: 'c1', conversionId: 'v1', status: 'reversed', grossCommissionCents: 10_000 } }), RULE).reason).toBe('reversed_commission');
    expect(evaluateShadowEligibility(chain({ membershipStatus: 'invited' }), RULE).reason).toBe('not_enrolled');
    for (const observation of [
      evaluateShadowEligibility(chain({ actorType: 'MACHINE_HUNTER' }), RULE),
      evaluateShadowEligibility(chain({ actorType: 'SYSTEM' }), RULE),
      evaluateShadowEligibility(chain({ membershipStatus: 'none' }), RULE),
    ]) {
      expect(observation.projectedCreatorCents).toBe(0);
      expect(observation.projectedPlatformCents).toBe(0);
    }
  });
});

describe('shadow persistence', () => {
  it('guarda una proyección y no escribe dinero', async () => {
    const db = seeded();
    const first = await persistShadowProjection(db.client, { commissionId: 'c1', rule: RULE });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.reused).toBe(false);
    expect(first.observation.projectedCreatorCents).toBe(4000);
    expect(db.tables.economic_shadow_projections).toHaveLength(1);
    expect(db.writes.some((write) => write.startsWith('creator_rewards'))).toBe(false);
    expect(db.writes.some((write) => write.startsWith('affiliate_ledger_entries'))).toBe(false);
    expect(db.writes.some((write) => write.startsWith('payout_intents'))).toBe(false);
    expect(db.writes.some((write) => write.startsWith('ledger_settlements'))).toBe(false);
  });

  it('la misma comisión no crea otra proyección y conserva la regla histórica', async () => {
    const db = seeded();
    await persistShadowProjection(db.client, { commissionId: 'c1', rule: RULE });
    const second = await persistShadowProjection(db.client, {
      commissionId: 'c1',
      rule: { version: '2099-01-01', creatorShareBps: 9000 },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.reused).toBe(true);
    expect(second.observation.ruleVersion).toBe('2026-10-05');
    expect(second.observation.projectedCreatorCents).toBe(4000);
    expect(db.tables.economic_shadow_projections).toHaveLength(1);
    expect(db.tables.economic_shadow_projections[0]?.rule_version).toBe('2026-10-05');
    expect(db.tables.economic_shadow_projections[0]?.creator_share_bps).toBe(4000);
  });

  it('un hunter de máquina queda inelegible', async () => {
    const db = seeded({
      offers: [{ id: 'o1', created_by: HUNTER }],
      rewards_beta_memberships: [
        {
          user_id: HUNTER,
          status: 'enrolled',
          rule_version: '2026-10-05',
          reason: 'beta',
          created_at: '2026-10-06T00:00:00.000Z',
        },
      ],
      machine_clients: [{ id: 'mc', author_profile_id: HUNTER }],
    });
    const result = await persistShadowProjection(db.client, { commissionId: 'c1', rule: RULE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.observation.reason).toBe('machine_actor');
    expect(result.observation.projectedCreatorCents).toBe(0);
  });
});

describe('cross-source order identity', () => {
  it('la misma clave explícita en dos canales es candidato y no se fusiona', () => {
    const decision = decideCrossSourceOrder({
      network: 'amazon',
      incoming: { conversionId: 'webhook-1', explicitOrderKey: 'ORDER-9' },
      existing: { conversionId: 'csv-1', explicitOrderKey: 'ORDER-9' },
    });
    expect(decision.action).toBe('candidate');
  });

  it('órdenes distintas siguen separadas', () => {
    expect(
      decideCrossSourceOrder({
        network: 'amazon',
        incoming: { conversionId: 'a', explicitOrderKey: 'ORDER-1' },
        existing: { conversionId: 'b', explicitOrderKey: 'ORDER-2' },
      }).action,
    ).toBe('ignore');
  });

  it('sin clave explícita no se mezcla aunque el id externo coincida', () => {
    const decision = decideCrossSourceOrder({
      network: 'amazon',
      incoming: { conversionId: 'webhook-1', explicitOrderKey: null },
      existing: { conversionId: 'csv-1', explicitOrderKey: null },
    });
    expect(decision).toEqual({ action: 'ignore', cause: 'ambiguous' });
  });

  it('registrar dos veces la misma identidad no duplica la fila', async () => {
    const db = seeded();
    const first = await observeExplicitOrderIdentity(db.client, {
      network: 'amazon',
      source: 'webhook',
      conversionId: 'v1',
      explicitOrderKey: ' ORDER-9 ',
    });
    const second = await observeExplicitOrderIdentity(db.client, {
      network: 'amazon',
      source: 'csv_import',
      conversionId: 'v1',
      explicitOrderKey: 'ORDER-9',
    });
    expect(first).toMatchObject({ ok: true, recorded: true });
    expect(second).toMatchObject({ ok: true, recorded: false, cause: 'already_recorded' });
    expect(db.tables.economic_order_reconciliation_candidates).toHaveLength(1);
    expect(db.tables.affiliate_conversions).toHaveLength(1);
  });
});

describe('money flags stay closed', () => {
  it('MONEY_PATH_FROZEN impide reward, settlement y payout', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.VERCEL_ENV;
    process.env.MONEY_PATH_FROZEN = 'true';
    const writes: string[] = [];
    const client = {
      from(table: string) {
        const api = {
          select() {
            return api;
          },
          eq() {
            return api;
          },
          insert() {
            writes.push(`${table}.insert`);
            return api;
          },
          maybeSingle: async () => ({ data: null, error: null }),
        };
        return api;
      },
    } as unknown as SupabaseClient;

    const reward = await createRewardFromLedgerEntry(client, {
      id: 'ledger-1',
      network: 'amazon',
      amount_cents: 1000,
      status: 'accrued',
    });
    const payout = await reservePayoutIntent(client, { rewardId: 'reward-1' });
    expect(reward).toEqual({ created: false, reason: 'money_path_frozen' });
    expect(payout).toEqual({ ok: false, reason: 'money_path_frozen' });
    expect(writes).toEqual([]);
  });
});

describe('economic beta report math', () => {
  it('la tasa de reverso es nula cuando no hay comisiones reconocidas', () => {
    expect(reversalRate(0, 0)).toBeNull();
    expect(reversalRate(3, 1)).toBe(0.25);
  });

  it('la migración no convierte la proyección en payout ni quita source del unique', () => {
    const sql = readFileSync('docs/supabase-migrations/20261006_economic_shadow_projections.sql', 'utf8');
    const foundation = readFileSync('docs/supabase-migrations/20260916_conversion_commission_foundation.sql', 'utf8');
    expect(sql).toContain('SHADOW_ONLY');
    expect(sql).toContain('withdrawable = false');
    expect(sql).toContain('unique (commission_id)');
    expect(sql).not.toMatch(/references public\.creator_rewards/i);
    expect(sql).not.toMatch(/references public\.payout_intents/i);
    expect(sql).not.toMatch(/references public\.affiliate_ledger_entries/i);
    expect(foundation).toContain('UNIQUE (source, network, external_conversion_id)');
    expect(sql).not.toContain('drop constraint affiliate_conversions_external_unique');
  });
});
