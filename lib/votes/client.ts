/**
 * Contrato con POST /api/votes: value === 2 (arriba) o -1 (abajo).
 * @see lib/contracts/votes.ts
 */
export const VOTE_API_UP = 2 as const;
export const VOTE_API_DOWN = -1 as const;
export type VoteApiValue = typeof VOTE_API_UP | typeof VOTE_API_DOWN;

export function isVoteApiValue(v: unknown): v is VoteApiValue {
  return v === VOTE_API_UP || v === VOTE_API_DOWN;
}

/**
 * Tras decidir el siguiente estado de UI (1 | -1 | 0), devuelve el payload para la API.
 * Quitar voto: reenviar el mismo value almacenado (la API borra la fila).
 */
export function voteApiValueForTransition(
  nextDisplay: 0 | 1 | -1,
  prevDisplay: 0 | 1 | -1
): VoteApiValue | null {
  if (nextDisplay === 1) return VOTE_API_UP;
  if (nextDisplay === -1) return VOTE_API_DOWN;
  if (prevDisplay === 1) return VOTE_API_UP;
  if (prevDisplay === -1) return VOTE_API_DOWN;
  return null;
}

export type PostOfferVoteResult =
  | { ok: true }
  | { ok: false; message: string; isNetworkError: boolean };

/** POST /api/votes: interpreta cuerpo y status para no mostrar “conexión” en 401/429/500. */
export async function postOfferVote(
  offerId: string,
  value: VoteApiValue,
  accessToken: string | null | undefined
): Promise<PostOfferVoteResult> {
  try {
    const res = await fetch('/api/votes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ offerId, value }),
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
    return { ok: false, message: 'No se pudo registrar el voto.', isNetworkError: false };
  } catch {
    return {
      ok: false,
      message: 'No se pudo registrar el voto. Revisa tu conexión.',
      isNetworkError: true,
    };
  }
}
