import { describe, it, expect, vi, beforeEach } from 'vitest';
import { selectWelcomeOffer, acceptRewardsProgramTerms } from '../../lib/rewards/unlock';
import { REWARDS_TERMS_VERSION } from '../../lib/rewards/config';
import type { SupabaseClient } from '@supabase/supabase-js';

const USER = '11111111-1111-1111-1111-111111111111';
const OFFER = '22222222-2222-2222-2222-222222222222';
const OTHER = '33333333-3333-3333-3333-333333333333';

function mockSupabase(scenario: {
  unlocked?: boolean;
  welcomeAlready?: boolean;
  termsAccepted?: boolean;
  raceLost?: boolean;
}): SupabaseClient {
  const profile = {
    reward_program_unlocked_at: scenario.unlocked === false ? null : '2026-01-01T00:00:00Z',
    welcome_offer_id: scenario.welcomeAlready ? OFFER : null,
    rewards_terms_accepted_at: scenario.termsAccepted ? '2026-01-02T00:00:00Z' : null,
    rewards_terms_version: scenario.termsAccepted ? REWARDS_TERMS_VERSION : null,
  };

  const offersById: Record<string, { id: string; created_by: string; status: string }> = {
    [OFFER]: { id: OFFER, created_by: USER, status: 'approved' },
    [OTHER]: {
      id: OTHER,
      created_by: '99999999-9999-9999-9999-999999999999',
      status: 'approved',
    },
  };

  let lastOfferId = OFFER;

  const profilesChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(async () => {
      // Lectura inicial de perfil
      if (!profilesChain.update.mock.calls.length) {
        return { data: profile, error: null };
      }
      // Tras update atómico
      if (scenario.raceLost || scenario.welcomeAlready) {
        return { data: null, error: null };
      }
      return {
        data: { welcome_offer_id: OFFER, welcome_offer_selected_at: '2026-01-03T00:00:00Z' },
        error: null,
      };
    }),
  };

  const from = vi.fn((table: string) => {
    if (table === 'profiles') return profilesChain;
    if (table === 'offers') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((col: string, val: string) => {
          if (col === 'id') lastOfferId = val;
          return from('offers');
        }),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [{ id: OFFER }],
          error: null,
        }),
        maybeSingle: vi.fn().mockImplementation(async () => ({
          data: offersById[lastOfferId] ?? null,
          error: null,
        })),
      };
    }
    if (table === 'reward_audit_log') {
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    }
    return {};
  });

  return { from } as unknown as SupabaseClient;
}

describe('acceptRewardsProgramTerms', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rechaza si no está desbloqueado', async () => {
    const supabase = mockSupabase({ unlocked: false });
    const result = await acceptRewardsProgramTerms(supabase, USER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it('acepta términos cuando está desbloqueado', async () => {
    const supabase = mockSupabase({ unlocked: true, termsAccepted: false });
    const result = await acceptRewardsProgramTerms(supabase, USER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.alreadyAccepted).toBe(false);
      expect(result.termsVersion).toBe(REWARDS_TERMS_VERSION);
    }
  });

  it('es idempotente si ya aceptó la versión vigente', async () => {
    const supabase = mockSupabase({ unlocked: true, termsAccepted: true });
    const result = await acceptRewardsProgramTerms(supabase, USER);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.alreadyAccepted).toBe(true);
  });
});

describe('Welcome offer selection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exige términos previos si no se pasa acceptTerms', async () => {
    const supabase = mockSupabase({ unlocked: true, termsAccepted: false });
    const result = await selectWelcomeOffer(supabase, USER, OFFER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it('puede elegir con términos ya aceptados', async () => {
    const supabase = mockSupabase({ unlocked: true, termsAccepted: true });
    const result = await selectWelcomeOffer(supabase, USER, OFFER);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.welcomeOfferId).toBe(OFFER);
  });

  it('no puede elegir una oferta ajena', async () => {
    const supabase = mockSupabase({ unlocked: true, termsAccepted: true });
    const result = await selectWelcomeOffer(supabase, USER, OTHER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it('no puede cambiarla libremente después', async () => {
    const supabase = mockSupabase({
      unlocked: true,
      termsAccepted: true,
      welcomeAlready: true,
    });
    const result = await selectWelcomeOffer(supabase, USER, OFFER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });

  it('detecta carrera (doble reclamación) como 409', async () => {
    const supabase = mockSupabase({
      unlocked: true,
      termsAccepted: true,
      raceLost: true,
    });
    const result = await selectWelcomeOffer(supabase, USER, OFFER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });
});
