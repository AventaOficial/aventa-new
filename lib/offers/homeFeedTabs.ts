import type { HomeFeedPeriod, HomeFeedViewMode } from '@/lib/offers/homeFeedClient';

export type HomeTab = HomeFeedViewMode | 'personalized';

export const HOME_TAB_PARAM = 'tab';
export const DEFAULT_HOME_TAB: HomeTab = 'vitales';

export type HomeTabDefinition = {
  id: HomeTab;
  /** Valor de `?tab=`. */
  slug: string;
  label: string;
  description: string;
  requiresSession: boolean;
};

/** Orden aprobado de las pestañas del inicio. Única fuente de etiquetas y descripciones. */
export const HOME_TABS: readonly HomeTabDefinition[] = [
  {
    id: 'vitales',
    slug: 'dia-a-dia',
    label: 'Día a día',
    description: 'Encuentra ofertas útiles para tu hogar, despensa, limpieza e higiene de todos los días.',
    requiresSession: false,
  },
  {
    id: 'top',
    slug: 'top',
    label: 'Top',
    description: 'Descubre las ofertas que más destacan por la participación de la comunidad.',
    requiresSession: false,
  },
  {
    id: 'personalized',
    slug: 'para-ti',
    label: 'Para ti',
    description: 'Ofertas relacionadas con tus intereses y las categorías que más te gustan.',
    requiresSession: true,
  },
  {
    id: 'latest',
    slug: 'recientes',
    label: 'Recientes',
    description: 'Descubre las últimas ofertas compartidas por la comunidad.',
    requiresSession: false,
  },
];

export function homeTabDefinition(tab: HomeTab): HomeTabDefinition {
  return HOME_TABS.find((t) => t.id === tab) ?? HOME_TABS[0];
}

export function visibleHomeTabs(hasSession: boolean): HomeTabDefinition[] {
  return HOME_TABS.filter((t) => hasSession || !t.requiresSession);
}

/**
 * Pestaña a partir de `?tab=`. Valores desconocidos, ausentes o que requieren sesión
 * sin tenerla vuelven a la pestaña predeterminada.
 */
export function parseHomeTab(raw: string | null | undefined, hasSession: boolean): HomeTab {
  const slug = raw?.trim().toLowerCase();
  const found = HOME_TABS.find((t) => t.slug === slug);
  if (!found) return DEFAULT_HOME_TAB;
  if (found.requiresSession && !hasSession) return DEFAULT_HOME_TAB;
  return found.id;
}

/**
 * URL del inicio con la pestaña elegida. Conserva los demás parámetros;
 * la pestaña predeterminada no escribe `?tab=`.
 */
export function homeTabHref(pathname: string, current: URLSearchParams | string, tab: HomeTab): string {
  const params = new URLSearchParams(typeof current === 'string' ? current : current.toString());
  if (tab === DEFAULT_HOME_TAB) params.delete(HOME_TAB_PARAM);
  else params.set(HOME_TAB_PARAM, homeTabDefinition(tab).slug);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** URL sin los parámetros indicados, conservando el resto (incluida la pestaña). */
export function hrefWithoutParams(pathname: string, current: URLSearchParams | string, keys: readonly string[]): string {
  const params = new URLSearchParams(typeof current === 'string' ? current : current.toString());
  for (const key of keys) params.delete(key);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function homeFeedHeading(tab: HomeTab, period: HomeFeedPeriod): string {
  if (tab === 'top') {
    if (period === 'week') return 'Top de la semana';
    if (period === 'month') return 'Top del mes';
    return 'Top del día';
  }
  return homeTabDefinition(tab).label;
}

/** Top: la lista no repite lo que ya está en el carrusel. */
export function excludeFeaturedOffers<T extends { id: string }>(list: readonly T[], featured: readonly { id: string }[]): T[] {
  if (featured.length === 0) return [...list];
  const ids = new Set(featured.map((o) => o.id));
  return list.filter((o) => !ids.has(o.id));
}

/** Tope del servidor para `/api/feed/home` (`feedHomeQuerySchema` y `getHomeFeed`). */
export const HOME_FEED_MAX_LIMIT = 100;

export const HOME_FEED_PAGE_SIZE = 12;
/** Top tiene suficiente señal para una primera lectura más amplia sin esperar otra petición. */
export const TOP_FEED_INITIAL_PAGE_SIZE = 24;

/** Tamaño inicial y de "Cargar más" por pestaña pública. */
export function homeFeedPageSize(tab: HomeTab): number {
  return tab === 'top' ? TOP_FEED_INITIAL_PAGE_SIZE : HOME_FEED_PAGE_SIZE;
}
/** Día a día ordena en el cliente: necesita un universo mínimo aunque la página sea corta. */
export const VITALES_MIN_API_LIMIT = 60;

export function vitalesApiLimit(pageSize: number): number {
  return Math.min(Math.max(pageSize, VITALES_MIN_API_LIMIT), HOME_FEED_MAX_LIMIT);
}

/**
 * Hay más en Día a día si el orden de Despensa dejó ofertas fuera de la página,
 * o si el servidor tiene más filas y la página siguiente pediría un universo mayor.
 */
export function vitalesHasMore(input: { rankedCount: number; pageSize: number; serverHasMore: boolean }): boolean {
  if (input.rankedCount > input.pageSize) return true;
  if (!input.serverHasMore) return false;
  return vitalesApiLimit(input.pageSize + HOME_FEED_PAGE_SIZE) > vitalesApiLimit(input.pageSize);
}
