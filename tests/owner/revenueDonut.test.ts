import { describe, expect, it } from 'vitest';
import { revenueDonutSplit } from '@/lib/owner/revenueSplit';

describe('revenueDonutSplit', () => {
  it('0/0 no inventa porcentajes', () => {
    expect(revenueDonutSplit(0, 0)).toEqual({ ok: false, reason: 'insufficient' });
  });

  it('100/0', () => {
    expect(revenueDonutSplit(100, 0)).toEqual({ ok: true, confirmedPct: 100, estimatedPct: 0 });
  });

  it('0/100', () => {
    expect(revenueDonutSplit(0, 100)).toEqual({ ok: true, confirmedPct: 0, estimatedPct: 100 });
  });

  it('30/70', () => {
    expect(revenueDonutSplit(30, 70)).toEqual({ ok: true, confirmedPct: 30, estimatedPct: 70 });
  });

  it('null', () => {
    expect(revenueDonutSplit(null, 10)).toEqual({ ok: false, reason: 'insufficient' });
    expect(revenueDonutSplit(10, null)).toEqual({ ok: false, reason: 'insufficient' });
  });

  it('dato parcial', () => {
    expect(revenueDonutSplit(undefined, 10)).toEqual({ ok: false, reason: 'insufficient' });
    expect(revenueDonutSplit(10, Number.NaN)).toEqual({ ok: false, reason: 'insufficient' });
  });
});
