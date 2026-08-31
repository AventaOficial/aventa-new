import { describe, it, expect } from 'vitest';
import { isPubliclyVotableOfferStatus } from '../../lib/votes/offerVoteEligibility';
import { ALLOWED_OFFER_VOTE_VALUES, voteWeightPairForLevel } from '../../lib/votes/reputationWeights';

describe('votos — estados y pesos', () => {
  it('no permite votar pending/rejected', () => {
    expect(isPubliclyVotableOfferStatus('pending')).toBe(false);
    expect(isPubliclyVotableOfferStatus('rejected')).toBe(false);
    expect(isPubliclyVotableOfferStatus('expired')).toBe(false);
    expect(isPubliclyVotableOfferStatus('approved')).toBe(true);
    expect(isPubliclyVotableOfferStatus('published')).toBe(true);
  });

  it('pesa +2/−1 … +12/−6 y el CHECK los cubre', () => {
    expect(voteWeightPairForLevel(1)).toEqual({ up: 2, down: -1 });
    expect(voteWeightPairForLevel(2)).toEqual({ up: 4, down: -2 });
    expect(voteWeightPairForLevel(3)).toEqual({ up: 8, down: -4 });
    expect(voteWeightPairForLevel(4)).toEqual({ up: 12, down: -6 });
    for (const pair of [1, 2, 3, 4].map((l) => voteWeightPairForLevel(l))) {
      expect(ALLOWED_OFFER_VOTE_VALUES).toContain(pair.up);
      expect(ALLOWED_OFFER_VOTE_VALUES).toContain(pair.down);
    }
  });
});
