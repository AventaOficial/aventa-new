import { describe, it, expect } from 'vitest';
import {
  OFFER_AUTO_APPROVE_TTL_MS,
  getOfferAutoApproveExpiryIso,
  resolveOfferAutoApproveFromProfile,
} from '../../lib/server/offerAutoApprove';
import { REPUTATION_LEVEL_AUTO_APPROVE_OFFERS } from '../../lib/server/reputation';

describe('offerAutoApprove', () => {
  it('whitelist owner tiene prioridad sobre reputación baja', () => {
    const decision = resolveOfferAutoApproveFromProfile({
      owner_auto_approve_offers: true,
      reputation_level: 1,
    });
    expect(decision.approved).toBe(true);
    expect(decision.source).toBe('owner_whitelist');
    expect(decision.expiresAt).toBeTruthy();
  });

  it('reputación ≥ umbral auto-aprueba sin whitelist', () => {
    const decision = resolveOfferAutoApproveFromProfile({
      owner_auto_approve_offers: false,
      reputation_level: REPUTATION_LEVEL_AUTO_APPROVE_OFFERS,
    });
    expect(decision.approved).toBe(true);
    expect(decision.source).toBe('reputation');
  });

  it('sin whitelist ni reputación suficiente queda pending', () => {
    const decision = resolveOfferAutoApproveFromProfile({
      owner_auto_approve_offers: false,
      reputation_level: REPUTATION_LEVEL_AUTO_APPROVE_OFFERS - 1,
    });
    expect(decision.approved).toBe(false);
    expect(decision.source).toBeUndefined();
  });

  it('getOfferAutoApproveExpiryIso suma TTL de 7 días', () => {
    const from = Date.parse('2026-06-24T12:00:00.000Z');
    const iso = getOfferAutoApproveExpiryIso(from);
    expect(Date.parse(iso)).toBe(from + OFFER_AUTO_APPROVE_TTL_MS);
  });
});
