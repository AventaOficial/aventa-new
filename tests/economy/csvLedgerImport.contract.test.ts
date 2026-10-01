import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/requireAdmin', () => ({
  requireUsersLogs: vi.fn(async () => ({ user: { id: 'admin-1' }, role: 'admin' })),
}));

type LedgerRow = {
  id: string;
  network: string;
  external_ref: string;
  status: string;
  amount_cents: number;
};

function ledgerClient(opts?: { failAudits?: number }) {
  const rows = new Map<string, LedgerRow>();
  const events: Array<Record<string, unknown>> = [];
  let failAudits = opts?.failAudits ?? 0;
  let seq = 0;
  let inserts = 0;
  let updates = 0;
  let deletes = 0;
  const forbidden = ['creator_rewards', 'payout_intents', 'reward_payouts'];

  function keyOf(row: { network?: unknown; external_ref?: unknown }) {
    return `${row.network}|${row.external_ref}`;
  }

  function storeOne(row: Record<string, unknown>): { data: LedgerRow | null; error: { code?: string; message: string } | null } {
    const key = keyOf(row);
    if ([...rows.values()].some((item) => keyOf(item) === key)) {
      return { data: null, error: { code: '23505', message: 'duplicate' } };
    }
    seq += 1;
    inserts += 1;
    const stored: LedgerRow = {
      id: `ledger-${seq}`,
      network: String(row.network),
      external_ref: String(row.external_ref),
      status: String(row.status),
      amount_cents: Number(row.amount_cents),
    };
    rows.set(stored.id, stored);
    return { data: stored, error: null };
  }

  const client = {
    from(table: string) {
      if (forbidden.includes(table)) throw new Error(`forbidden write ${table}`);
      if (table === 'profiles') {
        return {
          select: () => ({
            or: async () => ({ data: [], error: null }),
          }),
        };
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
        throw new Error(`unexpected table ${table}`);
      }
      return {
        insert(rowOrChunk: Record<string, unknown> | Record<string, unknown>[]) {
          return {
            select() {
              const batch = Array.isArray(rowOrChunk) ? rowOrChunk : [rowOrChunk];
              const seen = new Set<string>();
              const conflict = batch.some((row) => {
                const key = keyOf(row);
                const dup = seen.has(key) || [...rows.values()].some((item) => keyOf(item) === key);
                seen.add(key);
                return dup;
              });
              const result = conflict
                ? { data: null, error: { code: '23505', message: 'duplicate' } }
                : {
                    data: batch.map((row) => storeOne(row).data),
                    error: null,
                  };
              const pending = Promise.resolve(result);
              return Object.assign(pending, {
                single: async () => {
                  const one = storeOne(batch[0]);
                  return { data: one.data, error: one.error };
                },
              });
            },
          };
        },
        select() {
          const filters: Record<string, string> = {};
          const api = {
            eq(col: string, val: string) {
              filters[col] = String(val);
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
        update() {
          updates += 1;
          return { eq: async () => ({ error: null }) };
        },
        delete() {
          deletes += 1;
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };

  return { client, rows, events, counts: () => ({ inserts, updates, deletes }) };
}

let current: ReturnType<typeof ledgerClient>;

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => current.client,
}));

import { POST } from '@/app/api/admin/affiliate-ledger/import-csv/route';

const prevEnv = { ...process.env };

function csvBody(extra: Record<string, unknown> = {}, ref = 'AMZ-1') {
  return JSON.stringify({
    csv: `amount,external_ref\n12.50,${ref}`,
    network: 'amazon',
    currency: 'MXN',
    amount_unit: 'major',
    ...extra,
  });
}

function request(body: string) {
  return new Request('https://aventaofertas.com/api/admin/affiliate-ledger/import-csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
    body,
  });
}

describe('csv ledger import writer', () => {
  beforeEach(() => {
    process.env = { ...prevEnv, NODE_ENV: 'test' };
    delete process.env.VERCEL_ENV;
    process.env.MONEY_PATH_FROZEN = 'false';
    current = ledgerClient();
  });

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it('blocks import while MONEY_PATH_FROZEN', async () => {
    process.env.MONEY_PATH_FROZEN = 'true';
    const res = await POST(request(csvBody()));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('money_path_frozen');
    expect(current.counts()).toEqual({ inserts: 0, updates: 0, deletes: 0 });
    expect(current.rows.size).toBe(0);
  });

  it('rejects paid and reversed with zero writes', async () => {
    const paid = await POST(request(csvBody({ status: 'paid' })));
    const reversed = await POST(request(csvBody({ status: 'reversed' })));
    expect(paid.status).toBe(400);
    expect(reversed.status).toBe(400);
    expect((await paid.json()).error).toBe('status_not_allowed');
    expect((await reversed.json()).error).toBe('status_not_allowed');
    expect(current.counts().inserts).toBe(0);
    expect(current.counts().updates).toBe(0);
    expect(current.counts().deletes).toBe(0);
  });

  it('rejects every settlement namespace ref', async () => {
    for (const ref of [
      'settlement:commission:abc',
      'settlement:reversal:commission:abc',
      'settlement:anything-else',
      'SETTLEMENT:OTHER',
    ]) {
      const res = await POST(request(csvBody({}, ref)));
      expect(res.status).toBe(400);
    }
    expect(current.rows.size).toBe(0);
    expect(current.counts().inserts).toBe(0);
  });

  it('keeps the ledger row when mandatory audit fails', async () => {
    current = ledgerClient({ failAudits: 1 });
    const res = await POST(request(csvBody()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('audit_append_failed');
    expect(body.ok).toBeUndefined();
    expect(current.rows.size).toBe(1);
    expect(current.counts().deletes).toBe(0);
    expect(current.counts().updates).toBe(0);
    expect(current.events).toHaveLength(0);
  });

  it('retries a failed audit without a second ledger row', async () => {
    current = ledgerClient({ failAudits: 1 });
    const first = await POST(request(csvBody()));
    expect(first.status).toBe(500);
    const second = await POST(request(csvBody()));
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body.ok).toBe(true);
    expect(body.duplicates).toBe(1);
    expect(body.inserted).toBe(0);
    expect(current.rows.size).toBe(1);
    expect(current.events).toHaveLength(1);
    expect(current.counts().deletes).toBe(0);
    expect(current.counts().updates).toBe(0);
  });

  it('does not create a second economic fact for the same external ref', async () => {
    const first = await POST(request(csvBody()));
    expect(first.status).toBe(200);
    const second = await POST(request(csvBody()));
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body.duplicates).toBe(1);
    expect(body.inserted).toBe(0);
    expect(current.rows.size).toBe(1);
    expect(current.counts().deletes).toBe(0);
  });

  it('imports a valid accrued row only after the audit succeeds', async () => {
    const res = await POST(request(csvBody({ status: 'accrued' })));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.inserted).toBe(1);
    expect(body.rewards_created).toBe(0);
    expect(current.rows.size).toBe(1);
    expect(current.rows.get('ledger-1')?.status).toBe('accrued');
    expect(current.events).toHaveLength(1);
    expect(current.events[0]?.event_type).toBe('network_report_evidence_ingested');
  });

  it('route source does not update, delete, or write rewards and payouts', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/api/admin/affiliate-ledger/import-csv/route.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.from\(['"]creator_rewards['"]\)/);
    expect(src).not.toMatch(/\.from\(['"]payout_intents['"]\)/);
    expect(src).not.toMatch(/\.from\(['"]reward_payouts['"]\)/);
  });
});
