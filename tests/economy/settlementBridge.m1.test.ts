/**
 * M1 Settlement Bridge — deterministic tests A–T.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  settleCommission,
  isSettlementBridgeEnabled,
  buildSettlementExternalRef,
  parseSettlementCommissionId,
  buildSettlementDiagnostics,
  buildSettlementReversalContract,
  ECONOMIC_LEDGER_BOUNDARY,
} from '@/lib/economy';
import { transitionCommissionStatus } from '@/lib/economy/recordCommission';
import { splitCommissionCents, REWARDS_CREATOR_SHARE_BPS } from '@/lib/rewards/config';

type Store = {
  commission: Record<string, unknown> | null;
  ledgers: Map<string, Record<string, unknown>>;
  ledgerByRef: Map<string, string>;
  events: Array<Record<string, unknown>>;
  ledgerInserts: number;
  rewardInserts: number;
  payoutInserts: number;
  attributionMutations: number;
  supplyTouches: number;
  distributionTouches: number;
  /** Simulate crash: insert ledger but skip commission link on first settle. */
  crashAfterLedger?: boolean;
  crashConsumed?: boolean;
  /** Force unique violation on first ledger insert (concurrency). */
  uniqueOnLedgerInsert?: boolean;
  uniqueConsumed?: boolean;
};

function makeSettlementMock(store: Store) {
  const sb = {
    from: vi.fn((table: string) => {
      if (table === 'affiliate_economic_events') {
        return {
          insert: vi.fn(async (row: Record<string, unknown>) => {
            store.events.push(row);
            return { error: null };
          }),
          select: vi.fn(() => {
            const api: Record<string, unknown> = {};
            const self = () => api;
            api.eq = () => self();
            api.order = () => self();
            api.limit = () => ({
              then: undefined,
            });
            // supabase chain ends with await on limit — return thenable via fake
            return {
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: vi.fn(async () => ({
                      data: store.events
                        .filter((e) => e.entity_type === 'settlement')
                        .slice()
                        .reverse()
                        .slice(0, 1)
                        .map((e) => ({
                          event_type: e.event_type,
                          created_at: e.created_at ?? new Date().toISOString(),
                          payload: e.payload ?? {},
                        })),
                      error: null,
                    })),
                  }),
                }),
              }),
            };
          }),
        };
      }

      if (table === 'affiliate_commissions') {
        return {
          select: vi.fn(() => {
            const api: Record<string, unknown> = {};
            const self = () => api;
            api.eq = () => self();
            api.maybeSingle = vi.fn(async () => ({
              data: store.commission
                ? {
                    ...store.commission,
                    id: store.commission.id,
                    status: store.commission.status,
                    ledger_entry_id: store.commission.ledger_entry_id ?? null,
                  }
                : null,
              error: null,
            }));
            return api;
          }),
          update: vi.fn((patch: Record<string, unknown>) => {
            const api: Record<string, unknown> = {};
            let linked = false;
            api.eq = () => api;
            api.is = (_col: string, val: unknown) => {
              if (
                val === null &&
                store.commission &&
                (store.commission.ledger_entry_id == null ||
                  store.commission.ledger_entry_id === null)
              ) {
                if (store.crashAfterLedger && !store.crashConsumed) {
                  store.crashConsumed = true;
                  // Simulate crash: ledger exists but link not applied
                  return Promise.resolve({ error: null });
                }
                store.commission = { ...store.commission, ...patch };
                linked = true;
              }
              return Promise.resolve({ error: null });
            };
            // Also support .eq().eq() without .is for status transitions
            api.then = undefined;
            const chain = {
              eq: (_c: string, _v: unknown) => ({
                eq: async () => {
                  if (store.commission && patch.status) {
                    store.commission = { ...store.commission, ...patch };
                  }
                  return { error: null };
                },
                is: api.is,
              }),
              is: api.is,
            };
            void linked;
            return chain;
          }),
          insert: vi.fn(() => {
            throw new Error('settlement must not insert commissions');
          }),
        };
      }

      if (table === 'affiliate_ledger_entries') {
        return {
          select: vi.fn(() => {
            const filters: Record<string, string> = {};
            const api: Record<string, unknown> = {};
            const self = () => api;
            api.eq = (col: string, val: string) => {
              filters[col] = val;
              return self();
            };
            api.maybeSingle = vi.fn(async () => {
              if (filters.id) {
                const row = store.ledgers.get(filters.id) ?? null;
                return { data: row, error: null };
              }
              if (filters.external_ref && filters.network) {
                const id = store.ledgerByRef.get(
                  `${filters.network}|${filters.external_ref}`,
                );
                return {
                  data: id ? store.ledgers.get(id) ?? null : null,
                  error: null,
                };
              }
              return { data: null, error: null };
            });
            return api;
          }),
          insert: vi.fn((row: Record<string, unknown>) => {
            store.ledgerInserts += 1;
            const runInsert = () => {
              if (
                store.uniqueOnLedgerInsert &&
                !store.uniqueConsumed &&
                store.ledgerByRef.size > 0
              ) {
                store.uniqueConsumed = true;
                return {
                  data: null,
                  error: { code: '23505', message: 'duplicate' },
                };
              }
              const id = `ledger-${store.ledgerInserts}`;
              const full = {
                id,
                ...row,
                created_at: new Date().toISOString(),
              };
              store.ledgers.set(id, full);
              const ref = String(row.external_ref);
              const network = String(row.network);
              store.ledgerByRef.set(`${network}|${ref}`, id);
              return { data: full, error: null };
            };
            return {
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => runInsert()),
              })),
            };
          }),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        };
      }

      if (table === 'creator_rewards') {
        return {
          insert: vi.fn(() => {
            store.rewardInserts += 1;
            return {
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            };
          }),
        };
      }
      if (table === 'reward_payouts') {
        return {
          insert: vi.fn(() => {
            store.payoutInserts += 1;
            return { error: null };
          }),
        };
      }
      if (table === 'reward_outbound_clicks' || table === 'affiliate_conversions') {
        return {
          update: vi.fn(() => {
            store.attributionMutations += 1;
            return { eq: vi.fn(async () => ({ error: null })) };
          }),
          insert: vi.fn(() => {
            store.attributionMutations += 1;
            return { error: null };
          }),
        };
      }
      if (table.startsWith('supply') || table.includes('bot_ingest')) {
        store.supplyTouches += 1;
        return {};
      }
      if (table.includes('distribution') || table.includes('publication')) {
        store.distributionTouches += 1;
        return {};
      }
      return {};
    }),
  };
  return sb;
}

function approvedCommission(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    conversion_id: '22222222-2222-2222-2222-222222222222',
    source: 'api',
    network: 'amazon',
    external_commission_id: 'EXT-1',
    gross_commission_cents: 1000,
    currency: 'MXN',
    status: 'approved',
    ledger_entry_id: null,
    occurred_at: '2026-09-18T12:00:00.000Z',
    updated_at: '2026-09-18T12:00:00.000Z',
    ...overrides,
  };
}

describe('M1 Settlement Bridge', () => {
  const prevEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...prevEnv };
    process.env.SETTLEMENT_BRIDGE_ENABLED = 'true';
    process.env.MONEY_PATH_FROZEN = 'false';
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it('external_ref is deterministic and reconstructable', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const a = buildSettlementExternalRef(id);
    const b = buildSettlementExternalRef(id);
    expect(a).toBe(b);
    expect(a).toBe(`settlement:commission:${id}`);
    expect(parseSettlementCommissionId(a)).toBe(id);
  });

  it('A. approved → settlement creates one ledger', async () => {
    const store: Store = {
      commission: approvedCommission(),
      ledgers: new Map(),
      ledgerByRef: new Map(),
      events: [],
      ledgerInserts: 0,
      rewardInserts: 0,
      payoutInserts: 0,
      attributionMutations: 0,
      supplyTouches: 0,
      distributionTouches: 0,
    };
    const r = await settleCommission(makeSettlementMock(store) as never, {
      commissionId: String(store.commission!.id),
    });
    expect(r.ok).toBe(true);
    expect(r.event).toBe('settlement_created');
    expect(r.ledgerEntryId).toBeTruthy();
    expect(r.allocation?.grossCommissionCents).toBe(1000);
    expect(r.allocation?.creatorAllocationCents).toBe(
      splitCommissionCents(1000, REWARDS_CREATOR_SHARE_BPS).creatorCents,
    );
    expect(r.allocation?.withdrawable).toBe(false);
    expect(r.allocation?.settled).toBe(false);
    expect(r.createdCreatorReward).toBe(false);
    expect(r.rewardBoundary).toBe('future_createRewardFromLedgerEntry');
    expect(store.ledgerInserts).toBe(1);
    expect(store.commission!.ledger_entry_id).toBe(r.ledgerEntryId);
    expect(store.events.some((e) => e.event_type === 'settlement_eligible')).toBe(
      true,
    );
    expect(store.events.some((e) => e.event_type === 'settlement_created')).toBe(
      true,
    );
  });

  it.each([
    ['reported', 'B'],
    ['pending', 'C'],
    ['rejected', 'D'],
  ] as const)('%s → rejected (%s)', async (status) => {
    const store: Store = {
      commission: approvedCommission({ status }),
      ledgers: new Map(),
      ledgerByRef: new Map(),
      events: [],
      ledgerInserts: 0,
      rewardInserts: 0,
      payoutInserts: 0,
      attributionMutations: 0,
      supplyTouches: 0,
      distributionTouches: 0,
    };
    const r = await settleCommission(makeSettlementMock(store) as never, {
      commissionId: String(store.commission!.id),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('commission_not_approved');
    expect(store.ledgerInserts).toBe(0);
  });

  it('E. reversed → rejected', async () => {
    const store: Store = {
      commission: approvedCommission({ status: 'reversed' }),
      ledgers: new Map(),
      ledgerByRef: new Map(),
      events: [],
      ledgerInserts: 0,
      rewardInserts: 0,
      payoutInserts: 0,
      attributionMutations: 0,
      supplyTouches: 0,
      distributionTouches: 0,
    };
    const r = await settleCommission(makeSettlementMock(store) as never, {
      commissionId: String(store.commission!.id),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('commission_reversed');
    expect(store.ledgerInserts).toBe(0);
  });

  it('F. duplicate settlement → reused', async () => {
    const store: Store = {
      commission: approvedCommission(),
      ledgers: new Map(),
      ledgerByRef: new Map(),
      events: [],
      ledgerInserts: 0,
      rewardInserts: 0,
      payoutInserts: 0,
      attributionMutations: 0,
      supplyTouches: 0,
      distributionTouches: 0,
    };
    const sb = makeSettlementMock(store);
    const a = await settleCommission(sb as never, {
      commissionId: String(store.commission!.id),
    });
    const b = await settleCommission(sb as never, {
      commissionId: String(store.commission!.id),
    });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(b.reused).toBe(true);
    expect(b.event).toBe('settlement_reused');
    expect(b.ledgerEntryId).toBe(a.ledgerEntryId);
    expect(store.ledgerInserts).toBe(1);
  });

  it('G. concurrent settlement → one ledger (unique race)', async () => {
    const store: Store = {
      commission: approvedCommission(),
      ledgers: new Map(),
      ledgerByRef: new Map(),
      events: [],
      ledgerInserts: 0,
      rewardInserts: 0,
      payoutInserts: 0,
      attributionMutations: 0,
      supplyTouches: 0,
      distributionTouches: 0,
      uniqueOnLedgerInsert: true,
    };
    // Seed a "winner" ledger as if concurrent worker already inserted
    const ref = buildSettlementExternalRef(String(store.commission!.id));
    const winnerId = 'ledger-winner';
    store.ledgers.set(winnerId, {
      id: winnerId,
      network: 'amazon',
      external_ref: ref,
      amount_cents: 1000,
      currency: 'MXN',
      created_at: new Date().toISOString(),
    });
    store.ledgerByRef.set(`amazon|${ref}`, winnerId);

    const r = await settleCommission(makeSettlementMock(store) as never, {
      commissionId: String(store.commission!.id),
    });
    expect(r.ok).toBe(true);
    expect(r.reused).toBe(true);
    expect(r.ledgerEntryId).toBe(winnerId);
    // Either found by ref before insert, or unique race — never 2 distinct ledgers for same ref
    expect(store.ledgerByRef.size).toBe(1);
  });

  it('H. currency mismatch on reuse → fail closed', async () => {
    const id = '11111111-1111-1111-1111-111111111111';
    const ledgerId = 'ledger-bad-fx';
    const store: Store = {
      commission: approvedCommission({
        ledger_entry_id: ledgerId,
        currency: 'MXN',
      }),
      ledgers: new Map([
        [
          ledgerId,
          {
            id: ledgerId,
            network: 'amazon',
            external_ref: buildSettlementExternalRef(id),
            amount_cents: 1000,
            currency: 'USD',
            created_at: new Date().toISOString(),
          },
        ],
      ]),
      ledgerByRef: new Map(),
      events: [],
      ledgerInserts: 0,
      rewardInserts: 0,
      payoutInserts: 0,
      attributionMutations: 0,
      supplyTouches: 0,
      distributionTouches: 0,
    };
    const r = await settleCommission(makeSettlementMock(store) as never, {
      commissionId: id,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('currency_mismatch');
  });

  it('I. negative amount → fail closed', async () => {
    const store: Store = {
      commission: approvedCommission({ gross_commission_cents: -1 }),
      ledgers: new Map(),
      ledgerByRef: new Map(),
      events: [],
      ledgerInserts: 0,
      rewardInserts: 0,
      payoutInserts: 0,
      attributionMutations: 0,
      supplyTouches: 0,
      distributionTouches: 0,
    };
    const r = await settleCommission(makeSettlementMock(store) as never, {
      commissionId: String(store.commission!.id),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid_amount');
    expect(store.ledgerInserts).toBe(0);
  });

  it('J. non-integer amount → fail closed', async () => {
    const store: Store = {
      commission: approvedCommission({ gross_commission_cents: 10.5 }),
      ledgers: new Map(),
      ledgerByRef: new Map(),
      events: [],
      ledgerInserts: 0,
      rewardInserts: 0,
      payoutInserts: 0,
      attributionMutations: 0,
      supplyTouches: 0,
      distributionTouches: 0,
    };
    const r = await settleCommission(makeSettlementMock(store) as never, {
      commissionId: String(store.commission!.id),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid_amount');
  });

  it('K. allocation invariant: creator+platform == gross', () => {
    for (const g of [0, 1, 7, 1000, 9999]) {
      const s = splitCommissionCents(g, REWARDS_CREATOR_SHARE_BPS);
      expect(s.creatorCents + s.platformCents).toBe(g);
      expect(s.creatorCents).toBeLessThanOrEqual(g);
    }
  });

  it('L. crash after ledger creation → retry safe', async () => {
    const store: Store = {
      commission: approvedCommission(),
      ledgers: new Map(),
      ledgerByRef: new Map(),
      events: [],
      ledgerInserts: 0,
      rewardInserts: 0,
      payoutInserts: 0,
      attributionMutations: 0,
      supplyTouches: 0,
      distributionTouches: 0,
      crashAfterLedger: true,
    };
    const sb = makeSettlementMock(store);
    const first = await settleCommission(sb as never, {
      commissionId: String(store.commission!.id),
    });
    // First attempt: ledger may exist; link skipped by crash sim
    expect(store.ledgerInserts).toBeGreaterThanOrEqual(1);
    // Ensure commission unlinked for retry path
    store.commission!.ledger_entry_id = null;
    store.crashAfterLedger = false;

    const retry = await settleCommission(sb as never, {
      commissionId: String(store.commission!.id),
    });
    expect(retry.ok).toBe(true);
    expect(retry.reused).toBe(true);
    expect(retry.event).toBe('settlement_reused');
    expect(store.ledgerByRef.size).toBe(1);
    expect(first.createdCreatorReward).toBe(false);
  });

  it('M. malformed commission → fail closed', async () => {
    const store: Store = {
      commission: approvedCommission({ network: 'not-a-network' }),
      ledgers: new Map(),
      ledgerByRef: new Map(),
      events: [],
      ledgerInserts: 0,
      rewardInserts: 0,
      payoutInserts: 0,
      attributionMutations: 0,
      supplyTouches: 0,
      distributionTouches: 0,
    };
    const r = await settleCommission(makeSettlementMock(store) as never, {
      commissionId: String(store.commission!.id),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('commission_malformed');
  });

  it('N. missing commission → fail closed', async () => {
    const store: Store = {
      commission: null,
      ledgers: new Map(),
      ledgerByRef: new Map(),
      events: [],
      ledgerInserts: 0,
      rewardInserts: 0,
      payoutInserts: 0,
      attributionMutations: 0,
      supplyTouches: 0,
      distributionTouches: 0,
    };
    const r = await settleCommission(makeSettlementMock(store) as never, {
      commissionId: '00000000-0000-0000-0000-000000000000',
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('commission_not_found');
  });

  it('O. settlement disabled → no write', async () => {
    delete process.env.SETTLEMENT_BRIDGE_ENABLED;
    expect(isSettlementBridgeEnabled()).toBe(false);
    expect(ECONOMIC_LEDGER_BOUNDARY.settlementEnabled).toBe(false);

    const store: Store = {
      commission: approvedCommission(),
      ledgers: new Map(),
      ledgerByRef: new Map(),
      events: [],
      ledgerInserts: 0,
      rewardInserts: 0,
      payoutInserts: 0,
      attributionMutations: 0,
      supplyTouches: 0,
      distributionTouches: 0,
    };
    const r = await settleCommission(makeSettlementMock(store) as never, {
      commissionId: String(store.commission!.id),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('settlement_disabled');
    expect(store.ledgerInserts).toBe(0);
  });

  it('P–Q. no creator reward / payout creation', async () => {
    const store: Store = {
      commission: approvedCommission(),
      ledgers: new Map(),
      ledgerByRef: new Map(),
      events: [],
      ledgerInserts: 0,
      rewardInserts: 0,
      payoutInserts: 0,
      attributionMutations: 0,
      supplyTouches: 0,
      distributionTouches: 0,
    };
    const r = await settleCommission(makeSettlementMock(store) as never, {
      commissionId: String(store.commission!.id),
    });
    expect(r.ok).toBe(true);
    expect(r.createdCreatorReward).toBe(false);
    expect(r.createdPayout).toBe(false);
    expect(store.rewardInserts).toBe(0);
    expect(store.payoutInserts).toBe(0);
    const src = readFileSync(
      join(process.cwd(), 'lib/economy/settlement/settleCommission.ts'),
      'utf8',
    );
    // Boundary string is documentation only — must not import/call reward engine.
    expect(src).not.toMatch(/from ['"]@\/lib\/rewards\/rewardsEngine['"]/);
    expect(src).not.toMatch(/createRewardFromLedgerEntry\s*\(/);
    expect(src).not.toMatch(/\.from\(['"]creator_rewards['"]\)/);
    expect(src).not.toMatch(/\.from\(['"]reward_payouts['"]\)/);
  });

  it('R–T. no attribution / supply / distribution mutation', async () => {
    const store: Store = {
      commission: approvedCommission(),
      ledgers: new Map(),
      ledgerByRef: new Map(),
      events: [],
      ledgerInserts: 0,
      rewardInserts: 0,
      payoutInserts: 0,
      attributionMutations: 0,
      supplyTouches: 0,
      distributionTouches: 0,
    };
    await settleCommission(makeSettlementMock(store) as never, {
      commissionId: String(store.commission!.id),
    });
    expect(store.attributionMutations).toBe(0);
    expect(store.supplyTouches).toBe(0);
    expect(store.distributionTouches).toBe(0);

    for (const f of [
      'lib/economy/settlement/settleCommission.ts',
      'lib/economy/settlement/diagnostics.ts',
      'lib/economy/settlement/reversalContract.ts',
    ]) {
      const src = readFileSync(join(process.cwd(), f), 'utf8');
      expect(src).not.toMatch(/lib\/distribution/);
      expect(src).not.toMatch(/lib\/bots\/ingest/);
      expect(src).not.toMatch(/recordAttributedClick/);
    }
  });

  it('reversal contract when commission reversed with ledger', async () => {
    const contract = buildSettlementReversalContract({
      commissionId: '11111111-1111-1111-1111-111111111111',
      ledgerEntryId: 'ledger-1',
    });
    expect(contract.kind).toBe('settlement_reversal_required');
    expect(contract.moneyMovement).toBe('none_m1');

    const events: unknown[] = [];
    const sb = {
      from: vi.fn((table: string) => {
        if (table === 'affiliate_economic_events') {
          return {
            insert: vi.fn(async (row: unknown) => {
              events.push(row);
              return { error: null };
            }),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: '11111111-1111-1111-1111-111111111111',
                  status: 'approved',
                  ledger_entry_id: 'ledger-1',
                },
                error: null,
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          })),
        };
      }),
    };
    const r = await transitionCommissionStatus(sb as never, {
      commissionId: '11111111-1111-1111-1111-111111111111',
      toStatus: 'reversed',
    });
    expect(r.ok).toBe(true);
    expect(
      events.some(
        (e) =>
          (e as { event_type?: string }).event_type ===
          'settlement_reversal_required',
      ),
    ).toBe(true);
  });

  it('diagnostics surface returns expected fields', async () => {
    const id = '11111111-1111-1111-1111-111111111111';
    const store: Store = {
      commission: approvedCommission({ ledger_entry_id: 'ledger-1' }),
      ledgers: new Map([
        [
          'ledger-1',
          {
            id: 'ledger-1',
            amount_cents: 1000,
            currency: 'MXN',
            external_ref: buildSettlementExternalRef(id),
            created_at: '2026-09-18T13:00:00.000Z',
            meta: {
              settlement: {
                creatorAllocationCents: 400,
                platformAllocationCents: 600,
              },
            },
          },
        ],
      ]),
      ledgerByRef: new Map(),
      events: [
        {
          entity_type: 'settlement',
          entity_id: id,
          event_type: 'settlement_created',
          created_at: '2026-09-18T13:00:01.000Z',
          payload: {},
        },
      ],
      ledgerInserts: 0,
      rewardInserts: 0,
      payoutInserts: 0,
      attributionMutations: 0,
      supplyTouches: 0,
      distributionTouches: 0,
    };
    const diag = await buildSettlementDiagnostics(
      makeSettlementMock(store) as never,
      id,
    );
    expect(diag?.commissionId).toBe(id);
    expect(diag?.ledgerEntryId).toBe('ledger-1');
    expect(diag?.externalRef).toBe(buildSettlementExternalRef(id));
    expect(diag?.creatorAllocationCents).toBe(400);
    expect(diag?.withdrawable).toBe(false);
    expect(diag?.settled).toBe(false);
    expect(diag?.rewardBoundary).toBe('future_createRewardFromLedgerEntry');
    expect(diag?.ops).toBeDefined();
    expect(diag?.ops.economicLedgerBoundary.settlementEnabled).toBe(false);
    expect(typeof diag?.ops.stagingCanaryEligible).toBe('boolean');
  });

  it('migration is additive and preserves conversion unique', () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        'docs/supabase-migrations/20260918_money_settlement_bridge_m1.sql',
      ),
      'utf8',
    );
    expect(sql).toMatch(/settlement/);
    expect(sql).toMatch(/affiliate_commissions_ledger_entry_unique/);
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    // Executable SQL must not SET the env gate; comment may mention the name.
    const executable = sql
      .split(/\r?\n/)
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');
    expect(executable).not.toMatch(/SETTLEMENT_BRIDGE_ENABLED\s*=/);
    expect(executable).not.toMatch(/\bTRUE\b.*settlement/i);
    const doubleCredit = readFileSync(
      join(
        process.cwd(),
        'docs/supabase-migrations/20260918_money_system_double_credit.sql',
      ),
      'utf8',
    );
    expect(doubleCredit).toMatch(/affiliate_commissions_conversion_unique/);
  });

  it('product boundary remains settlementEnabled=false', () => {
    expect(ECONOMIC_LEDGER_BOUNDARY.settlementEnabled).toBe(false);
    expect(ECONOMIC_LEDGER_BOUNDARY.foundationWritesRewards).toBe(false);
    expect(ECONOMIC_LEDGER_BOUNDARY.foundationWritesPayouts).toBe(false);
  });
});
