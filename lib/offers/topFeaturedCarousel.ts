import type { HomeFeedPeriod } from '@/lib/offers/homeFeedClient';

/** `app_config`: carrusel horizontal en Top para Semana y Mes (Hoy siempre activo). */
export const TOP_CAROUSEL_WEEK_MONTH_CONFIG_KEY = 'top_carousel_week_month';

export function shouldShowTopFeaturedCarousel(
  timeFilter: HomeFeedPeriod,
  weekMonthCarouselEnabled: boolean,
): boolean {
  if (timeFilter === 'day') return true;
  return weekMonthCarouselEnabled;
}

export function topFeaturedCarouselHeading(period: HomeFeedPeriod): string {
  if (period === 'day') return 'Mejores de hoy';
  if (period === 'month') return 'Mejores del mes';
  return 'Mejores de la semana';
}
