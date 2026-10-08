/**
 * Identidad anónima de producto. Opaca, httpOnly, sin email, IP ni user id.
 * La cookie se escribe en middleware (páginas) y en route handlers (API).
 */

export const ANONYMOUS_ID_COOKIE = 'aventa_anon';

/** El middleware reenvía solo el pathname. La escritura de page_view no vive en el middleware. */
export const PRODUCT_PATH_HEADER = 'x-aventa-pathname';

const ANONYMOUS_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ANONYMOUS_ID_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

export type AnonymousCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
};

type CookieReader = {
  cookies: { get(name: string): { value: string } | undefined };
};

type CookieWriter = {
  cookies: {
    set(name: string, value: string, options: AnonymousCookieOptions): void;
  };
};

export function anonymousCookieOptions(nodeEnv: string | undefined = process.env.NODE_ENV): AnonymousCookieOptions {
  return {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ANONYMOUS_ID_MAX_AGE_SECONDS,
  };
}

export function isAnonymousId(value: string | null | undefined): value is string {
  return typeof value === 'string' && ANONYMOUS_ID_RE.test(value);
}

export function createAnonymousId(): string {
  return crypto.randomUUID();
}

/** Lee la cookie válida. No rota una identidad que ya existe. */
export function readAnonymousId(value: string | null | undefined): string | null {
  return isAnonymousId(value) ? value : null;
}

/**
 * Si no hay un id opaco válido, escribe uno nuevo en la respuesta.
 * No pisa un id ya emitido.
 */
export function ensureAnonymousCookie(request: CookieReader, response: CookieWriter): string {
  const existing = readAnonymousId(request.cookies.get(ANONYMOUS_ID_COOKIE)?.value);
  if (existing) return existing;
  const created = createAnonymousId();
  response.cookies.set(ANONYMOUS_ID_COOKIE, created, anonymousCookieOptions());
  return created;
}

/** Adapta un jar con get/set propios (route handler) al contrato de la cookie. */
export function issueAnonymousId(
  read: (name: string) => string | undefined,
  write: (name: string, value: string, options: AnonymousCookieOptions) => void,
): string {
  return ensureAnonymousCookie(
    {
      cookies: {
        get: (name) => {
          const value = read(name);
          return value ? { value } : undefined;
        },
      },
    },
    { cookies: { set: write } },
  );
}
