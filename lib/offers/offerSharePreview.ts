import { isOfferExpiredByExpiresAt, VOTABLE_OFFER_STATUSES } from '@/lib/votes/offerVoteEligibility';

/**
 * Estados con ficha pública: los mismos que el feed, la tienda y la categoría listan.
 * `app/oferta/[id]/page.tsx#readOfferDetail` responde 404 fuera de ellos o si `deleted_at` existe.
 * Caducar (expires_at) no quita la ficha pública, así que tampoco quita la foto ni el título al compartir.
 */
export const PUBLIC_OFFER_DETAIL_STATUSES = VOTABLE_OFFER_STATUSES;

export type OfferSharePreviewRow = {
  status?: string | null;
  deleted_at?: string | null;
  expires_at?: string | null;
};

export type OfferSharePreviewState = { visible: false } | { visible: true; expired: boolean };

export function isPublicOfferDetailStatus(status: string | null | undefined): boolean {
  return (PUBLIC_OFFER_DETAIL_STATUSES as readonly string[]).includes(status ?? '');
}

export function presentOfferSharePreview(
  row: OfferSharePreviewRow | null | undefined,
  nowMs: number = Date.now(),
): OfferSharePreviewState {
  if (!row) return { visible: false };
  if (!isPublicOfferDetailStatus(row.status)) return { visible: false };
  if (row.deleted_at) return { visible: false };
  return { visible: true, expired: isOfferExpiredByExpiresAt(row.expires_at, nowMs) };
}
