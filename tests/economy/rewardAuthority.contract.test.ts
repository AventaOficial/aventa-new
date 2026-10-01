import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createRewardFromLedgerEntry, cancelReward, reverseReward } from '@/lib/rewards/rewardsEngine';

const LEDGER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const REWARD = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walk(full, out);
    } else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

function rewardStore(opts?: { failAudits?: number; gross?: number; currency?: string }) {
  const rewards = new Map<string, { id: string; ledger_entry_id: string; gross: number; currency: string }>();
  if (opts?.gross != null) {
    rewards.set(REWARD, {
      id: REWARD,
      ledger_entry_id: LEDGER,
      gross: opts.gross,
      currency: opts.currency ?? 'MXN',
    });
  }
  let inserts = 0;
  let updates = 0;
  let deletes = 0;
  let audits = 0;
  let failAudits = opts?.failAudits ?? 0;
  const forbidden = ['payout_intents', 'reward_payouts', 'affiliate_commissions', 'affiliate_conversions'];

  const supabase = {
    from(table: string) {
      if (forbidden.includes(table)) throw new Error(`forbidden write ${table}`);
      const filters: Record<string, string> = {};
      const api = {
        select() {
          return api;
        },
        eq(col: string, val: string) {
          filters[col] = val;
          return api;
        },
        maybeSingle: async () => {
          if (table !== 'creator_rewards') return { data: null, error: null };
          const found = [...rewards.values()].find((row) => row.ledger_entry_id === filters.ledger_entry_id);
          return {
            data: found
              ? { id: found.id, gross_commission_cents: found.gross, currency: found.currency }
              : null,
            error: null,
          };
        },
        insert: async () => {
          if (table === 'creator_rewards') {
            inserts += 1;
            return { error: null };
          }
          if (table === 'reward_audit_log') {
            if (failAudits > 0) {
              failAudits -= 1;
              return { error: { message: 'audit_down' } };
            }
            audits += 1;
            return { error: null };
          }
          return { error: null };
        },
        update() {
          updates += 1;
          return { eq: async () => ({ error: null }) };
        },
        delete() {
          deletes += 1;
          return { eq: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) };
        },
      };
      return api;
    },
  };

  return {
    supabase: supabase as unknown as SupabaseClient,
    rewards,
    counts: () => ({ inserts, updates, deletes, audits, rows: rewards.size }),
  };
}

const prev = { ...process.env };

describe('reward creation authority', () => {
  beforeEach(() => {
    process.env = { ...prev, NODE_ENV: 'test', REWARDS_PROGRAM_ACTIVE: 'true' };
    delete process.env.VERCEL_ENV;
    process.env.MONEY_PATH_FROZEN = 'false';
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it('blocks a new reward while MONEY_PATH_FROZEN', async () => {
    process.env.MONEY_PATH_FROZEN = 'true';
    const store = rewardStore();
    const result = await createRewardFromLedgerEntry(store.supabase, {
      id: LEDGER,
      network: 'amazon',
      amount_cents: 1000,
      status: 'accrued',
    });
    expect(result.created).toBe(false);
    if (!result.created) expect(result.reason).toBe('money_path_frozen');
    expect(store.counts().inserts).toBe(0);
  });

  it('keeps an existing reward when the mandatory audit fails', async () => {
    const store = rewardStore({ failAudits: 1, gross: 1000 });
    const result = await createRewardFromLedgerEntry(store.supabase, {
      id: LEDGER,
      network: 'amazon',
      amount_cents: 1000,
      status: 'accrued',
    });
    expect(result.created).toBe(false);
    if (!result.created) {
      expect(result.reason).toBe('audit_append_failed');
      expect(result.rewardId).toBe(REWARD);
    }
    expect(store.counts()).toMatchObject({ inserts: 0, deletes: 0, rows: 1 });
  });

  it('reuses the same reward and certifies it on retry', async () => {
    const store = rewardStore({ failAudits: 1, gross: 1000 });
    const first = await createRewardFromLedgerEntry(store.supabase, {
      id: LEDGER,
      network: 'amazon',
      amount_cents: 1000,
      status: 'accrued',
    });
    expect(first.created).toBe(false);
    const second = await createRewardFromLedgerEntry(store.supabase, {
      id: LEDGER,
      network: 'amazon',
      amount_cents: 1000,
      status: 'accrued',
    });
    expect(second.created).toBe(false);
    if (!second.created) expect(second.reason).toBe('duplicate_ledger');
    expect(store.counts().inserts).toBe(0);
    expect(store.counts().rows).toBe(1);
    expect(store.counts().audits).toBeGreaterThan(0);
    expect(store.counts().deletes).toBe(0);
  });

  it('refuses to rewrite a reward whose amount does not match the ledger', async () => {
    const store = rewardStore({ gross: 50 });
    const result = await createRewardFromLedgerEntry(store.supabase, {
      id: LEDGER,
      network: 'amazon',
      amount_cents: 1000,
      status: 'accrued',
    });
    expect(result.created).toBe(false);
    if (!result.created) expect(result.reason).toBe('reward_ledger_mismatch');
    expect(store.counts().updates).toBe(0);
    expect(store.counts().inserts).toBe(0);
  });

  it('creates a reward only inside the atomic audit function', () => {
    const roots = [join(process.cwd(), 'lib'), join(process.cwd(), 'app')];
    const hits: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        const src = readFileSync(file, 'utf8');
        if (/from\(['"]creator_rewards['"]\)[\s\S]{0,80}\.insert\(/.test(src)) hits.push(file);
      }
    }
    expect(hits).toEqual([]);
    const engine = readFileSync(join(process.cwd(), 'lib/rewards/rewardsEngine.ts'), 'utf8');
    const sql = readFileSync(
      join(process.cwd(), 'docs/supabase-migrations/20260930_reward_creation_atomic.sql'),
      'utf8',
    );
    expect(engine).toMatch(/create_creator_reward_with_creation_audit/);
    expect(engine).not.toMatch(/from\(['"]creator_rewards['"]\)[\s\S]{0,80}\.insert\(/);
    expect(sql).toMatch(/INSERT INTO public\.creator_rewards/);
    expect(sql).toMatch(/'reward_created'/);
    expect(sql).toMatch(/'reward_validating'/);
    expect(sql).toMatch(/RAISE EXCEPTION 'reward_creation_audit_failed'/);
    const bridge = readFileSync(
      join(process.cwd(), 'lib/rewards/ledgerRewardBridge/processLedgerRewardAttempt.ts'),
      'utf8',
    );
    expect(engine).not.toMatch(/payout_intents|reward_payouts|affiliate_commissions|affiliate_conversions/);
    expect(bridge).not.toMatch(/\.insert\(/);
    expect(bridge).toMatch(/tryCreateRewardFromLedgerRow/);
  });

  it('rejects a non-positive amount before any reward write', async () => {
    const store = rewardStore();
    const result = await createRewardFromLedgerEntry(store.supabase, {
      id: LEDGER,
      network: 'amazon',
      amount_cents: -1000,
      status: 'accrued',
    });
    expect(result).toEqual({ created: false, reason: 'zero_amount' });
    expect(store.counts().inserts).toBe(0);
  });

  it('rejects a void ledger without creating a reward', async () => {
    const store = rewardStore();
    const result = await createRewardFromLedgerEntry(store.supabase, {
      id: LEDGER,
      network: 'amazon',
      amount_cents: 1000,
      status: 'void',
    });
    expect(result.created).toBe(false);
    if (!result.created) expect(result.reason).toBe('commission_void');
    expect(store.counts().inserts).toBe(0);
  });

  it('rejects a new reward when the rewards program is inactive', async () => {
    process.env.REWARDS_PROGRAM_ACTIVE = 'false';
    const store = rewardStore();
    const result = await createRewardFromLedgerEntry(store.supabase, {
      id: LEDGER,
      network: 'amazon',
      amount_cents: 1000,
      status: 'accrued',
    });
    expect(result.created).toBe(false);
    if (!result.created) expect(result.reason).toBe('program_inactive');
    expect(store.counts().inserts).toBe(0);
  });

  it('refuses a reward whose currency is not MXN', async () => {
    const store = rewardStore({ gross: 1000, currency: 'USD' });
    const result = await createRewardFromLedgerEntry(store.supabase, {
      id: LEDGER,
      network: 'amazon',
      amount_cents: 1000,
      status: 'accrued',
    });
    expect(result.created).toBe(false);
    if (!result.created) expect(result.reason).toBe('reward_ledger_mismatch');
    expect(store.counts()).toMatchObject({ inserts: 0, updates: 0, deletes: 0, rows: 1 });
  });

  it('does not mutate a live reward while MONEY_PATH_FROZEN', async () => {
    process.env.MONEY_PATH_FROZEN = 'true';
    let updates = 0;
    const supabase = {
      from(table: string) {
        if (table === 'creator_rewards') {
          const api = {
            select() {
              return api;
            },
            eq() {
              return api;
            },
            maybeSingle: async () => ({ data: { status: 'VALIDATING' }, error: null }),
            update() {
              updates += 1;
              return api;
            },
          };
          return api;
        }
        throw new Error(`unexpected ${table}`);
      },
    } as unknown as SupabaseClient;
    const cancelled = await cancelReward(supabase, REWARD, 'staff', 'frozen');
    const reversed = await reverseReward(supabase, REWARD, 'staff', 'frozen');
    expect(cancelled).toMatchObject({ ok: false, reason: 'money_path_frozen' });
    expect(reversed).toMatchObject({ ok: false, reason: 'money_path_frozen' });
    expect(updates).toBe(0);
  });
});
