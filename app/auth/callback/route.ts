import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerAuthClient } from '@/lib/supabase/server-auth';

// Evitar cache: el callback debe ejecutarse siempre en el servidor con las cookies de la petición
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/';
  const safeNext = next.startsWith('/') ? next : '/';
  const origin = requestUrl.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=missing_code`);
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

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/?error=auth&message=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
