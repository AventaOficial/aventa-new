import { describe, expect, it } from 'vitest';
import {
  filterStickyByCooldown,
  pickStickyTargetsWithDiversity,
  type StickySkuTarget,
} from '@/lib/hunter/supply/stickySku';
import {
  loadStickyBudgetConfig,
  resolveStickyNicheBudget,
} from '@/lib/hunter/supply/stickyBudgets';
import { nicheCategoriesForSticky } from '@/lib/hunter/supply/stickyNicheAttribution';
import { nicheProfileById } from '@/lib/hunter/supply/nicheProfiles';
import { runSupplyEngine } from '@/lib/hunter/supply/engine';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';

function target(
  productId: string,
  over: Partial<StickySkuTarget> = {},
): StickySkuTarget {
  return {
    productId,
    priorDays: 6,
    lastObservedOn: '2026-09-10',
    lastPrice: 100,
    listPrice: 200,
    hoursSinceObserved: 48,
    nicheId: 'beauty',
    store: null,
    category: 'belleza',
    ...over,
  };
}

describe('sticky niche budgets', () => {
  it('4–5. niche budget propio y global nunca excede techo', () => {
    const cfg = loadStickyBudgetConfig();
    expect(cfg.globalMaxPerWave).toBeGreaterThan(0);
    for (const id of ['beauty', 'electronics', 'day_to_day'] as const) {
      const b = resolveStickyNicheBudget(id, cfg);
      expect(b).toBeGreaterThan(0);
      expect(b).toBeLessThanOrEqual(cfg.globalMaxPerWave);
      expect(b).toBeLessThanOrEqual(cfg.nicheMaxPerWave[id] ?? cfg.defaultNicheMaxPerWave);
    }
    expect(resolveStickyNicheBudget('unknown_niche', cfg)).toBe(0);
  });

  it('1–3. cada nicho tiene categorías propias (sin solape beauty↔electronics)', () => {
    const beauty = nicheCategoriesForSticky(nicheProfileById('beauty')!);
    const electronics = nicheCategoriesForSticky(nicheProfileById('electronics')!);
    const dtd = nicheCategoriesForSticky(nicheProfileById('day_to_day')!);
    expect(beauty).toContain('belleza');
    expect(electronics).toEqual(expect.arrayContaining(['tecnologia', 'gaming']));
    expect(dtd).toEqual(expect.arrayContaining(['supermercado', 'hogar']));
    expect(beauty.some((c) => electronics.includes(c))).toBe(false);
    expect(beauty.some((c) => dtd.includes(c))).toBe(false);
  });
});

describe('sticky cooldown + diversidad', () => {
  it('6–7. cooldown filtra / vencido permite', () => {
    const rows = [
      { productId: 'A', hoursSinceObserved: 5 },
      { productId: 'B', hoursSinceObserved: 30 },
    ];
    expect(filterStickyByCooldown(rows, 20).map((r) => r.productId)).toEqual(['B']);
  });

  it('8–10. historyReady/drop priorizan sin forzar approval (orden)', () => {
    const ranked = [
      target('LOW_HIST', { priorDays: 4, lastPrice: 180, listPrice: 200 }),
      target('HIGH_HIST_DROP', { priorDays: 10, lastPrice: 100, listPrice: 200 }),
      target('HIGH_HIST', { priorDays: 10, lastPrice: 190, listPrice: 200 }),
    ].sort((a, b) => {
      const drop = (t: StickySkuTarget) =>
        t.lastPrice != null && t.listPrice != null && t.listPrice > t.lastPrice
          ? (t.listPrice - t.lastPrice) / t.listPrice
          : 0;
      return b.priorDays - a.priorDays || drop(b) - drop(a);
    });
    expect(ranked[0]!.productId).toBe('HIGH_HIST_DROP');
    expect(ranked[1]!.productId).toBe('HIGH_HIST');
  });

  it('11–12. diversidad store + sin duplicar productId; budget limita', () => {
    const ranked = [
      target('MLM1', { store: 'seller_a' }),
      target('MLM1', { store: 'seller_a' }),
      target('MLM2', { store: 'seller_a' }),
      target('MLM3', { store: 'seller_a' }),
      target('MLM4', { store: 'seller_b' }),
      target('MLM5', { store: 'seller_c' }),
    ];
    const { picked, duplicateSkipped, budgetLimited } = pickStickyTargetsWithDiversity(ranked, {
      maxTargets: 3,
      maxPerStore: 2,
    });
    expect(picked.map((p) => p.productId)).toEqual(['MLM1', 'MLM2', 'MLM4']);
    expect(new Set(picked.map((p) => p.productId)).size).toBe(picked.length);
    expect(duplicateSkipped).toBeGreaterThan(0);
    expect(budgetLimited).toBeGreaterThan(0);
  });
});

describe('sticky niche isolation (allowlist)', () => {
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

  it('1–4. beauty y electronics solo seleccionan su allowlist; budgets independientes', async () => {
    const { selectStickySkuTargetsWithReport } = await import('@/lib/hunter/supply/stickySku');
    const { resolveStickyNicheBudget } = await import('@/lib/hunter/supply/stickyBudgets');

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

    const beauty = await selectStickySkuTargetsWithReport({
      nicheId: 'beauty',
      productIdAllowlist: new Set(['MLMBEAUTY1']),
      supabase: mockDb(allRows) as never,
      now,
      config: { maxTargets: resolveStickyNicheBudget('beauty'), minHistoryDays: 4, cooldownHours: 20 },
    });
    expect(beauty.targets.map((t) => t.productId)).toEqual(['MLMBEAUTY1']);
    expect(beauty.targets.every((t) => t.nicheId === 'beauty')).toBe(true);
    expect(beauty.stickySelected).toBeLessThanOrEqual(beauty.nicheBudget);
    expect(beauty.stickySelected).toBeLessThanOrEqual(beauty.globalBudget);

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
    expect(dayToDay.nicheId).toBe('day_to_day');
  });
});

describe('WRITE safety sticky niche mission', () => {
  it('13–15. dry_run WRITE false; legacy auto-approve write off', async () => {
    const report = await runSupplyEngine({
      mode: 'dry_run',
      nicheId: 'electronics',
      enableSticky: false,
      persistSnapshots: false,
      sources: [],
    });
    expect(report.wroteOffers).toBe(false);
    expect(loadBotIngestConfig('standard').legacyAutoApproveWriteEnabled).toBe(false);
  });
});
