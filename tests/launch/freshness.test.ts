import { describe, expect, it } from 'vitest';
import {
  compareFreshnessCandidates,
  freshnessPriorityScore,
  scheduleNextCheckAt,
} from '@/lib/offers/freshness/priority';
import { resolveFreshnessBatchLimit } from '@/lib/offers/freshness/policy';
import { presentOfferFreshness } from '@/lib/offers/freshness/present';

const now = new Date('2026-09-23T12:00:00.000Z');

describe('freshness priority', () => {
  it('ranks hot and volatile offers above cold ones', () => {
    const hot = freshnessPriorityScore({
      outbound7d: 8,
      createdAt: '2026-09-23T10:00:00.000Z',
      healthStatus: 'price_changed',
      lastCheckedAt: '2026-09-20T12:00:00.000Z',
      now,
    });
    const cold = freshnessPriorityScore({
      outbound7d: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      healthStatus: 'available',
      lastCheckedAt: now.toISOString(),
      now,
    });
    expect(hot).toBeGreaterThan(cold);
  });

  it('breaks ties by offer id', () => {
    const ranked = [
      { id: 'b', score: 10 },
      { id: 'a', score: 10 },
    ].sort(compareFreshnessCandidates);
    expect(ranked.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('backs off unknown checks and rechecks price changes sooner', () => {
    const unknown = scheduleNextCheckAt({
      now,
      persistedStatus: 'unknown',
      outbound7d: 0,
      consecutiveFailures: 2,
    });
    const changed = scheduleNextCheckAt({
      now,
      persistedStatus: 'price_changed',
      outbound7d: 0,
      consecutiveFailures: 0,
    });
    expect(unknown.getTime() - now.getTime()).toBe(2 * 60 * 60 * 1000);
    expect(changed.getTime() - now.getTime()).toBe(4 * 60 * 60 * 1000);
  });

  it('caps a batch below an unbounded scan', () => {
    expect(resolveFreshnessBatchLimit('500')).toBe(50);
    expect(resolveFreshnessBatchLimit(undefined)).toBe(30);
  });
});

describe('public freshness', () => {
  it('does not treat a stale available offer as healthy', () => {
    const view = presentOfferFreshness({
      expiresAt: null,
      healthStatus: 'available',
      lastCheckedAt: '2026-09-01T00:00:00.000Z',
      now,
    });
    expect(view.state).toBe('unknown');
    expect(view.ctaEnabled).toBe(true);
  });

  it('disables CTA and indexing for unavailable and expired offers', () => {
    const unavailable = presentOfferFreshness({
      expiresAt: null,
      healthStatus: 'out_of_stock',
      lastCheckedAt: now.toISOString(),
      now,
    });
    const expired = presentOfferFreshness({
      expiresAt: '2026-09-01T00:00:00.000Z',
      healthStatus: 'available',
      now,
    });
    expect(unavailable.state).toBe('unavailable');
    expect(unavailable.ctaEnabled).toBe(false);
    expect(unavailable.indexable).toBe(false);
    expect(expired.state).toBe('expired');
    expect(expired.indexable).toBe(false);
    expect(expired.ctaEnabled).toBe(false);
  });

  it('keeps price changes visible and clickable', () => {
    const view = presentOfferFreshness({
      expiresAt: null,
      healthStatus: 'price_changed',
      lastCheckedAt: now.toISOString(),
      now,
    });
    expect(view.state).toBe('price_changed');
    expect(view.ctaEnabled).toBe(true);
    expect(view.indexable).toBe(true);
    expect(view.label).toBe('El precio cambió');
  });
});
