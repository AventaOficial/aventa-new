'use client';

import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ChevronDown, Menu, X } from 'lucide-react';
import {
  ROLES,
  canAccessModeration,
  canAccessMetrics,
  canAccessHealth,
  canAccessUsersLogs,
  canManageTeam,
  canManageAnnouncements,
  canAccessOwnerOperationsPanel,
  type Role,
} from '@/lib/admin/roles';
import {
  buildAdminNavigation,
  getDefaultAdminHome,
  type AdminNavDomainSection,
  type AdminNavItem,
  type NavDomain,
} from '@/lib/admin/navigation';

function NavLink({
  item,
  isActive,
  onNavigate,
}: {
  item: AdminNavItem;
  isActive: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`
        flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-medium tracking-tight transition-all
        ${
          isActive
            ? 'bg-violet-100/90 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 shadow-[0_4px_20px_rgba(0,0,0,0.03)]'
            : item.subtle
              ? 'text-gray-500 dark:text-gray-500 hover:bg-gray-100/80 dark:hover:bg-gray-900'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100/80 dark:hover:bg-gray-900'
        }
      `}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [authGateReady, setAuthGateReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openDomains, setOpenDomains] = useState<Partial<Record<NavDomain, boolean>>>({});

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u ? { id: u.id } : null);
      if (!u) {
        setUserRole(null);
        setAuthGateReady(true);
        return;
      }
      supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', u.id)
        .in('role', ROLES)
        .then(({ data, error }) => {
          if (error) {
            console.error('Error fetching user roles:', error);
            setUserRole(null);
            setAuthGateReady(true);
            return;
          }
          const roles = ((data ?? []) as { role: Role }[]).map((x) => x.role);
          const priority: Role[] = ['owner', 'admin', 'moderator', 'analyst'];
          const r = priority.find((p) => roles.includes(p)) ?? null;
          setUserRole(r);
          setAuthGateReady(true);
        });
    });
  }, []);

  const hasAllowedRole = userRole !== null;
  const canMod = canAccessModeration(userRole);
  const canUsersLogs = canAccessUsersLogs(userRole);
  const canTeam = canManageTeam(userRole);
  const canAnnouncements = canManageAnnouncements(userRole);
  const canOwnerOpsPanel = canAccessOwnerOperationsPanel(userRole);
  const canMet = canAccessMetrics(userRole);
  const canHea = canAccessHealth(userRole);
  const canTechnical = canOwnerOpsPanel;

  useEffect(() => {
    if (!authGateReady || !hasAllowedRole) return;
    const isDashboardPath = pathname === '/admin/dashboard';
    const isModPath = pathname.startsWith('/admin/moderation') || pathname.startsWith('/admin/reports');
    const isUsersLogsPath = pathname === '/admin/users' || pathname === '/admin/logs';
    const isTeamPath = pathname === '/admin/team';
    const isOwnerPanelPath = pathname === '/admin/owner';
    const isAnalistaPath = pathname === '/admin/analista';
    const isAnnouncementsPath = pathname === '/admin/announcements';
    const isMetPath = pathname === '/admin/metrics';
    const isHeaPath = pathname === '/admin/health';
    const isVoteWeightsPath = pathname === '/admin/vote-weights';
    const isOperacionesPath = pathname.startsWith('/admin/operaciones');
    const isCommissionsPath = pathname === '/admin/commissions';
    const isMantenimientoPath = pathname === '/admin/mantenimiento';
    const isTechnicalPath = pathname === '/admin/technical';
    if (isOwnerPanelPath && !canOwnerOpsPanel) {
      router.replace(canMod ? '/admin/moderation' : canMet ? '/admin/metrics' : '/admin/health');
    } else if (isDashboardPath && userRole === 'owner') {
      router.replace('/admin/owner');
    } else if (isAnalistaPath) {
      router.replace(canMet ? '/admin/metrics' : '/admin/health');
    } else if (isDashboardPath && !hasAllowedRole) {
      router.replace('/');
    } else if (isOperacionesPath && (!canTeam || !canOwnerOpsPanel)) {
      router.replace(canMod ? '/admin/moderation' : canMet ? '/admin/metrics' : '/admin/health');
    } else if (isCommissionsPath && !canOwnerOpsPanel) {
      router.replace(canMod ? '/admin/moderation' : canMet ? '/admin/metrics' : '/admin/health');
    } else if (isMantenimientoPath && !canTeam) {
      router.replace(canMod ? '/admin/moderation' : canMet ? '/admin/metrics' : '/admin/health');
    } else if (isVoteWeightsPath && (!canTeam || !canOwnerOpsPanel)) {
      router.replace(canUsersLogs ? '/admin/users' : canMod ? '/admin/moderation' : '/admin/metrics');
    } else if (isAnnouncementsPath && !canAnnouncements) {
      router.replace(canTeam ? '/admin/team' : canUsersLogs ? '/admin/users' : canMod ? '/admin/moderation' : canMet ? '/admin/metrics' : '/admin/health');
    } else if (isTeamPath && !canTeam) {
      router.replace(canUsersLogs ? '/admin/users' : canMod ? '/admin/moderation' : canMet ? '/admin/metrics' : '/admin/health');
    } else if (isUsersLogsPath && !canUsersLogs) {
      router.replace(canTeam ? '/admin/team' : canMod ? '/admin/moderation' : canMet ? '/admin/metrics' : '/admin/health');
    } else if (isModPath && !canMod) {
      router.replace(canMet ? '/admin/metrics' : '/admin/health');
    } else if (isMetPath && !canMet) {
      router.replace(canMod ? '/admin/moderation' : '/admin/health');
    } else if (isHeaPath && !canHea) {
      router.replace(canMod ? '/admin/moderation' : '/admin/metrics');
    } else if (isTechnicalPath && !canTechnical) {
      router.replace(canOwnerOpsPanel ? '/admin/owner' : canMod ? '/admin/moderation' : canMet ? '/admin/metrics' : '/admin/health');
    }
  }, [
    pathname,
    authGateReady,
    hasAllowedRole,
    userRole,
    canMod,
    canUsersLogs,
    canTeam,
    canOwnerOpsPanel,
    canAnnouncements,
    canMet,
    canHea,
    canTechnical,
    router,
  ]);

  const nav = buildAdminNavigation(userRole);
  const homeHref = getDefaultAdminHome(userRole);

  useEffect(() => {
    if (!userRole) return;
    const { domains } = buildAdminNavigation(userRole);
    const initial: Partial<Record<NavDomain, boolean>> = {};
    for (const d of domains) {
      initial[d.id] = d.defaultOpen;
    }
    setOpenDomains(initial);
  }, [userRole]);

  const getActive = (item: AdminNavItem) => {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  const mobileTitle =
    pathname === '/admin/owner'
      ? 'Negocio'
      : pathname.startsWith('/admin/moderation') || pathname.startsWith('/admin/reports') || pathname === '/admin/announcements'
        ? 'Comunidad'
        : pathname === '/admin/users' || pathname === '/admin/team' || pathname === '/admin/vote-weights'
          ? 'Usuarios'
          : pathname.startsWith('/admin/operaciones') || pathname === '/admin/commissions'
            ? 'Operaciones'
            : pathname === '/admin/metrics' || pathname === '/admin/health' || pathname === '/admin/technical' || pathname === '/admin/logs' || pathname === '/admin/mantenimiento'
              ? 'Sistema'
              : 'Admin';

  if (!authGateReady) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-[#141414] flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Cargando…</div>
      </div>
    );
  }

  if (!user || hasAllowedRole === false) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-[#141414] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-700 dark:text-gray-300 font-medium">Acceso restringido</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Solo usuarios con rol (owner, admin, moderator, analyst) pueden acceder.
          </p>
          <Link href="/" className="mt-4 inline-block text-purple-600 dark:text-purple-400 hover:underline">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-black flex">
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-72 bg-white/95 dark:bg-[#111113]/95 backdrop-blur-xl border-r border-gray-200/80 dark:border-gray-800
          transform transition-transform duration-200 ease-in-out
          lg:translate-x-0 lg:static
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex h-16 items-center justify-between px-5 border-b border-gray-200/80 dark:border-gray-800 lg:justify-start">
          <Link href={homeHref} className="font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            {userRole === 'owner' ? 'AVENTA · Mando' : 'Panel Admin'}
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

        <nav className="p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-4rem)]">
          {nav.home ? (
            <NavLink
              item={nav.home}
              isActive={getActive(nav.home)}
              onNavigate={() => setSidebarOpen(false)}
            />
          ) : null}

          {nav.pinned.length > 0 ? (
            <div>
              <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">
                Acceso rápido
              </p>
              <div className="mt-1 space-y-0.5">
                {nav.pinned.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    isActive={getActive(item)}
                    onNavigate={() => setSidebarOpen(false)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {nav.domains.map((section: AdminNavDomainSection) => {
            const isOpen = openDomains[section.id] ?? section.defaultOpen;
            const hasActiveChild = section.items.some((i) => getActive(i));
            return (
              <div key={section.id}>
                <button
                  type="button"
                  onClick={() => setOpenDomains((s) => ({ ...s, [section.id]: !isOpen }))}
                  className={`flex w-full flex-col items-stretch gap-0.5 px-3 py-2 rounded-xl text-left transition-colors ${
                    hasActiveChild
                      ? 'bg-violet-50/80 dark:bg-violet-950/30'
                      : 'hover:bg-gray-100/80 dark:hover:bg-gray-900'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                        hasActiveChild
                          ? 'text-violet-600 dark:text-violet-400'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {section.title}
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 pr-6">{section.subtitle}</span>
                </button>
                {isOpen ? (
                  <div className="mt-1 space-y-0.5 pl-1">
                    {section.items.map((item) => (
                      <NavLink
                        key={item.href}
                        item={item}
                        isActive={getActive(item)}
                        onNavigate={() => setSidebarOpen(false)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
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
        <div className="sticky top-0 z-20 flex h-14 items-center gap-2 px-4 bg-[#F5F5F7]/90 dark:bg-black/90 backdrop-blur-xl border-b border-gray-200/80 dark:border-gray-800 lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-medium text-gray-800 dark:text-gray-200">{mobileTitle}</span>
        </div>
        <div className="p-4 lg:p-6 max-w-7xl mx-auto w-full">{children}</div>
      </main>
    </div>
  );
}
