import { describe, expect, it } from 'vitest';
import { hasModerationSummaryActivity } from '@/lib/moderation/moderationSessionSummary';

describe('hasModerationSummaryActivity', () => {
  it('ignora solo locks activos', () => {
    expect(
      hasModerationSummaryActivity({ newOffers: 0, lowTrustOffers: 0, newReports: 0 })
    ).toBe(false);
  });

  it('detecta novedades accionables', () => {
    expect(
      hasModerationSummaryActivity({ newOffers: 2, lowTrustOffers: 0, newReports: 0 })
    ).toBe(true);
    expect(
      hasModerationSummaryActivity({ newOffers: 0, lowTrustOffers: 1, newReports: 0 })
    ).toBe(true);
    expect(
      hasModerationSummaryActivity({ newOffers: 0, lowTrustOffers: 0, newReports: 3 })
    ).toBe(true);
  });
});
