import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isStaffPathAllowed, resolveUserStaffRole } from '@/lib/server/middlewareRoleGate';
import {
  decideProtectedNavigation,
  sessionObservationFromAuthResult,
} from '@/lib/server/protectedNavigation';
import { applyPendingAuthCookies, type PendingAuthCookie } from '@/lib/server/sessionCookies';
import { ensureAnonymousCookie, PRODUCT_PATH_HEADER } from '@/lib/analytics/anonymousIdentity';

const PROTECTED_PATHS = ['/me', '/settings', '/mi-panel', '/contexto', '/operaciones'];
const ADMIN_PREFIX = '/admin';
const STAFF_PREFIX = '/equipo';
const TEAM_PREFIX = '/team';
/** Solo la consulta de rol. getUser() no se corta: un timeout descartaría el refresh. */
const ROLE_TIMEOUT_MS = 8000;

function isTeamPath(pathname: string): boolean {
  return pathname === TEAM_PREFIX || pathname.startsWith(`${TEAM_PREFIX}/`);
}

function isProtectedPath(pathname: string): boolean {
  const isStaff = pathname === STAFF_PREFIX || pathname.startsWith(`${STAFF_PREFIX}/`);
  return (
    PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/')) ||
    pathname.startsWith(ADMIN_PREFIX) ||
    isStaff ||
    isTeamPath(pathname)
  );
}

function redirectWithSession(
  request: NextRequest,
  pathname: string,
  pending: readonly PendingAuthCookie[],
  next?: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  if (next) url.searchParams.set('next', next);
  const redirect = NextResponse.redirect(url);
  applyPendingAuthCookies(redirect, pending);
  return redirect;
}

function forwardPathname(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  headers.set(PRODUCT_PATH_HEADER, request.nextUrl.pathname);
  return headers;
}

function continueWithPath(request: NextRequest): NextResponse {
  const response = NextResponse.next({ request: { headers: forwardPathname(request) } });
  ensureAnonymousCookie(request, response);
  return response;
}

function sessionUnavailable(pending: readonly PendingAuthCookie[]) {
  const unavailable = new NextResponse(
    'No se pudo comprobar la sesión. Recarga para continuar.',
    {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  );
  applyPendingAuthCookies(unavailable, pending);
  return unavailable;
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

  if (!isProtectedPath(pathname)) return continueWithPath(request);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return new NextResponse('Servicio no configurado (faltan variables de Supabase).', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const response = continueWithPath(request);
  const pendingCookies: PendingAuthCookie[] = [];

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const cookie of cookiesToSet) {
          const index = pendingCookies.findIndex((item) => item.name === cookie.name);
          if (index >= 0) pendingCookies[index] = cookie;
          else pendingCookies.push(cookie);
          response.cookies.set(cookie.name, cookie.value, cookie.options);
        }
      },
    },
  });

  // getUser() valida y puede rotar el refresh. Esperarlo evita devolver
  // una respuesta que tire esas cookies y deje al navegador con el token viejo.
  let session: 'authenticated' | 'anonymous' | 'unavailable' = 'anonymous';
  let userId: string | null = null;
  try {
    const userResult = await supabase.auth.getUser();
    userId = userResult.data.user?.id ?? null;
    session = sessionObservationFromAuthResult({
      userId,
      errorName: userResult.error?.name ?? null,
    });
  } catch (error) {
    console.error('[middleware] auth check failed', pathname, error);
    session = 'unavailable';
  }

  const navigation = decideProtectedNavigation(pathname, session);
  if (navigation.type === 'unavailable') return sessionUnavailable(pendingCookies);
  if (navigation.type === 'redirect') {
    return redirectWithSession(request, navigation.pathname, pendingCookies, navigation.next);
  }
  if (!userId) return response;

  // Team OS no consulta user_roles. La membresía se comprueba en el servidor.
  if (isTeamPath(pathname)) {
    return response;
  }

  const isAdmin = pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
  const isStaff =
    pathname === STAFF_PREFIX || pathname.startsWith(`${STAFF_PREFIX}/`);

  if (isAdmin || isStaff) {
    const role = await withTimeout(resolveUserStaffRole(supabase, userId), ROLE_TIMEOUT_MS);
    if (role === 'timeout') {
      console.error('[middleware] role timeout on', pathname);
      return sessionUnavailable(pendingCookies);
    }
    if (!isStaffPathAllowed(pathname, role)) {
      if (isAdmin && role === 'moderator') {
        return redirectWithSession(request, '/equipo/moderacion', pendingCookies);
      }
      return redirectWithSession(request, '/', pendingCookies);
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
    '/team',
    '/team/:path*',
    '/oferta/:path*',
    '/categoria/:path*',
    '/tienda/:path*',
    '/tag/:path*',
    '/descubre/:path*',
    '/plaza/:path*',
    '/cazadores/:path*',
    '/u/:path*',
    '/guias/:path*',
    '/privacy',
    '/terms',
    '/subir/:path*',
    '/comisiones',
    '/extension/:path*',
    '/configuracion/:path*',
  ],
};
