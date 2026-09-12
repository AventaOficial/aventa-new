import type { HunterSourceId } from '../types';

export type DayToDayComplianceStatus =
  | 'READY'
  | 'DEGRADED'
  | 'NOT_CONFIGURED'
  | 'BLOCKED'
  | 'DISABLED'
  | 'BLOCKED_PENDING_POLICY_REVIEW';

export type DayToDayCapabilityRow = {
  source: HunterSourceId | 'liverpool_mx' | 'home_depot_mx' | 'soriana_mx';
  displayName: string;
  discoveryMethod: string;
  public: boolean;
  robots: 'allow_limited' | 'allow_broad' | 'restrictive' | 'unknown';
  sitemap: boolean;
  structuredData: 'pdp_jsonld' | 'spa_shell' | 'unknown';
  pagination: boolean;
  price: boolean;
  originalPrice: boolean;
  discount: boolean;
  images: boolean;
  productId: boolean;
  availability: boolean;
  rateLimit: string;
  affiliate: 'unavailable' | 'unknown';
  complianceStatus: DayToDayComplianceStatus;
  notes: string;
};

/**
 * Matriz de capacidades — evidencia de auditoría FASE 8.
 * No implica que la fuente esté activada en producción.
 */
export const DAY_TO_DAY_CAPABILITY_MATRIX: DayToDayCapabilityRow[] = [
  {
    source: 'chedraui_mx',
    displayName: 'Chedraui',
    discoveryMethod: 'item_list_pdp_jsonld',
    public: true,
    robots: 'restrictive',
    sitemap: true,
    structuredData: 'pdp_jsonld',
    pagination: true,
    price: true,
    originalPrice: false,
    discount: false,
    images: true,
    productId: true,
    availability: true,
    rateLimit: 'maxItems≤12 / requestsPerCycle≤8 / timeout 12s',
    affiliate: 'unavailable',
    complianceStatus: 'READY',
    notes:
      'FASE 8.2: /promociones/* ItemList permitido. AggregateOffer high/low NO es originalPrice. Listings actuales CATALOG_ONLY. Sitemap slug -2x1- DEGRADED (yield bajo).',
  },
  {
    source: 'bodega_aurrera_mx',
    displayName: 'Bodega Aurrera',
    discoveryMethod: 'sitemap_attempt_pdp',
    public: true,
    robots: 'allow_limited',
    sitemap: true,
    structuredData: 'spa_shell',
    pagination: false,
    price: false,
    originalPrice: false,
    discount: false,
    images: false,
    productId: false,
    availability: false,
    rateLimit: 'maxItems≤12 / requestsPerCycle≤8 / timeout 12s',
    affiliate: 'unavailable',
    complianceStatus: 'DEGRADED',
    notes:
      'FASE 9: /content/ofertas 200 SPA vacía; /ofertas 404. PDPs de sitemap históricamente challenge. Sin CAPTCHA bypass.',
  },
  {
    source: 'walmart_mx',
    displayName: 'Walmart México',
    discoveryMethod: 'sitemap_attempt_pdp',
    public: true,
    robots: 'allow_limited',
    sitemap: true,
    structuredData: 'spa_shell',
    pagination: false,
    price: false,
    originalPrice: false,
    discount: false,
    images: false,
    productId: false,
    availability: false,
    rateLimit: 'maxItems≤12 / requestsPerCycle≤8 / timeout 12s',
    affiliate: 'unavailable',
    complianceStatus: 'DEGRADED',
    notes:
      'FASE 9: /content/ofertas 200 SPA vacía; /ofertas 404. PDPs con challenge histórico. No proxies/CAPTCHA bypass.',
  },
  {
    source: 'liverpool_mx',
    displayName: 'Liverpool',
    discoveryMethod: 'not_implemented',
    public: true,
    robots: 'allow_broad',
    sitemap: true,
    structuredData: 'unknown',
    pagination: true,
    price: true,
    originalPrice: true,
    discount: true,
    images: true,
    productId: true,
    availability: true,
    rateLimit: 'n/a',
    affiliate: 'unknown',
    complianceStatus: 'NOT_CONFIGURED',
    notes: 'Candidato FASE 8.1. robots Allow: /.',
  },
  {
    source: 'home_depot_mx',
    displayName: 'Home Depot',
    discoveryMethod: 'sitemap_index_pdp_investigation',
    public: true,
    robots: 'allow_broad',
    sitemap: true,
    structuredData: 'pdp_jsonld',
    pagination: true,
    price: true,
    originalPrice: false,
    discount: false,
    images: true,
    productId: true,
    availability: true,
    rateLimit: 'Sin Crawl-delay en robots. Budget discovery: 8 req / 1 concurrency',
    affiliate: 'unknown',
    complianceStatus: 'NOT_CONFIGURED',
    notes:
      'FASE 9.1 CATALOG_ONLY: sitemap_10351 → PDP JSON-LD con precio actual. 0 originalPrice. Slugs 2x1 del sitemap no son promoción (canonical distinto). Landings ≠ promo. Sin HunterSource. No activar.',
  },
  {
    source: 'soriana_mx',
    displayName: 'Soriana',
    discoveryMethod: 'not_implemented',
    public: true,
    robots: 'unknown',
    sitemap: false,
    structuredData: 'unknown',
    pagination: false,
    price: false,
    originalPrice: false,
    discount: false,
    images: false,
    productId: false,
    availability: false,
    rateLimit: 'n/a',
    affiliate: 'unknown',
    complianceStatus: 'BLOCKED_PENDING_POLICY_REVIEW',
    notes: 'Términos con restricciones sobre spiders/robots/agentes. No implementar.',
  },
];

export function capabilityFor(source: string): DayToDayCapabilityRow | undefined {
  return DAY_TO_DAY_CAPABILITY_MATRIX.find((r) => r.source === source);
}
