import { revalidatePath, revalidateTag } from 'next/cache';

/** Antigüedad máxima del detalle público servido desde caché. Igual al techo del layout raíz. */
export const PUBLIC_OFFER_REVALIDATE_SECONDS = 60;

/** Listados ISR que pueden mostrar la tarjeta de la oferta. La home la revalida moderate-offer. */
export const PUBLIC_OFFER_LISTING_ROUTES = [
  '/categoria/[slug]',
  '/categoria/[slug]/[subslug]',
  '/tienda/[slug]',
  '/tag/[slug]',
] as const;

export function offerDetailCacheTag(offerId: string): string {
  return `offer:${offerId}`;
}

/**
 * Expira el detalle y los listados cacheados tras moderar, editar o expirar la oferta.
 * Las rutas que no llaman aquí (crons, lotes) quedan acotadas por PUBLIC_OFFER_REVALIDATE_SECONDS.
 */
export function invalidatePublicOffer(offerId: string): void {
  try {
    revalidateTag(offerDetailCacheTag(offerId), { expire: 0 });
    for (const route of PUBLIC_OFFER_LISTING_ROUTES) revalidatePath(route, 'page');
  } catch (error) {
    console.error('[offer-cache] invalidation skipped', error instanceof Error ? error.name : 'error');
  }
}
