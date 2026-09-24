import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerAuthClient } from '@/lib/supabase/server-auth';
import { resolveSafeOAuthNext } from '@/lib/auth/safeOAuthNext';
import { getClientIp, enforceRateLimit } from '@/lib/server/rateLimit';
import { recordProductEvent } from '@/lib/analytics/recordProductEvent';

// Evitar cache: el callback debe ejecutarse siempre en el servidor con las cookies de la petición
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const safeNext = resolveSafeOAuthNext(requestUrl.searchParams.get('next'));
  const origin = requestUrl.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=missing_code`);
  }

  const rl = await enforceRateLimit(`auth:${getClientIp(request)}`, { critical: true });
  if (!rl.success) {
    return NextResponse.redirect(`${origin}/?error=rate_limited`);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.redirect(`${origin}/?error=config`);
  }

  const cookieStore = await cookies();
  const supabase = createServerAuthClient({
    getAll: async () => cookieStore.getAll(),
    set: (name, value, options) => {
      cookieStore.set(name, value, options as Record<string, unknown>);
    },
    delete: (name) => {
      cookieStore.delete(name);
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/?error=auth&message=${encodeURIComponent(error.message)}`);
  }

  if (data.user?.id) {
    void recordProductEvent({
      event: 'login',
      userId: data.user.id,
      source: 'oauth_callback',
    });
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
