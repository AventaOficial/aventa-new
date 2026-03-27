import { describe, it, expect } from 'vitest';
import { createOfferInputSchema } from '../../lib/contracts/offers';
import { voteInputSchema } from '../../lib/contracts/votes';
import { feedHomeQuerySchema, feedForYouQuerySchema } from '../../lib/contracts/feed';

describe('api validation contracts', () => {
  it('rechaza voto inválido fuera de -1/2', () => {
    const bad = voteInputSchema.safeParse({ offerId: '550e8400-e29b-41d4-a716-446655440000', value: 1 });
    expect(bad.success).toBe(false);
  });

  it('acepta voto válido', () => {
    const ok = voteInputSchema.safeParse({ offerId: '550e8400-e29b-41d4-a716-446655440000', value: 2 });
    expect(ok.success).toBe(true);
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
  });

  it('normaliza query for-you con defaults seguros', () => {
    const parsed = feedForYouQuerySchema.parse({});
    expect(parsed.limit).toBe(12);
    expect(parsed.store).toBe(null);
    expect(parsed.category).toBe(null);
  });
});
