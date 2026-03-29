import { describe, it, expect } from 'vitest';
import { createOfferInputSchema } from '../../lib/contracts/offers';
import { voteInputSchema } from '../../lib/contracts/votes';
import { feedHomeQuerySchema, feedForYouQuerySchema } from '../../lib/contracts/feed';

const SAMPLE_OFFER_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('api validation contracts', () => {
  it('rechaza voto con value 0', () => {
    const bad = voteInputSchema.safeParse({ offerId: SAMPLE_OFFER_UUID, value: 0 });
    expect(bad.success).toBe(false);
  });

  it('normaliza value legacy negativo a direction down', () => {
    const legacy = voteInputSchema.safeParse({ offerId: SAMPLE_OFFER_UUID, value: -1 });
    expect(legacy.success).toBe(true);
    if (legacy.success) expect(legacy.data.direction).toBe('down');
  });

  it('normaliza value legacy positivo a direction up', () => {
    const legacy = voteInputSchema.safeParse({ offerId: SAMPLE_OFFER_UUID, value: 1 });
    expect(legacy.success).toBe(true);
    if (legacy.success) expect(legacy.data.direction).toBe('up');
  });

  it('acepta direction explícita arriba y abajo', () => {
    const up = voteInputSchema.safeParse({ offerId: SAMPLE_OFFER_UUID, direction: 'up' });
    expect(up.success).toBe(true);
    if (up.success) expect(up.data.direction).toBe('up');
    const down = voteInputSchema.safeParse({ offerId: SAMPLE_OFFER_UUID, direction: 'down' });
    expect(down.success).toBe(true);
    if (down.success) expect(down.data.direction).toBe('down');
  });

  it('rechaza oferta sin title/store', () => {
    const bad = createOfferInputSchema.safeParse({ title: '', store: '  ' });
    expect(bad.success).toBe(false);
  });

  it('rechaza precio negativo en oferta', () => {
    const bad = createOfferInputSchema.safeParse({
      title: 'Oferta test',
      store: 'Tienda',
      price: -10,
      hasDiscount: true,
    });
    expect(bad.success).toBe(false);
  });

  it('normaliza query home con defaults seguros', () => {
    const parsed = feedHomeQuerySchema.parse({});
    expect(parsed.limit).toBe(20);
    expect(parsed.type).toBe('trending');
    expect(parsed.cursor).toBe(null);
    expect(parsed.view).toBe(null);
    expect(parsed.period).toBe('day');
    expect(parsed.category).toBe(null);
    expect(parsed.store).toBe(null);
  });

  it('normaliza query for-you con defaults seguros', () => {
    const parsed = feedForYouQuerySchema.parse({});
    expect(parsed.limit).toBe(12);
    expect(parsed.store).toBe(null);
    expect(parsed.category).toBe(null);
  });
});
