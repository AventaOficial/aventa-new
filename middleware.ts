import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isStaffPathAllowed, resolveUserStaffRole } from '@/lib/server/middlewareRoleGate';

const PROTECTED_PATHS = ['/me', '/settings', '/mi-panel', '/contexto', '/operaciones'];
const ADMIN_PREFIX = '/admin';
const STAFF_PREFIX = '/equipo';
/** Edge middleware budget on Vercel; fail fast instead of 504. */
const AUTH_TIMEOUT_MS = 8000;

function isProtectedPath(pathname: string): boolean {
  const isStaff = pathname === STAFF_PREFIX || pathname.startsWith(`${STAFF_PREFIX}/`);
  return (
    PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/')) ||
    pathname.startsWith(ADMIN_PREFIX) ||
    isStaff
  );
}

function redirectHome(request: NextRequest) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/';
  return NextResponse.redirect(loginUrl);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname === '/' && searchParams.get('o')) {
    const id = searchParams.get('o')?.trim();
    if (id && !id.startsWith('tester-')) {
      const url = request.nextUrl.clone();
      url.pathname = `/oferta/${id}`;
      url.search = '';
      return NextResponse.redirect(url, 301);
    }
  }

  if (!isProtectedPath(pathname)) return NextResponse.next();

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

  // Session-only gate: roles are enforced in /admin and /equipo layouts (client + API).
  const userResult = await withTimeout(supabase.auth.getUser(), AUTH_TIMEOUT_MS);
  if (userResult === 'timeout') {
    console.error('[middleware] auth timeout on', pathname);
    return redirectHome(request);
  }

  if (!userResult.data.user) {
    return redirectHome(request);
  }

  const isAdmin = pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
  const isStaff =
    pathname === STAFF_PREFIX || pathname.startsWith(`${STAFF_PREFIX}/`);

  if (isAdmin || isStaff) {
    const role = await withTimeout(
      resolveUserStaffRole(supabase, userResult.data.user.id),
      AUTH_TIMEOUT_MS,
    );
    if (role === 'timeout') {
      console.error('[middleware] role timeout on', pathname);
      return redirectHome(request);
    }
    if (!isStaffPathAllowed(pathname, role)) {
      return redirectHome(request);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/',
    '/me/:path*',
    '/settings',
    '/settings/:path*',
    '/mi-panel/:path*',
    '/contexto/:path*',
    '/operaciones/:path*',
    '/admin',
    '/admin/:path*',
    '/equipo',
    '/equipo/:path*',
  ],
};
