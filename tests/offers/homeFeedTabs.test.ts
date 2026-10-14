import { describe, expect, it } from 'vitest';
import { feedHomeQuerySchema } from '@/lib/contracts/feed';
import {
  DEFAULT_HOME_TAB,
  HOME_FEED_MAX_LIMIT,
  HOME_FEED_PAGE_SIZE,
  TOP_FEED_INITIAL_PAGE_SIZE,
  HOME_TABS,
  excludeFeaturedOffers,
  homeFeedHeading,
  homeFeedPageSize,
  homeTabDefinition,
  homeTabHref,
  hrefWithoutParams,
  parseHomeTab,
  visibleHomeTabs,
  vitalesApiLimit,
  vitalesHasMore,
} from '@/lib/offers/homeFeedTabs';

describe('pestañas del inicio', () => {
  it('Día a día es la predeterminada y el orden es el aprobado', () => {
    expect(DEFAULT_HOME_TAB).toBe('vitales');
    expect(HOME_TABS.map((t) => t.label)).toEqual(['Día a día', 'Top', 'Para ti', 'Recientes']);
  });

  it('cada pestaña tiene su descripción aprobada', () => {
    expect(homeTabDefinition('vitales').description).toBe(
      'Encuentra ofertas útiles para tu hogar, despensa, limpieza e higiene de todos los días.',
    );
    expect(homeTabDefinition('top').description).toBe(
      'Descubre las ofertas que más destacan por la participación de la comunidad.',
    );
    expect(homeTabDefinition('personalized').description).toBe(
      'Ofertas relacionadas con tus intereses y las categorías que más te gustan.',
    );
    expect(homeTabDefinition('latest').description).toBe('Descubre las últimas ofertas compartidas por la comunidad.');
  });

  it('lee ?tab= y vuelve a Día a día con valores inválidos', () => {
    expect(parseHomeTab(null, false)).toBe('vitales');
    expect(parseHomeTab('', true)).toBe('vitales');
    expect(parseHomeTab('top', false)).toBe('top');
    expect(parseHomeTab('recientes', false)).toBe('latest');
    expect(parseHomeTab(' Recientes ', false)).toBe('latest');
    expect(parseHomeTab('dia-a-dia', false)).toBe('vitales');
    expect(parseHomeTab('latest', false)).toBe('vitales');
    expect(parseHomeTab('<script>', true)).toBe('vitales');
  });

  it('Para ti requiere sesión', () => {
    expect(parseHomeTab('para-ti', false)).toBe('vitales');
    expect(parseHomeTab('para-ti', true)).toBe('personalized');
    expect(visibleHomeTabs(false).map((t) => t.id)).toEqual(['vitales', 'top', 'latest']);
    expect(visibleHomeTabs(true).map((t) => t.id)).toEqual(['vitales', 'top', 'personalized', 'latest']);
  });

  it('cambiar de pestaña conserva los demás parámetros', () => {
    expect(homeTabHref('/', 'q=arroz&store=walmart', 'latest')).toBe('/?q=arroz&store=walmart&tab=recientes');
    expect(homeTabHref('/', 'tab=top&q=arroz', 'personalized')).toBe('/?tab=para-ti&q=arroz');
    expect(homeTabHref('/', 'tab=top&q=arroz', 'vitales')).toBe('/?q=arroz');
    expect(homeTabHref('/', '', 'vitales')).toBe('/');
    expect(homeTabHref('/', new URLSearchParams('tab=recientes'), 'top')).toBe('/?tab=top');
  });

  it('limpiar parámetros de error no pierde la pestaña', () => {
    expect(hrefWithoutParams('/', 'tab=top&error=x&message=y', ['error', 'message'])).toBe('/?tab=top');
    expect(hrefWithoutParams('/', 'error=x', ['error', 'message'])).toBe('/');
  });

  it('el título de escritorio sigue a la pestaña', () => {
    expect(homeFeedHeading('vitales', 'day')).toBe('Día a día');
    expect(homeFeedHeading('latest', 'day')).toBe('Recientes');
    expect(homeFeedHeading('personalized', 'week')).toBe('Para ti');
    expect(homeFeedHeading('top', 'day')).toBe('Top del día');
    expect(homeFeedHeading('top', 'week')).toBe('Top de la semana');
    expect(homeFeedHeading('top', 'month')).toBe('Top del mes');
  });
});

describe('Top sin duplicados', () => {
  it('la lista no repite ofertas del carrusel y conserva el orden', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    expect(excludeFeaturedOffers(list, [{ id: 'c' }, { id: 'a' }]).map((o) => o.id)).toEqual(['b', 'd']);
    expect(excludeFeaturedOffers(list, []).map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('paginación de Día a día', () => {
  it('Top abre y crece en lotes de 24; las demás pestañas conservan 12', () => {
    expect(TOP_FEED_INITIAL_PAGE_SIZE).toBe(24);
    expect(homeFeedPageSize('top')).toBe(24);
    expect(homeFeedPageSize('latest')).toBe(HOME_FEED_PAGE_SIZE);
    expect(homeFeedPageSize('vitales')).toBe(HOME_FEED_PAGE_SIZE);
  });

  it('el límite pedido al servidor está acotado por el contrato', () => {
    expect(HOME_FEED_MAX_LIMIT).toBe(feedHomeQuerySchema.shape.limit.unwrap().maxValue);
    expect(vitalesApiLimit(HOME_FEED_PAGE_SIZE)).toBe(60);
    expect(vitalesApiLimit(72)).toBe(72);
    expect(vitalesApiLimit(500)).toBe(HOME_FEED_MAX_LIMIT);
  });

  it('hay más si el orden dejó ofertas fuera de la página', () => {
    expect(vitalesHasMore({ rankedCount: 13, pageSize: 12, serverHasMore: false })).toBe(true);
  });

  it('sin más filas en el servidor y sin sobrantes, no hay botón', () => {
    expect(vitalesHasMore({ rankedCount: 12, pageSize: 12, serverHasMore: false })).toBe(false);
    expect(vitalesHasMore({ rankedCount: 3, pageSize: 12, serverHasMore: false })).toBe(false);
  });

  it('con más filas en el servidor solo ofrece más si la página siguiente pide un universo mayor', () => {
    expect(vitalesHasMore({ rankedCount: 10, pageSize: 60, serverHasMore: true })).toBe(true);
    expect(vitalesHasMore({ rankedCount: 10, pageSize: 96, serverHasMore: true })).toBe(true);
    expect(vitalesHasMore({ rankedCount: 10, pageSize: 100, serverHasMore: true })).toBe(false);
  });
});
