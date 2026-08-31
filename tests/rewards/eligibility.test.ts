import { describe, it, expect } from 'vitest';
import { computeRewardsProgress } from '../../lib/rewards/eligibility';
import {
  REWARDS_REQUIRED_APPROVED_OFFERS,
  REWARDS_REQUIRED_POSITIVE_VOTES,
} from '../../lib/rewards/config';

describe('Rewards eligibility (15+15 acumulados)', () => {
  it('14 ofertas + 15 votos = no elegible', () => {
    const p = computeRewardsProgress(14, 15);
    expect(p.offersProgressMet).toBe(false);
    expect(p.votesProgressMet).toBe(true);
    expect(p.unlockEligible).toBe(false);
  });

  it('15 ofertas + 14 votos = no elegible', () => {
    const p = computeRewardsProgress(15, 14);
    expect(p.offersProgressMet).toBe(true);
    expect(p.votesProgressMet).toBe(false);
    expect(p.unlockEligible).toBe(false);
  });

  it('15 ofertas + 15 votos = elegible', () => {
    const p = computeRewardsProgress(15, 15);
    expect(p.unlockEligible).toBe(true);
    expect(p.requiredOffers).toBe(REWARDS_REQUIRED_APPROVED_OFFERS);
    expect(p.requiredVotes).toBe(REWARDS_REQUIRED_POSITIVE_VOTES);
  });
});
