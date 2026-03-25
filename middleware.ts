import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PROTECTED_PATHS = ['/me', '/settings', '/mi-panel', '/contexto', '/operaciones'];
const ADMIN_PREFIX = '/admin';

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // SEO: redirect ?o=id to canonical /oferta/id
  if (pathname === '/' && searchParams.get('o')) {
    const id = searchParams.get('o')?.trim();
    if (id && !id.startsWith('tester-')) {
      const url = request.nextUrl.clone();
      url.pathname = `/oferta/${id}`;
      url.search = '';
      return NextResponse.redirect(url, 301);
    }
  }

  const isProtected =
    PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/')) ||
    pathname.startsWith(ADMIN_PREFIX);

  if (!isProtected) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return new NextResponse('Servicio no configurado (faltan variables de Supabase).', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const response = NextResponse.next();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/';
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    '/',
    '/me/:path*',
    '/settings/:path*',
    '/mi-panel/:path*',
    '/contexto/:path*',
    '/operaciones/:path*',
    '/admin/:path*',
  ],
};
