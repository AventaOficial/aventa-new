import { describe, expect, it } from 'vitest';
import { presentOfferFreshness } from '@/lib/offers/freshness/present';
import { freshnessPriorityScore, scheduleNextCheckAt, compareFreshnessCandidates } from '@/lib/offers/freshness/priority';
import { resolveFreshnessBatchLimit } from '@/lib/offers/freshness/policy';
import { decideRateLimitBackend } from '@/lib/server/rateLimitPolicy';
import { evaluateAbusePolicy } from '@/lib/abuse/risk';
import { sanitizeFunnelMetadata, isCanonicalFunnelEvent, OFFER_EVENT_TO_CANONICAL } from '@/lib/analytics/funnelTaxonomy';
import { anonymizedProfilePatch, isDeletionGraceElapsed, deletionPurgeAfter } from '@/lib/privacy/accountDeletionPlan';
import { sanitizeSearchQuery } from '@/lib/offers/searchQuery';
import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';
import { isCommissionProgramPubliclyActive } from '@/lib/commissions/programStatus';

describe('freshness presentation', () => {
  const now = new Date('2026-09-23T12:00:00.000Z');

  it('treats a recent available check as healthy and indexable', () => {
    const view = presentOfferFreshness({
      expiresAt: null,
      healthStatus: 'available',
      lastCheckedAt: '2026-09-23T10:00:00.000Z',
      now,
    });
    expect(view.state).toBe('healthy');
    expect(view.ctaEnabled).toBe(true);
    expect(view.indexable).toBe(true);
  });

  it('does not treat a stale available offer as verified', () => {
    const view = presentOfferFreshness({
      expiresAt: null,
      healthStatus: 'available',
      lastCheckedAt: '2026-09-01T10:00:00.000Z',
      now,
    });
    expect(view.state).toBe('unknown');
    expect(view.ctaEnabled).toBe(true);
  });

  it('disables CTA for expired and unavailable offers and keeps them out of the index', () => {
    const expired = presentOfferFreshness({
      expiresAt: '2026-09-01T00:00:00.000Z',
      healthStatus: 'available',
      lastCheckedAt: now.toISOString(),
      now,
    });
    const unavailable = presentOfferFreshness({
      expiresAt: null,
      healthStatus: 'out_of_stock',
      lastCheckedAt: now.toISOString(),
      now,
    });
    expect(expired.state).toBe('expired');
    expect(expired.ctaEnabled).toBe(false);
    expect(expired.indexable).toBe(false);
    expect(unavailable.state).toBe('unavailable');
    expect(unavailable.ctaEnabled).toBe(false);
    expect(unavailable.indexable).toBe(false);
  });

  it('keeps price_changed visible with a live CTA', () => {
    const view = presentOfferFreshness({
      expiresAt: null,
      healthStatus: 'price_changed',
      lastCheckedAt: now.toISOString(),
      now,
    });
    expect(view.state).toBe('price_changed');
    expect(view.ctaEnabled).toBe(true);
    expect(view.label).toMatch(/precio/i);
  });
});

describe('freshness priority', () => {
  const now = new Date('2026-09-23T12:00:00.000Z');

  it('ranks hot and volatile offers above cold ones', () => {
    const hot = freshnessPriorityScore({
      outbound7d: 10,
      createdAt: '2026-09-23T08:00:00.000Z',
      healthStatus: 'price_changed',
      lastCheckedAt: '2026-09-23T11:00:00.000Z',
      now,
    });
    const cold = freshnessPriorityScore({
      outbound7d: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      healthStatus: 'available',
      lastCheckedAt: '2026-09-23T11:00:00.000Z',
      now,
    });
    expect(hot).toBeGreaterThan(cold);
  });

  it('backs off unknown checks and rechecks hot healthy offers sooner', () => {
    const unknown = scheduleNextCheckAt({
      now,
      persistedStatus: 'unknown',
      outbound7d: 0,
      consecutiveFailures: 4,
    });
    const hot = scheduleNextCheckAt({
      now,
      persistedStatus: 'available',
      outbound7d: 5,
      consecutiveFailures: 0,
    });
    expect(unknown.getTime() - now.getTime()).toBeGreaterThan(hot.getTime() - now.getTime());
  });

  it('breaks score ties by id', () => {
    const ordered = [
      { id: 'b', score: 10 },
      { id: 'a', score: 10 },
    ].sort(compareFreshnessCandidates);
    expect(ordered.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('caps a batch below the hard maximum', () => {
    expect(resolveFreshnessBatchLimit('500')).toBe(50);
    expect(resolveFreshnessBatchLimit(undefined)).toBe(30);
  });
});

describe('rate limit policy', () => {
  it('fail-closes critical production traffic without a distributed backend', () => {
    expect(
      decideRateLimitBackend({ hasDistributedBackend: false, production: true, critical: true })
    ).toBe('deny');
  });

  it('allows memory fallback outside production and for non-critical production reads', () => {
    expect(
      decideRateLimitBackend({ hasDistributedBackend: false, production: false, critical: true })
    ).toBe('memory');
    expect(
      decideRateLimitBackend({ hasDistributedBackend: false, production: true, critical: false })
    ).toBe('memory');
  });
});

describe('abuse policy', () => {
  it('blocks brand-new accounts from submissions and self-reports', () => {
    const tooNew = evaluateAbusePolicy({
      action: 'submission',
      accountCreatedAt: '2026-09-23T11:59:00.000Z',
      now: new Date('2026-09-23T12:00:00.000Z'),
    });
    const self = evaluateAbusePolicy({ action: 'report', isSelfTarget: true });
    expect(tooNew.allow).toBe(false);
    expect(self.code).toBe('self_target');
  });
});

describe('funnel taxonomy', () => {
  it('maps historical offer events and strips PII metadata', () => {
    expect(OFFER_EVENT_TO_CANONICAL.view).toBe('offer_view');
    expect(OFFER_EVENT_TO_CANONICAL.outbound).toBe('outbound_click');
    expect(isCanonicalFunnelEvent('login')).toBe(true);
    expect(sanitizeFunnelMetadata({ email: 'a@b.c', source: 'home', token: 'secret' })).toEqual({
      source: 'home',
    });
  });
});

describe('account deletion plan', () => {
  it('waits out the grace window and anonymizes PII without inventing a ledger delete', () => {
    const requested = new Date('2026-09-01T00:00:00.000Z');
    const purgeAfter = deletionPurgeAfter(requested);
    expect(
      isDeletionGraceElapsed({
        requestedAt: requested.toISOString(),
        now: new Date('2026-09-10T00:00:00.000Z'),
      })
    ).toBe(false);
    expect(
      isDeletionGraceElapsed({
        requestedAt: requested.toISOString(),
        purgeAfter: purgeAfter.toISOString(),
        now: new Date('2026-09-20T00:00:00.000Z'),
      })
    ).toBe(true);
    const patch = anonymizedProfilePatch('2026-09-20T00:00:00.000Z');
    expect(patch.display_name).toBe('Cuenta eliminada');
    expect(patch).not.toHaveProperty('ledger');
  });
});

describe('search query', () => {
  it('bounds length and strips control characters', () => {
    expect(sanitizeSearchQuery('  smart\u0000 tv  ')).toBe('smart tv');
    expect(sanitizeSearchQuery('x'.repeat(200)).length).toBe(80);
  });
});

describe('money stays off by default', () => {
  it('does not activate rewards or commissions from empty env, and freezes money in production', () => {
    const prev = {
      rewards: process.env.REWARDS_PROGRAM_ACTIVE,
      commission: process.env.COMMISSION_PROGRAM_ACTIVE,
      frozen: process.env.MONEY_PATH_FROZEN,
      vercel: process.env.VERCEL_ENV,
      node: process.env.NODE_ENV,
    };
    delete process.env.REWARDS_PROGRAM_ACTIVE;
    delete process.env.COMMISSION_PROGRAM_ACTIVE;
    delete process.env.MONEY_PATH_FROZEN;
    process.env.VERCEL_ENV = 'production';
    process.env.NODE_ENV = 'production';
    try {
      expect(isRewardsProgramActive()).toBe(false);
      expect(isCommissionProgramPubliclyActive()).toBe(false);
      expect(isMoneyPathFrozen()).toBe(true);
    } finally {
      if (prev.rewards === undefined) delete process.env.REWARDS_PROGRAM_ACTIVE;
      else process.env.REWARDS_PROGRAM_ACTIVE = prev.rewards;
      if (prev.commission === undefined) delete process.env.COMMISSION_PROGRAM_ACTIVE;
      else process.env.COMMISSION_PROGRAM_ACTIVE = prev.commission;
      if (prev.frozen === undefined) delete process.env.MONEY_PATH_FROZEN;
      else process.env.MONEY_PATH_FROZEN = prev.frozen;
      if (prev.vercel === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = prev.vercel;
      if (prev.node === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prev.node;
    }
  });
});
