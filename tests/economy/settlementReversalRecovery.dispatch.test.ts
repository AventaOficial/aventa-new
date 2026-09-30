/**
 * Durable settlement reversal recovery — dispatcher and cron delivery.
 * The mock store follows the live checks: commission status includes reversed,
 * ledger status is accrued (not reversed), and (network, external_ref) is unique.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSettlementExternalRef } from '@/lib/economy/settlement/externalRef';
import { buildSettlementReversalExternalRef } from '@/lib/economy/settlement/reversalContract';
import {
  dispatchSettlementReversalRecovery,
  SETTLEMENT_REVERSAL_RECOVERY_BATCH_LIMIT,
} from '@/lib/economy/settlement/reversalRecoveryDispatch';

vi.mock('@/lib/server/moneyPathFreeze', () => ({
  isMoneyPathFrozen: vi.fn(() => false),
}));

import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';

type CommissionRow = {
  id: string;
  status: string;
  ledger_entry_id: string | null;
  network: string;
  updated_at: string;
};

type LedgerRow = {
  id: string;
  network: string;
  amount_cents: number;
  currency: string;
  status: string;
  external_ref: string;
  meta: Record<string, unknown>;
  source?: string;
  period_start?: string | null;
  created_at?: string;
  notes?: string;
};

type Filter =
  | { op: 'eq'; col: string; val: unknown }
  | { op: 'in'; col: string; vals: unknown[] }
  | { op: 'not'; col: string; kind: string; val: unknown };

function makeStore(opts?: { auditFailures?: number }) {
  const commissions: CommissionRow[] = [];
  const ledgerById = new Map<string, LedgerRow>();
  const ledgerByExternal = new Map<string, LedgerRow>();
  const events: Record<string, unknown>[] = [];
  let insertCount = 0;
  let updateCount = 0;
  let fromCalls = 0;
  let auditFailures = opts?.auditFailures ?? 0;
  const hiddenOnIdLookup = new Set<string>();

  function matches(row: Record<string, unknown>, filters: Filter[]): boolean {
    return filters.every((filter) => {
      const value = row[filter.col];
      if (filter.op === 'eq') return value === filter.val;
      if (filter.op === 'in') return filter.vals.map(String).includes(String(value ?? ''));
      if (filter.op === 'not' && filter.kind === 'is' && filter.val === null) {
        return value != null && String(value).trim() !== '';
      }
      return true;
    });
  }

  function rowsFor(table: string): Record<string, unknown>[] {
    if (table === 'affiliate_commissions') return commissions as unknown as Record<string, unknown>[];
    if (table === 'affiliate_ledger_entries') {
      return [...ledgerById.values()] as unknown as Record<string, unknown>[];
    }
    if (table === 'affiliate_economic_events') return events;
    throw new Error(`unexpected table ${table}`);
  }

  function query(table: string) {
    const filters: Filter[] = [];
    let limitN = 1000;
    let orderCol: { col: string; ascending: boolean } | null = null;
    const run = () => {
      let rows = rowsFor(table).filter((row) => matches(row, filters));
      if (orderCol) {
        const { col, ascending } = orderCol;
        rows = [...rows].sort((a, b) => {
          const left = String(a[col] ?? '');
          const right = String(b[col] ?? '');
          return ascending ? left.localeCompare(right) : right.localeCompare(left);
        });
      }
      return rows.slice(0, limitN);
    };
    const api = {
      select() {
        return api;
      },
      eq(col: string, val: unknown) {
        filters.push({ op: 'eq', col, val });
        return api;
      },
      in(col: string, vals: unknown[]) {
        filters.push({ op: 'in', col, vals });
        return api;
      },
      not(col: string, kind: string, val: unknown) {
        filters.push({ op: 'not', col, kind, val });
        return api;
      },
      order(col: string, opts: { ascending: boolean }) {
        orderCol = { col, ascending: opts.ascending };
        return api;
      },
      limit(n: number) {
        limitN = n;
        return api;
      },
      maybeSingle: async () => {
        const idFilter = filters.find((filter) => filter.op === 'eq' && filter.col === 'id');
        if (
          table === 'affiliate_commissions' &&
          idFilter &&
          idFilter.op === 'eq' &&
          hiddenOnIdLookup.has(String(idFilter.val))
        ) {
          return { data: null, error: null };
        }
        const rows = run();
        return { data: rows[0] ?? null, error: null };
      },
      then(resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve({ data: run(), error: null }).then(resolve, reject);
      },
    };
    return api;
  }

  const supabase = {
    from(table: string) {
      fromCalls += 1;
      if (table === 'affiliate_ledger_entries') {
        return {
          ...query(table),
          insert(row: LedgerRow) {
            const key = `${row.network}|${String(row.external_ref).trim().toLowerCase()}`;
            if (ledgerByExternal.has(key)) {
              return {
                select: () => ({
                  maybeSingle: async () => ({
                    data: null,
                    error: { code: '23505', message: 'duplicate' },
                  }),
                }),
              };
            }
            insertCount += 1;
            const stored = { ...row, id: row.id ?? `rev-${insertCount}` };
            ledgerById.set(stored.id, stored);
            ledgerByExternal.set(key, stored);
            return {
              select: () => ({
                maybeSingle: async () => ({ data: { id: stored.id }, error: null }),
              }),
            };
          },
          update() {
            updateCount += 1;
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === 'affiliate_economic_events') {
        return {
          ...query(table),
          insert: async (row: Record<string, unknown>) => {
            if (auditFailures > 0) {
              auditFailures -= 1;
              return { error: { message: 'audit_down' } };
            }
            events.push(row);
            return { error: null };
          },
        };
      }
      if (table === 'affiliate_commissions') {
        return {
          ...query(table),
          update() {
            updateCount += 1;
            return { eq: () => ({ eq: async () => ({ error: null }) }) };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  return {
    supabase,
    commissions,
    ledgerById,
    ledgerByExternal,
    events,
    hiddenOnIdLookup,
    getInsertCount: () => insertCount,
    getUpdateCount: () => updateCount,
    getFromCalls: () => fromCalls,
    addCommission(row: CommissionRow) {
      commissions.push(row);
    },
    addOriginal(commissionId: string, amountCents: number, network = 'mercadolibre') {
      const row: LedgerRow = {
        id: `ledger-${commissionId}`,
        network,
        amount_cents: amountCents,
        currency: 'MXN',
        status: 'accrued',
        external_ref: buildSettlementExternalRef(commissionId),
        meta: { settlement: { commissionId } },
        source: 'api',
        period_start: '2026-09-01',
        created_at: '2026-09-15T18:00:00.000Z',
      };
      ledgerById.set(row.id, row);
      ledgerByExternal.set(`${network}|${row.external_ref}`, row);
      return row;
    },
  };
}

function reversedCommission(
  id: string,
  ledgerId: string | null,
  updatedAt: string,
  network = 'mercadolibre',
): CommissionRow {
  return {
    id,
    status: 'reversed',
    ledger_entry_id: ledgerId,
    network,
    updated_at: updatedAt,
  };
}

describe('dispatchSettlementReversalRecovery', () => {
  beforeEach(() => {
    vi.mocked(isMoneyPathFrozen).mockReturnValue(false);
  });

  it('recovers a reversed commission whose compensating row is missing', async () => {
    const store = makeStore();
    const original = store.addOriginal('c-missing', 10000);
    store.addCommission(reversedCommission('c-missing', original.id, '2026-10-02T00:00:00.000Z'));
    const before = structuredClone(store.ledgerById.get(original.id));

    const result = await dispatchSettlementReversalRecovery(store.supabase as never);

    expect(result.ok).toBe(true);
    expect(result.recovered).toBe(1);
    expect(result.failed).toBe(0);
    expect(store.getInsertCount()).toBe(1);
    const rev = store.ledgerByExternal.get(
      `mercadolibre|${buildSettlementReversalExternalRef('c-missing')}`,
    );
    expect(rev).toMatchObject({
      amount_cents: -10000,
      status: 'accrued',
      source: 'api',
    });
    expect(store.ledgerById.get(original.id)).toEqual(before);
    expect(store.getUpdateCount()).toBe(0);
  });

  it('does not insert a second row when the reversal and its audit already exist', async () => {
    const store = makeStore();
    const original = store.addOriginal('c-done', 100);
    store.addCommission(reversedCommission('c-done', original.id, '2026-10-02T00:00:00.000Z'));
    const ref = buildSettlementReversalExternalRef('c-done');
    const existing: LedgerRow = {
      id: 'rev-existing',
      network: 'mercadolibre',
      amount_cents: -100,
      currency: 'MXN',
      status: 'accrued',
      external_ref: ref,
      meta: {},
      source: 'api',
    };
    store.ledgerById.set(existing.id, existing);
    store.ledgerByExternal.set(`mercadolibre|${ref}`, existing);
    store.events.push({
      entity_type: 'settlement',
      entity_id: 'c-done',
      event_type: 'settlement_reversed',
    });

    const result = await dispatchSettlementReversalRecovery(store.supabase as never);

    expect(result.skipped).toBe(1);
    expect(result.eligible).toBe(0);
    expect(result.recovered).toBe(0);
    expect(store.getInsertCount()).toBe(0);
  });

  it('ignores approved, pending, and reversed commissions without a ledger entry', async () => {
    const store = makeStore();
    const missing = store.addOriginal('c-missing', 50);
    store.addCommission({
      id: 'c-approved',
      status: 'approved',
      ledger_entry_id: 'ledger-approved',
      network: 'amazon',
      updated_at: '2026-10-03T00:00:00.000Z',
    });
    store.addCommission({
      id: 'c-pending',
      status: 'pending',
      ledger_entry_id: 'ledger-pending',
      network: 'amazon',
      updated_at: '2026-10-03T00:00:00.000Z',
    });
    store.addCommission(reversedCommission('c-empty', null, '2026-10-03T00:00:00.000Z'));
    store.addCommission(reversedCommission('c-missing', missing.id, '2026-10-01T00:00:00.000Z'));

    const result = await dispatchSettlementReversalRecovery(store.supabase as never);

    expect(result.scanned).toBe(1);
    expect(result.recovered).toBe(1);
    expect(store.ledgerByExternal.has(`amazon|${buildSettlementReversalExternalRef('c-approved')}`)).toBe(
      false,
    );
    expect(store.ledgerByExternal.has(`mercadolibre|${buildSettlementReversalExternalRef('c-empty')}`)).toBe(
      false,
    );
  });

  it('does not crash when nothing is reversed', async () => {
    const store = makeStore();
    const result = await dispatchSettlementReversalRecovery(store.supabase as never);
    expect(result).toMatchObject({
      ok: true,
      scanned: 0,
      eligible: 0,
      recovered: 0,
      failed: 0,
    });
  });

  it('counts commission_not_found when the row disappears before recovery', async () => {
    const store = makeStore();
    const original = store.addOriginal('c-ghost', 10);
    store.addCommission(reversedCommission('c-ghost', original.id, '2026-10-01T00:00:00.000Z'));
    store.hiddenOnIdLookup.add('c-ghost');

    const result = await dispatchSettlementReversalRecovery(store.supabase as never);

    expect(result.failed).toBe(1);
    expect(result.failures[0]).toEqual({ commissionId: 'c-ghost', reason: 'commission_not_found' });
    expect(store.getInsertCount()).toBe(0);
  });

  it('counts reused when the row exists and the audit is still open', async () => {
    const store = makeStore();
    const original = store.addOriginal('c-open', 80);
    store.addCommission(reversedCommission('c-open', original.id, '2026-10-01T00:00:00.000Z'));
    const ref = buildSettlementReversalExternalRef('c-open');
    const existing: LedgerRow = {
      id: 'rev-open',
      network: 'mercadolibre',
      amount_cents: -80,
      currency: 'MXN',
      status: 'accrued',
      external_ref: ref,
      meta: {},
      source: 'api',
    };
    store.ledgerById.set(existing.id, existing);
    store.ledgerByExternal.set(`mercadolibre|${ref}`, existing);

    const result = await dispatchSettlementReversalRecovery(store.supabase as never);

    expect(result.reused).toBe(1);
    expect(result.recovered).toBe(0);
    expect(store.getInsertCount()).toBe(0);
    expect(store.events.some((event) => event.event_type === 'settlement_reversal_reused')).toBe(true);
  });

  it('counts audit_append_failed and lets the next run finish the audit', async () => {
    const store = makeStore({ auditFailures: 1 });
    const original = store.addOriginal('c-audit', 40);
    store.addCommission(reversedCommission('c-audit', original.id, '2026-10-01T00:00:00.000Z'));

    const first = await dispatchSettlementReversalRecovery(store.supabase as never);
    expect(first.failed).toBe(1);
    expect(first.failures[0]?.reason).toBe('audit_append_failed');
    expect(store.getInsertCount()).toBe(1);

    const second = await dispatchSettlementReversalRecovery(store.supabase as never);
    expect(second.reused).toBe(1);
    expect(second.failed).toBe(0);
    expect(store.getInsertCount()).toBe(1);
    expect(store.events.some((event) => event.event_type === 'settlement_reversal_reused')).toBe(true);
  });

  it('counts inconsistent_reversal as failed and does not rewrite the row', async () => {
    const store = makeStore();
    const original = store.addOriginal('c-bad', 100);
    store.addCommission(reversedCommission('c-bad', original.id, '2026-10-01T00:00:00.000Z'));
    const ref = buildSettlementReversalExternalRef('c-bad');
    const existing: LedgerRow = {
      id: 'rev-bad',
      network: 'mercadolibre',
      amount_cents: -1,
      currency: 'MXN',
      status: 'accrued',
      external_ref: ref,
      meta: { keep: true },
      source: 'api',
    };
    store.ledgerById.set(existing.id, existing);
    store.ledgerByExternal.set(`mercadolibre|${ref}`, existing);
    const before = structuredClone(existing);

    const first = await dispatchSettlementReversalRecovery(store.supabase as never);
    expect(first.failed).toBe(1);
    expect(first.failures[0]?.reason).toBe('inconsistent_reversal');
    expect(store.ledgerByExternal.get(`mercadolibre|${ref}`)).toEqual(before);
    expect(store.getInsertCount()).toBe(0);

    const second = await dispatchSettlementReversalRecovery(store.supabase as never);
    expect(second.eligible).toBe(0);
    expect(second.skipped).toBe(1);
    expect(second.failed).toBe(0);
    expect(store.ledgerByExternal.get(`mercadolibre|${ref}`)).toEqual(before);
    expect(
      store.events.filter((event) => event.event_type === 'settlement_reversal_inconsistent'),
    ).toHaveLength(1);
  });

  it('writes nothing when the money path is frozen', async () => {
    vi.mocked(isMoneyPathFrozen).mockReturnValue(true);
    const store = makeStore();
    const original = store.addOriginal('c-frozen', 100);
    store.addCommission(reversedCommission('c-frozen', original.id, '2026-10-01T00:00:00.000Z'));

    const result = await dispatchSettlementReversalRecovery(store.supabase as never);

    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('money_path_frozen');
    expect(result.scanned).toBe(0);
    expect(store.getInsertCount()).toBe(0);
    expect(store.getFromCalls()).toBe(0);
    expect(store.events).toHaveLength(0);
  });

  it('never processes more than the batch limit', async () => {
    const store = makeStore();
    for (let i = 0; i < 5; i += 1) {
      const id = `c-${i}`;
      const original = store.addOriginal(id, 10);
      store.addCommission(reversedCommission(id, original.id, `2026-10-0${i + 1}T00:00:00.000Z`));
    }

    const result = await dispatchSettlementReversalRecovery(store.supabase as never, { limit: 2 });

    expect(result.eligible).toBe(2);
    expect(result.recovered).toBe(2);
    expect(result.deferred).toBe(3);
    expect(store.getInsertCount()).toBe(2);
    expect(2).toBeLessThanOrEqual(SETTLEMENT_REVERSAL_RECOVERY_BATCH_LIMIT);
  });

  it('clamps an oversized limit to the batch constant', async () => {
    const store = makeStore();
    for (let i = 0; i < SETTLEMENT_REVERSAL_RECOVERY_BATCH_LIMIT + 3; i += 1) {
      const id = `cap-${i}`;
      const original = store.addOriginal(id, 5);
      store.addCommission(
        reversedCommission(id, original.id, `2026-09-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`),
      );
    }

    const result = await dispatchSettlementReversalRecovery(store.supabase as never, {
      limit: 1_000_000,
    });

    expect(result.eligible).toBe(SETTLEMENT_REVERSAL_RECOVERY_BATCH_LIMIT);
    expect(result.recovered).toBe(SETTLEMENT_REVERSAL_RECOVERY_BATCH_LIMIT);
    expect(store.getInsertCount()).toBe(SETTLEMENT_REVERSAL_RECOVERY_BATCH_LIMIT);
  });

  it('two overlapping runs create one compensating row', async () => {
    const store = makeStore();
    const original = store.addOriginal('c-race', 10000);
    store.addCommission(reversedCommission('c-race', original.id, '2026-10-01T00:00:00.000Z'));
    const before = structuredClone(store.ledgerById.get(original.id));

    const [a, b] = await Promise.all([
      dispatchSettlementReversalRecovery(store.supabase as never),
      dispatchSettlementReversalRecovery(store.supabase as never),
    ]);

    expect(a.ok && b.ok).toBe(true);
    expect(store.getInsertCount()).toBe(1);
    expect(a.recovered + b.recovered + a.reused + b.reused).toBe(2);
    expect(store.getUpdateCount()).toBe(0);
    expect(store.ledgerById.get(original.id)).toEqual(before);
    const rev = store.ledgerByExternal.get(
      `mercadolibre|${buildSettlementReversalExternalRef('c-race')}`,
    );
    expect(rev?.amount_cents).toBe(-10000);
    expect(rev?.status).toBe('accrued');
  });

  it('keeps going when one commission fails', async () => {
    const store = makeStore();
    store.addCommission(reversedCommission('c-broken', 'missing-ledger', '2026-10-02T00:00:00.000Z'));
    const original = store.addOriginal('c-ok', 20);
    store.addCommission(reversedCommission('c-ok', original.id, '2026-10-01T00:00:00.000Z'));

    const result = await dispatchSettlementReversalRecovery(store.supabase as never);

    expect(result.failed).toBe(1);
    expect(result.recovered).toBe(1);
    expect(result.failures[0]?.reason).toBe('missing_original_settlement');
    expect(store.getInsertCount()).toBe(1);
  });

  it('only calls recoverSettlementReversal and does not write commissions, rewards, or payouts', () => {
    const dispatcher = readFileSync(
      join(process.cwd(), 'lib/economy/settlement/reversalRecoveryDispatch.ts'),
      'utf8',
    );
    const route = readFileSync(
      join(process.cwd(), 'app/api/cron/settlement-reversal-recovery/route.ts'),
      'utf8',
    );
    expect(dispatcher).toContain('recoverSettlementReversal(');
    expect(dispatcher).not.toContain('executeSettlementReversal');
    expect(dispatcher).not.toContain('.insert(');
    expect(dispatcher).not.toContain('.update(');
    expect(dispatcher).not.toContain('creator_rewards');
    expect(dispatcher).not.toContain('payout_intents');
    expect(route).toContain('requireCronSecret');
    expect(route).toContain('dispatchSettlementReversalRecovery');
    expect(route).not.toContain('creator_rewards');
    expect(route).not.toContain('payout_intents');
    expect(route).not.toContain('.insert(');
    expect(route).not.toContain('.update(');
  });
});
