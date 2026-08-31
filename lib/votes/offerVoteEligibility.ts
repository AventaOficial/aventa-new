export const VOTABLE_OFFER_STATUSES = ['approved', 'published'] as const;

export type VotableOfferStatus = (typeof VOTABLE_OFFER_STATUSES)[number];

/** Solo ofertas visibles en el feed pueden recibir votos. */
export function isPubliclyVotableOfferStatus(status: string | null | undefined): boolean {
  return status === 'approved' || status === 'published';
}
