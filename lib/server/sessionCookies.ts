export type PendingAuthCookie = {
  name: string;
  value: string;
  options?: {
    domain?: string;
    path?: string;
    maxAge?: number;
    expires?: Date;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: boolean | 'lax' | 'strict' | 'none';
  };
};

type CookieSink = {
  cookies: {
    set: (name: string, value: string, options?: PendingAuthCookie['options']) => void;
  };
};

/** Copia cookies de sesión a la respuesta que el navegador sí va a recibir. */
export function applyPendingAuthCookies(
  target: CookieSink,
  pending: readonly PendingAuthCookie[],
): void {
  for (const cookie of pending) {
    target.cookies.set(cookie.name, cookie.value, cookie.options);
  }
}
