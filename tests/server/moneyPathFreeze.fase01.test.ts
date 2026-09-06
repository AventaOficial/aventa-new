import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isMoneyPathFrozen,
  isProductionRuntime,
  MONEY_PATH_FROZEN_CODE,
} from '../../lib/server/moneyPathFreeze';
import { processExpiredRewardHolds } from '../../lib/rewards/rewardsEngine';
import { createManualRewardPayout } from '../../lib/rewards/payout';

const ENV_KEYS = [
  'MONEY_PATH_FROZEN',
  'VERCEL_ENV',
  'NODE_ENV',
] as const;

type EnvSnapshot = Record<(typeof ENV_KEYS)[number], string | undefined>;

function snapshotEnv(): EnvSnapshot {
  const out = {} as EnvSnapshot;
  for (const k of ENV_KEYS) out[k] = process.env[k];
  return out;
}

function restoreEnv(snap: EnvSnapshot) {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

describe('FASE 0.1 — moneyPathFreeze', () => {
  let snap: EnvSnapshot;

  beforeEach(() => {
    snap = snapshotEnv();
    delete process.env.MONEY_PATH_FROZEN;
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    restoreEnv(snap);
  });

  it('Test 6 — Production + MONEY_PATH_FROZEN ausente → fail-closed (frozen)', () => {
    process.env.VERCEL_ENV = 'production';
    delete process.env.MONEY_PATH_FROZEN;
    expect(isProductionRuntime()).toBe(true);
    expect(isMoneyPathFrozen()).toBe(true);
  });

  it('Production + valor inválido → fail-closed', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.MONEY_PATH_FROZEN = 'maybe';
    expect(isMoneyPathFrozen()).toBe(true);
  });

  it('MONEY_PATH_FROZEN=true → frozen en cualquier runtime', () => {
    process.env.NODE_ENV = 'test';
    process.env.MONEY_PATH_FROZEN = 'true';
    expect(isMoneyPathFrozen()).toBe(true);
  });

  it('MONEY_PATH_FROZEN=false → no frozen (incluso Production)', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.MONEY_PATH_FROZEN = 'false';
    expect(isMoneyPathFrozen()).toBe(false);
  });

  it('non-prod + ausente → no frozen (tests/local)', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.VERCEL_ENV;
    delete process.env.MONEY_PATH_FROZEN;
    expect(isMoneyPathFrozen()).toBe(false);
  });
});

describe('FASE 0.1 — processExpiredRewardHolds freeze', () => {
  let snap: EnvSnapshot;

  beforeEach(() => {
    snap = snapshotEnv();
    process.env.MONEY_PATH_FROZEN = 'true';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    restoreEnv(snap);
  });

  it('Test 1 — con freeze, VALIDATING no pasa a AVAILABLE', async () => {
    const from = vi.fn(() => {
      throw new Error('creator_rewards no debe consultarse bajo freeze');
    });
    const supabase = { from } as unknown as SupabaseClient;

    const result = await processExpiredRewardHolds(supabase);
    expect(result).toEqual({ processed: 0, frozen: true });
    expect(from).not.toHaveBeenCalled();
  });
});

describe('FASE 0.1 — createManualRewardPayout freeze', () => {
  let snap: EnvSnapshot;

  beforeEach(() => {
    snap = snapshotEnv();
    process.env.MONEY_PATH_FROZEN = 'true';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    restoreEnv(snap);
  });

  it('Test 2 — con freeze, payout manual se rechaza', async () => {
    const rpc = vi.fn();
    const supabase = {
      from: vi.fn(),
      rpc,
    } as unknown as SupabaseClient;

    const result = await createManualRewardPayout(supabase, {
      userId: '00000000-0000-4000-8000-000000000001',
      amountCents: 20_000,
      speiReference: 'SPEI-TEST-1234',
      createdBy: '00000000-0000-4000-8000-000000000002',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(503);
      expect(result.error).toContain(MONEY_PATH_FROZEN_CODE);
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('FASE 0.1 — run-monthly freeze', () => {
  let snap: EnvSnapshot;

  beforeEach(() => {
    snap = snapshotEnv();
    process.env.MONEY_PATH_FROZEN = 'true';
    process.env.NODE_ENV = 'test';
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv(snap);
    vi.doUnmock('@/lib/server/requireAdmin');
    vi.doUnmock('@/lib/supabase/server');
    vi.resetModules();
  });

  it('Test 3 — con freeze, run-monthly rechaza y no crea allocations', async () => {
    const from = vi.fn(() => {
      throw new Error('DB money tables no deben tocarse bajo freeze');
    });

    vi.doMock('@/lib/server/requireAdmin', () => ({
      requireUsersLogs: vi.fn(async () => ({
        user: { id: 'admin-1' },
        role: 'owner',
      })),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      createServerClient: vi.fn(() => ({ from })),
    }));

    const { POST } = await import('../../app/api/admin/commissions/run-monthly/route');
    const res = await POST(
      new Request('https://aventaofertas.com/api/admin/commissions/run-monthly', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ period: '2026-09' }),
      }),
    );

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe(MONEY_PATH_FROZEN_CODE);
    expect(body.frozen).toBe(true);
    expect(from).not.toHaveBeenCalled();
  });
});

describe('FASE 0.1 — mark allocation paid freeze', () => {
  let snap: EnvSnapshot;

  beforeEach(() => {
    snap = snapshotEnv();
    process.env.MONEY_PATH_FROZEN = 'true';
    process.env.NODE_ENV = 'test';
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv(snap);
    vi.doUnmock('@/lib/server/requireAdmin');
    vi.doUnmock('@/lib/supabase/server');
    vi.resetModules();
  });

  it('Test 4 — mark paid bloqueado incluso con force=true', async () => {
    const from = vi.fn(() => {
      throw new Error('commission_allocations no debe actualizarse a paid bajo freeze');
    });

    vi.doMock('@/lib/server/requireAdmin', () => ({
      requireUsersLogs: vi.fn(async () => ({
        user: { id: 'admin-1' },
        role: 'owner',
      })),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      createServerClient: vi.fn(() => ({ from })),
    }));

    const { PATCH } = await import('../../app/api/admin/commissions/allocations/route');
    const res = await PATCH(
      new Request('https://aventaofertas.com/api/admin/commissions/allocations', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ids: ['00000000-0000-4000-8000-000000000099'],
          status: 'paid',
          force: true,
        }),
      }),
    );

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe(MONEY_PATH_FROZEN_CODE);
    expect(from).not.toHaveBeenCalled();
  });
});

describe('FASE 0.1 — reads / historical untouched', () => {
  let snap: EnvSnapshot;

  beforeEach(() => {
    snap = snapshotEnv();
    process.env.MONEY_PATH_FROZEN = 'true';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    restoreEnv(snap);
  });

  it('Test 5 — isMoneyPathFrozen no altera datos; es solo lectura de config', () => {
    expect(isMoneyPathFrozen()).toBe(true);
    // No side effects on DB — pure function
    expect(typeof isMoneyPathFrozen()).toBe('boolean');
  });

  it('Test 7 — freeze no ejecuta updates sobre tablas money (holds path)', async () => {
    const update = vi.fn();
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          lte: vi.fn(async () => ({ data: [{ id: 'r1', status: 'VALIDATING' }], error: null })),
        })),
      })),
      update,
    }));
    const supabase = { from } as unknown as SupabaseClient;
    await processExpiredRewardHolds(supabase);
    expect(update).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});
