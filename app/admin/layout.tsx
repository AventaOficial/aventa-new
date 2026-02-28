'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  ClipboardList,
  CheckCircle,
  XCircle,
  Flag,
  Users,
  FileText,
  MessageCircle,
  BarChart3,
  Heart,
  Menu,
  X,
} from 'lucide-react';
import { canAccessModeration, canAccessMetrics, canAccessHealth, type Role } from '@/lib/admin/roles';

const ALLOWED_ROLES = ['owner', 'admin', 'moderator', 'analyst'] as const;

const MODERATION_ITEMS = [
  { href: '/admin/moderation', label: 'Pendientes', icon: ClipboardList },
  { href: '/admin/moderation/approved', label: 'Aprobadas', icon: CheckCircle },
  { href: '/admin/moderation/rejected', label: 'Rechazadas', icon: XCircle },
  { href: '/admin/moderation/comments', label: 'Comentarios', icon: MessageCircle },
  { href: '/admin/reports', label: 'Reportes', icon: Flag },
  { href: '/admin/users', label: 'Usuarios', icon: Users },
  { href: '/admin/logs', label: 'Logs', icon: FileText },
] as const;

const METRICS_ITEMS = [
  { href: '/admin/metrics', label: 'Métricas', icon: BarChart3 },
  { href: '/admin/health', label: 'Health', icon: Heart },
] as const;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u ? { id: u.id } : null);
      if (!u) {
        setUserRole(null);
        return;
      }
      supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', u.id)
        .in('role', ALLOWED_ROLES)
        .then(({ data, error }) => {
          if (error) {
            console.error('Error fetching user roles:', error);
            setUserRole(null);
            return;
          }
          const roles = ((data ?? []) as { role: Role }[]).map((x) => x.role);
          const priority: Role[] = ['owner', 'admin', 'moderator', 'analyst'];
          const r = priority.find((p) => roles.includes(p)) ?? null;
          setUserRole(r);
        });
    });
  }, []);

  const hasAllowedRole = userRole !== null;
  const canMod = canAccessModeration(userRole);
  const canMet = canAccessMetrics(userRole);
  const canHea = canAccessHealth(userRole);

  useEffect(() => {
    if (!hasAllowedRole) return;
    const isModPath = pathname.startsWith('/admin/moderation') || pathname.startsWith('/admin/reports') || pathname.startsWith('/admin/users') || pathname.startsWith('/admin/logs');
    const isMetPath = pathname === '/admin/metrics';
    const isHeaPath = pathname === '/admin/health';
    if (isModPath && !canMod) {
      router.replace(canMet ? '/admin/metrics' : '/admin/health');
    } else if (isMetPath && !canMet) {
      router.replace(canMod ? '/admin/moderation' : '/admin/health');
    } else if (isHeaPath && !canHea) {
      router.replace(canMod ? '/admin/moderation' : '/admin/metrics');
    }
  }, [pathname, hasAllowedRole, canMod, canMet, canHea, router]);

  if (hasAllowedRole === null) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Cargando…</div>
      </div>
    );
  }

  if (!user || hasAllowedRole === false) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-700 dark:text-gray-300 font-medium">
            Acceso restringido
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Solo usuarios con rol (owner, admin, moderator, analyst) pueden acceder.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-purple-600 dark:text-purple-400 hover:underline"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex">
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700
          transform transition-transform duration-200 ease-in-out
          lg:translate-x-0 lg:static
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex h-16 items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700 lg:justify-start">
          <Link
            href="/admin/moderation"
            className="font-semibold text-gray-900 dark:text-gray-100"
          >
            Panel Admin
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="p-3 space-y-0.5">
          {canMod && (
            <>
              <p className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Moderación
              </p>
              {MODERATION_ITEMS.map(({ href, label, icon: Icon }) => {
                const isActive =
                  pathname === href ||
                  (href.startsWith('/admin/moderation/') && pathname.startsWith(href));
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setSidebarOpen(false)}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                      ${
                        isActive
                          ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }
                    `}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </>
          )}
          {(canMet || canHea) && (
            <>
              <p className="px-3 py-1.5 mt-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Métricas
              </p>
              {canMet && (
                <Link
                  href="/admin/metrics"
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                    ${
                      pathname === '/admin/metrics'
                        ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }
                  `}
                >
                  <BarChart3 className="h-4 w-4 shrink-0" />
                  Métricas
                </Link>
              )}
              {canHea && (
                <Link
                  href="/admin/health"
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                    ${
                      pathname === '/admin/health'
                        ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }
                  `}
                >
                  <Heart className="h-4 w-4 shrink-0" />
                  Health
                </Link>
              )}
            </>
          )}
        </nav>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <main className="flex-1 min-w-0">
        <div className="sticky top-0 z-20 flex h-14 items-center gap-2 px-4 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-medium text-gray-800 dark:text-gray-200">
            Moderación
          </span>
        </div>
        <div className="p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
