/**
 * Yield-focused discovery: escape the sticky query pot.
 * Does NOT touch money / publish / 25% threshold.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildAdaptiveDiscoveryPlan,
  nextSchedulerState,
  ML_EXPLORATION_QUERY_FAMILIES,
} from '@/lib/hunter/candidateIntelligence/discoveryScheduler';
import {
  buildExplorationQueryCatalog,
  isStickyExploitQueryList,
} from '@/lib/hunter/candidateIntelligence/queryFamilyCatalog';
import {
  loadSchedulerState,
  saveSchedulerState,
  resetSchedulerStateMemoryForTests,
  peekSchedulerStateMemory,
} from '@/lib/hunter/candidateIntelligence/schedulerStateStore';
import { recoverUnknownDiscountShadow } from '@/lib/hunter/candidateIntelligence/unknownDiscountRecovery';
import { isAdaptiveDiscoveryEnabled } from '@/lib/bots/ingest/discoverMercadoLibre';
import { resolveCanonicalDiscount } from '@/lib/bots/ingest/canonicalDiscount';

describe('anti-sticky query catalog', () => {
  it('exploration catalog is much wider than the sticky ≤12 exploit pot', () => {
    const catalog = buildExplorationQueryCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(40);
    expect(ML_EXPLORATION_QUERY_FAMILIES.length).toBeGreaterThanOrEqual(40);
    expect(catalog.some((q) => /perfume|serum|detergente|galaxy/i.test(q))).toBe(true);
  });

  it('flags production-style short BOT_INGEST_ML_QUERIES as sticky exploit list', () => {
    const prodStyle = [
      'laptop',
      'audifonos bluetooth',
      'tablet',
      'smartwatch',
      'televisor smart',
      'freidora de aire',
      'ssd nvme',
      'mouse inalambrico',
      'teclado mecanico',
      'monitor 27 pulgadas',
    ];
    expect(isStickyExploitQueryList(prodStyle)).toBe(true);
    expect(isStickyExploitQueryList([...prodStyle, ...catalogPad(20)])).toBe(false);
  });
});

function catalogPad(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `extra query ${i}`);
}

describe('adaptive plan escapes sticky exploit', () => {
  it('with sticky exploit list, plan still includes explore-axis queries not in exploit', () => {
    const exploit = ['laptop', 'tablet', 'ssd nvme'];
    const plan = buildAdaptiveDiscoveryPlan({
      runSlot: 100,
      exploitQueries: exploit,
      explorationShare: 0.4,
      maxCalls: 14,
      pageStrategy: 'page_1_only',
    });
    expect(plan.pages).toEqual([1]);
    const exploreQs = plan.calls.filter((c) => c.axis === 'explore' && c.kind === 'q');
    expect(exploreQs.length).toBeGreaterThan(0);
    for (const c of exploreQs) {
      expect(exploit.includes(c.value)).toBe(false);
    }
  });

  it('persisted offsets change the explore window across runs', async () => {
    resetSchedulerStateMemoryForTests();
    const plan1 = buildAdaptiveDiscoveryPlan({
      runSlot: 1,
      exploitQueries: ['laptop'],
      explorationShare: 0.5,
      maxCalls: 10,
    });
    const next = nextSchedulerState(plan1, null);
    await saveSchedulerState({ state: next });
    const prior = await loadSchedulerState({});
    expect(prior?.lastQueryOffset).toBeGreaterThan(0);

    const plan2 = buildAdaptiveDiscoveryPlan({
      runSlot: 2,
      priorState: prior,
      exploitQueries: ['laptop'],
      explorationShare: 0.5,
      maxCalls: 10,
    });
    const explore1 = plan1.calls.filter((c) => c.axis === 'explore').map((c) => c.value);
    const explore2 = plan2.calls.filter((c) => c.axis === 'explore').map((c) => c.value);
    // Not identical windows after cursor advance
    expect(explore1.join('|')).not.toBe(explore2.join('|'));
    expect(peekSchedulerStateMemory()).not.toBeNull();
  });
});

describe('adaptive default ON', () => {
  it('defaults to enabled; opt-out with =0', () => {
    expect(isAdaptiveDiscoveryEnabled({} as NodeJS.ProcessEnv)).toBe(true);
    expect(isAdaptiveDiscoveryEnabled({ HUNTER_ADAPTIVE_DISCOVERY: '1' } as NodeJS.ProcessEnv)).toBe(
      true,
    );
    expect(isAdaptiveDiscoveryEnabled({ HUNTER_ADAPTIVE_DISCOVERY: '0' } as NodeJS.ProcessEnv)).toBe(
      false,
    );
  });
});

describe('UNKNOWN shadow recovery', () => {
  beforeEach(() => {
    resetSchedulerStateMemoryForTests();
  });

  it('does not invent recovery without client/history', async () => {
    const r = await recoverUnknownDiscountShadow({
      salePrice: 100,
      originalPrice: null,
      itemId: 'MLM1234567890',
      supabase: null,
    });
    expect(r.recovered).toBe(false);
    expect(r.reason).toBe('no_client');
  });

  it('recovers shadow class from Price Memory max above sale (mock)', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            gte: () => ({
              limit: async () => ({
                data: [
                  { last_price: 100, list_price: 200, regular_price: null, recorded_on: '2026-09-01' },
                  { last_price: 110, list_price: 180, regular_price: null, recorded_on: '2026-09-10' },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as never;

    const r = await recoverUnknownDiscountShadow({
      salePrice: 100,
      originalPrice: null,
      itemId: 'MLM1234567890',
      supabase: client,
    });
    expect(r.recovered).toBe(true);
    expect(r.historicalPrice).toBe(200);
    expect(r.shadowDiscountPercentage).toBe(50);
    expect(r.shadowDiscountClass).toBe('DISCOUNT_REAL_GOOD');
  });

  it('canonical path still keeps UNKNOWN when original missing (no invent for gates)', () => {
    const c = resolveCanonicalDiscount({ salePrice: 100, originalPrice: null });
    expect(c.discountPercentage).toBeNull();
    expect(c.discountClass).toBe('DISCOUNT_UNKNOWN');
  });
});
