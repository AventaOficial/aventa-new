import { createServerClient } from '@/lib/supabase/server';
import { createServerAuthClient } from '@/lib/supabase/server-auth';

type CookiePair = { name: string; value: string };

export type CapturedRequestAuth = {
  bearer: string | null;
  cookies: CookiePair[];
};

export function captureRequestAuth(request: Request, cookies: CookiePair[]): CapturedRequestAuth {
  const header = request.headers.get('authorization');
  const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  return { bearer: bearer || null, cookies };
}

/** Resuelve el usuario dentro del trabajo diferido. El id autenticado manda sobre la cookie anónima. */
export async function userIdFromCapturedAuth(auth: CapturedRequestAuth): Promise<string | null> {
  try {
    if (auth.bearer) {
      const supabase = createServerClient();
      const { data, error } = await supabase.auth.getUser(auth.bearer);
      if (!error && data.user?.id) return data.user.id;
    }
  } catch (error) {
    console.error('[product-event] bearer user lookup failed', error instanceof Error ? error.name : 'error');
  }

  if (auth.cookies.length === 0) return null;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;

  try {
    const supabase = createServerAuthClient({
      getAll: async () => auth.cookies,
      set: () => undefined,
      delete: () => undefined,
    });
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) return null;
    return data.user.id;
  } catch (error) {
    console.error('[product-event] cookie user lookup failed', error instanceof Error ? error.name : 'error');
    return null;
  }
}
