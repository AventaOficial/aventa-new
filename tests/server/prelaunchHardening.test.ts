import { describe, it, expect, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { isEmailVerifiedForCommunity } from '../../lib/server/requireCommunityUser';
import { hasCurrentLegalConsent } from '../../lib/server/legalConsent';
import { isUserBanned } from '../../lib/server/isUserBanned';
import { getCommentableOffer, validateCommentParent } from '../../lib/server/commentOfferGuard';

describe('isEmailVerifiedForCommunity', () => {
  it('acepta email confirmado', () => {
    const user = { email_confirmed_at: '2026-01-01', identities: [] } as User;
    expect(isEmailVerifiedForCommunity(user)).toBe(true);
  });

  it('acepta OAuth sin email_confirmed_at', () => {
    const user = {
      email_confirmed_at: null,
      identities: [{ provider: 'google' }],
    } as User;
    expect(isEmailVerifiedForCommunity(user)).toBe(true);
  });

  it('rechaza email sin confirmar', () => {
    const user = {
      email_confirmed_at: null,
      identities: [{ provider: 'email' }],
    } as User;
    expect(isEmailVerifiedForCommunity(user)).toBe(false);
  });
});

describe('hasCurrentLegalConsent', () => {
  it('devuelve true con consentimiento vigente', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        terms_accepted_at: '2026-08-30',
        privacy_accepted_at: '2026-08-30',
        legal_consent_version: '2026-08-30',
      },
      error: null,
    });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      }),
    } as unknown as Parameters<typeof hasCurrentLegalConsent>[0];

    await expect(hasCurrentLegalConsent(supabase, 'user-1')).resolves.toBe(true);
  });

  it('devuelve false sin consentimiento', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { terms_accepted_at: null, privacy_accepted_at: null, legal_consent_version: null },
      error: null,
    });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      }),
    } as unknown as Parameters<typeof hasCurrentLegalConsent>[0];

    await expect(hasCurrentLegalConsent(supabase, 'user-1')).resolves.toBe(false);
  });
});

describe('isUserBanned', () => {
  it('devuelve true cuando hay ban activo', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'ban-1' }, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        maybeSingle,
      }),
    } as unknown as Parameters<typeof isUserBanned>[0];

    await expect(isUserBanned(supabase, 'user-1')).resolves.toBe(true);
  });

  it('devuelve false sin ban', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        maybeSingle,
      }),
    } as unknown as Parameters<typeof isUserBanned>[0];

    await expect(isUserBanned(supabase, 'user-1')).resolves.toBe(false);
  });
});

describe('commentOfferGuard', () => {
  it('getCommentableOffer devuelve null si no está publicada', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'o1', status: 'pending' }, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      }),
    } as unknown as Parameters<typeof getCommentableOffer>[0];

    await expect(getCommentableOffer(supabase, 'o1')).resolves.toBeNull();
  });

  it('getCommentableOffer acepta oferta approved', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'o1', status: 'approved' }, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      }),
    } as unknown as Parameters<typeof getCommentableOffer>[0];

    await expect(getCommentableOffer(supabase, 'o1')).resolves.toEqual({ id: 'o1', status: 'approved' });
  });

  it('validateCommentParent rechaza parent de otra oferta', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'c1', offer_id: 'other-offer', status: 'approved' },
      error: null,
    });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      }),
    } as unknown as Parameters<typeof validateCommentParent>[0];

    const result = await validateCommentParent(supabase, 'offer-1', 'c1');
    expect(result).toEqual({ ok: false, error: 'La respuesta no pertenece a esta oferta.' });
  });
});
