/**
 * M2 Settlement staging canary — gate + dry-run / execute hardening.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  assertSettlementStagingCanaryEnv,
  runSettlementStagingCanary,
  SETTLEMENT_STAGING_CANARY_BOUNDARY,
  buildSettlementOpsSnapshot,
} from '@/lib/economy/settlement';

type Store = {
  commission: Record<string, unknown> | null;
  ledgers: Map<string, Record<string, unknown>>;
  ledgerByRef: Map<string, string>;
  events: Array<Record<string, unknown>>;
  ledgerInserts: number;
};

function stagingEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    VERCEL_ENV: 'preview',
    AVENTA_SUPABASE_TARGET: 'staging',
    AVENTA_EXPECTED_SUPABASE_REF: 'oojshofrpbfwsiypcecr',
    NEXT_PUBLIC_SUPABASE_URL: 'https://oojshofrpbfwsiypcecr.supabase.co',
    SETTLEMENT_BRIDGE_ENABLED: 'true',
    MONEY_PATH_FROZEN: 'false',
    REWARDS_PROGRAM_ACTIVE: '',
    COMMISSION_PROGRAM_ACTIVE: 'false',
    ...overrides,
  };
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

function makeMock(store: Store) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'affiliate_economic_events') {
        return {
          insert: vi.fn(async (row: Record<string, unknown>) => {
            store.events.push(row);
            return { error: null };
          }),
          select: vi.fn(() => ({
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
          })),
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
          update: vi.fn((patch: Record<string, unknown>) => ({
            eq: () => ({
              is: () => {
                if (
                  store.commission &&
                  (store.commission.ledger_entry_id == null ||
                    store.commission.ledger_entry_id === null)
                ) {
                  store.commission = { ...store.commission, ...patch };
                }
                return Promise.resolve({ error: null });
              },
            }),
          })),
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
                return { data: store.ledgers.get(filters.id) ?? null, error: null };
              }
              if (filters.external_ref && filters.network) {
                const id = store.ledgerByRef.get(
                  `${filters.network}|${filters.external_ref}`,
                );
                return { data: id ? store.ledgers.get(id) ?? null : null, error: null };
              }
              return { data: null, error: null };
            });
            return api;
          }),
          insert: vi.fn((row: Record<string, unknown>) => {
            store.ledgerInserts += 1;
            const id = `ledger-${store.ledgerInserts}`;
            const full = { id, ...row, created_at: new Date().toISOString() };
            store.ledgers.set(id, full);
            store.ledgerByRef.set(
              `${String(row.network)}|${String(row.external_ref)}`,
              id,
            );
            return {
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: full, error: null })),
              })),
            };
          }),
        };
      }

      return {};
    }),
  };
}

describe('M2 Settlement staging canary — env gates', () => {
  const prevEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...stagingEnv() };
  });

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it('blocks production runtime', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.NODE_ENV = 'production';
    const r = assertSettlementStagingCanaryEnv(process.env);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('production_runtime_forbidden');
  });

  it('blocks disabled settlement bridge', () => {
    delete process.env.SETTLEMENT_BRIDGE_ENABLED;
    const r = assertSettlementStagingCanaryEnv(process.env);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('settlement_bridge_disabled');
  });

  it('blocks money path frozen', () => {
    process.env.MONEY_PATH_FROZEN = 'true';
    const r = assertSettlementStagingCanaryEnv(process.env);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('money_path_frozen');
  });

  it('accepts staging env when gates pass', () => {
    const r = assertSettlementStagingCanaryEnv(process.env);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.target).toBe('staging');
      expect(r.settlementBridgeEnabled).toBe(true);
      expect(r.moneyPathFrozen).toBe(false);
    }
  });

  it('ops snapshot marks staging canary eligible when unblocked', () => {
    const ops = buildSettlementOpsSnapshot(process.env);
    expect(ops.stagingCanaryEligible).toBe(true);
    expect(ops.blockers).toEqual([]);
    expect(ops.economicLedgerBoundary.settlementEnabled).toBe(false);
  });

  it('boundary documents no reward/payout activation', () => {
    expect(SETTLEMENT_STAGING_CANARY_BOUNDARY.createsRewards).toBe(false);
    expect(SETTLEMENT_STAGING_CANARY_BOUNDARY.createsPayouts).toBe(false);
    expect(SETTLEMENT_STAGING_CANARY_BOUNDARY.economicLedgerSettlementEnabled).toBe(
      false,
    );
  });
});

describe('M2 Settlement staging canary — run', () => {
  const prevEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...stagingEnv() };
  });

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it('dry-run performs no ledger writes', async () => {
    const store: Store = {
      commission: approvedCommission(),
      ledgers: new Map(),
      ledgerByRef: new Map(),
      events: [],
      ledgerInserts: 0,
    };
    const r = await runSettlementStagingCanary(makeMock(store) as never, {
      commissionId: String(store.commission!.id),
      mode: 'dry_run',
      env: process.env,
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.mode === 'dry_run') {
      expect(r.writesPerformed).toBe(false);
      expect(r.wouldSettle).toBe(true);
      expect(r.diagnostics.ops.stagingCanaryEligible).toBe(true);
    }
    expect(store.ledgerInserts).toBe(0);
    expect(store.events.length).toBe(0);
  });

  it('disabled bridge blocks execute with no writes', async () => {
    delete process.env.SETTLEMENT_BRIDGE_ENABLED;
    const store: Store = {
      commission: approvedCommission(),
      ledgers: new Map(),
      ledgerByRef: new Map(),
      events: [],
      ledgerInserts: 0,
    };
    const r = await runSettlementStagingCanary(makeMock(store) as never, {
      commissionId: String(store.commission!.id),
      mode: 'execute',
      env: process.env,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('settlement_bridge_disabled');
    expect(store.ledgerInserts).toBe(0);
    expect(store.events.length).toBe(0);
  });

  it('production runtime blocks execute with no writes', async () => {
    process.env.VERCEL_ENV = 'production';
    process.env.NODE_ENV = 'production';
    const store: Store = {
      commission: approvedCommission(),
      ledgers: new Map(),
      ledgerByRef: new Map(),
      events: [],
      ledgerInserts: 0,
    };
    const r = await runSettlementStagingCanary(makeMock(store) as never, {
      commissionId: String(store.commission!.id),
      mode: 'execute',
      env: process.env,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('production_runtime_forbidden');
    expect(store.ledgerInserts).toBe(0);
  });

  it('execute settles approved commission on staging', async () => {
    const store: Store = {
      commission: approvedCommission(),
      ledgers: new Map(),
      ledgerByRef: new Map(),
      events: [],
      ledgerInserts: 0,
    };
    const r = await runSettlementStagingCanary(makeMock(store) as never, {
      commissionId: String(store.commission!.id),
      mode: 'execute',
      env: process.env,
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.mode === 'execute') {
      expect(r.settlement.event).toBe('settlement_created');
      expect(r.writesPerformed).toBe(true);
      expect(r.settlement.createdCreatorReward).toBe(false);
      expect(r.settlement.createdPayout).toBe(false);
      expect(r.diagnostics?.ledgerEntryId).toBeTruthy();
    }
    expect(store.ledgerInserts).toBe(1);
  });
});
