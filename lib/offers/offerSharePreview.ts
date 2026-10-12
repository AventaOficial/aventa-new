import { isOfferExpiredByExpiresAt } from '@/lib/votes/offerVoteEligibility';

/**
 * Misma regla que `app/oferta/[id]/page.tsx#getOffer`: el detalle carga solo `status = 'approved'`
 * y responde 404 si `deleted_at` existe. Caducar (expires_at) no quita la ficha pública,
 * así que tampoco quita la foto ni el título al compartir.
 */
export const OFFER_SHARE_PREVIEW_STATUS = 'approved';

export type OfferSharePreviewRow = {
  status?: string | null;
  deleted_at?: string | null;
  expires_at?: string | null;
};

export type OfferSharePreviewState = { visible: false } | { visible: true; expired: boolean };

export function presentOfferSharePreview(
  row: OfferSharePreviewRow | null | undefined,
  nowMs: number = Date.now(),
): OfferSharePreviewState {
  if (!row) return { visible: false };
  if (row.status !== OFFER_SHARE_PREVIEW_STATUS) return { visible: false };
  if (row.deleted_at) return { visible: false };
  return { visible: true, expired: isOfferExpiredByExpiresAt(row.expires_at, nowMs) };
}
