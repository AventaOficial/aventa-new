/**
 * POST /api/votes: cuerpo `{ offerId, direction: 'up' | 'down' }` (o legacy `value` con signo).
 * El servidor asigna el peso según reputation_level.
 * @see lib/contracts/votes.ts
 */
import type { VoteDirection } from '@/lib/votes/reputationWeights';

export type { VoteDirection };

export type PostOfferVoteResult =
  | { ok: true }
  | { ok: false; message: string; isNetworkError: boolean };

const voteQueues = new Map<string, Promise<PostOfferVoteResult>>();

async function executePostOfferVote(
  offerId: string,
  direction: VoteDirection,
  accessToken: string | null | undefined,
): Promise<PostOfferVoteResult> {
  try {
    const res = await fetch('/api/votes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ offerId, direction }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (res.ok && data.ok === true) return { ok: true };

    const serverErr =
      typeof data.error === 'string' && data.error.trim().length > 0 ? data.error.trim() : null;
    if (serverErr) {
      return { ok: false, message: serverErr, isNetworkError: false };
    }
    if (res.status === 429) {
      return {
        ok: false,
        message: 'Demasiadas acciones. Espera un minuto e inténtalo de nuevo.',
        isNetworkError: false,
      };
    }
    if (res.status === 401) {
      return {
        ok: false,
        message: 'Sesión caducada o inválida. Vuelve a iniciar sesión.',
        isNetworkError: false,
      };
    }
    if (res.status >= 500) {
      return {
        ok: false,
        message: 'Servicio no disponible. Inténtalo más tarde.',
        isNetworkError: false,
      };
    }
    return { ok: false, message: 'No registramos tu voto. Reintenta.', isNetworkError: false };
  } catch {
    return {
      ok: false,
      message: 'No registramos tu voto. Reintenta.',
      isNetworkError: true,
    };
  }
}

/** Serializa votos por oferta para evitar carreras al pulsar rápido. */
export async function postOfferVote(
  offerId: string,
  direction: VoteDirection,
  accessToken: string | null | undefined,
): Promise<PostOfferVoteResult> {
  const previous = voteQueues.get(offerId) ?? Promise.resolve({ ok: true as const });
  const current = previous
    .catch(() => ({ ok: false as const, message: '', isNetworkError: false }))
    .then(() => executePostOfferVote(offerId, direction, accessToken));

  voteQueues.set(offerId, current);
  try {
    return await current;
  } finally {
    if (voteQueues.get(offerId) === current) {
      voteQueues.delete(offerId);
    }
  }
}

/** True mientras hay un POST /api/votes en curso para esa oferta. */
export function isOfferVoteInFlight(offerId: string): boolean {
  return voteQueues.has(offerId);
}
