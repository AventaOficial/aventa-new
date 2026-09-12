import type { HunterSourceId } from '../types';

export type SurfaceKind = 'item_list' | 'sitemap' | 'seed_pdp';

export type SurfaceComplianceStatus =
  | 'READY'
  | 'DEGRADED'
  | 'CATALOG_ONLY'
  | 'BLOCKED_PENDING_POLICY_REVIEW'
  | 'NOT_CONFIGURED'
  | 'DISABLED';

export type DiscoverySurface = {
  id: string;
  source: HunterSourceId;
  url: string;
  kind: SurfaceKind;
  status: SurfaceComplianceStatus;
  notes: string;
  /** Regex source applied to sitemap loc URLs. */
  locPattern?: string;
  maxPages?: number;
};

/** Slug de promo en PDP. No usa "combo" suelto (mezcla packs de producto). */
export const PROMO_SLUG_PATTERN = '-2x1-|2x1-gratis|-3x2-';

export function locMatchesPromoSlug(url: string, pattern = PROMO_SLUG_PATTERN): boolean {
  try {
    return new RegExp(pattern, 'i').test(url);
  } catch {
    return false;
  }
}

export function listingPageUrl(base: string, page: number): string {
  if (page <= 1) return base;
  const u = new URL(base);
  u.searchParams.set('page', String(page));
  return u.href;
}

export function surfaceIdFromSourceDetail(detail: unknown): string | null {
  const m = String(detail ?? '').match(/^surface:([^:]+)/);
  return m?.[1] ?? null;
}

/**
 * Superficies Chedraui cableadas al adapter (FASE 8.2).
 * status describe evidencia, no el flag de producción (sigue OFF).
 * Presupuesto: pocas superficies con evidencia distinta (ItemList, AggregateOffer, slug Type B).
 */
export const CHEDRAUI_DISCOVERY_SURFACES: DiscoverySurface[] = [
  {
    id: 'promociones_nuestras_marcas',
    source: 'chedraui_mx',
    url: 'https://www.chedraui.com.mx/promociones/nuestras-marcas',
    kind: 'item_list',
    status: 'CATALOG_ONLY',
    notes: 'ItemList público permitido. Precios sí; highPrice=lowPrice. Sin original ni promo ligada al producto.',
    maxPages: 1,
  },
  {
    id: 'promociones_perecederos',
    source: 'chedraui_mx',
    url: 'https://www.chedraui.com.mx/promociones/perecederos',
    kind: 'item_list',
    status: 'CATALOG_ONLY',
    notes:
      'ItemList permitido. AggregateOffer low/high es rango (p. ej. 32 vs 320), no precio tachado. No usar highPrice como originalPrice.',
    maxPages: 1,
  },
  {
    id: 'sitemap_promo_slug',
    source: 'chedraui_mx',
    url: 'https://www.chedraui.com.mx/sitemap/product-0.xml',
    kind: 'sitemap',
    status: 'DEGRADED',
    notes:
      'Sitemap de producto filtrado por -2x1- / 2x1-gratis / -3x2-. Yield bajo; no crawl de los 60+ sitemaps.',
    locPattern: PROMO_SLUG_PATTERN,
  },
];

/** Auditadas, no cableadas: no gastar budget en SPA vacía / marca / cupón de categoría. */
export const CHEDRAUI_OBSERVED_SURFACES: DiscoverySurface[] = [
  {
    id: 'promociones_jabones',
    source: 'chedraui_mx',
    url: 'https://www.chedraui.com.mx/promociones/jabones',
    kind: 'item_list',
    status: 'CATALOG_ONLY',
    notes: 'ItemList permitido. Precio único, sin evidencia de descuento. No cableada para ahorrar requests.',
    maxPages: 1,
  },
  {
    id: 'promociones_exclusivas',
    source: 'chedraui_mx',
    url: 'https://www.chedraui.com.mx/promociones-exclusivas',
    kind: 'item_list',
    status: 'DEGRADED',
    notes: 'Landing robots-ok, SPA/hub sin ItemList de productos.',
    maxPages: 1,
  },
  {
    id: 'landing_3x2_cereales',
    source: 'chedraui_mx',
    url: 'https://www.chedraui.com.mx/3x2-en-cereales-kelloggs-seleccionados',
    kind: 'item_list',
    status: 'DEGRADED',
    notes: 'Robots-ok. SPA/ItemList vacío. No ligar el 3x2 del slug a cada producto.',
    maxPages: 1,
  },
  {
    id: 'super_extra',
    source: 'chedraui_mx',
    url: 'https://www.chedraui.com.mx/super-extra',
    kind: 'item_list',
    status: 'CATALOG_ONLY',
    notes: 'Marca Super Extra (arroz), no programa de ofertas.',
    maxPages: 1,
  },
  {
    id: 'cupon_cereal',
    source: 'chedraui_mx',
    url: 'https://www.chedraui.com.mx/cupon/cereal',
    kind: 'item_list',
    status: 'CATALOG_ONLY',
    notes: 'ItemList público; no asumir que el cupón de categoría aplica a cada SKU.',
    maxPages: 1,
  },
];

export function surfacesForSource(source: HunterSourceId): DiscoverySurface[] {
  if (source === 'chedraui_mx') return CHEDRAUI_DISCOVERY_SURFACES;
  return [];
}
