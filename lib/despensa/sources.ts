import type { DespensaFamilyId } from '@/lib/despensa/catalog';

/**
 * Registro de fuentes comerciales para Despensa.
 *
 * Separa tres cosas que no deben confundirse:
 * - `declared`: lo que se sabe o se espera de la fuente.
 * - `implemented`: lo que el código de Aventa hace hoy con ella.
 * - `verification`: la última prueba concreta de que funciona. Sin prueba, no está activa.
 *
 * Este registro no habilita ninguna integración. Los adaptadores siguen viviendo en
 * `lib/hunter/sources` (`HUNTER_SOURCES`) y se encienden por sus propios flags.
 */

export type SourceAccessMethod =
  | 'official_api'
  | 'browser_worker_public_pages'
  | 'public_sitemap_jsonld'
  | 'public_catalog_unverified'
  | 'none';

export type SourceOperationalStatus =
  /** Hay código y una ejecución verificada (solo descubrimiento, sin escribir ofertas). */
  | 'discovery_verified'
  /** Hay adaptador, pero apagado por flag o sin ejecución verificada. */
  | 'integrated_flag_off'
  /** Solo metadatos de presentación; no hay adaptador. */
  | 'metadata_only'
  /** El proveedor retiró la API que usaba el adaptador; no hay acceso vigente verificado. */
  | 'api_retired'
  /** No hay código ni método de acceso validado. */
  | 'pending_research';

export type SourceEvidenceType = 'published_price' | 'promo_validity' | 'list_price' | 'price_history';

export type DespensaSource = {
  id: string;
  displayName: string;
  /** Dominios para identificar la fuente de una oferta publicada. */
  hosts: readonly string[];
  /** Ids en `HUNTER_SOURCES` que implementan el acceso, si existen. */
  hunterSourceIds: readonly string[];
  accessMethod: SourceAccessMethod;
  declared: {
    families: readonly DespensaFamilyId[];
    geography: 'MX_national_online' | 'MX_unknown';
    evidence: readonly SourceEvidenceType[];
    updateFrequency: 'unknown' | 'scheduled_30min' | 'daily';
  };
  implemented: {
    discovery: boolean;
    originalPrice: boolean;
    affiliate: boolean;
  };
  status: SourceOperationalStatus;
  verification: { lastVerifiedAt: string; method: string } | null;
  limitations: readonly string[];
};

const ALL_FAMILIES: readonly DespensaFamilyId[] = [
  'alimentacion_basica',
  'limpieza_hogar',
  'higiene_personal',
  'familia_bebes',
  'mascotas',
];

export const DESPENSA_SOURCES: readonly DespensaSource[] = [
  {
    id: 'mercadolibre_mx',
    displayName: 'Mercado Libre',
    hosts: ['mercadolibre.com.mx', 'articulo.mercadolibre.com.mx', 'meli.la'],
    hunterSourceIds: ['ml_worker', 'ml_api_legacy'],
    accessMethod: 'browser_worker_public_pages',
    declared: { families: ALL_FAMILIES, geography: 'MX_national_online', evidence: ['published_price', 'list_price', 'price_history'], updateFrequency: 'scheduled_30min' },
    implemented: { discovery: true, originalPrice: true, affiliate: true },
    status: 'discovery_verified',
    verification: {
      lastVerifiedAt: '2026-10-11',
      method: 'GitHub Actions «Mercado Libre Worker» run 38180320728 (success). WORKER_DISCOVERY_ONLY=1: no escribe ofertas.',
    },
    limitations: [
      'El worker corre en modo solo descubrimiento por defecto.',
      'La búsqueda por API (`ml_api_legacy`) falla cerrado ante 401/403/429.',
      'Disponibilidad geográfica por código postal no se observa.',
    ],
  },
  {
    id: 'amazon_mx',
    displayName: 'Amazon México',
    hosts: ['amazon.com.mx', 'amzn.to'],
    hunterSourceIds: ['amazon_paapi', 'amazon_asin'],
    accessMethod: 'none',
    declared: { families: ALL_FAMILIES, geography: 'MX_national_online', evidence: ['published_price', 'list_price'], updateFrequency: 'unknown' },
    implemented: { discovery: false, originalPrice: false, affiliate: true },
    status: 'api_retired',
    verification: null,
    limitations: [
      'Amazon retiró PA-API 5.0 (15-may-2026, guía de migración oficial) y la sustituye Creators API (OAuth y credenciales nuevas). Los adaptadores `amazon_paapi`/`amazon_asin` usan PA-API: no son una fuente vigente.',
      'Creators API no está integrada ni hay evidencia de acceso para Aventa. Los enlaces de afiliado no dependen de esta API.',
    ],
  },
  {
    id: 'walmart_mx',
    displayName: 'Walmart México',
    hosts: ['walmart.com.mx'],
    hunterSourceIds: ['walmart_mx'],
    accessMethod: 'public_sitemap_jsonld',
    declared: { families: ALL_FAMILIES, geography: 'MX_unknown', evidence: ['published_price'], updateFrequency: 'unknown' },
    implemented: { discovery: true, originalPrice: false, affiliate: false },
    status: 'integrated_flag_off',
    verification: null,
    limitations: ['DAY_TO_DAY_WALMART_* apagado por defecto.', 'Sin precio de lista confiable ni afiliado.', 'Compliance marcado DEGRADED en el adaptador.'],
  },
  {
    id: 'bodega_aurrera_mx',
    displayName: 'Bodega Aurrera',
    hosts: ['bodegaaurrera.com.mx'],
    hunterSourceIds: ['bodega_aurrera_mx'],
    accessMethod: 'public_sitemap_jsonld',
    declared: { families: ALL_FAMILIES, geography: 'MX_unknown', evidence: ['published_price'], updateFrequency: 'unknown' },
    implemented: { discovery: true, originalPrice: false, affiliate: false },
    status: 'integrated_flag_off',
    verification: null,
    limitations: ['DAY_TO_DAY_BODEGA_* apagado por defecto.', 'Sin precio de lista confiable ni afiliado.', 'Compliance marcado DEGRADED en el adaptador.'],
  },
  {
    id: 'chedraui_mx',
    displayName: 'Chedraui',
    hosts: ['chedraui.com.mx'],
    hunterSourceIds: ['chedraui_mx'],
    accessMethod: 'public_sitemap_jsonld',
    declared: { families: ALL_FAMILIES, geography: 'MX_unknown', evidence: ['published_price'], updateFrequency: 'unknown' },
    implemented: { discovery: true, originalPrice: false, affiliate: false },
    status: 'integrated_flag_off',
    verification: null,
    limitations: ['DAY_TO_DAY_CHEDRAUI_* apagado por defecto.', 'Sin precio de lista confiable ni afiliado.'],
  },
  {
    id: 'soriana_mx',
    displayName: 'Soriana',
    hosts: ['soriana.com'],
    hunterSourceIds: [],
    accessMethod: 'none',
    declared: { families: ALL_FAMILIES, geography: 'MX_unknown', evidence: [], updateFrequency: 'unknown' },
    implemented: { discovery: false, originalPrice: false, affiliate: false },
    status: 'metadata_only',
    verification: null,
    limitations: ['Solo existe como marca de tienda y perfil de cobertura; no hay adaptador ni método de acceso validado.'],
  },
  {
    id: 'tiendas_3b_mx',
    displayName: 'Tiendas 3B',
    hosts: ['tiendas3b.com'],
    hunterSourceIds: [],
    accessMethod: 'public_catalog_unverified',
    declared: { families: ['alimentacion_basica', 'limpieza_hogar', 'higiene_personal'], geography: 'MX_unknown', evidence: [], updateFrequency: 'unknown' },
    implemented: { discovery: false, originalPrice: false, affiliate: false },
    status: 'pending_research',
    verification: null,
    limitations: [
      'La investigación identificó catálogo público y folletos; no hay API pública autorizada demostrada.',
      'No se implementa scraping. Requiere confirmar términos de uso o un acuerdo antes de cualquier adaptador.',
      'El dominio registrado es una hipótesis para identificar ofertas enviadas por la comunidad; no se ha verificado.',
    ],
  },
];

/** Una fuente solo cuenta como activa si hay código de descubrimiento y una verificación registrada. */
export function isSourceVerifiedForDiscovery(source: DespensaSource): boolean {
  return source.status === 'discovery_verified' && source.implemented.discovery && source.verification != null;
}

function hostOf(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Fuente identificable para una URL de oferta (por dominio exacto o subdominio).
 * Identificar la tienda no implica que el precio esté verificado.
 */
export function despensaSourceForUrl(url: string | null | undefined): DespensaSource | null {
  const host = hostOf(url);
  if (!host) return null;
  return (
    DESPENSA_SOURCES.find((s) => s.hosts.some((h) => host === h || host.endsWith(`.${h}`))) ?? null
  );
}

export { hostOf as despensaHostOf };
