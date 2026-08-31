import { describe, expect, it } from 'vitest';
import { classifyOfferModerationLevel } from '@/lib/moderation/classifyOfferModerationLevel';
import { moderationLevelWithinMax } from '@/lib/moderation/moderationLevelRank';
import { moderationMaxLevelForRole } from '@/lib/moderation/moderationMaxLevelForRole';

describe('classifyOfferModerationLevel', () => {
  const baseOffer = {
    title: 'Test producto sprint',
    price: 100,
    original_price: 200,
    image_url: 'https://example.com/img.jpg',
    category: 'moda',
    offer_url: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-test',
    risk_score: 10,
  };

  it('clasifica sprint en oferta normal', () => {
    const { level } = classifyOfferModerationLevel(baseOffer, {});
    expect(level).toBe('sprint');
  });

  it('clasifica enforcement con reporte pendiente', () => {
    const { level } = classifyOfferModerationLevel(baseOffer, { hasPendingReport: true });
    expect(level).toBe('enforcement');
  });

  it('clasifica enforcement con autor baneado', () => {
    const { level } = classifyOfferModerationLevel(baseOffer, { authorBanned: true });
    expect(level).toBe('enforcement');
  });

  it('clasifica review con duplicados', () => {
    const { level } = classifyOfferModerationLevel(baseOffer, { similarCount: 2 });
    expect(level).toBe('review');
  });

  it('clasifica enforcement con risk_score alto', () => {
    const { level } = classifyOfferModerationLevel({ ...baseOffer, risk_score: 85 }, {});
    expect(level).toBe('enforcement');
  });
});

describe('moderationMaxLevelForRole', () => {
  it('moderator puede A y B', () => {
    expect(moderationMaxLevelForRole('moderator')).toBe('review');
    expect(moderationLevelWithinMax('sprint', 'review')).toBe(true);
    expect(moderationLevelWithinMax('review', 'review')).toBe(true);
    expect(moderationLevelWithinMax('enforcement', 'review')).toBe(false);
  });

  it('owner/admin pueden C', () => {
    expect(moderationMaxLevelForRole('owner')).toBe('enforcement');
    expect(moderationMaxLevelForRole('admin')).toBe('enforcement');
  });
});
