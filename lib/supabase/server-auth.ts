import { createServerClient } from '@supabase/ssr';

type CookieStore = {
  getAll: () => Promise<{ name: string; value: string }[]>;
  set: (name: string, value: string, options?: Record<string, unknown>) => Promise<void> | void;
  delete: (name: string, options?: Record<string, unknown>) => Promise<void> | void;
};

/** Opciones de cookie que Next.js acepta (path, maxAge, httpOnly, secure, sameSite, etc.) */
function toNextCookieOptions(options?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!options || typeof options !== 'object') return undefined;
  const next: Record<string, unknown> = {};
  if (options.path !== undefined) next.path = options.path;
  if (options.maxAge !== undefined) next.maxAge = options.maxAge;
  if (options.expires !== undefined) next.expires = options.expires;
  if (options.domain !== undefined) next.domain = options.domain;
  if (options.secure !== undefined) next.secure = options.secure;
  if (options.httpOnly !== undefined) next.httpOnly = options.httpOnly;
  if (options.sameSite !== undefined) next.sameSite = options.sameSite;
  return Object.keys(next).length ? next : undefined;
}

/**
 * Cliente Supabase para flujos de auth en el servidor (callback OAuth, etc.).
 * Usa cookies para leer/escribir la sesión. Solo anon key.
 */
export function createServerAuthClient(cookieStore: CookieStore) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: async () => cookieStore.getAll(),
      setAll: async (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          const opts = toNextCookieOptions(options as Record<string, unknown> | undefined);
          if (value) {
            await Promise.resolve(cookieStore.set(name, value, opts));
          } else {
            await Promise.resolve(cookieStore.delete(name, opts));
          }
        }
      },
    },
  });
}
