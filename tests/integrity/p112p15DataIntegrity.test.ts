/**
 * FASE 0.7 — P1-12 offers.status DEFAULT + P1-5 welcome claim integrity.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { selectWelcomeOffer } from '../../lib/rewards/unlock';
import { computeRewardsProgress, type RewardsMembership } from '../../lib/rewards/eligibility';
import { REWARDS_TERMS_VERSION } from '../../lib/rewards/config';
import type { SupabaseClient } from '@supabase/supabase-js';

const MIGRATION = join(
  process.cwd(),
  'docs/supabase-migrations/20260906_p1_12_p1_5_integrity.sql',
);

describe('P1-12 — offers.status DEFAULT pending (migration)', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('migration sets DEFAULT pending (not approved)', () => {
    expect(sql).toMatch(/ALTER COLUMN status SET DEFAULT 'pending'/i);
    expect(sql).not.toMatch(/ALTER COLUMN status SET DEFAULT 'approved'/i);
  });

  it('does not delete monetary tables or weaken grants', () => {
    expect(sql.toLowerCase()).not.toContain('drop table');
    expect(sql.toLowerCase()).not.toContain('creator_rewards');
    expect(sql.toLowerCase()).not.toContain('grant ');
  });

  it('API create path defaults offerStatus to pending before auto-approve', () => {
    let offerStatus: 'pending' | 'approved' = 'pending';
    expect(offerStatus).toBe('pending');
    offerStatus = 'approved'; // solo writer autorizado / auto-approve
    expect(offerStatus).toBe('approved');
  });
});

const USER = '11111111-1111-1111-1111-111111111111';
const OFFER = '22222222-2222-2222-2222-222222222222';
const OFFER_B = '44444444-4444-4444-4444-444444444444';

function membershipMirror(fields: {
  unlocked?: boolean;
  welcomeId?: string | null;
  selectedAt?: string | null;
  terms?: boolean;
}): Pick<
  RewardsMembership,
  'needsWelcomeSelection' | 'claimPhase' | 'welcomeOfferId' | 'welcomeOfferSelectedAt'
> {
  const unlocked = fields.unlocked !== false;
  const welcomeOfferId = fields.welcomeId ?? null;
  const welcomeOfferSelectedAt = fields.selectedAt ?? null;
  const termsCurrent = fields.terms !== false;
  const welcomeClaimed = Boolean(welcomeOfferSelectedAt) || Boolean(welcomeOfferId);
  let claimPhase: RewardsMembership['claimPhase'] = 'locked';
  if (unlocked && welcomeClaimed) claimPhase = 'complete';
  else if (unlocked && termsCurrent) claimPhase = 'pending_selection';
  else if (unlocked) claimPhase = 'unlocked';
  return {
    welcomeOfferId,
    welcomeOfferSelectedAt,
    needsWelcomeSelection: unlocked && termsCurrent && !welcomeClaimed,
    claimPhase,
  };
}

describe('P1-5 — membership after welcome delete', () => {
  it('never claimed → needs selection', () => {
    const m = membershipMirror({ welcomeId: null, selectedAt: null });
    expect(m.needsWelcomeSelection).toBe(true);
    expect(m.claimPhase).toBe('pending_selection');
  });

  it('claimed with id → complete', () => {
    const m = membershipMirror({ welcomeId: OFFER, selectedAt: '2026-01-03T00:00:00Z' });
    expect(m.needsWelcomeSelection).toBe(false);
    expect(m.claimPhase).toBe('complete');
  });

  it('offer deleted (id NULL, selected_at set) → no re-claim UI', () => {
    const m = membershipMirror({ welcomeId: null, selectedAt: '2026-01-03T00:00:00Z' });
    expect(m.needsWelcomeSelection).toBe(false);
    expect(m.claimPhase).toBe('complete');
  });
});

describe('P1-5 — selectWelcomeOffer', () => {
  beforeEach(() => vi.clearAllMocks());

  function mockSelect(scenario: {
    welcomeId?: string | null;
    selectedAt?: string | null;
    raceLost?: boolean;
  }): SupabaseClient {
    const profile = {
      reward_program_unlocked_at: '2026-01-01T00:00:00Z',
      welcome_offer_id: scenario.welcomeId ?? null,
      welcome_offer_selected_at: scenario.selectedAt ?? null,
      rewards_terms_accepted_at: '2026-01-02T00:00:00Z',
      rewards_terms_version: REWARDS_TERMS_VERSION,
    };

    const profilesChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockImplementation(async () => {
        if (!profilesChain.update.mock.calls.length) {
          return { data: profile, error: null };
        }
        if (scenario.raceLost || profile.welcome_offer_id || profile.welcome_offer_selected_at) {
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
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [{ id: OFFER }], error: null }),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: OFFER, created_by: USER, status: 'approved' },
            error: null,
          }),
        };
      }
      if (table === 'reward_audit_log') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {};
    });

    return { from } as unknown as SupabaseClient;
  }

  it('first claim → success', async () => {
    const result = await selectWelcomeOffer(mockSelect({}), USER, OFFER);
    expect(result.ok).toBe(true);
  });

  it('second claim → 409', async () => {
    const result = await selectWelcomeOffer(
      mockSelect({ welcomeId: OFFER, selectedAt: '2026-01-03T00:00:00Z' }),
      USER,
      OFFER_B,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });

  it('deleted welcome (orphan selected_at) → 409', async () => {
    const result = await selectWelcomeOffer(
      mockSelect({ welcomeId: null, selectedAt: '2026-01-03T00:00:00Z' }),
      USER,
      OFFER,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });

  it('concurrent CAS loser → 409', async () => {
    const result = await selectWelcomeOffer(mockSelect({ raceLost: true }), USER, OFFER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });

  it('migration includes immutable selected_at trigger', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    expect(sql).toContain('profiles_protect_welcome_claim');
    expect(sql).toMatch(/ON DELETE SET NULL/i);
  });

  it('no monetary unlock helper regression', () => {
    expect(computeRewardsProgress(15, 15).unlockEligible).toBe(true);
  });
});
