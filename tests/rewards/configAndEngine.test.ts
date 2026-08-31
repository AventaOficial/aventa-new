import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  REWARDS_CREATOR_SHARE_BPS,
  REWARDS_HOLD_DAYS,
  REWARDS_MIN_PAYOUT_CENTS,
  splitCommissionCents,
  platformShareBps,
} from '../../lib/rewards/config';
import { isOfferRewardsParticipating } from '../../lib/rewards/offerParticipation';
import { createRewardFromLedgerEntry } from '../../lib/rewards/rewardsEngine';
import { isRewardsProgramActive } from '../../lib/rewards/programStatus';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('Rewards split 40/60', () => {
  it('40% creador y 60% Aventa', () => {
    const { creatorCents, platformCents } = splitCommissionCents(10_000);
    expect(creatorCents).toBe(4000);
    expect(platformCents).toBe(6000);
    expect(platformShareBps()).toBe(6000);
    expect(REWARDS_CREATOR_SHARE_BPS).toBe(4000);
  });
});

describe('Hold y mínimo de pago', () => {
  it('hold configurado a 60 días', () => {
    expect(REWARDS_HOLD_DAYS).toBe(60);
  });

  it('mínimo de retiro $200 MXN', () => {
    expect(REWARDS_MIN_PAYOUT_CENTS).toBe(20_000);
  });
});

describe('Offer participation', () => {
  const unlockedAt = '2026-06-01T12:00:00Z';

  it('Oferta de Bienvenida participa', () => {
    expect(
      isOfferRewardsParticipating({
        offerId: 'welcome-1',
        creatorId: 'u1',
        offerStatus: 'approved',
        offerCreatedAt: '2026-01-01T00:00:00Z',
        rewardProgramUnlockedAt: unlockedAt,
        welcomeOfferId: 'welcome-1',
      }),
    ).toBe(true);
  });

  it('Oferta pre-unlock que no es bienvenida no participa', () => {
    expect(
      isOfferRewardsParticipating({
        offerId: 'old-1',
        creatorId: 'u1',
        offerStatus: 'approved',
        offerCreatedAt: '2026-05-01T00:00:00Z',
        rewardProgramUnlockedAt: unlockedAt,
        welcomeOfferId: 'welcome-1',
      }),
    ).toBe(false);
  });

  it('Oferta creada después del unlock participa', () => {
    expect(
      isOfferRewardsParticipating({
        offerId: 'new-1',
        creatorId: 'u1',
        offerStatus: 'published',
        offerCreatedAt: '2026-07-01T00:00:00Z',
        rewardProgramUnlockedAt: unlockedAt,
        welcomeOfferId: 'welcome-1',
      }),
    ).toBe(true);
  });
});

describe('createRewardFromLedgerEntry — programa inactivo', () => {
  const prevRewards = process.env.REWARDS_PROGRAM_ACTIVE;
  const prevLegacy = process.env.COMMISSION_PROGRAM_ACTIVE;

  beforeEach(() => {
    delete process.env.REWARDS_PROGRAM_ACTIVE;
    process.env.COMMISSION_PROGRAM_ACTIVE = 'false';
  });

  afterEach(() => {
    if (prevRewards !== undefined) process.env.REWARDS_PROGRAM_ACTIVE = prevRewards;
    else delete process.env.REWARDS_PROGRAM_ACTIVE;
    if (prevLegacy !== undefined) process.env.COMMISSION_PROGRAM_ACTIVE = prevLegacy;
    else delete process.env.COMMISSION_PROGRAM_ACTIVE;
  });

  it('no crea recompensa cuando COMMISSION_PROGRAM_ACTIVE=false', async () => {
    expect(isRewardsProgramActive()).toBe(false);
    const supabase = { from: vi.fn() } as unknown as SupabaseClient;
    const result = await createRewardFromLedgerEntry(supabase, {
      id: 'l1',
      network: 'amazon',
      amount_cents: 1000,
      status: 'confirmed',
    });
    expect(result.created).toBe(false);
    if (!result.created) expect(result.reason).toBe('program_inactive');
  });
});
