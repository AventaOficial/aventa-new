/**
 * Settlement reversal — compensating ledger movement tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSettlementReversalContract,
  buildSettlementReversalExternalRef,
  executeSettlementReversal,
} from '@/lib/economy/settlement/reversalContract';
import { buildSettlementExternalRef } from '@/lib/economy/settlement/externalRef';

vi.mock('@/lib/server/moneyPathFreeze', () => ({
  isMoneyPathFrozen: vi.fn(() => false),
}));

import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';

type LedgerRow = {
  id: string;
  network: string;
  amount_cents: number;
  currency: string;
  status: string;
  external_ref: string | null;
  meta: Record<string, unknown> | null;
};

function makeLedgerStore(opts?: {
  original?: LedgerRow;
  reversals?: Map<string, LedgerRow>;
  auditFail?: boolean;
}) {
  const original =
    opts?.original ??
    ({
      id: 'ledger-orig',
      network: 'mercadolibre',
      amount_cents: 100,
      currency: 'MXN',
      status: 'accrued',
      external_ref: buildSettlementExternalRef('comm-1'),
      meta: {},
    } satisfies LedgerRow);
  const byExternal = new Map<string, LedgerRow>();
  byExternal.set(`${original.network}|${original.external_ref}`, original);
  for (const [k, v] of opts?.reversals ?? []) {
    byExternal.set(k, v);
  }
  const byId = new Map<string, LedgerRow>([[original.id, original]]);
  const events: unknown[] = [];
  let insertCount = 0;

  const supabase = {
    from(table: string) {
      if (table === 'affiliate_economic_events') {
        return {
          insert: async (row: unknown) => {
            if (opts?.auditFail) return { error: { message: 'audit_down' } };
            events.push(row);
            return { error: null };
          },
        };
      }
      if (table !== 'affiliate_ledger_entries') {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        select(_cols: string) {
          return {
            eq(col: string, val: string) {
              if (col === 'id') {
                return {
                  maybeSingle: async () => ({
                    data: byId.get(val) ?? null,
                    error: null,
                  }),
                };
              }
              // chain network + external_ref
              const network = val;
              return {
                eq(col2: string, val2: string) {
                  return {
                    maybeSingle: async () => {
                      const key = `${network}|${val2}`;
                      return { data: byExternal.get(key) ?? null, error: null };
                    },
                  };
                },
              };
            },
          };
        },
        insert(row: LedgerRow & { notes?: string; source?: string }) {
          insertCount += 1;
          const key = `${row.network}|${row.external_ref}`;
          if (byExternal.has(key)) {
            return {
              select: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: { code: '23505', message: 'duplicate' },
                }),
              }),
            };
          }
          const id = `rev-${insertCount}`;
          const stored = { ...row, id };
          byExternal.set(key, stored);
          byId.set(id, stored);
          return {
            select: () => ({
              maybeSingle: async () => ({ data: { id }, error: null }),
            }),
          };
        },
        update() {
          return {
            eq: async () => ({ error: null }),
          };
        },
      };
    },
  };

  return { supabase, byExternal, byId, events, getInsertCount: () => insertCount };
}

describe('executeSettlementReversal compensating movement', () => {
  beforeEach(() => {
    vi.mocked(isMoneyPathFrozen).mockReturnValue(false);
  });

  it('writes compensating -100 for original +100 (net 0)', async () => {
    const { supabase, byExternal } = makeLedgerStore();
    const result = await executeSettlementReversal(supabase as never, {
      commissionId: 'comm-1',
      ledgerEntryId: 'ledger-orig',
    });
    expect(result.ok).toBe(true);
    expect(result.reused).toBe(false);
    expect(result.contract.moneyMovement).toBe('compensating_ledger_entry');
    expect(result.contract.amountCents).toBe(-100);
    const revRef = buildSettlementReversalExternalRef('comm-1');
    const rev = byExternal.get(`mercadolibre|${revRef}`);
    expect(rev?.amount_cents).toBe(-100);
  });

  it('replay reuses same compensating row (idempotent)', async () => {
    const store = makeLedgerStore();
    const a = await executeSettlementReversal(store.supabase as never, {
      commissionId: 'comm-1',
      ledgerEntryId: 'ledger-orig',
    });
    const b = await executeSettlementReversal(store.supabase as never, {
      commissionId: 'comm-1',
      ledgerEntryId: 'ledger-orig',
    });
    expect(a.ok && b.ok).toBe(true);
    expect(b.reused).toBe(true);
    expect(a.compensatingLedgerEntryId).toBe(b.compensatingLedgerEntryId);
    expect(store.getInsertCount()).toBe(1);
  });

  it('concurrent unique violation reuses raced row', async () => {
    const revRef = buildSettlementReversalExternalRef('comm-1');
    const existing = {
      id: 'rev-raced',
      network: 'mercadolibre',
      amount_cents: -100,
      currency: 'MXN',
      status: 'reversed',
      external_ref: revRef,
      meta: {},
    };
    const store = makeLedgerStore({
      reversals: new Map([[`mercadolibre|${revRef}`, existing]]),
    });
    // Pre-seed byId
    store.byId.set(existing.id, existing);
    const result = await executeSettlementReversal(store.supabase as never, {
      commissionId: 'comm-1',
      ledgerEntryId: 'ledger-orig',
    });
    expect(result.ok).toBe(true);
    expect(result.reused).toBe(true);
    expect(result.compensatingLedgerEntryId).toBe('rev-raced');
    expect(store.getInsertCount()).toBe(0);
  });

  it('money_path_frozen blocks compensating write', async () => {
    vi.mocked(isMoneyPathFrozen).mockReturnValue(true);
    const store = makeLedgerStore();
    const result = await executeSettlementReversal(store.supabase as never, {
      commissionId: 'comm-1',
      ledgerEntryId: 'ledger-orig',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('money_path_frozen');
    expect(store.getInsertCount()).toBe(0);
  });

  it('audit failure after compensating write → audit_append_failed', async () => {
    const store = makeLedgerStore({ auditFail: true });
    const result = await executeSettlementReversal(store.supabase as never, {
      commissionId: 'comm-1',
      ledgerEntryId: 'ledger-orig',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('audit_append_failed');
    // Compensating row may exist — operator must reconcile; fail-closed for caller.
    expect(result.compensatingLedgerEntryId).toBeTruthy();
  });

  it('contract refs link original settlement and reversal', () => {
    const c = buildSettlementReversalContract({
      commissionId: 'AaBb',
      ledgerEntryId: 'L1',
      amountCents: -50,
      compensatingLedgerEntryId: 'R1',
    });
    expect(c.externalRef).toBe(buildSettlementExternalRef('AaBb'));
    expect(c.reversalExternalRef).toBe(buildSettlementReversalExternalRef('AaBb'));
    expect(c.kind).toBe('settlement_reversal_executed');
  });
});
