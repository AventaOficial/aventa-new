import { describe, expect, it } from 'vitest';
import {
  countClaimEligibleOffers,
  isOfferClaimEligible,
  isSnoozedActive,
} from '@/lib/moderation/offerClaimEligibility';

const now = Date.now();

function offer(
  id: string,
  lockedBy: string | null = null,
  lockedAt: string | null = null,
  snoozedUntil: string | null = null
) {
  return {
    id,
    created_at: new Date(now - Number(id) * 1000).toISOString(),
    locked_by: lockedBy,
    locked_at: lockedAt,
    snoozed_until: snoozedUntil,
  };
}

describe('offerClaimEligibility', () => {
  it('excluye ofertas snoozed activas', () => {
    const until = new Date(now + 60_000).toISOString();
    expect(isSnoozedActive({ snoozed_until: until })).toBe(true);
    expect(isOfferClaimEligible(offer('1', null, null, until), 'mod-a')).toBe(false);
  });

  it('excluye lock ajeno activo', () => {
    const list = [offer('1', 'mod-b', new Date().toISOString()), offer('2')];
    expect(isOfferClaimEligible(list[0], 'mod-a')).toBe(false);
    expect(countClaimEligibleOffers(list, 'mod-a')).toBe(1);
  });

  it('incluye lock stale para reclamar', () => {
    const stale = new Date(now - 10 * 60 * 1000).toISOString();
    expect(isOfferClaimEligible(offer('1', 'mod-b', stale), 'mod-a')).toBe(true);
  });
});
