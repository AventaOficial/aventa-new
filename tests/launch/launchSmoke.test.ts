import { afterEach, describe, expect, it } from 'vitest';
import { decideRateLimitBackend } from '@/lib/server/rateLimitPolicy';
import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';
import { isCommissionProgramPubliclyActive } from '@/lib/commissions/programStatus';
import { isSettlementBridgeEnabled } from '@/lib/economy/settlement/isSettlementBridgeEnabled';
import { evaluateAbusePolicy } from '@/lib/abuse/risk';
import { sanitizeFunnelMetadata, OFFER_EVENT_TO_CANONICAL } from '@/lib/analytics/funnelTaxonomy';
import { sanitizeSearchQuery } from '@/lib/offers/searchQuery';
import { anonymizedProfilePatch, isDeletionGraceElapsed } from '@/lib/privacy/accountDeletionPlan';

const envSnapshot = { ...process.env };

afterEach(() => {
  process.env = { ...envSnapshot };
});

describe('rate limit policy', () => {
  it('fails closed for critical production traffic without Upstash', () => {
    expect(
      decideRateLimitBackend({ hasDistributedBackend: false, production: true, critical: true })
    ).toBe('deny');
  });

  it('allows memory fallback outside production and for non-critical reads', () => {
    expect(
      decideRateLimitBackend({ hasDistributedBackend: false, production: false, critical: true })
    ).toBe('memory');
    expect(
      decideRateLimitBackend({ hasDistributedBackend: false, production: true, critical: false })
    ).toBe('memory');
  });

  it('uses the distributed backend when configured', () => {
    expect(
      decideRateLimitBackend({ hasDistributedBackend: true, production: true, critical: true })
    ).toBe('distributed');
  });
});

describe('money stays off by default', () => {
  it('freezes the money path in production when the flag is absent', () => {
    process.env.VERCEL_ENV = 'production';
    delete process.env.MONEY_PATH_FROZEN;
    expect(isMoneyPathFrozen()).toBe(true);
  });

  it('does not activate rewards or commissions or settlement by default', () => {
    delete process.env.REWARDS_PROGRAM_ACTIVE;
    delete process.env.COMMISSION_PROGRAM_ACTIVE;
    delete process.env.SETTLEMENT_BRIDGE_ENABLED;
    expect(isRewardsProgramActive()).toBe(false);
    expect(isCommissionProgramPubliclyActive()).toBe(false);
    expect(isSettlementBridgeEnabled()).toBe(false);
  });
});

describe('abuse and analytics contracts', () => {
  it('blocks brand-new accounts from submissions', () => {
    const decision = evaluateAbusePolicy({
      action: 'submission',
      accountCreatedAt: '2026-09-23T11:59:00.000Z',
      now: new Date('2026-09-23T12:00:00.000Z'),
    });
    expect(decision.allow).toBe(false);
    expect(decision.code).toBe('account_too_new');
  });

  it('blocks self reports', () => {
    expect(evaluateAbusePolicy({ action: 'report', isSelfTarget: true }).allow).toBe(false);
  });

  it('drops PII from funnel metadata and maps historical click names', () => {
    expect(sanitizeFunnelMetadata({ email: 'a@b.c', source: 'home', token: 'x' })).toEqual({
      source: 'home',
    });
    expect(OFFER_EVENT_TO_CANONICAL.outbound).toBe('outbound_click');
    expect(OFFER_EVENT_TO_CANONICAL.view).toBe('offer_view');
  });
});

describe('search and deletion', () => {
  it('bounds search text', () => {
    expect(sanitizeSearchQuery('  tele\u0000visor  ')).toBe('tele visor');
    expect(sanitizeSearchQuery('x'.repeat(200)).length).toBe(80);
  });

  it('waits out the grace window and anonymizes without touching money fields', () => {
    expect(
      isDeletionGraceElapsed({
        requestedAt: '2026-09-23T00:00:00.000Z',
        now: new Date('2026-09-24T00:00:00.000Z'),
      })
    ).toBe(false);
    expect(
      isDeletionGraceElapsed({
        requestedAt: '2026-09-01T00:00:00.000Z',
        now: new Date('2026-09-23T00:00:00.000Z'),
      })
    ).toBe(true);
    const patch = anonymizedProfilePatch('2026-09-23T00:00:00.000Z');
    expect(patch.display_name).toBe('Cuenta eliminada');
    expect(patch).not.toHaveProperty('ledger');
    expect(patch.avatar_url).toBeNull();
  });
});
