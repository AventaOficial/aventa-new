import { describe, it, expect } from 'vitest';
import { computeOfferScore, normalizeVoteCounts } from '../../lib/offers/scoring';

describe('scoring contract', () => {
  it('usa fórmula canonica up*2 - down', () => {
    expect(computeOfferScore(0, 0)).toBe(0);
    expect(computeOfferScore(1, 0)).toBe(2);
    expect(computeOfferScore(10, 3)).toBe(17);
    expect(computeOfferScore(0, 4)).toBe(-4);
  });

  it('normaliza contadores y score de forma estable', () => {
    expect(normalizeVoteCounts(undefined, undefined)).toEqual({ up: 0, down: 0, score: 0 });
    expect(normalizeVoteCounts(null, 2)).toEqual({ up: 0, down: 2, score: -2 });
    expect(normalizeVoteCounts(5, 1)).toEqual({ up: 5, down: 1, score: 9 });
  });
});
