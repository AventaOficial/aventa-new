/**
 * Settlement reversal — compensating ledger movement tests.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSettlementReversalContract,
  buildSettlementReversalExternalRef,
  executeSettlementReversal,
  recoverSettlementReversal,
} from '@/lib/economy/settlement/reversalContract';
import { buildSettlementExternalRef, parseSettlementCommissionId } from '@/lib/economy/settlement/externalRef';
import { foldNetworkEconomy } from '@/lib/economy/readModel/aggregateEconomicSnapshot';
import { classifyLedgerEconomicKind } from '@/lib/economy/readModel/classifyLedgerRow';
import { periodKeyFromInstant } from '@/lib/economy/readModel/economicPeriod';
import { transitionCommissionStatus } from '@/lib/economy/recordCommission';
import { createRewardFromLedgerEntry } from '@/lib/rewards/rewardsEngine';

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
  source?: string;
  period_start?: string | null;
  created_at?: string;
  notes?: string;
};

function makeLedgerStore(opts?: {
  original?: LedgerRow;
  reversals?: Map<string, LedgerRow>;
  auditFail?: boolean;
  /** SELECT misses, INSERT returns 23505, the re-read finds the raced row. */
  uniqueRace?: boolean;
  racedAmountCents?: number;
  commission?: { id: string; status: string; ledger_entry_id: string | null } | null;
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
  let updateCount = 0;
  let raceArmed = Boolean(opts?.uniqueRace);

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
      if (table === 'affiliate_commissions') {
        const commission =
          opts && 'commission' in opts
            ? opts.commission
            : {
                id: 'comm-1',
                status: 'reversed',
                ledger_entry_id: 'ledger-orig',
              };
        return {
          select() {
            return {
              eq(_col: string, id: string) {
                return {
                  maybeSingle: async () => ({
                    data: commission && commission.id === id ? commission : null,
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }
      if (table !== 'affiliate_ledger_entries') {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        select() {
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
                      if (raceArmed) return { data: null, error: null };
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
          const key = `${row.network}|${row.external_ref}`;
          if (raceArmed) {
            raceArmed = false;
            const stored = {
              ...row,
              id: 'rev-raced',
              amount_cents: opts?.racedAmountCents ?? row.amount_cents,
            };
            byExternal.set(key, stored);
            byId.set(stored.id, stored);
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
          updateCount += 1;
          return {
            eq: async () => ({ error: null }),
          };
        },
      };
    },
  };

  return {
    supabase,
    byExternal,
    byId,
    events,
    getInsertCount: () => insertCount,
    getUpdateCount: () => updateCount,
  };
}

describe('executeSettlementReversal compensating movement', () => {
  beforeEach(() => {
    vi.mocked(isMoneyPathFrozen).mockReturnValue(false);
  });

  it('writes a full reversal of +10000 as accrued api compensation', async () => {
    const occurredAt = '2026-09-15T18:00:00.000Z';
    const store = makeLedgerStore({
      original: {
        id: 'ledger-orig',
        network: 'mercadolibre',
        amount_cents: 10000,
        currency: 'MXN',
        status: 'accrued',
        external_ref: buildSettlementExternalRef('comm-1'),
        meta: { settlement: { commissionId: 'comm-1' } },
        period_start: '2026-08-01',
        created_at: '2026-08-20T18:00:00.000Z',
      },
    });
    const before = structuredClone(store.byId.get('ledger-orig'));
    const result = await executeSettlementReversal(store.supabase as never, {
      commissionId: 'comm-1',
      ledgerEntryId: 'ledger-orig',
      occurredAt,
    });
    expect(result.ok).toBe(true);
    expect(result.reused).toBe(false);
    const revRef = buildSettlementReversalExternalRef('comm-1');
    const rev = store.byExternal.get(`mercadolibre|${revRef}`);
    expect(rev).toMatchObject({
      amount_cents: -10000,
      status: 'accrued',
      source: 'api',
      external_ref: revRef,
      network: 'mercadolibre',
      period_start: '2026-09-01',
      created_at: occurredAt,
    });
    expect(rev?.period_start).not.toBe('2026-08-01');
    expect(store.byId.get('ledger-orig')).toEqual(before);
    expect(before).toMatchObject({
      status: 'accrued',
      amount_cents: 10000,
      external_ref: buildSettlementExternalRef('comm-1'),
      created_at: '2026-08-20T18:00:00.000Z',
      period_start: '2026-08-01',
      meta: { settlement: { commissionId: 'comm-1' } },
    });
    expect(store.getUpdateCount()).toBe(0);
    expect(store.getInsertCount()).toBe(1);
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
    const reversed = store.events.filter(
      (event) => (event as { event_type?: string }).event_type === 'settlement_reversed',
    );
    expect(reversed).toHaveLength(1);
  });

  it('unique violation 23505 re-reads the raced reversal and succeeds', async () => {
    const store = makeLedgerStore({ uniqueRace: true });
    const result = await executeSettlementReversal(store.supabase as never, {
      commissionId: 'comm-1',
      ledgerEntryId: 'ledger-orig',
      occurredAt: '2026-09-15T18:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    expect(result.reused).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.compensatingLedgerEntryId).toBe('rev-raced');
    expect(store.getInsertCount()).toBe(0);
    const revRef = buildSettlementReversalExternalRef('comm-1');
    expect(store.byExternal.get(`mercadolibre|${revRef}`)?.status).toBe('accrued');
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

  it('audit failure after compensating write does not delete the row or mint another on retry', async () => {
    const store = makeLedgerStore({ auditFail: true });
    const first = await executeSettlementReversal(store.supabase as never, {
      commissionId: 'comm-1',
      ledgerEntryId: 'ledger-orig',
    });
    const second = await executeSettlementReversal(store.supabase as never, {
      commissionId: 'comm-1',
      ledgerEntryId: 'ledger-orig',
    });
    expect(first.ok).toBe(false);
    expect(first.reason).toBe('audit_append_failed');
    expect(first.compensatingLedgerEntryId).toBeTruthy();
    expect(second.ok).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.reason).toBe('audit_append_failed');
    expect(second.compensatingLedgerEntryId).toBe(first.compensatingLedgerEntryId);
    expect(store.getInsertCount()).toBe(1);
  });

  it('places the reversal in the Mexico City month of the reversal instant', async () => {
    const early = makeLedgerStore();
    await executeSettlementReversal(early.supabase as never, {
      commissionId: 'comm-1',
      ledgerEntryId: 'ledger-orig',
      occurredAt: '2026-10-01T05:30:00.000Z',
    });
    const revRef = buildSettlementReversalExternalRef('comm-1');
    expect(periodKeyFromInstant('2026-10-01T05:30:00.000Z')).toBe('2026-09');
    expect(early.byExternal.get(`mercadolibre|${revRef}`)?.period_start).toBe('2026-09-01');

    const late = makeLedgerStore();
    await executeSettlementReversal(late.supabase as never, {
      commissionId: 'comm-1',
      ledgerEntryId: 'ledger-orig',
      occurredAt: '2026-10-01T06:00:00.000Z',
    });
    expect(periodKeyFromInstant('2026-10-01T06:00:00.000Z')).toBe('2026-10');
    expect(late.byExternal.get(`mercadolibre|${revRef}`)?.period_start).toBe('2026-10-01');
  });

  it('read model keeps gross and nets the signed reversal to zero', async () => {
    const occurredAt = '2026-09-15T18:00:00.000Z';
    const store = makeLedgerStore({
      original: {
        id: 'ledger-orig',
        network: 'mercadolibre',
        amount_cents: 10000,
        currency: 'MXN',
        status: 'accrued',
        external_ref: buildSettlementExternalRef('comm-1'),
        meta: {},
        created_at: occurredAt,
      },
    });
    const written = await executeSettlementReversal(store.supabase as never, {
      commissionId: 'comm-1',
      ledgerEntryId: 'ledger-orig',
      occurredAt,
    });
    expect(written.ok).toBe(true);
    const revRef = buildSettlementReversalExternalRef('comm-1');
    const rev = store.byExternal.get(`mercadolibre|${revRef}`);
    const folded = foldNetworkEconomy(
      [
        {
          id: 'ledger-orig',
          network: 'mercadolibre',
          amountCents: 10000,
          externalRef: buildSettlementExternalRef('comm-1'),
          source: 'api',
          periodStart: '2026-09-01',
          createdAt: occurredAt,
        },
        {
          id: String(rev?.id),
          network: 'mercadolibre',
          amountCents: Number(rev?.amount_cents),
          externalRef: rev?.external_ref,
          source: 'api',
          periodStart: rev?.period_start,
          createdAt: String(rev?.created_at),
        },
      ],
      '2026-09',
    );
    expect(folded.grossRecognizedCents).toBe(10000);
    expect(folded.reversalCents).toBe(-10000);
    expect(folded.netRecognizedCents).toBe(0);
    expect(folded.settlementIds).toEqual(['ledger-orig']);
    expect(classifyLedgerEconomicKind({ externalRef: revRef, source: 'api' })).toBe('reversal');
  });

  it('does not let a reversal prefix or a negative amount create a creator reward', async () => {
    expect(parseSettlementCommissionId(buildSettlementReversalExternalRef('comm-1'))).toBeNull();
    expect(parseSettlementCommissionId(buildSettlementExternalRef('comm-1'))).toBe('comm-1');
    const touched: string[] = [];
    const result = await createRewardFromLedgerEntry(
      {
        from(table: string) {
          touched.push(table);
          return {};
        },
      } as never,
      {
        id: 'rev-1',
        network: 'mercadolibre',
        amount_cents: -10000,
        status: 'accrued',
        external_ref: buildSettlementReversalExternalRef('comm-1'),
      },
      { force: true },
    );
    expect(result).toEqual({ created: false, reason: 'zero_amount' });
    expect(touched).toEqual([]);
  });

  it('keeps a zero original as a zero compensation and rejects a negative original', async () => {
    const zero = makeLedgerStore({
      original: {
        id: 'ledger-orig',
        network: 'mercadolibre',
        amount_cents: 0,
        currency: 'MXN',
        status: 'accrued',
        external_ref: buildSettlementExternalRef('comm-1'),
        meta: {},
      },
    });
    const zeroResult = await executeSettlementReversal(zero.supabase as never, {
      commissionId: 'comm-1',
      ledgerEntryId: 'ledger-orig',
    });
    expect(zeroResult.ok).toBe(true);
    const revRef = buildSettlementReversalExternalRef('comm-1');
    expect(zero.byExternal.get(`mercadolibre|${revRef}`)?.amount_cents === 0).toBe(true);

    const negative = makeLedgerStore({
      original: {
        id: 'ledger-orig',
        network: 'mercadolibre',
        amount_cents: -100,
        currency: 'MXN',
        status: 'accrued',
        external_ref: buildSettlementExternalRef('comm-1'),
        meta: {},
      },
    });
    const negativeResult = await executeSettlementReversal(negative.supabase as never, {
      commissionId: 'comm-1',
      ledgerEntryId: 'ledger-orig',
    });
    expect(negativeResult.ok).toBe(false);
    expect(negativeResult.reason).toBe('invalid_original_amount');
    expect(negative.getInsertCount()).toBe(0);
  });

  it('does not report transition success when the compensating ledger write fails', async () => {
    const sb = {
      from(table: string) {
        if (table === 'affiliate_commissions') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: 'c1', status: 'approved', ledger_entry_id: 'L1' },
                  error: null,
                }),
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            }),
          };
        }
        if (table === 'affiliate_economic_events') {
          return { insert: async () => ({ error: null }) };
        }
        if (table === 'affiliate_ledger_entries') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    const result = await transitionCommissionStatus(sb as never, {
      commissionId: 'c1',
      toStatus: 'reversed',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('missing_original_settlement');
  });

  it('recovers a reversed commission that is missing its compensating row', async () => {
    const store = makeLedgerStore({
      original: {
        id: 'ledger-orig',
        network: 'mercadolibre',
        amount_cents: 10000,
        currency: 'MXN',
        status: 'accrued',
        external_ref: buildSettlementExternalRef('comm-1'),
        meta: { settlement: { commissionId: 'comm-1' } },
        period_start: '2026-09-01',
        created_at: '2026-09-15T18:00:00.000Z',
      },
    });
    const before = structuredClone(store.byId.get('ledger-orig'));
    const result = await recoverSettlementReversal(store.supabase as never, {
      commissionId: 'comm-1',
      occurredAt: '2026-10-15T18:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    expect(result.reused).toBe(false);
    expect(result.reason).toBeNull();
    const revRef = buildSettlementReversalExternalRef('comm-1');
    expect(store.byExternal.get(`mercadolibre|${revRef}`)).toMatchObject({
      amount_cents: -10000,
      status: 'accrued',
      source: 'api',
      period_start: '2026-10-01',
    });
    expect(store.getInsertCount()).toBe(1);
    expect(store.byId.get('ledger-orig')).toEqual(before);
  });

  it('reuses an existing reversal when recovery runs again', async () => {
    const revRef = buildSettlementReversalExternalRef('comm-1');
    const existing = {
      id: 'rev-existing',
      network: 'mercadolibre',
      amount_cents: -100,
      currency: 'MXN',
      status: 'accrued',
      external_ref: revRef,
      meta: {},
    };
    const store = makeLedgerStore({
      reversals: new Map([[`mercadolibre|${revRef}`, existing]]),
    });
    const result = await recoverSettlementReversal(store.supabase as never, {
      commissionId: 'comm-1',
    });
    expect(result.ok).toBe(true);
    expect(result.reused).toBe(true);
    expect(result.compensatingLedgerEntryId).toBe('rev-existing');
    expect(store.getInsertCount()).toBe(0);
  });

  it('reports an inconsistent existing reversal and leaves it unchanged', async () => {
    const revRef = buildSettlementReversalExternalRef('comm-1');
    const existing = {
      id: 'rev-wrong',
      network: 'mercadolibre',
      amount_cents: -50,
      currency: 'MXN',
      status: 'accrued',
      external_ref: revRef,
      meta: { keep: true },
    };
    const store = makeLedgerStore({
      reversals: new Map([[`mercadolibre|${revRef}`, existing]]),
    });
    const before = structuredClone(existing);
    const result = await recoverSettlementReversal(store.supabase as never, {
      commissionId: 'comm-1',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('inconsistent_reversal');
    expect(result.reused).toBe(false);
    expect(store.getInsertCount()).toBe(0);
    expect(store.getUpdateCount()).toBe(0);
    expect(store.byExternal.get(`mercadolibre|${revRef}`)).toEqual(before);
    expect(
      store.events.some(
        (event) =>
          (event as { event_type?: string }).event_type === 'settlement_reversal_inconsistent',
      ),
    ).toBe(true);
  });

  it('refuses recovery when the linked row is not the canonical settlement', async () => {
    const store = makeLedgerStore({
      original: {
        id: 'ledger-orig',
        network: 'mercadolibre',
        amount_cents: 10000,
        currency: 'MXN',
        status: 'accrued',
        external_ref: 'csv:not-settlement',
        meta: {},
      },
    });
    const result = await recoverSettlementReversal(store.supabase as never, {
      commissionId: 'comm-1',
    });
    expect(result.reason).toBe('missing_original_settlement');
    expect(store.getInsertCount()).toBe(0);
  });

  it('refuses recovery without a ledger entry and without a reversed commission', async () => {
    const missingLedger = makeLedgerStore({
      commission: { id: 'comm-1', status: 'reversed', ledger_entry_id: null },
    });
    const missing = await recoverSettlementReversal(missingLedger.supabase as never, {
      commissionId: 'comm-1',
    });
    expect(missing.reason).toBe('missing_ledger_entry');
    expect(missingLedger.getInsertCount()).toBe(0);

    const stillApproved = makeLedgerStore({
      commission: { id: 'comm-1', status: 'approved', ledger_entry_id: 'ledger-orig' },
    });
    const approved = await recoverSettlementReversal(stillApproved.supabase as never, {
      commissionId: 'comm-1',
    });
    expect(approved.reason).toBe('commission_not_reversed');
    expect(stillApproved.getInsertCount()).toBe(0);

    const absent = makeLedgerStore({ commission: null });
    const notFound = await recoverSettlementReversal(absent.supabase as never, {
      commissionId: 'comm-1',
    });
    expect(notFound.reason).toBe('commission_not_found');
  });

  it('keeps one compensating row across ten sequential recoveries', async () => {
    const store = makeLedgerStore();
    const results = [];
    for (let i = 0; i < 10; i += 1) {
      results.push(
        await recoverSettlementReversal(store.supabase as never, { commissionId: 'comm-1' }),
      );
    }
    expect(results[0]?.ok).toBe(true);
    expect(results[0]?.reused).toBe(false);
    expect(results.slice(1).every((result) => result.ok && result.reused)).toBe(true);
    expect(store.getInsertCount()).toBe(1);
    const reversed = store.events.filter(
      (event) => (event as { event_type?: string }).event_type === 'settlement_reversed',
    );
    expect(reversed).toHaveLength(1);
  });

  it('rejects a raced reversal whose amount does not match', async () => {
    const store = makeLedgerStore({ uniqueRace: true, racedAmountCents: -1 });
    const result = await recoverSettlementReversal(store.supabase as never, {
      commissionId: 'comm-1',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('inconsistent_reversal');
    expect(store.getInsertCount()).toBe(0);
  });

  it('keeps September gross and October reversal in separate periods', async () => {
    const store = makeLedgerStore({
      original: {
        id: 'ledger-orig',
        network: 'mercadolibre',
        amount_cents: 10000,
        currency: 'MXN',
        status: 'accrued',
        external_ref: buildSettlementExternalRef('comm-1'),
        meta: {},
        period_start: '2026-09-01',
        created_at: '2026-09-15T18:00:00.000Z',
      },
    });
    const written = await recoverSettlementReversal(store.supabase as never, {
      commissionId: 'comm-1',
      occurredAt: '2026-10-15T18:00:00.000Z',
    });
    expect(written.ok).toBe(true);
    const revRef = buildSettlementReversalExternalRef('comm-1');
    const rev = store.byExternal.get(`mercadolibre|${revRef}`);
    const originalLine = {
      id: 'ledger-orig',
      network: 'mercadolibre',
      amountCents: 10000,
      externalRef: buildSettlementExternalRef('comm-1'),
      source: 'api',
      periodStart: '2026-09-01',
      createdAt: '2026-09-15T18:00:00.000Z',
    };
    const reversalLine = {
      id: String(rev?.id),
      network: 'mercadolibre',
      amountCents: Number(rev?.amount_cents),
      externalRef: rev?.external_ref,
      source: 'api',
      periodStart: rev?.period_start,
      createdAt: String(rev?.created_at),
    };
    const september = foldNetworkEconomy([originalLine, reversalLine], '2026-09');
    const october = foldNetworkEconomy([originalLine, reversalLine], '2026-10');
    expect(september.grossRecognizedCents).toBe(10000);
    expect(september.reversalCents).toBe(0);
    expect(september.netRecognizedCents).toBe(10000);
    expect(october.grossRecognizedCents).toBe(0);
    expect(october.reversalCents).toBe(-10000);
    expect(october.netRecognizedCents).toBe(-10000);
    expect(september.netRecognizedCents + october.netRecognizedCents).toBe(0);
  });

  it('recovery does not touch rewards or payouts', () => {
    const writer = readFileSync(
      join(process.cwd(), 'lib/economy/settlement/reversalContract.ts'),
      'utf8',
    );
    expect(writer).not.toContain('creator_rewards');
    expect(writer).not.toContain('payout_intents');
    expect(writer).not.toContain('REWARDS_CREATOR_SHARE_BPS');
    expect(writer).not.toContain("status: 'PAID'");
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
