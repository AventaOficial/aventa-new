import {
  isAllowedAffiliateNetworkHost,
  isAllowedMxCommerceHost,
  isOfferAmazonHost,
  isOfferMeliLaHost,
  isOfferMercadoLibreHost,
} from '@/lib/offers/commerceHostAllowlist';
import { extractAmazonAsin, offerUrlFingerprint } from '@/lib/offers/offerUrlFingerprint';
import { hasMercadoLibreListingIdentity } from '@/lib/offers/resolveMercadoLibreItem';

/** Estados que el contrato de publicación ya trata como listables. */
export const PUBLIC_CATALOG_STATUSES = ['approved', 'published'] as const;

export type PublicCatalogStatus = (typeof PUBLIC_CATALOG_STATUSES)[number];

export type PublicCatalogOfferFields = {
  status?: string | null;
  deleted_at?: string | null;
  offer_url?: string | null;
  bot_meta?: unknown;
};

/** Orígenes escritos por costuras de prueba. No son publicación. */
const INTERNAL_TEST_SOURCES = new Set(['wave3_seam']);

/**
 * Una oferta es de catálogo público solo si ya está aprobada o publicada,
 * no está borrada, no proviene de una costura de prueba, y su destino es
 * un producto identificable en una tienda que el producto ya reconoce.
 * Descubrir, extraer o aprobar un dato de prueba no la vuelve pública.
 */
export function isRecognizedPublicStoreHost(hostname: string): boolean {
  return (
    isOfferAmazonHost(hostname) ||
    isOfferMercadoLibreHost(hostname) ||
    isOfferMeliLaHost(hostname) ||
    isAllowedAffiliateNetworkHost(hostname) ||
    isAllowedMxCommerceHost(hostname)
  );
}

function isInternalTestSource(botMeta: unknown): boolean {
  if (!botMeta || typeof botMeta !== 'object') return false;
  const source = (botMeta as { source?: unknown }).source;
  return typeof source === 'string' && INTERNAL_TEST_SOURCES.has(source);
}

function destinationHasPublicProductIdentity(raw: string, hostname: string): boolean {
  if (isOfferAmazonHost(hostname)) return extractAmazonAsin(raw) != null;
  if (isOfferMercadoLibreHost(hostname)) return hasMercadoLibreListingIdentity(raw);
  if (isOfferMeliLaHost(hostname)) {
    const fingerprint = offerUrlFingerprint(raw);
    return fingerprint != null && fingerprint.startsWith('meli.la:');
  }
  return offerUrlFingerprint(raw) != null;
}

export function offerUrlIsPublicDestination(raw: string | null | undefined): boolean {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (!url.hostname || url.username || url.password) return false;
  if (!isRecognizedPublicStoreHost(url.hostname)) return false;
  return destinationHasPublicProductIdentity(value, url.hostname);
}

export function isPublicCatalogOffer(row: PublicCatalogOfferFields): boolean {
  const status = row.status?.trim() ?? '';
  if (status !== 'approved' && status !== 'published') return false;
  if (row.deleted_at) return false;
  if (isInternalTestSource(row.bot_meta)) return false;
  return offerUrlIsPublicDestination(row.offer_url);
}

export function filterPublicCatalogRows<T extends PublicCatalogOfferFields>(rows: readonly T[]): T[] {
  return rows.filter((row) => isPublicCatalogOffer(row));
}
