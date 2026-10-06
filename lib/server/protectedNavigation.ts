const TRANSIENT_AUTH_ERRORS = new Set(['AuthRetryableFetchError', 'AuthUnknownError']);

export type SessionObservation = 'authenticated' | 'anonymous' | 'unavailable';

/** Un error transitorio de Auth no es una sesión ausente. */
export function sessionObservationFromAuthResult(result: {
  userId: string | null;
  errorName?: string | null;
}): SessionObservation {
  if (result.userId) return 'authenticated';
  if (result.errorName && TRANSIENT_AUTH_ERRORS.has(result.errorName)) return 'unavailable';
  return 'anonymous';
}

export type ProtectedNavigation =
  | { type: 'continue' }
  | { type: 'unavailable' }
  | { type: 'redirect'; pathname: string; next?: string };

export function isTeamGatePath(pathname: string): boolean {
  return pathname === '/team/gate' || pathname.startsWith('/team/gate/');
}

export function isTeamPath(pathname: string): boolean {
  return pathname === '/team' || pathname.startsWith('/team/');
}

/**
 * Un fallo al comprobar la sesión no es un cierre de sesión.
 * El middleware debe responder 503 y conservar las cookies que Supabase ya escribió.
 */
export function decideProtectedNavigation(
  pathname: string,
  session: SessionObservation,
): ProtectedNavigation {
  if (session === 'unavailable') return { type: 'unavailable' };
  if (session === 'authenticated') return { type: 'continue' };
  if (isTeamGatePath(pathname)) return { type: 'continue' };
  if (isTeamPath(pathname)) {
    return { type: 'redirect', pathname: '/team/gate', next: pathname };
  }
  return { type: 'redirect', pathname: '/' };
}
