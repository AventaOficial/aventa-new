import { describe, it, expect } from 'vitest';
import { inferOfferCategory } from '../../lib/offers/inferOfferCategory';

describe('inferOfferCategory', () => {
  it('mapea categoría raíz ML de consolas a gaming', () => {
    expect(inferOfferCategory({ mlCategoryId: 'MLM1144' })).toBe('gaming');
  });

  it('infiere tecnología por título', () => {
    expect(inferOfferCategory({ title: 'iPhone 15 Pro Max 256GB' })).toBe('tecnologia');
  });

  it('infiere hogar por título de espejo', () => {
    expect(inferOfferCategory({ title: 'Espejos Led Touch Espejo Pared Tocador' })).toBe('hogar');
  });
});
