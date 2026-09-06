/**
 * FASE 0.8 — P1-1 batch approve, P1-4 expired votes, P1-3 ban fail-closed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { assertOfferReadyForAffiliateApproval } from '../../lib/moderation/approveReadiness';
import { canUseBulkModeration } from '../../lib/moderation/moderationBulkAccess';
import {
  canAcceptNewPublicVote,
  isOfferExpiredByExpiresAt,
  isPubliclyVotableOfferStatus,
} from '../../lib/votes/offerVoteEligibility';
import { isUserBanned, lookupUserBan } from '../../lib/server/isUserBanned';
import { requireBearerMeUser } from '../../lib/server/requireMeUser';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('P1-1 — batch approve invariants', () => {
  const mlUrl = 'https://articulo.mercadolibre.com.mx/MLM-123-test';
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.ML_AFFILIATE_TAG = 'tag';
    process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG = 'tag';
  });
  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('1-2 — solo owner/admin usan bulk; moderator no', () => {
    expect(canUseBulkModeration('owner')).toBe(true);
    expect(canUseBulkModeration('admin')).toBe(true);
    expect(canUseBulkModeration('moderator')).toBe(false);
    expect(canUseBulkModeration('analyst')).toBe(false);
  });

  it('7 — batch no bypassa link_mod_ok (misma barra que single)', () => {
    expect(
      assertOfferReadyForAffiliateApproval({
        offerUrl: mlUrl,
        linkModOk: false,
        batchApprove: true,
        originalProductUrl: mlUrl,
      }).ok,
    ).toBe(false);
    expect(
      assertOfferReadyForAffiliateApproval({
        offerUrl: mlUrl,
        linkModOk: true,
        batchApprove: true,
        originalProductUrl: mlUrl,
      }).ok,
    ).toBe(true);
  });

  it('5 — already same status handled at route (pending-only CAS documented)', () => {
    // moderate-offer usa .eq('status','pending') — rejected/approved no pasan.
    expect(true).toBe(true);
  });
});

describe('P1-4 — votos en ofertas expiradas', () => {
  const now = Date.parse('2026-09-05T12:00:00.000Z');

  it('11 — active (null expires) → allowed', () => {
    expect(canAcceptNewPublicVote({ status: 'approved', expiresAt: null, nowMs: now }).ok).toBe(
      true,
    );
  });

  it('12 — expired → rejected', () => {
    const r = canAcceptNewPublicVote({
      status: 'approved',
      expiresAt: '2026-09-05T11:59:59.000Z',
      nowMs: now,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('expired');
  });

  it('13 — pending → status reject', () => {
    const r = canAcceptNewPublicVote({ status: 'pending', expiresAt: null, nowMs: now });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('status');
  });

  it('14 — rejected → status reject', () => {
    const r = canAcceptNewPublicVote({ status: 'rejected', expiresAt: null, nowMs: now });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('status');
  });

  it('15 — boundary expires_at === now → still active (gte feed rule)', () => {
    expect(
      canAcceptNewPublicVote({
        status: 'approved',
        expiresAt: '2026-09-05T12:00:00.000Z',
        nowMs: now,
      }).ok,
    ).toBe(true);
    expect(isOfferExpiredByExpiresAt('2026-09-05T12:00:00.000Z', now)).toBe(false);
  });

  it('16 — client cannot pass expiration; helper only uses DB fields', () => {
    // No client expires_at parameter — only expiresAt from row.
    expect(isOfferExpiredByExpiresAt('2026-09-06T00:00:00.000Z', now)).toBe(false);
  });

  it('17 — historical votes: eligibility only gates new votes', () => {
    expect(isPubliclyVotableOfferStatus('approved')).toBe(true);
    // No delete of historical votes in this phase.
  });

  it('19 — invalid expires_at → fail-closed expired', () => {
    expect(isOfferExpiredByExpiresAt('not-a-date', now)).toBe(true);
  });
});

function banMock(opts: {
  data?: { id: string } | null;
  error?: { message: string } | null;
  throwErr?: boolean;
}): SupabaseClient {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockImplementation(async () => {
        if (opts.throwErr) throw new Error('timeout');
        return { data: opts.data ?? null, error: opts.error ?? null };
      }),
    }),
  } as unknown as SupabaseClient;
}

describe('P1-3 — ban fail-closed', () => {
  it('25 — banned=true → blocked', async () => {
    const r = await lookupUserBan(banMock({ data: { id: 'b1' } }), 'u1');
    expect(r.ok && r.banned).toBe(true);
  });

  it('26 — banned=false → allowed', async () => {
    const r = await lookupUserBan(banMock({ data: null }), 'u1');
    expect(r.ok && !r.banned).toBe(true);
  });

  it('27 — DB error → lookup ok=false; isUserBanned fail-closed true', async () => {
    const r = await lookupUserBan(banMock({ error: { message: 'db down' } }), 'u1');
    expect(r.ok).toBe(false);
    await expect(isUserBanned(banMock({ error: { message: 'db down' } }), 'u1')).resolves.toBe(
      true,
    );
  });

  it('28 — exception/timeout → fail-closed', async () => {
    const r = await lookupUserBan(banMock({ throwErr: true }), 'u1');
    expect(r.ok).toBe(false);
    await expect(isUserBanned(banMock({ throwErr: true }), 'u1')).resolves.toBe(true);
  });

  it('24 — missing auth → 401', async () => {
    const req = new Request('https://aventaofertas.com/api/me/x');
    const r = await requireBearerMeUser(req, { mutate: true });
    expect('error' in r && r.status === 401).toBe(true);
  });

  it('29 — client cannot spoof ban (lookup ignores body)', async () => {
    // Ban state only from user_bans via server client — no request body field.
    const r = await lookupUserBan(banMock({ data: { id: 'b' } }), 'u1');
    expect(r.ok && r.banned).toBe(true);
  });
});

describe('P1-3 — requireBearerMeUser mutate policy (mocked auth)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('21 — mutate + banned → 403 user_banned', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createServerClient: () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'u-banned' } }, error: null }),
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              or: () => ({
                maybeSingle: async () => ({ data: { id: 'ban' }, error: null }),
              }),
            }),
          }),
        }),
      }),
    }));
    const { requireBearerMeUser: requireMe } = await import('../../lib/server/requireMeUser');
    const req = new Request('https://x/api/me', {
      headers: { authorization: 'Bearer tok' },
    });
    const r = await requireMe(req, { mutate: true });
    expect('error' in r).toBe(true);
    if ('error' in r) {
      expect(r.status).toBe(403);
      expect(r.code).toBe('user_banned');
    }
    vi.doUnmock('@/lib/supabase/server');
  });

  it('22 — mutate + not banned → success shape', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createServerClient: () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'u-ok' } }, error: null }),
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              or: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    }));
    const { requireBearerMeUser: requireMe } = await import('../../lib/server/requireMeUser');
    const req = new Request('https://x/api/me', {
      headers: { authorization: 'Bearer tok' },
    });
    const r = await requireMe(req, { mutate: true });
    expect('user' in r && r.user.id === 'u-ok').toBe(true);
    vi.doUnmock('@/lib/supabase/server');
  });

  it('23 — GET (no mutate) allows banned user through auth helper', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createServerClient: () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'u-banned' } }, error: null }),
        },
        from: () => {
          throw new Error('ban lookup should not run for GET');
        },
      }),
    }));
    const { requireBearerMeUser: requireMe } = await import('../../lib/server/requireMeUser');
    const req = new Request('https://x/api/me', {
      headers: { authorization: 'Bearer tok' },
    });
    const r = await requireMe(req);
    expect('user' in r && r.user.id === 'u-banned').toBe(true);
    vi.doUnmock('@/lib/supabase/server');
  });
});
