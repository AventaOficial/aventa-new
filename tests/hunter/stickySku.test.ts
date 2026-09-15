import { describe, expect, it } from 'vitest';
import { filterStickyByCooldown, DEFAULT_STICKY_SKU_CONFIG } from '@/lib/hunter/supply/stickySku';
import { parseMlSourceDetail } from '@/lib/hunter/supply/qualityClass';
import { computeMlPriceIntel } from '@/lib/bots/ingest/mlPriceEngine';

describe('sticky cooldown', () => {
  it('excluye SKUs observados dentro del cooldown', () => {
    const filtered = filterStickyByCooldown(
      [
        { productId: 'A', hoursSinceObserved: 2 },
        { productId: 'B', hoursSinceObserved: 24 },
      ],
      20,
    );
    expect(filtered.map((t) => t.productId)).toEqual(['B']);
  });

  it('cooldown es configurable y > 0', () => {
    expect(DEFAULT_STICKY_SKU_CONFIG.cooldownHours).toBeGreaterThan(0);
    expect(DEFAULT_STICKY_SKU_CONFIG.maxTargets).toBeGreaterThan(0);
  });
});

describe('sticky vs fresh attribution', () => {
  it('parsea discoveryMode sticky', () => {
    expect(parseMlSourceDetail('ml:sticky:MLM123|niche:beauty|mode:sticky')).toEqual({
      kind: 'sticky',
      value: 'MLM123',
      sort: null,
      discoveryMode: 'sticky',
    });
  });

  it('parsea fresh highlights', () => {
    const p = parseMlSourceDetail('ml:hl:MLM1246|q:perfume|sort:highlights');
    expect(p.discoveryMode).toBe('fresh');
    expect(p.kind).toBe('hl');
  });
});

describe('historyReady contract (sticky intel)', () => {
  it('no inventa historical low sin ≥4 días', () => {
    const intel = computeMlPriceIntel(
      { current: 100, listPrice: 110, regularPrice: null },
      [{ recordedOn: '2026-09-14', lastPrice: 120, minPrice: 120, listPrice: 110, regularPrice: null }],
      '2026-09-15',
    );
    expect(intel.historyReady).toBe(false);
    expect(intel.lowest90d).toBeNull();
  });
});

describe('budget defaults', () => {
  it('sticky maxTargets acota presupuesto', () => {
    expect(DEFAULT_STICKY_SKU_CONFIG.maxTargets).toBeLessThanOrEqual(36);
  });
});
