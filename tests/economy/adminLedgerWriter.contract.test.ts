import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/requireAdmin', () => ({
  requireUsersLogs: vi.fn(async () => ({ user: { id: 'admin-1' }, role: 'admin' })),
}));

vi.mock('@/lib/staff/requireFinanceStaff', () => ({
  requireFinanceRead: vi.fn(async () => ({ user: { id: 'finance-1' }, role: 'admin' })),
  requireFinanceWrite: vi.fn(async () => ({ user: { id: 'finance-1' }, role: 'admin' })),
  canFinanceWrite: vi.fn(() => true),
}));

vi.mock('@/lib/rewards/ledgerReconciliation', () => ({
  reconcileRewardsForLedgerStatus: vi.fn(async (_sb: unknown, id: string) => ({
    ledgerEntryId: id,
    action: 'none',
  })),
}));

type LedgerRow = {
  id: string;
  network: string;
  external_ref: string;
  status: string;
  amount_cents: number;
  currency: string;
};

function ledgerClient(opts?: { failAudits?: number; uniqueOnInsert?: boolean }) {
  const rows = new Map<string, LedgerRow>();
  const events: Array<Record<string, unknown>> = [];
  let failAudits = opts?.failAudits ?? 0;
  let seq = 0;
  let inserts = 0;
  let updates = 0;
  let deletes = 0;
  const forbidden = ['creator_rewards', 'payout_intents', 'reward_payouts'];

  const client = {
    from(table: string) {
      if (forbidden.includes(table)) {
        throw new Error(`forbidden write ${table}`);
      }
      if (table === 'affiliate_economic_events') {
        return {
          insert: vi.fn(async (row: Record<string, unknown>) => {
            if (failAudits > 0) {
              failAudits -= 1;
              return { error: { message: 'audit_down' } };
            }
            events.push(row);
            return { error: null };
          }),
        };
      }
      if (table !== 'affiliate_ledger_entries') {
        return {
          insert: vi.fn(() => {
            throw new Error(`unexpected table ${table}`);
          }),
        };
      }
      return {
        insert(row: Record<string, unknown>) {
          return {
            select() {
              return {
                single: async () => {
                  inserts += 1;
                  const key = `${row.network}|${row.external_ref}`;
                  const duplicate = [...rows.values()].some(
                    (item) => `${item.network}|${item.external_ref}` === key,
                  );
                  if (opts?.uniqueOnInsert || duplicate) {
                    return { data: null, error: { code: '23505', message: 'duplicate' } };
                  }
                  seq += 1;
                  const stored: LedgerRow = {
                    id: `ledger-${seq}`,
                    network: String(row.network),
                    external_ref: String(row.external_ref),
                    status: String(row.status),
                    amount_cents: Number(row.amount_cents),
                    currency: String(row.currency),
                  };
                  rows.set(stored.id, stored);
                  return { data: { ...row, ...stored }, error: null };
                },
              };
            },
          };
        },
        select() {
          const filters: Record<string, string> = {};
          const api = {
            eq(col: string, val: string) {
              filters[col] = val;
              return api;
            },
            maybeSingle: async () => {
              const found = [...rows.values()].find((item) =>
                Object.entries(filters).every(
                  ([col, val]) => String(item[col as keyof LedgerRow]) === val,
                ),
              );
              return { data: found ?? null, error: null };
            },
          };
          return api;
        },
        update(patch: Record<string, unknown>) {
          updates += 1;
          return {
            eq: async (_col: string, id: string) => {
              const row = rows.get(id);
              if (row && patch.status) row.status = String(patch.status);
              return { error: null };
            },
          };
        },
        delete() {
          deletes += 1;
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };

  return {
    client,
    rows,
    events,
    counts: () => ({ inserts, updates, deletes }),
  };
}

let current: ReturnType<typeof ledgerClient>;

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => current.client,
}));

import { PATCH, POST } from '@/app/api/admin/affiliate-ledger/route';
import { PATCH as staffPatch } from '@/app/api/staff/finance/ledger/route';

const prevEnv = { ...process.env };

function postBody(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    network: 'amazon',
    amount_cents: 1000,
    currency: 'MXN',
    status: 'accrued',
    source: 'manual',
    external_ref: 'AMZ-1',
    ...extra,
  });
}

function request(method: string, body?: string) {
  return new Request('https://aventaofertas.com/api/admin/affiliate-ledger', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
    body,
  });
}

describe('admin ledger writer', () => {
  beforeEach(() => {
    process.env = { ...prevEnv, NODE_ENV: 'test' };
    delete process.env.VERCEL_ENV;
    process.env.MONEY_PATH_FROZEN = 'false';
    current = ledgerClient();
  });

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it('POST with MONEY_PATH_FROZEN inserts nothing', async () => {
    process.env.MONEY_PATH_FROZEN = 'true';
    const res = await POST(request('POST', postBody()));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('money_path_frozen');
    expect(current.counts().inserts).toBe(0);
    expect(current.rows.size).toBe(0);
  });

  it('POST audit failure keeps the ledger row and does not delete it', async () => {
    current = ledgerClient({ failAudits: 1 });
    const res = await POST(request('POST', postBody()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('audit_append_failed');
    expect(body.ok).toBeUndefined();
    expect(current.rows.size).toBe(1);
    expect(current.counts().deletes).toBe(0);
    expect(current.events).toHaveLength(0);
  });

  it('POST success requires the audit row', async () => {
    const res = await POST(request('POST', postBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(current.rows.size).toBe(1);
    expect(current.events).toHaveLength(1);
    expect(current.events[0]?.event_type).toBe('network_report_evidence_ingested');
    expect(current.counts().deletes).toBe(0);
  });

  it('duplicate external_ref does not create a second ledger row', async () => {
    const first = await POST(request('POST', postBody()));
    expect(first.status).toBe(200);
    const second = await POST(request('POST', postBody()));
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.ok).toBeUndefined();
    expect(current.rows.size).toBe(1);
    expect(current.counts().inserts).toBe(2);
    expect(current.counts().deletes).toBe(0);
  });

  it('retry after audit failure reuses the same row and certifies it', async () => {
    current = ledgerClient({ failAudits: 1 });
    const first = await POST(request('POST', postBody()));
    expect(first.status).toBe(500);
    const second = await POST(request('POST', postBody()));
    expect(second.status).toBe(409);
    expect(current.rows.size).toBe(1);
    expect(current.events).toHaveLength(1);
    expect(current.counts().deletes).toBe(0);
  });

  it('POST cannot mint a settlement namespace row', async () => {
    for (const external_ref of [
      'settlement:commission:abc',
      'settlement:reversal:commission:abc',
      'settlement:other',
    ]) {
      const res = await POST(request('POST', postBody({ external_ref })));
      expect(res.status).toBe(400);
    }
    expect(current.rows.size).toBe(0);
    expect(current.counts().inserts).toBe(0);
  });

  it('POST paid is rejected', async () => {
    const res = await POST(request('POST', postBody({ status: 'paid' })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('status_not_allowed');
    expect(current.counts().inserts).toBe(0);
  });

  it('PATCH with MONEY_PATH_FROZEN updates nothing', async () => {
    current.rows.set('ledger-1', {
      id: 'ledger-1',
      network: 'amazon',
      external_ref: 'AMZ-1',
      status: 'accrued',
      amount_cents: 1000,
      currency: 'MXN',
    });
    process.env.MONEY_PATH_FROZEN = 'true';
    const res = await PATCH(request('PATCH', JSON.stringify({ id: 'ledger-1', status: 'void' })));
    expect(res.status).toBe(503);
    expect(current.counts().updates).toBe(0);
    expect(current.rows.get('ledger-1')?.status).toBe('accrued');
  });

  it('PATCH paid and reversed are rejected', async () => {
    current.rows.set('ledger-1', {
      id: 'ledger-1',
      network: 'amazon',
      external_ref: 'AMZ-1',
      status: 'accrued',
      amount_cents: 1000,
      currency: 'MXN',
    });
    const paid = await PATCH(request('PATCH', JSON.stringify({ id: 'ledger-1', status: 'paid' })));
    const reversed = await PATCH(
      request('PATCH', JSON.stringify({ id: 'ledger-1', status: 'reversed' })),
    );
    expect(paid.status).toBe(400);
    expect(reversed.status).toBe(400);
    expect(current.counts().updates).toBe(0);
    expect(current.rows.get('ledger-1')?.status).toBe('accrued');
  });

  it('PATCH refuses a canonical settlement row', async () => {
    current.rows.set('ledger-s', {
      id: 'ledger-s',
      network: 'amazon',
      external_ref: 'settlement:commission:abc',
      status: 'accrued',
      amount_cents: 1000,
      currency: 'MXN',
    });
    const res = await PATCH(request('PATCH', JSON.stringify({ id: 'ledger-s', status: 'void' })));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('canonical_settlement_immutable');
    expect(current.counts().updates).toBe(0);
    expect(current.rows.get('ledger-s')?.status).toBe('accrued');
  });

  it('PATCH voids a non-canonical evidence row', async () => {
    current.rows.set('ledger-1', {
      id: 'ledger-1',
      network: 'amazon',
      external_ref: 'AMZ-1',
      status: 'accrued',
      amount_cents: 1000,
      currency: 'MXN',
    });
    const res = await PATCH(request('PATCH', JSON.stringify({ id: 'ledger-1', status: 'void' })));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(current.rows.get('ledger-1')?.status).toBe('void');
    expect(current.counts().updates).toBe(1);
  });

  it('route source does not delete ledger rows or write rewards and payouts', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/api/admin/affiliate-ledger/route.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.from\(['"]creator_rewards['"]\)/);
    expect(src).not.toMatch(/\.from\(['"]payout_intents['"]\)/);
    expect(src).not.toMatch(/\.from\(['"]reward_payouts['"]\)/);
  });
});

describe('staff ledger writer', () => {
  beforeEach(() => {
    process.env = { ...prevEnv, NODE_ENV: 'test' };
    delete process.env.VERCEL_ENV;
    process.env.MONEY_PATH_FROZEN = 'false';
    current = ledgerClient();
  });

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it('PATCH with MONEY_PATH_FROZEN updates nothing', async () => {
    current.rows.set('ledger-1', {
      id: 'ledger-1',
      network: 'amazon',
      external_ref: 'AMZ-1',
      status: 'accrued',
      amount_cents: 1000,
      currency: 'MXN',
    });
    process.env.MONEY_PATH_FROZEN = 'true';
    const res = await staffPatch(
      request('PATCH', JSON.stringify({ id: 'ledger-1', status: 'void' })),
    );
    expect(res.status).toBe(503);
    expect(current.counts().updates).toBe(0);
  });

  it('PATCH refuses paid, reversed, and canonical settlement rows', async () => {
    current.rows.set('ledger-s', {
      id: 'ledger-s',
      network: 'amazon',
      external_ref: 'settlement:reversal:commission:abc',
      status: 'accrued',
      amount_cents: 1000,
      currency: 'MXN',
    });
    const paid = await staffPatch(request('PATCH', JSON.stringify({ id: 'ledger-s', status: 'paid' })));
    const reversed = await staffPatch(
      request('PATCH', JSON.stringify({ id: 'ledger-s', status: 'reversed' })),
    );
    expect(paid.status).toBe(400);
    expect(reversed.status).toBe(400);
    const canonical = await staffPatch(
      request('PATCH', JSON.stringify({ id: 'ledger-s', status: 'void' })),
    );
    expect(canonical.status).toBe(409);
    expect(current.counts().updates).toBe(0);
    expect(current.rows.get('ledger-s')?.status).toBe('accrued');
  });
});
