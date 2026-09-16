import { describe, expect, it, vi } from 'vitest';
import {
  canTransitionConversion,
  canTransitionCommission,
  ECONOMIC_LEDGER_BOUNDARY,
} from '@/lib/economy/types';
import {
  recordConversion,
  resolveConversionAttribution,
  transitionConversionStatus,
} from '@/lib/economy/recordConversion';
import { recordCommission, transitionCommissionStatus } from '@/lib/economy/recordCommission';
import { buildConversionCommissionTruth } from '@/lib/economy/buildConversionCommissionTruth';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('economy state machines', () => {
  it('conversion: confirmed→reversed ok; approved path invalid; rejected terminal', () => {
    expect(canTransitionConversion('received', 'confirmed')).toBe(true);
    expect(canTransitionConversion('confirmed', 'reversed')).toBe(true);
    expect(canTransitionConversion('rejected', 'confirmed')).toBe(false);
    expect(canTransitionConversion('reversed', 'confirmed')).toBe(false);
    expect(canTransitionConversion('confirmed', 'pending')).toBe(false);
  });

  it('commission: approved→reversed ok; invalid transitions blocked', () => {
    expect(canTransitionCommission('reported', 'approved')).toBe(true);
    expect(canTransitionCommission('approved', 'reversed')).toBe(true);
    expect(canTransitionCommission('approved', 'pending')).toBe(false);
    expect(canTransitionCommission('reversed', 'approved')).toBe(false);
  });

  it('ledger boundary explícita: settlement OFF', () => {
    expect(ECONOMIC_LEDGER_BOUNDARY.foundationWritesLedger).toBe(false);
    expect(ECONOMIC_LEDGER_BOUNDARY.foundationWritesRewards).toBe(false);
    expect(ECONOMIC_LEDGER_BOUNDARY.foundationWritesPayouts).toBe(false);
    expect(ECONOMIC_LEDGER_BOUNDARY.settlementEnabled).toBe(false);
  });
});

describe('resolveConversionAttribution', () => {
  it('sin click → unattributed', async () => {
    const sb = { from: vi.fn() };
    const r = await resolveConversionAttribution(sb as never, { clickId: null });
    expect(r.attributionStatus).toBe('unattributed');
    expect(r.clickId).toBeNull();
  });

  it('click existente → attributed', async () => {
    const sb = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { id: 'click-1', offer_id: 'offer-1' },
              error: null,
            })),
          })),
        })),
      })),
    };
    const r = await resolveConversionAttribution(sb as never, { clickId: 'click-1' });
    expect(r.attributionStatus).toBe('attributed');
    expect(r.offerId).toBe('offer-1');
  });

  it('click missing → unresolved (no inventar)', async () => {
    const sb = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
    };
    const r = await resolveConversionAttribution(sb as never, { clickId: 'missing' });
    expect(r.attributionStatus).toBe('unresolved');
    expect(r.clickId).toBe('missing');
  });
});

function mockEconomyDb(opts: {
  click?: { id: string; offer_id: string } | null;
  existingConversion?: Record<string, unknown> | null;
  existingCommission?: Record<string, unknown> | null;
  uniqueOnInsert?: 'conversion' | 'commission' | null;
}) {
  const inserts: Array<{ table: string; row: unknown }> = [];
  const events: unknown[] = [];
  let conversionSelectMode: 'by_id' | 'by_external' = 'by_id';

  const sb = {
    from: vi.fn((table: string) => {
      if (table === 'reward_outbound_clicks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: opts.click ?? null,
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
            const chain = {
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
            return chain;
          }),
          select: vi.fn(() => {
            const api: Record<string, unknown> = {};
            const self = () => api;
            api.eq = () => {
              conversionSelectMode =
                conversionSelectMode === 'by_id' ? 'by_external' : conversionSelectMode;
              return self();
            };
            api.maybeSingle = vi.fn(async () => {
              if (opts.uniqueOnInsert === 'conversion' && opts.existingConversion) {
                return { data: opts.existingConversion, error: null };
              }
              if (opts.existingConversion) {
                return { data: opts.existingConversion, error: null };
              }
              return { data: { id: 'conv-new' }, error: null };
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
                  if (opts.uniqueOnInsert === 'commission') {
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
            const self = () => api;
            api.eq = () => self();
            api.maybeSingle = vi.fn(async () => ({
              data: opts.existingCommission ?? null,
              error: null,
            }));
            return api;
          }),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          })),
        };
      }
      return {};
    }),
  };

  return { sb, inserts, events };
}

describe('recordConversion', () => {
  it('NEW conversion attributed + no money tables', async () => {
    const { sb, inserts, events } = mockEconomyDb({
      click: { id: 'click-1', offer_id: 'offer-1' },
    });
    const r = await recordConversion(sb as never, {
      source: 'api',
      network: 'amazon',
      externalConversionId: 'ORD-1',
      occurredAt: '2026-09-16T12:00:00.000Z',
      clickId: 'click-1',
    });
    expect(r?.reused).toBe(false);
    expect(r?.attributionStatus).toBe('attributed');
    expect(r?.offerId).toBe('offer-1');
    expect(inserts.some((i) => i.table === 'affiliate_conversions')).toBe(true);
    expect(events.length).toBeGreaterThan(0);
    expect(inserts.every((i) => i.table !== 'creator_rewards')).toBe(true);
  });

  it('duplicate external id → reused canonical', async () => {
    const existing = {
      id: 'conv-existing',
      source: 'api',
      network: 'amazon',
      external_conversion_id: 'ORD-1',
      click_id: null,
      offer_id: null,
      attribution_status: 'unattributed',
      status: 'received',
      occurred_at: '2026-09-16T12:00:00.000Z',
    };
    const { sb } = mockEconomyDb({
      uniqueOnInsert: 'conversion',
      existingConversion: existing,
    });
    const r = await recordConversion(sb as never, {
      source: 'api',
      network: 'amazon',
      externalConversionId: 'ORD-1',
      occurredAt: '2026-09-16T12:00:00.000Z',
    });
    expect(r?.reused).toBe(true);
    expect(r?.conversionId).toBe('conv-existing');
  });

  it('conversion without click → unattributed', async () => {
    const { sb } = mockEconomyDb({ click: null });
    const r = await recordConversion(sb as never, {
      source: 'manual',
      network: 'mercadolibre',
      externalConversionId: 'ML-9',
      occurredAt: new Date('2026-09-16T12:00:00.000Z'),
    });
    expect(r?.attributionStatus).toBe('unattributed');
  });

  it('rejects forged network / empty external id', async () => {
    const { sb } = mockEconomyDb({});
    expect(
      await recordConversion(sb as never, {
        source: 'api',
        network: 'not-a-network' as never,
        externalConversionId: 'X',
        occurredAt: '2026-09-16T12:00:00.000Z',
      }),
    ).toBeNull();
    expect(
      await recordConversion(sb as never, {
        source: 'api',
        network: 'amazon',
        externalConversionId: '  ',
        occurredAt: '2026-09-16T12:00:00.000Z',
      }),
    ).toBeNull();
  });
});

describe('recordCommission', () => {
  it('attaches to conversion and forces ledger_entry_id null', async () => {
    const { sb, inserts } = mockEconomyDb({
      existingConversion: { id: 'conv-1' },
    });
    const r = await recordCommission(sb as never, {
      conversionId: 'conv-1',
      source: 'api',
      network: 'amazon',
      externalCommissionId: 'COM-1',
      grossCommissionCents: 1250,
      currency: 'mxn',
      occurredAt: '2026-09-16T12:00:00.000Z',
    });
    expect(r?.reused).toBe(false);
    expect(r?.grossCommissionCents).toBe(1250);
    expect(r?.currency).toBe('MXN');
    expect(r?.ledgerEntryId).toBeNull();
    const row = inserts.find((i) => i.table === 'affiliate_commissions')?.row as {
      ledger_entry_id: unknown;
    };
    expect(row.ledger_entry_id).toBeNull();
  });

  it('rejects non-integer / negative amount (forged)', async () => {
    const { sb } = mockEconomyDb({ existingConversion: { id: 'conv-1' } });
    expect(
      await recordCommission(sb as never, {
        conversionId: 'conv-1',
        source: 'api',
        network: 'amazon',
        externalCommissionId: 'COM-2',
        grossCommissionCents: -1,
        occurredAt: '2026-09-16T12:00:00.000Z',
      }),
    ).toBeNull();
    expect(
      await recordCommission(sb as never, {
        conversionId: 'conv-1',
        source: 'api',
        network: 'amazon',
        externalCommissionId: 'COM-3',
        grossCommissionCents: 12.5,
        occurredAt: '2026-09-16T12:00:00.000Z',
      }),
    ).toBeNull();
  });

  it('duplicate commission → reused', async () => {
    const existing = {
      id: 'comm-existing',
      conversion_id: 'conv-1',
      source: 'api',
      network: 'amazon',
      external_commission_id: 'COM-1',
      gross_commission_cents: 100,
      currency: 'MXN',
      status: 'reported',
      occurred_at: '2026-09-16T12:00:00.000Z',
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
      externalCommissionId: 'COM-1',
      grossCommissionCents: 999999,
      occurredAt: '2026-09-16T12:00:00.000Z',
    });
    expect(r?.reused).toBe(true);
    expect(r?.commissionId).toBe('comm-existing');
    expect(r?.grossCommissionCents).toBe(100);
  });
});

describe('status transitions', () => {
  it('blocks invalid conversion transition', async () => {
    const sb = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { id: 'c1', status: 'confirmed' },
              error: null,
            })),
          })),
        })),
      })),
    };
    const r = await transitionConversionStatus(sb as never, {
      conversionId: 'c1',
      toStatus: 'pending',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('invalid_transition');
  });

  it('blocks invalid commission transition', async () => {
    const sb = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { id: 'm1', status: 'reversed' },
              error: null,
            })),
          })),
        })),
      })),
    };
    const r = await transitionCommissionStatus(sb as never, {
      commissionId: 'm1',
      toStatus: 'approved',
    });
    expect(r.ok).toBe(false);
  });
});

describe('buildConversionCommissionTruth + money safety docs', () => {
  it('empty tables → 0 reported + ingest not connected + revenue not connected', async () => {
    const sb = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          gte: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: [], error: null })),
          })),
        })),
      })),
    };
    const snap = await buildConversionCommissionTruth(sb as never);
    expect(snap.ingestSourceConnected).toBe(false);
    expect(snap.conversions.reported).toBe(0);
    expect(snap.revenue.label).toBe('not connected');
    expect(snap.revenue.confirmedCents).toBeNull();
    expect(snap.ledgerBoundary.settlementEnabled).toBe(false);
  });

  it('migration is additive and money-safe', () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        'docs/supabase-migrations/20260916_conversion_commission_foundation.sql',
      ),
      'utf8',
    );
    // Strip line comments so safety assertions inspect executable SQL only.
    const executable = sql
      .split(/\r?\n/)
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');
    expect(executable).toMatch(/CREATE TABLE IF NOT EXISTS public\.affiliate_conversions/);
    expect(executable).toMatch(/CREATE TABLE IF NOT EXISTS public\.affiliate_commissions/);
    expect(executable).toMatch(/UNIQUE \(source, network, external_conversion_id\)/);
    expect(executable).toMatch(/UNIQUE \(source, network, external_commission_id\)/);
    expect(executable).toMatch(/ledger_entry_id/);
    expect(executable).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(executable).not.toMatch(/\bTRUNCATE\b/i);
    expect(executable).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(executable).not.toMatch(/\bcreator_rewards\b/);
    expect(executable).not.toMatch(/\breward_payouts\b/);
    expect(executable).not.toMatch(/\bUPDATE\s+creator_rewards\b/i);
    expect(executable).not.toMatch(/\bUPDATE\s+reward_payouts\b/i);
  });

  it('record paths never reference payouts/rewards writes', () => {
    const conv = readFileSync(
      join(process.cwd(), 'lib/economy/recordConversion.ts'),
      'utf8',
    );
    const comm = readFileSync(
      join(process.cwd(), 'lib/economy/recordCommission.ts'),
      'utf8',
    );
    expect(conv).not.toMatch(/creator_rewards/);
    expect(comm).not.toMatch(/creator_rewards/);
    expect(comm).not.toMatch(/reward_payouts/);
    expect(comm).toMatch(/ledger_entry_id: null/);
  });
});
