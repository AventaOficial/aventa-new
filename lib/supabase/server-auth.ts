import { createServerClient } from '@supabase/ssr';

type CookieStore = {
  getAll: () => Promise<{ name: string; value: string }[]>;
  set: (name: string, value: string, options?: object) => Promise<void> | void;
  delete: (name: string, options?: object) => Promise<void> | void;
};

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
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        return Promise.all(
          cookiesToSet.map(({ name, value, options }) =>
            value
              ? Promise.resolve(cookieStore.set(name, value, options))
              : Promise.resolve(cookieStore.delete(name, options))
          )
        );
      },
    },
  });
}
