export type ModerationLockAction = 'acquire' | 'release' | 'heartbeat';

export type ModerationLockClientResult =
  | { ok: true; lockSupported: true }
  | { ok: true; lockSupported: false }
  | { ok: false; conflict: true }
  | { ok: false; conflict?: false; transient?: boolean };

type RequestModerationLockParams = {
  offerId: string;
  action: ModerationLockAction;
  headers: HeadersInit;
  fetchImpl?: typeof fetch;
};

/**
 * Cliente de lock de moderación.
 * Fallos de red / HMR / fetch abortado → { ok: false, transient: true } sin lanzar.
 */
export async function requestModerationLock(
  params: RequestModerationLockParams
): Promise<ModerationLockClientResult> {
  const fetchImpl = params.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl('/api/admin/moderation-lock', {
      method: 'POST',
      headers: params.headers,
      body: JSON.stringify({ offerId: params.offerId, action: params.action }),
    });
    const data = (await res.json().catch(() => ({}))) as { lockSupported?: boolean };
    if (data?.lockSupported === false) {
      return { ok: true, lockSupported: false };
    }
    if (res.status === 409) {
      return { ok: false, conflict: true };
    }
    if (!res.ok) {
      return { ok: false };
    }
    return { ok: true, lockSupported: true };
  } catch {
    // TypeError: Failed to fetch, AbortError, etc. — no overlay, no throw.
    // Evitar spam: no loguear heartbeats fallidos.
    if (params.action !== 'heartbeat' && process.env.NODE_ENV === 'development') {
      console.warn('[moderation-lock] transient network failure', params.action);
    }
    return { ok: false, transient: true };
  }
}
