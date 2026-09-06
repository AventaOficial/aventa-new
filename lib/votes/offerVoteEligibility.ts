export const VOTABLE_OFFER_STATUSES = ['approved', 'published'] as const;

export type VotableOfferStatus = (typeof VOTABLE_OFFER_STATUSES)[number];

/** Solo ofertas visibles en el feed pueden recibir votos. */
export function isPubliclyVotableOfferStatus(status: string | null | undefined): boolean {
  return status === 'approved' || status === 'published';
}

/**
 * P1-4 — Alineado con el feed: activa si expires_at IS NULL o expires_at >= now.
 * Exactamente now ⇒ aún activa (gte). Cliente no aporta la fecha.
 */
export function isOfferExpiredByExpiresAt(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (expiresAt == null || expiresAt === '') return false;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return true; // fecha inválida → fail-closed (no votable)
  return t < nowMs;
}

export function canAcceptNewPublicVote(params: {
  status: string | null | undefined;
  expiresAt: string | null | undefined;
  nowMs?: number;
}): { ok: true } | { ok: false; reason: 'status' | 'expired' } {
  if (!isPubliclyVotableOfferStatus(params.status)) {
    return { ok: false, reason: 'status' };
  }
  if (isOfferExpiredByExpiresAt(params.expiresAt, params.nowMs ?? Date.now())) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true };
}
