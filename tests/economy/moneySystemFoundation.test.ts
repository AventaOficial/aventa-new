/**
 * Money System Foundation — deterministic scenarios 1–18.
 * Shadow path only. No real settlement / payouts.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ECONOMIC_LEDGER_BOUNDARY,
  COMMISSION_TRANSITIONS,
  canTransitionCommission,
} from '@/lib/economy/types';
import {
  resolveConversionAttribution,
  recordConversion,
  transitionConversionStatus,
} from '@/lib/economy/recordConversion';
import { recordCommission, transitionCommissionStatus } from '@/lib/economy/recordCommission';
import {
  snapshotMoneyFoundationFreeze,
  assertMoneyShadowAllowed,
  runMoneyShadowPipeline,
  projectShadowAllocations,
  MONEY_SHADOW_MODE,
  MONEY_SYSTEM_AUTHORITIES,
  MONEY_SYSTEM_CHAIN,
  MONEY_SYSTEM_PRESENT_INVARIANTS,
  MONEY_SYSTEM_MISSING_INVARIANTS,
  checkCurrencyMatch,
  assertNonNegativeIntegerCents,
} from '@/lib/economy';
import {
  actorKeyFromSignals,
  buildClickIdempotencyKey,
} from '@/lib/attribution/clickIdentity';
import { splitCommissionCents, REWARDS_CREATOR_SHARE_BPS } from '@/lib/rewards/config';
import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';
import { isCommissionProgramPubliclyActive } from '@/lib/commissions/programStatus';

function mockEconomyDb(opts: {
  click?: {
    id: string;
    offer_id: string;
    clicker_user_id?: string | null;
    created_at?: string;
  } | null;
  existingConversion?: Record<string, unknown> | null;
  existingCommission?: Record<string, unknown> | null;
  uniqueOnInsert?: 'conversion' | 'commission' | 'commission_conversion' | null;
  commissionByConversion?: Record<string, unknown> | null;
}) {
  const inserts: Array<{ table: string; row: unknown }> = [];
  const events: unknown[] = [];
  let conversionEqCount = 0;

  const clickRow = opts.click
    ? {
        ...opts.click,
        clicker_user_id: opts.click.clicker_user_id ?? null,
        created_at: opts.click.created_at ?? '2026-09-18T11:00:00.000Z',
      }
    : null;

  const sb = {
    from: vi.fn((table: string) => {
      if (table === 'offers') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        };
      }
      if (table === 'reward_outbound_clicks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: clickRow,
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === 'affiliate_economic_events') {
        return {
          insert: vi.fn(async (row: unknown) => {
            events.push(row);
            return { error: null };
          }),
        };
      }
      if (table === 'affiliate_conversions') {
        return {
          insert: vi.fn((row: unknown) => {
            inserts.push({ table, row });
            return {
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => {
                  if (opts.uniqueOnInsert === 'conversion') {
                    return {
                      data: null,
                      error: { code: '23505', message: 'duplicate' },
                    };
                  }
                  return {
                    data: {
                      id: 'conv-new',
                      ...(row as object),
                      external_conversion_id: (row as { external_conversion_id: string })
                        .external_conversion_id,
                    },
                    error: null,
                  };
                }),
              })),
            };
          }),
          select: vi.fn(() => {
            const api: Record<string, unknown> = {};
            const self = () => api;
            api.eq = () => {
              conversionEqCount += 1;
              return self();
            };
            api.maybeSingle = vi.fn(async () => {
              if (opts.uniqueOnInsert === 'conversion' && opts.existingConversion) {
                return { data: opts.existingConversion, error: null };
              }
              if (opts.existingConversion) {
                return { data: opts.existingConversion, error: null };
              }
              return { data: { id: 'conv-new', status: 'received' }, error: null };
            });
            return api;
          }),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          })),
        };
      }
      if (table === 'affiliate_commissions') {
        return {
          insert: vi.fn((row: unknown) => {
            inserts.push({ table, row });
            return {
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => {
                  if (
                    opts.uniqueOnInsert === 'commission' ||
                    opts.uniqueOnInsert === 'commission_conversion'
                  ) {
                    return {
                      data: null,
                      error: { code: '23505', message: 'duplicate' },
                    };
                  }
                  const r = row as Record<string, unknown>;
                  expect(r.ledger_entry_id).toBeNull();
                  return {
                    data: {
                      id: 'comm-new',
                      ...r,
                      ledger_entry_id: null,
                    },
                    error: null,
                  };
                }),
              })),
            };
          }),
          select: vi.fn(() => {
            const api: Record<string, unknown> = {};
            const filters: string[] = [];
            const self = () => api;
            api.eq = (col: string) => {
              filters.push(col);
              return self();
            };
            api.maybeSingle = vi.fn(async () => {
              if (filters.includes('external_commission_id') && opts.existingCommission) {
                return { data: opts.existingCommission, error: null };
              }
              if (
                filters.includes('conversion_id') &&
                (opts.commissionByConversion || opts.existingCommission)
              ) {
                return {
                  data: opts.commissionByConversion ?? opts.existingCommission,
                  error: null,
                };
              }
              if (opts.existingCommission && filters.length === 0) {
                return { data: opts.existingCommission, error: null };
              }
              // status transition path
              if (opts.existingCommission) {
                return { data: opts.existingCommission, error: null };
              }
              return { data: null, error: null };
            });
            return api;
          }),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          })),
        };
      }
      // Forbidden money tables — any insert should be detectable by shadow guard
      if (
        table === 'affiliate_ledger_entries' ||
        table === 'creator_rewards' ||
        table === 'reward_payouts'
      ) {
        return {
          insert: vi.fn(() => {
            inserts.push({ table, row: {} });
            return {
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            };
          }),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        };
      }
      return {};
    }),
  };

  return { sb, inserts, events, conversionEqCount };
}

describe('Money System Foundation — authorities & chain', () => {
  it('documents single economic path (no second SoT)', () => {
    expect(MONEY_SYSTEM_CHAIN).toEqual([
      'offer',
      'click',
      'attribution',
      'conversion',
      'commission',
      'ledger',
      'allocation',
      'reward',
    ]);
    expect(MONEY_SYSTEM_AUTHORITIES.click.table).toBe('reward_outbound_clicks');
    expect(MONEY_SYSTEM_AUTHORITIES.conversion.table).toBe('affiliate_conversions');
    expect(MONEY_SYSTEM_AUTHORITIES.commission.table).toBe('affiliate_commissions');
    expect(MONEY_SYSTEM_AUTHORITIES.platformLedger.table).toBe('affiliate_ledger_entries');
    expect(MONEY_SYSTEM_AUTHORITIES.reward.table).toBe('creator_rewards');
    expect(MONEY_SYSTEM_PRESENT_INVARIANTS.length).toBeGreaterThan(5);
    expect(MONEY_SYSTEM_MISSING_INVARIANTS.some((s) => s.includes('settlement'))).toBe(true);
  });

  it('double-credit migration adds UNIQUE(conversion_id)', () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        'docs/supabase-migrations/20260918_money_system_double_credit.sql',
      ),
      'utf8',
    );
    expect(sql).toMatch(/affiliate_commissions_conversion_unique/);
    expect(sql).toMatch(/UNIQUE INDEX[\s\S]*\(conversion_id\)/);
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/settlementEnabled\s*=\s*true/);
  });
});

describe('1–3 click / attribution identity', () => {
  it('1. click attribution identity is deterministic', () => {
    const a = buildClickIdempotencyKey({
      offerId: 'offer-1',
      actorKey: 'u:user-1',
      nowMs: 1_700_000_000_000,
    });
    const b = buildClickIdempotencyKey({
      offerId: 'offer-1',
      actorKey: 'u:user-1',
      nowMs: 1_700_000_000_000,
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(40);
  });

  it('2. authenticated user attribution uses u: prefix', () => {
    expect(actorKeyFromSignals({ userId: 'abc-123' })).toBe('u:abc-123');
  });

  it('3. anonymous click distinguishable — never silent user assign', () => {
    expect(actorKeyFromSignals({})).toBe('anon');
    expect(actorKeyFromSignals({ ipHash: 'deadbeef' })).toBe('ip:deadbeef');
    expect(actorKeyFromSignals({ userId: null, ipHash: null })).toBe('anon');
    expect(actorKeyFromSignals({ userId: '  ' })).toBe('anon');
  });
});

describe('4–5 conversion + duplicate', () => {
  it('4. conversion with click → attributed', async () => {
    const { sb } = mockEconomyDb({
      click: { id: 'click-1', offer_id: 'offer-1' },
    });
    const r = await recordConversion(sb as never, {
      source: 'api',
      network: 'amazon',
      externalConversionId: 'ORD-M1',
      occurredAt: '2026-09-18T12:00:00.000Z',
      clickId: 'click-1',
    });
    expect(r?.attributionStatus).toBe('attributed');
    expect(r?.clickId).toBe('click-1');
    expect(r?.offerId).toBe('offer-1');
  });

  it('5. duplicate conversion → reused (idempotent)', async () => {
    const existing = {
      id: 'conv-existing',
      source: 'api',
      network: 'amazon',
      external_conversion_id: 'ORD-DUP',
      click_id: null,
      offer_id: null,
      attribution_status: 'unattributed',
      status: 'received',
      occurred_at: '2026-09-18T12:00:00.000Z',
    };
    const { sb } = mockEconomyDb({
      uniqueOnInsert: 'conversion',
      existingConversion: existing,
    });
    const r = await recordConversion(sb as never, {
      source: 'api',
      network: 'amazon',
      externalConversionId: 'ORD-DUP',
      occurredAt: '2026-09-18T12:00:00.000Z',
    });
    expect(r?.reused).toBe(true);
    expect(r?.conversionId).toBe('conv-existing');
  });
});

describe('6–9 commission lifecycle + idempotency', () => {
  it('6. commission reported', async () => {
    const { sb, inserts } = mockEconomyDb({
      existingConversion: { id: 'conv-1' },
    });
    const r = await recordCommission(sb as never, {
      conversionId: 'conv-1',
      source: 'api',
      network: 'amazon',
      externalCommissionId: 'COM-R1',
      grossCommissionCents: 2500,
      occurredAt: '2026-09-18T12:00:00.000Z',
      status: 'reported',
    });
    expect(r?.status).toBe('reported');
    expect(r?.ledgerEntryId).toBeNull();
    expect(inserts.some((i) => i.table === 'affiliate_commissions')).toBe(true);
  });

  it('7. commission confirmation (reported→approved) ≠ settled', async () => {
    expect(canTransitionCommission('reported', 'approved')).toBe(true);
    expect(COMMISSION_TRANSITIONS.approved).toContain('reversed');
    expect(COMMISSION_TRANSITIONS.approved).not.toContain('settled' as never);
    expect(ECONOMIC_LEDGER_BOUNDARY.settlementEnabled).toBe(false);

    const sb = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { id: 'm1', status: 'reported' },
              error: null,
            })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        })),
        insert: vi.fn(async () => ({ error: null })),
      })),
    };
    // affiliate_economic_events insert on same from mock — simplify with dual table
    const events: unknown[] = [];
    const dual = {
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
                data: { id: 'm1', status: 'reported' },
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
    void sb;
    const r = await transitionCommissionStatus(dual as never, {
      commissionId: 'm1',
      toStatus: 'approved',
    });
    expect(r.ok).toBe(true);
    expect(r.to).toBe('approved');
  });

  it('8. duplicate commission report → reused (external id)', async () => {
    const existing = {
      id: 'comm-existing',
      conversion_id: 'conv-1',
      source: 'api',
      network: 'amazon',
      external_commission_id: 'COM-DUP',
      gross_commission_cents: 100,
      currency: 'MXN',
      status: 'reported',
      occurred_at: '2026-09-18T12:00:00.000Z',
      ledger_entry_id: null,
    };
    const { sb } = mockEconomyDb({
      existingConversion: { id: 'conv-1' },
      uniqueOnInsert: 'commission',
      existingCommission: existing,
    });
    const r = await recordCommission(sb as never, {
      conversionId: 'conv-1',
      source: 'api',
      network: 'amazon',
      externalCommissionId: 'COM-DUP',
      grossCommissionCents: 999999,
      occurredAt: '2026-09-18T12:00:00.000Z',
    });
    expect(r?.reused).toBe(true);
    expect(r?.grossCommissionCents).toBe(100);
  });

  it('9. ledger idempotency — shadow never books ledger; UNIQUE documented', () => {
    expect(ECONOMIC_LEDGER_BOUNDARY.foundationWritesLedger).toBe(false);
    const ledgerSql = readFileSync(
      join(process.cwd(), 'docs/supabase-migrations/affiliate_platform_ledger.sql'),
      'utf8',
    );
    expect(ledgerSql).toMatch(/affiliate_ledger_unique_external_per_network/);
    const rewardSql = readFileSync(
      join(process.cwd(), 'docs/supabase-migrations/20260830_rewards_v1.sql'),
      'utf8',
    );
    expect(rewardSql).toMatch(/UNIQUE \(ledger_entry_id\)/);
  });
});

describe('10–11 allocations', () => {
  it('10. user allocation projection (not withdrawable)', () => {
    const a = projectShadowAllocations({ grossCommissionCents: 1000 });
    expect(a.creatorCents).toBe(splitCommissionCents(1000).creatorCents);
    expect(a.withdrawable).toBe(false);
    expect(a.settled).toBe(false);
    expect(a.note).toBe('shadow_projection_only_not_user_balance');
  });

  it('11. Aventa/platform allocation projection', () => {
    const a = projectShadowAllocations({
      grossCommissionCents: 1000,
      creatorShareBps: REWARDS_CREATOR_SHARE_BPS,
    });
    expect(a.platformCents).toBe(1000 - a.creatorCents);
    expect(a.creatorCents + a.platformCents).toBe(1000);
  });
});

describe('12–14 attribution conflicts / missing / reversed', () => {
  it('12. conflicting attribution — click offer wins over client offerId', async () => {
    const sb = {
      from: vi.fn((table: string) => {
        if (table === 'offers') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: 'click-1',
                  offer_id: 'offer-from-click',
                  clicker_user_id: null,
                  created_at: '2026-09-18T11:00:00.000Z',
                },
                error: null,
              })),
            })),
          })),
        };
      }),
    };
    const r = await resolveConversionAttribution(sb as never, {
      clickId: 'click-1',
      offerId: 'offer-forged-client',
      conversionAt: '2026-09-18T12:00:00.000Z',
    });
    expect(r.attributionStatus).toBe('attributed');
    expect(r.offerId).toBe('offer-from-click');
  });

  it('13. missing commission — conversion alone does not invent commission', async () => {
    const { sb, inserts } = mockEconomyDb({
      click: { id: 'c1', offer_id: 'o1' },
    });
    await recordConversion(sb as never, {
      source: 'api',
      network: 'amazon',
      externalConversionId: 'ORD-NO-COM',
      occurredAt: '2026-09-18T12:00:00.000Z',
      clickId: 'c1',
    });
    expect(inserts.every((i) => i.table !== 'affiliate_commissions')).toBe(true);
  });

  it('14. reversed/cancelled commission terminal', async () => {
    expect(canTransitionCommission('reversed', 'approved')).toBe(false);
    expect(canTransitionCommission('rejected', 'approved')).toBe(false);
    const sb = {
      from: vi.fn((table: string) => {
        if (table === 'affiliate_economic_events') {
          return { insert: vi.fn(async () => ({ error: null })) };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: 'm1', status: 'reversed' },
                error: null,
              })),
            })),
          })),
        };
      }),
    };
    const r = await transitionCommissionStatus(sb as never, {
      commissionId: 'm1',
      toStatus: 'approved',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('invalid_transition');
  });
});

describe('15–17 currency / negatives / concurrent settlement', () => {
  it('15. currency mismatch detected', () => {
    expect(checkCurrencyMatch('MXN', 'USD').ok).toBe(false);
    expect(checkCurrencyMatch('mxn', 'MXN').ok).toBe(true);
    expect(checkCurrencyMatch(null, 'MXN').reason).toBe('missing');
  });

  it('16. impossible negative values rejected', () => {
    expect(assertNonNegativeIntegerCents(-1)).toBe(false);
    expect(assertNonNegativeIntegerCents(12.5)).toBe(false);
    expect(assertNonNegativeIntegerCents(0)).toBe(true);
    expect(() => projectShadowAllocations({ grossCommissionCents: -5 })).toThrow(
      /invalid_gross_commission_cents/,
    );
  });

  it('17. concurrent settlement blocked — settlementEnabled false + no settled status', () => {
    expect(ECONOMIC_LEDGER_BOUNDARY.settlementEnabled).toBe(false);
    expect(Object.values(COMMISSION_TRANSITIONS).flat()).not.toContain('settled');
  });
});

describe('18. frozen production path + program freeze', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('freeze snapshot: settlement OFF; shadow allowed when boundary intact', () => {
    const snap = snapshotMoneyFoundationFreeze();
    expect(snap.settlementEnabled).toBe(false);
    expect(snap.foundationWritesLedger).toBe(false);
    expect(snap.foundationWritesRewards).toBe(false);
    expect(snap.foundationWritesPayouts).toBe(false);
    expect(snap.shadowAllowed).toBe(true);
    expect(() => assertMoneyShadowAllowed()).not.toThrow();
  });

  it('does not activate REWARDS or COMMISSION programs', () => {
    expect(isRewardsProgramActive()).toBe(false);
    expect(isCommissionProgramPubliclyActive()).toBe(false);
  });

  it('money path frozen semantics preserved in production-shaped env', () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_ENV = 'production';
    delete process.env.MONEY_PATH_FROZEN;
    expect(isMoneyPathFrozen()).toBe(true);
  });
});

function mockShadowPipelineDb() {
  const inserts: Array<{ table: string; row: unknown }> = [];
  let conversion: Record<string, unknown> = {
    id: 'conv-shadow',
    status: 'received',
  };
  let commission: Record<string, unknown> = {
    id: 'comm-shadow',
    conversion_id: 'conv-shadow',
    status: 'reported',
    ledger_entry_id: null,
    gross_commission_cents: 1000,
    currency: 'MXN',
    external_commission_id: 'SH-COM-1',
    source: 'api',
    network: 'amazon',
    occurred_at: '2026-09-18T12:00:00.000Z',
  };

  const sb = {
    from: vi.fn((table: string) => {
      if (table === 'offers') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        };
      }
      if (table === 'reward_outbound_clicks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: 'click-sh',
                  offer_id: 'offer-sh',
                  clicker_user_id: null,
                  created_at: '2026-09-18T11:00:00.000Z',
                },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === 'affiliate_economic_events') {
        return { insert: vi.fn(async () => ({ error: null })) };
      }
      if (table === 'affiliate_conversions') {
        return {
          insert: vi.fn((row: unknown) => {
            inserts.push({ table, row });
            conversion = {
              id: 'conv-shadow',
              ...(row as object),
              status: (row as { status?: string }).status ?? 'received',
            };
            return {
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    id: 'conv-shadow',
                    ...conversion,
                    external_conversion_id: (row as { external_conversion_id: string })
                      .external_conversion_id,
                  },
                  error: null,
                })),
              })),
            };
          }),
          select: vi.fn(() => {
            const api: Record<string, unknown> = {};
            const self = () => api;
            api.eq = () => self();
            api.maybeSingle = vi.fn(async () => ({
              data: { id: conversion.id, status: conversion.status },
              error: null,
            }));
            return api;
          }),
          update: vi.fn((patch: Record<string, unknown>) => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => {
                conversion = { ...conversion, ...patch };
                return { error: null };
              }),
            })),
          })),
        };
      }
      if (table === 'affiliate_commissions') {
        return {
          insert: vi.fn((row: unknown) => {
            inserts.push({ table, row });
            const r = row as Record<string, unknown>;
            expect(r.ledger_entry_id).toBeNull();
            commission = {
              id: 'comm-shadow',
              ...r,
              ledger_entry_id: null,
            };
            return {
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: commission,
                  error: null,
                })),
              })),
            };
          }),
          select: vi.fn(() => {
            const api: Record<string, unknown> = {};
            const self = () => api;
            api.eq = () => self();
            api.maybeSingle = vi.fn(async () => ({
              data: {
                id: commission.id,
                status: commission.status,
                conversion_id: commission.conversion_id,
              },
              error: null,
            }));
            return api;
          }),
          update: vi.fn((patch: Record<string, unknown>) => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => {
                commission = { ...commission, ...patch };
                return { error: null };
              }),
            })),
          })),
        };
      }
      return {
        insert: vi.fn(() => {
          inserts.push({ table, row: {} });
          return { select: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) };
        }),
      };
    }),
  };

  return { sb, inserts };
}

describe('shadow pipeline end-to-end', () => {
  beforeEach(() => {
    delete process.env.REWARDS_PROGRAM_ACTIVE;
    delete process.env.COMMISSION_PROGRAM_ACTIVE;
  });

  it('runs CLICK→CONVERSION→COMMISSION_REPORTED→CONFIRMED→projections without ledger/reward writes', async () => {
    const { sb, inserts } = mockShadowPipelineDb();
    const evidence = await runMoneyShadowPipeline(sb as never, {
      source: 'api',
      network: 'amazon',
      externalConversionId: 'SH-ORD-1',
      externalCommissionId: 'SH-COM-1',
      grossCommissionCents: 1000,
      clickId: 'click-sh',
      currency: 'MXN',
    });

    expect(evidence.mode).toBe(MONEY_SHADOW_MODE);
    expect(evidence.settlementEnabled).toBe(false);
    expect(evidence.reconstructable).toBe(true);
    expect(evidence.chain).toContain('CLICK');
    expect(evidence.chain).toContain('CONVERSION');
    expect(evidence.chain).toContain('COMMISSION_REPORTED');
    expect(evidence.chain).toContain('COMMISSION_CONFIRMED');
    expect(evidence.chain).toContain('LEDGER_PROJECTED');
    expect(evidence.chain).toContain('REWARD_PROJECTED');
    expect(evidence.chain).not.toContain('COMMISSION_SETTLED');
    expect(evidence.allocation?.withdrawable).toBe(false);
    expect(evidence.touchedForbiddenTables).toEqual([]);
    expect(inserts.every((i) => i.table !== 'affiliate_ledger_entries')).toBe(true);
    expect(inserts.every((i) => i.table !== 'creator_rewards')).toBe(true);
    expect(inserts.every((i) => i.table !== 'reward_payouts')).toBe(true);
  });

  it('double-credit: second commission on same conversion reuses via UNIQUE(conversion_id)', async () => {
    const existing = {
      id: 'comm-canonical',
      conversion_id: 'conv-1',
      source: 'api',
      network: 'amazon',
      external_commission_id: 'COM-A',
      gross_commission_cents: 500,
      currency: 'MXN',
      status: 'reported',
      occurred_at: '2026-09-18T12:00:00.000Z',
      ledger_entry_id: null,
    };
    const { sb } = mockEconomyDb({
      existingConversion: { id: 'conv-1' },
      uniqueOnInsert: 'commission_conversion',
      existingCommission: null,
      commissionByConversion: existing,
    });
    const r = await recordCommission(sb as never, {
      conversionId: 'conv-1',
      source: 'api',
      network: 'amazon',
      externalCommissionId: 'COM-DIFFERENT-EXTERNAL',
      grossCommissionCents: 9999,
      occurredAt: '2026-09-18T13:00:00.000Z',
    });
    expect(r?.reused).toBe(true);
    expect(r?.commissionId).toBe('comm-canonical');
    expect(r?.grossCommissionCents).toBe(500);
  });

  it('shadow modules never import distribution/supply/telegram', () => {
    const files = [
      'lib/economy/shadow/moneyShadowPipeline.ts',
      'lib/economy/shadow/assertMoneyFoundationFreeze.ts',
      'lib/economy/shadow/authorities.ts',
      'lib/economy/shadow/invariants.ts',
    ];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), 'utf8');
      expect(src).not.toMatch(/lib\/distribution/);
      expect(src).not.toMatch(/lib\/supply/);
      expect(src).not.toMatch(/telegram/i);
    }
  });
});

describe('conversion reverse path', () => {
  it('confirmed→reversed ok; blocks inventing money from reverse', async () => {
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
                data: { id: 'c1', status: 'confirmed' },
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
    const r = await transitionConversionStatus(sb as never, {
      conversionId: 'c1',
      toStatus: 'reversed',
    });
    expect(r.ok).toBe(true);
    expect(events.length).toBe(1);
  });
});
