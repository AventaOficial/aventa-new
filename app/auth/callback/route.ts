import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerAuthClient } from '@/lib/supabase/server-auth';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/';
  const safeNext = next.startsWith('/') ? next : '/';

  if (!code) {
    return NextResponse.redirect(`${requestUrl.origin}/?error=missing_code`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.redirect(`${requestUrl.origin}/?error=config`);
  }

  const cookieStore = await cookies();
  const supabase = createServerAuthClient({
    getAll: () => cookieStore.getAll(),
    set: (name, value, options) => cookieStore.set(name, value, options),
    delete: (name, options) => cookieStore.delete(name),
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${requestUrl.origin}/?error=auth&message=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${requestUrl.origin}${safeNext}`);
}
