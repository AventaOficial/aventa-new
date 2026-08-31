import { describe, it, expect, vi, beforeEach } from 'vitest';
import { selectWelcomeOffer } from '../../lib/rewards/unlock';
import type { SupabaseClient } from '@supabase/supabase-js';

const USER = '11111111-1111-1111-1111-111111111111';
const OFFER = '22222222-2222-2222-2222-222222222222';
const OTHER = '33333333-3333-3333-3333-333333333333';

function mockSupabase(scenario: 'ok' | 'already' | 'foreign' | 'not_first15'): SupabaseClient {
  const profile = {
    reward_program_unlocked_at: '2026-01-01T00:00:00Z',
    welcome_offer_id: scenario === 'already' ? OFFER : null,
  };

  const offersById: Record<string, { id: string; created_by: string; status: string }> = {
    [OFFER]: { id: OFFER, created_by: USER, status: 'approved' },
    [OTHER]: { id: OTHER, created_by: '99999999-9999-9999-9999-999999999999', status: 'approved' },
  };

  const first15 = scenario === 'not_first15' ? [] : [OFFER];

  const from = vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: profile, error: null }),
        update: vi.fn().mockReturnThis(),
        is: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    if (table === 'offers') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: first15.map((id) => ({ id })),
          error: null,
        }),
        maybeSingle: vi.fn().mockImplementation(async () => {
          const id = (from as unknown as { _lastOfferId?: string })._lastOfferId ?? OFFER;
          return { data: offersById[id] ?? null, error: null };
        }),
      };
    }
    if (table === 'reward_audit_log') {
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    }
    return {};
  });

  const supabase = {
    from: vi.fn((table: string) => {
      const chain = from(table);
      if (table === 'offers') {
        const origEq = chain.eq;
        chain.eq = vi.fn(function (col: string, val: string) {
          if (col === 'id') (from as unknown as { _lastOfferId?: string })._lastOfferId = val;
          return origEq?.call(this, col, val) ?? chain;
        });
      }
      return chain;
    }),
  } as unknown as SupabaseClient;

  return supabase;
}

describe('Welcome offer selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('puede elegir una oferta válida', async () => {
    const supabase = mockSupabase('ok');
    const result = await selectWelcomeOffer(supabase, USER, OFFER);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.welcomeOfferId).toBe(OFFER);
  });

  it('no puede elegir una oferta ajena', async () => {
    const supabase = mockSupabase('ok');
    const result = await selectWelcomeOffer(supabase, USER, OTHER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it('no puede cambiarla libremente después', async () => {
    const supabase = mockSupabase('already');
    const result = await selectWelcomeOffer(supabase, USER, OFFER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });
});
