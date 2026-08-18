import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { ROLES, pickEffectiveRole, ADMIN_PANEL_ROLES, STAFF_HUB_ROLES, type Role } from '@/lib/admin/roles';
import { canAccessStaffDepartment } from '@/lib/staff/permissions';
import { canAccessEquipoPath } from '@/lib/staff/equipoAccess';
import type { StaffDepartmentId } from '@/lib/staff/permissions';

const PROTECTED_PATHS = ['/me', '/settings', '/mi-panel', '/contexto', '/operaciones'];
const ADMIN_PREFIX = '/admin';
const STAFF_PREFIX = '/equipo';

function parseEquipoDepartment(pathname: string): StaffDepartmentId | null {
  if (pathname === '/equipo' || pathname === '/equipo/') return 'home';
  const m = pathname.match(/^\/equipo\/([^/]+)/);
  if (!m) return null;
  const slug = m[1];
  const allowed: StaffDepartmentId[] = [
    'moderacion',
    'marketing',
    'contabilidad',
    'operaciones',
    'gerencia',
  ];
  return allowed.includes(slug as StaffDepartmentId) ? (slug as StaffDepartmentId) : null;
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

  const isStaff = pathname === STAFF_PREFIX || pathname.startsWith(`${STAFF_PREFIX}/`);
  const isProtected =
    PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/')) ||
    pathname.startsWith(ADMIN_PREFIX) ||
    isStaff;

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/';
    return NextResponse.redirect(loginUrl);
  }

  const { data: roleRows, error: rolesError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', [...ROLES]);

  if (rolesError) {
    console.error('[middleware] user_roles:', rolesError.message);
  }

  const userRoles = ((roleRows ?? []) as { role: Role }[]).map((r) => r.role);
  const effectiveRole = pickEffectiveRole(userRoles);

  if (pathname.startsWith(ADMIN_PREFIX)) {
    if (!effectiveRole || !ADMIN_PANEL_ROLES.includes(effectiveRole)) {
      if (effectiveRole && STAFF_HUB_ROLES.includes(effectiveRole)) {
        const staffHome = request.nextUrl.clone();
        staffHome.pathname = '/equipo';
        return NextResponse.redirect(staffHome);
      }
      const home = request.nextUrl.clone();
      home.pathname = '/';
      return NextResponse.redirect(home);
    }
  }

  if (isStaff) {
    if (!effectiveRole || !STAFF_HUB_ROLES.includes(effectiveRole)) {
      const home = request.nextUrl.clone();
      home.pathname = '/';
      return NextResponse.redirect(home);
    }
    const dept = parseEquipoDepartment(pathname);
    if (dept && dept !== 'home' && !canAccessEquipoPath(effectiveRole, pathname)) {
      const fallback = request.nextUrl.clone();
      fallback.pathname = '/equipo';
      return NextResponse.redirect(fallback);
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
    '/admin/:path*',
    '/equipo',
    '/equipo/:path*',
  ],
};
