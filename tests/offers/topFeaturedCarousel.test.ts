import { describe, expect, it } from 'vitest';
import {
  shouldShowTopFeaturedCarousel,
  topFeaturedCarouselHeading,
} from '@/lib/offers/topFeaturedCarousel';

describe('topFeaturedCarousel', () => {
  it('Hoy siempre muestra carrusel', () => {
    expect(shouldShowTopFeaturedCarousel('day', false)).toBe(true);
    expect(shouldShowTopFeaturedCarousel('day', true)).toBe(true);
  });

  it('Semana y mes dependen del flag admin', () => {
    expect(shouldShowTopFeaturedCarousel('week', false)).toBe(false);
    expect(shouldShowTopFeaturedCarousel('month', false)).toBe(false);
    expect(shouldShowTopFeaturedCarousel('week', true)).toBe(true);
    expect(shouldShowTopFeaturedCarousel('month', true)).toBe(true);
  });

  it('títulos por periodo', () => {
    expect(topFeaturedCarouselHeading('day')).toBe('Mejores de hoy');
    expect(topFeaturedCarouselHeading('week')).toBe('Mejores de la semana');
    expect(topFeaturedCarouselHeading('month')).toBe('Mejores del mes');
  });
});
