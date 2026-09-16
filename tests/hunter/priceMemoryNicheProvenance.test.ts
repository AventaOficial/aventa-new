/**
 * P0: niche_id provenance en Price Memory — sin fallback a offers.category.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsertMock = vi.fn(async () => ({ error: null }));
const selectChain = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table !== 'product_price_snapshots') {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        select: (...args: unknown[]) => selectChain('select', ...args),
        upsert: (...args: unknown[]) => {
          upsertMock(...args);
          return Promise.resolve({ error: null });
        },
      };
    },
  }),
}));

import { nicheIdFromSourceDetail } from '@/lib/bots/ingest/priceIntel';
import { recordMlDailySnapshots } from '@/lib/bots/ingest/mlPriceEngine';
import { loadStickyProductAllowlistForNiche } from '@/lib/hunter/supply/stickyNicheAttribution';
import { selectStickySkuTargetsWithReport } from '@/lib/hunter/supply/stickySku';
import { resolveStickyNicheBudget, loadStickyBudgetConfig } from '@/lib/hunter/supply/stickyBudgets';
import { filterStickyByCooldown } from '@/lib/hunter/supply/stickySku';
import { runSupplyEngine } from '@/lib/hunter/supply/engine';

function mockExistingRead(rows: Array<Record<string, unknown>>) {
  selectChain.mockImplementation(() => ({
    eq: () => ({
      eq: () => ({
        in: async () => ({ data: rows, error: null }),
      }),
    }),
  }));
}

describe('nicheIdFromSourceDetail', () => {
  it('extrae niche explícito; no inventa desde título', () => {
    expect(nicheIdFromSourceDetail('ml:sticky:MLM1|niche:beauty|mode:sticky')).toBe('beauty');
    expect(nicheIdFromSourceDetail('worker:ml|niche:electronics')).toBe('electronics');
    expect(nicheIdFromSourceDetail('seed|niche:day_to_day|q:jabon')).toBe('day_to_day');
    expect(nicheIdFromSourceDetail('crema facial belleza barata')).toBe(null);
    expect(nicheIdFromSourceDetail('worker:ml')).toBe(null);
    expect(nicheIdFromSourceDetail(null)).toBe(null);
  });
});

describe('recordMlDailySnapshots niche_id provenance', () => {
  beforeEach(() => {
    upsertMock.mockClear();
    selectChain.mockReset();
    mockExistingRead([]);
  });

  it.each([
    ['beauty', 'MLM900000001'],
    ['electronics', 'MLM900000002'],
    ['day_to_day', 'MLM900000003'],
  ] as const)('fresh/sticky %s → snapshot niche_id=%s', async (niche, productId) => {
    await recordMlDailySnapshots([
      { productId, current: 99, listPrice: 150, regularPrice: null, nicheId: niche },
    ]);
    expect(upsertMock).toHaveBeenCalled();
    const rows = upsertMock.mock.calls[0]![0] as Array<{ niche_id: string | null; product_id: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.niche_id).toBe(niche);
    expect(rows[0]!.product_id).toBe(productId);
  });

  it('worker seed beauty vía nicheId explícito', async () => {
    await recordMlDailySnapshots([
      {
        productId: 'MLM900000010',
        current: 50,
        listPrice: 80,
        regularPrice: null,
        nicheId: nicheIdFromSourceDetail('worker:ml|niche:beauty|seed:1'),
      },
    ]);
    const rows = upsertMock.mock.calls[0]![0] as Array<{ niche_id: string | null }>;
    expect(rows[0]!.niche_id).toBe('beauty');
  });

  it('sin contexto → niche_id NULL', async () => {
    await recordMlDailySnapshots([
      { productId: 'MLM900000011', current: 10, listPrice: null, regularPrice: null },
    ]);
    const rows = upsertMock.mock.calls[0]![0] as Array<{ niche_id: string | null }>;
    expect(rows[0]!.niche_id).toBeNull();
  });

  it('legacy NULL no se convierte mágicamente (sin niche en obs nueva)', async () => {
    mockExistingRead([
      {
        product_id: 'MLM900000012',
        last_price: 10,
        min_price: 10,
        list_price: null,
        regular_price: null,
        niche_id: null,
      },
    ]);
    await recordMlDailySnapshots([
      { productId: 'MLM900000012', current: 11, listPrice: null, regularPrice: null, nicheId: null },
    ]);
    const rows = upsertMock.mock.calls[0]![0] as Array<{ niche_id: string | null }>;
    expect(rows[0]!.niche_id).toBeNull();
  });

  it('no duplica product_id en el mismo lote', async () => {
    await recordMlDailySnapshots([
      { productId: 'MLM900000013', current: 1, listPrice: null, regularPrice: null, nicheId: 'beauty' },
      { productId: 'MLM900000013', current: 2, listPrice: null, regularPrice: null, nicheId: 'beauty' },
    ]);
    const rows = upsertMock.mock.calls[0]![0] as Array<{ product_id: string; last_price: number }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.product_id).toBe('MLM900000013');
    expect(rows[0]!.last_price).toBe(2);
  });
});

describe('sticky allowlist desde snapshots.niche_id (NO offers.category)', () => {
  it('beauty pool solo desde niche_id; sin fallback category', async () => {
    const client = {
      from: (table: string) => {
        expect(table).toBe('product_price_snapshots');
        return {
          select: (cols: string) => {
            expect(cols).toBe('product_id');
            return {
              eq: (_k: string, v: string) => {
                if (v === 'mercadolibre') {
                  return {
                    eq: (_k2: string, niche: string) => {
                      expect(niche).toBe('beauty');
                      return {
                        order: () => ({
                          limit: async () => ({
                            data: [{ product_id: 'MLMBEAUTY1' }, { product_id: 'MLMBEAUTY2' }],
                            error: null,
                          }),
                        }),
                      };
                    },
                  };
                }
                throw new Error('unexpected eq');
              },
            };
          },
        };
      },
    };

    const attr = await loadStickyProductAllowlistForNiche({
      nicheId: 'beauty',
      supabase: client as never,
    });
    expect(attr.productIds.has('MLMBEAUTY1')).toBe(true);
    expect(attr.productIds.has('MLMBEAUTY2')).toBe(true);
    expect(attr.reasonIfEmpty).toBeNull();
    expect(attr.snapshotsWithNiche).toBe(2);
  });

  it('selector beauty no consume electronics; electronics no consume beauty', async () => {
    const histDays = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'];
    const beautyRows = histDays.map((on) => ({
      product_id: 'MLMBEAUTY1',
      recorded_on: on,
      last_price: 100,
      list_price: 200,
      recorded_at: `${on}T12:00:00Z`,
    }));
    const elecRows = histDays.map((on) => ({
      product_id: 'MLMELEC1',
      recorded_on: on,
      last_price: 500,
      list_price: 900,
      recorded_at: `${on}T12:00:00Z`,
    }));
    const allRows = [...beautyRows, ...elecRows];
    const now = new Date('2026-09-15T18:00:00.000Z');

    function mockDb(rows: Array<Record<string, unknown>>) {
      return {
        from: () => ({
          select: () => ({
            eq: () => ({
              gte: () => ({
                lt: () => ({
                  order: () => ({
                    limit: async () => ({ data: rows, error: null }),
                  }),
                }),
              }),
              eq: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }),
      };
    }

    const beauty = await selectStickySkuTargetsWithReport({
      nicheId: 'beauty',
      productIdAllowlist: new Set(['MLMBEAUTY1']),
      supabase: mockDb(allRows) as never,
      now,
      config: { maxTargets: resolveStickyNicheBudget('beauty'), minHistoryDays: 4, cooldownHours: 20 },
    });
    expect(beauty.targets.map((t) => t.productId)).toEqual(['MLMBEAUTY1']);
    expect(beauty.targets.some((t) => t.productId === 'MLMELEC1')).toBe(false);

    const electronics = await selectStickySkuTargetsWithReport({
      nicheId: 'electronics',
      productIdAllowlist: new Set(['MLMELEC1']),
      supabase: mockDb(allRows) as never,
      now,
      config: {
        maxTargets: resolveStickyNicheBudget('electronics'),
        minHistoryDays: 4,
        cooldownHours: 20,
      },
    });
    expect(electronics.targets.map((t) => t.productId)).toEqual(['MLMELEC1']);
    expect(electronics.targets.some((t) => t.productId === 'MLMBEAUTY1')).toBe(false);

    const dayToDay = await selectStickySkuTargetsWithReport({
      nicheId: 'day_to_day',
      productIdAllowlist: new Set(['MLMDTD1']),
      supabase: mockDb(
        histDays.map((on) => ({
          product_id: 'MLMDTD1',
          recorded_on: on,
          last_price: 40,
          list_price: 60,
          recorded_at: `${on}T12:00:00Z`,
        })),
      ) as never,
      now,
      config: {
        maxTargets: resolveStickyNicheBudget('day_to_day'),
        minHistoryDays: 4,
        cooldownHours: 20,
      },
    });
    expect(dayToDay.targets.map((t) => t.productId)).toEqual(['MLMDTD1']);
  });

  it('cooldown 20h y budgets 8/8/8 + global intactos', () => {
    const cfg = loadStickyBudgetConfig();
    expect(cfg.globalMaxPerWave).toBe(24);
    expect(resolveStickyNicheBudget('beauty', cfg)).toBe(8);
    expect(resolveStickyNicheBudget('electronics', cfg)).toBe(8);
    expect(resolveStickyNicheBudget('day_to_day', cfg)).toBe(8);
    expect(filterStickyByCooldown([{ productId: 'A', hoursSinceObserved: 19 }], 20)).toEqual([]);
    expect(filterStickyByCooldown([{ productId: 'B', hoursSinceObserved: 20 }], 20).map((r) => r.productId)).toEqual([
      'B',
    ]);
  });

  it('allowlist vacío sin niche_id → fail-closed (no usa offers)', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
    };
    const attr = await loadStickyProductAllowlistForNiche({
      nicheId: 'beauty',
      supabase: client as never,
    });
    expect(attr.productIds.size).toBe(0);
    expect(attr.reasonIfEmpty).toBe('no_snapshots_with_niche_id');
  });
});

describe('WRITE safety', () => {
  it('dry_run no escribe ofertas', async () => {
    const report = await runSupplyEngine({
      mode: 'dry_run',
      nicheId: 'beauty',
      enableSticky: false,
      persistSnapshots: false,
      sources: [],
    });
    expect(report.wroteOffers).toBe(false);
  });
});
