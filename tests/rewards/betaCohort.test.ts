import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { REWARD_STATUSES, REWARDS_CREATOR_SHARE_BPS } from '@/lib/rewards/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import { excludesHumanSurfaces, resolveActorTypeFromSignals } from '@/lib/actors/actorType';
import { createRewardFromLedgerEntry } from '@/lib/rewards/rewardsEngine';
import { reservePayoutIntent } from '@/lib/rewards/payoutIntent/engine';
import {
  activeRewardsRule,
  betaOnboardingSteps,
  isRewardsBetaUiEnabled,
  isRewardsPayoutEnabled,
  nextBetaStatus,
  resolveRewardsAccess,
  type RewardsBetaMembership,
  type RewardsBetaStatus,
} from '@/lib/rewards/betaCohort';

function member(status: RewardsBetaMembership['status'], ruleVersion = '2026-10-05'): RewardsBetaMembership {
  return {
    userId: '00000000-0000-4000-8000-000000000001',
    status,
    ruleVersion,
    reason: 'prueba',
    at: '2026-10-05T00:00:00.000Z',
  };
}

function experience(uiEnabled: boolean, membership: RewardsBetaMembership | null, programActive = false, payoutEnabled = false) {
  return resolveRewardsAccess({
    programActive,
    payoutEnabled,
    membership,
    experience: { uiEnabled },
  });
}

describe('cohorte Rewards beta', () => {
  it('un usuario fuera de la beta no ve ni genera economía', () => {
    const access = experience(true, null);
    expect(access.audience).toBe('closed');
    expect(access.canSeeEconomics).toBe(false);
    expect(access.canAccrue).toBe(false);
    expect(access.payoutEnabled).toBe(false);
  });

  it('invitado entra al onboarding y no acumula hasta activar', () => {
    const invited = experience(true, member('invited'), false, true);
    expect(invited.needsOnboarding).toBe(true);
    expect(invited.canAccrue).toBe(false);
    const enrolled = experience(true, member('enrolled'));
    expect(enrolled.canAccrue).toBe(false);
    expect(enrolled.canSeeEconomics).toBe(true);
    expect(enrolled.payoutEnabled).toBe(false);
    expect(enrolled.shareBps).toBe(4000);
    expect(enrolled.shareBps).toBe(REWARDS_CREATOR_SHARE_BPS);
  });

  it('suspender, quitar y reingresar no borra el recorrido de estados', () => {
    expect(nextBetaStatus(null, 'invite')).toBe('invited');
    expect(nextBetaStatus('invited', 'enroll')).toBe('enrolled');
    expect(nextBetaStatus('enrolled', 'enroll')).toBe('enrolled');
    expect(nextBetaStatus('enrolled', 'suspend')).toBe('suspended');
    expect(nextBetaStatus('suspended', 'reenroll')).toBe('invited');
    expect(nextBetaStatus('enrolled', 'remove')).toBe('removed');
    expect(nextBetaStatus('removed', 'reenroll')).toBe('invited');
    expect(nextBetaStatus('removed', 'remove')).toBeNull();
  });

  it('el 40% sale de una sola regla y una versión vieja no hereda el porcentaje nuevo', () => {
    expect(activeRewardsRule()).toEqual({ version: '2026-10-05', creatorShareBps: 4000 });
    const current = experience(true, member('enrolled', '2026-10-05'));
    const stale = experience(true, member('enrolled', '2026-01-01'));
    expect(current.shareBps).toBe(4000);
    expect(stale.shareBps).toBeNull();
    expect(stale.ruleVersion).toBe('2026-01-01');
  });

  it('los estados de recompensa no cambian y un pago beta apagado no se habilita dos veces', () => {
    expect(REWARD_STATUSES).toEqual(['PENDING', 'VALIDATING', 'AVAILABLE', 'PAID', 'CANCELLED', 'REVERSED']);
    const first = experience(true, member('enrolled'));
    const second = experience(true, member('enrolled'));
    expect(first.payoutEnabled).toBe(false);
    expect(second.payoutEnabled).toBe(false);
  });

  it('el onboarding muestra el 40% y separa el pago', () => {
    const steps = betaOnboardingSteps(4000);
    expect(steps.map((step) => step.title)).toEqual([
      'Cómo funciona',
      'Cómo generas recompensas',
      'Cómo se calcula tu participación',
      'Cuándo puedes recibirla',
      'Condiciones y validaciones',
      'Activar Rewards',
    ]);
    expect(steps[2]?.body.join(' ')).toContain('Tu participación actual: 40%');
    expect(steps[3]?.body.join(' ')).toContain('Esto todavía no puede pagarse');
    expect(steps[4]?.body.join(' ')).toContain('no calcula');
  });

  it('activar la beta solo cambia la membresía', () => {
    const route = readFileSync('app/api/me/rewards/beta/route.ts', 'utf8');
    expect(route).toContain("action: 'enroll'");
    expect(route).not.toMatch(/createReward|affiliate_ledger|payoutIntent|commission/i);
  });

  it('las banderas de beta y pago nacen apagadas', () => {
    const prevBeta = process.env.REWARDS_BETA_UI_ENABLED;
    const prevPay = process.env.REWARDS_PAYOUT_ENABLED;
    delete process.env.REWARDS_BETA_UI_ENABLED;
    delete process.env.REWARDS_PAYOUT_ENABLED;
    expect(isRewardsBetaUiEnabled()).toBe(false);
    expect(isRewardsPayoutEnabled()).toBe(false);
    if (prevBeta !== undefined) process.env.REWARDS_BETA_UI_ENABLED = prevBeta;
    if (prevPay !== undefined) process.env.REWARDS_PAYOUT_ENABLED = prevPay;
  });
});

const HUNTER = '22222222-2222-4222-8222-222222222222';
const SYSTEM = '33333333-3333-4333-8333-333333333333';

function ledgerClient(rows: Record<string, Record<string, unknown> | null>) {
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
        limit() {
          return api;
        },
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
        insert() {
          writes.push(table);
          return Promise.resolve({ data: null, error: null });
        },
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      };
      return api;
    },
  } as unknown as SupabaseClient;
  return { client, writes };
}

describe('la UI de la beta no autoriza dinero', () => {
  it('TEST 1 UI apagada oculta la experiencia aunque la persona esté invitada', () => {
    const access = experience(false, member('invited'));
    expect(access.audience).toBe('closed');
    expect(access.needsOnboarding).toBe(false);
    expect(access.canSeeEconomics).toBe(false);
    expect(access.canAccrue).toBe(false);
  });

  it('TEST 2 UI encendida muestra el onboarding a quien está invitado', () => {
    const access = experience(true, member('invited'));
    expect(access.audience).toBe('beta');
    expect(access.needsOnboarding).toBe(true);
    expect(access.canSeeEconomics).toBe(true);
    expect(access.canAccrue).toBe(false);
    expect(access.payoutEnabled).toBe(false);
    expect(nextBetaStatus('invited', 'enroll')).toBe('enrolled');
  });

  it('TEST 3 UI encendida, programa apagado y freeze no crean reward', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.VERCEL_ENV;
    process.env.MONEY_PATH_FROZEN = 'true';
    process.env.REWARDS_PROGRAM_ACTIVE = 'false';
    process.env.REWARDS_BETA_UI_ENABLED = 'true';
    const { client, writes } = ledgerClient({ creator_rewards: null });
    const result = await createRewardFromLedgerEntry(client, {
      id: 'ledger-ui',
      network: 'amazon',
      amount_cents: 1000,
      status: 'accrued',
    });
    expect(result).toEqual({ created: false, reason: 'money_path_frozen' });
    expect(writes).toEqual([]);
    expect(experience(true, member('enrolled'), false).canAccrue).toBe(false);
  });

  it('TEST 4 la UI encendida no autoriza rewards con el programa apagado y el freeze abierto', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.VERCEL_ENV;
    process.env.MONEY_PATH_FROZEN = 'false';
    process.env.REWARDS_PROGRAM_ACTIVE = 'false';
    process.env.REWARDS_BETA_UI_ENABLED = 'true';
    const { client, writes } = ledgerClient({ creator_rewards: null });
    const result = await createRewardFromLedgerEntry(client, {
      id: 'ledger-ui',
      network: 'amazon',
      amount_cents: 1000,
      status: 'accrued',
    });
    expect(result).toEqual({ created: false, reason: 'program_inactive' });
    expect(writes).toEqual([]);
    expect(experience(true, member('enrolled'), false, true).canAccrue).toBe(false);
  });

  it('TEST 5 una membresía distinta de enrolled no acumula', () => {
    const statuses: Array<RewardsBetaStatus | null> = ['invited', 'suspended', 'removed', null];
    for (const status of statuses) {
      const access = experience(true, status ? member(status) : null, false, true);
      expect(access.canAccrue).toBe(false);
    }
  });

  it('TEST 6 enrolled con el programa apagado no abre un bypass', () => {
    const access = experience(true, member('enrolled'), false, true);
    expect(access.canAccrue).toBe(false);
    expect(access.payoutEnabled).toBe(false);
    expect(experience(false, member('enrolled'), true).canAccrue).toBe(true);
  });

  it('TEST 7 el freeze bloquea aunque la UI, la membresía y el programa estén abiertos', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.VERCEL_ENV;
    process.env.MONEY_PATH_FROZEN = 'true';
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    process.env.REWARDS_BETA_UI_ENABLED = 'true';
    const { client, writes } = ledgerClient({ creator_rewards: null });
    const result = await createRewardFromLedgerEntry(client, {
      id: 'ledger-frozen',
      network: 'amazon',
      amount_cents: 1000,
      status: 'accrued',
    });
    expect(experience(true, member('enrolled'), true, true).canAccrue).toBe(true);
    expect(result).toEqual({ created: false, reason: 'money_path_frozen' });
    expect(writes).toEqual([]);
  });

  it('TEST 8 el flag de payout apagado no habilita cobro', async () => {
    process.env.REWARDS_PAYOUT_ENABLED = 'false';
    process.env.REWARDS_BETA_UI_ENABLED = 'true';
    process.env.NODE_ENV = 'test';
    delete process.env.VERCEL_ENV;
    process.env.MONEY_PATH_FROZEN = 'true';
    const access = experience(true, member('enrolled'), false, isRewardsPayoutEnabled());
    const forced = experience(true, member('enrolled'), false, true);
    expect(isRewardsPayoutEnabled()).toBe(false);
    expect(access.payoutEnabled).toBe(false);
    expect(forced.payoutEnabled).toBe(false);
    const payout = await reservePayoutIntent(ledgerClient({ creator_rewards: null }).client, { rewardId: 'reward-1' });
    expect(payout).toEqual({ ok: false, reason: 'money_path_frozen' });
    const eligibility = readFileSync('lib/rewards/payoutIntent/eligibility.ts', 'utf8');
    expect(eligibility).not.toMatch(/REWARDS_BETA_UI_ENABLED|isRewardsBetaUiEnabled|isRewardsBetaEnabled/);
  });

  it('TEST 9 MACHINE_HUNTER no recibe reward económico', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.VERCEL_ENV;
    process.env.MONEY_PATH_FROZEN = 'false';
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    process.env.REWARDS_BETA_UI_ENABLED = 'true';
    process.env.MCP_BOT_AUTHOR_USER_IDS = HUNTER;
    delete process.env.BOT_INGEST_USER_ID;
    expect(resolveActorTypeFromSignals(HUNTER, false)).toBe('MACHINE_HUNTER');
    expect(excludesHumanSurfaces('MACHINE_HUNTER')).toBe(true);
    const { client, writes } = ledgerClient({
      creator_rewards: null,
      offers: { id: 'offer-1', created_by: HUNTER, status: 'approved' },
    });
    const result = await createRewardFromLedgerEntry(
      client,
      { id: 'ledger-hunter', network: 'amazon', amount_cents: 1000, status: 'accrued', offer_id: 'offer-1' },
      { manualStaffConfirmed: true, actorId: 'staff-1' },
    );
    expect(result).toEqual({ created: false, reason: 'bot_author' });
    expect(writes).not.toContain('creator_rewards');
  });

  it('TEST 10 SYSTEM no recibe reward económico', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.VERCEL_ENV;
    process.env.MONEY_PATH_FROZEN = 'false';
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    process.env.REWARDS_BETA_UI_ENABLED = 'true';
    delete process.env.MCP_BOT_AUTHOR_USER_IDS;
    process.env.BOT_INGEST_USER_ID = SYSTEM;
    expect(resolveActorTypeFromSignals(SYSTEM, false)).toBe('SYSTEM');
    expect(excludesHumanSurfaces('SYSTEM')).toBe(true);
    const { client, writes } = ledgerClient({
      creator_rewards: null,
      offers: { id: 'offer-1', created_by: SYSTEM, status: 'approved' },
    });
    const result = await createRewardFromLedgerEntry(
      client,
      { id: 'ledger-system', network: 'amazon', amount_cents: 1000, status: 'accrued', offer_id: 'offer-1' },
      { manualStaffConfirmed: true, actorId: 'staff-1' },
    );
    expect(result).toEqual({ created: false, reason: 'bot_author' });
    expect(writes).not.toContain('creator_rewards');
  });

  it('el motor económico no lee la flag de UI', () => {
    const engine = readFileSync('lib/rewards/rewardsEngine.ts', 'utf8');
    expect(engine).not.toMatch(/REWARDS_BETA_UI_ENABLED|isRewardsBetaUiEnabled|isRewardsBetaEnabled|REWARDS_BETA_ENABLED/);
  });
});
