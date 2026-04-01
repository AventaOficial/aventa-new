'use client';

import { useState, useEffect, type ComponentType, type ReactNode } from 'react';
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
  ShieldOff,
  UserCog,
  Megaphone,
  LayoutDashboard,
  Map,
  Scale,
  Briefcase,
  NotebookPen,
  Wrench,
} from 'lucide-react';
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

/** Solo moderación: Pendientes, Aprobadas, Rechazadas, Comentarios, Reportes (visible para moderator + owner/admin) */
const MODERATION_ONLY_ITEMS = [
  { href: '/admin/moderation', label: 'Pendientes', icon: ClipboardList },
  { href: '/admin/moderation/approved', label: 'Aprobadas', icon: CheckCircle },
  { href: '/admin/moderation/rejected', label: 'Rechazadas', icon: XCircle },
  { href: '/admin/moderation/comments', label: 'Comentarios', icon: MessageCircle },
  { href: '/admin/reports', label: 'Reportes', icon: Flag },
  { href: '/admin/moderation/bans', label: 'Baneos', icon: ShieldOff },
] as const;

/** Usuarios y Logs: solo owner y admin (moderadores no ven estos enlaces) */
const USERS_LOGS_ITEMS = [
  { href: '/admin/users', label: 'Usuarios', icon: Users },
  { href: '/admin/logs', label: 'Logs', icon: FileText },
] as const;

/** Equipo (gestionar roles): owner y admin */
const TEAM_ITEM = { href: '/admin/team', label: 'Equipo', icon: UserCog } as const;

/** Avisos del sitio: solo owner */
const ANNOUNCEMENTS_ITEM = { href: '/admin/announcements', label: 'Avisos', icon: Megaphone } as const;

const METRICS_ITEMS = [
  { href: '/admin/metrics', label: 'Métricas', icon: BarChart3 },
  { href: '/admin/health', label: 'Health', icon: Heart },
] as const;

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
  subtle?: boolean;
};

type NavSection = {
  title: string;
  items: NavItem[];
  visible: boolean;
};

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
    const isMantenimientoPath = pathname === '/admin/mantenimiento';
    const isTechnicalPath = pathname === '/admin/technical';
    if (pathname === '/admin/owner') {
      router.replace('/admin/operaciones');
    } else if (isDashboardPath && !hasAllowedRole) {
      router.replace('/');
    } else if (isOperacionesPath && (!canTeam || !canOwnerOpsPanel)) {
      router.replace(canMod ? '/admin/moderation' : canMet ? '/admin/metrics' : '/admin/health');
    } else if (isMantenimientoPath && !canTeam) {
      router.replace(canMod ? '/admin/moderation' : canMet ? '/admin/metrics' : '/admin/health');
    } else if (isVoteWeightsPath && (!canTeam || !canOwnerOpsPanel)) {
      router.replace(canUsersLogs ? '/admin/users' : canMod ? '/admin/moderation' : '/admin/metrics');
    } else if (isOwnerPanelPath && !canTeam) {
      router.replace(canUsersLogs ? '/admin/users' : canMod ? '/admin/moderation' : canMet ? '/admin/metrics' : '/admin/health');
    } else if (isAnalistaPath && !canMet && !canHea) {
      router.replace(canMod ? '/admin/moderation' : '/admin/users');
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
      router.replace(canOwnerOpsPanel ? '/admin/operaciones' : canMod ? '/admin/moderation' : canMet ? '/admin/metrics' : '/admin/health');
    }
  }, [
    pathname,
    authGateReady,
    hasAllowedRole,
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

  const moderationItems: NavItem[] = MODERATION_ONLY_ITEMS.map((item) => ({
    ...item,
    exact: item.href === '/admin/moderation',
  }));
  const administrationItems: NavItem[] = [
    ...USERS_LOGS_ITEMS,
    TEAM_ITEM,
    ANNOUNCEMENTS_ITEM,
  ].filter((item) => {
    if (item.href === TEAM_ITEM.href) return canTeam;
    if (item.href === ANNOUNCEMENTS_ITEM.href) return canAnnouncements;
    return canUsersLogs;
  });
  const operationsItems: NavItem[] = [
    { href: '/admin/operaciones', label: 'Centro de operaciones', icon: LayoutDashboard },
    { href: '/admin/operaciones/trabajo', label: 'Trabajo', icon: Briefcase },
    { href: '/admin/vote-weights', label: 'Peso de voto', icon: Scale },
    { href: '/admin/mantenimiento', label: 'Mantenimiento', icon: NotebookPen },
  ];
  const analysisItems: NavItem[] = [
    { href: '/admin/analista', label: 'Panel', icon: LayoutDashboard },
    ...METRICS_ITEMS,
  ].filter((item) => {
    if (item.href === '/admin/metrics') return canMet;
    if (item.href === '/admin/health') return canHea;
    return canMet || canHea;
  });
  const technicalItems: NavItem[] = [{ href: '/admin/technical', label: 'Datos técnicos', icon: Wrench }];

  const navSections: NavSection[] = [
    {
      title: 'General',
      visible: hasAllowedRole,
      items: [{ href: '/admin/dashboard', label: 'Panel', icon: LayoutDashboard, exact: true }],
    },
    {
      title: 'Moderación',
      visible: canMod,
      items: moderationItems,
    },
    {
      title: 'Administración',
      visible: administrationItems.length > 0,
      items: administrationItems,
    },
    {
      title: 'Operaciones',
      visible: canOwnerOpsPanel,
      items: operationsItems,
    },
    {
      title: 'Análisis',
      visible: analysisItems.length > 0,
      items: analysisItems,
    },
    {
      title: 'Técnico',
      visible: canTechnical,
      items: technicalItems,
    },
    {
      title: 'Recursos',
      visible: canTeam,
      items: [{ href: '/contexto', label: 'Contexto', icon: Map, exact: true, subtle: true }],
    },
  ];

  const getActive = (item: NavItem) => {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  const mobileTitle = pathname === '/admin/dashboard'
    ? 'Panel'
    : pathname === '/admin/technical'
      ? 'Técnico'
      : pathname.startsWith('/admin/operaciones') || pathname === '/admin/mantenimiento' || pathname === '/admin/vote-weights'
        ? 'Operaciones'
        : pathname.startsWith('/admin/metrics') || pathname === '/admin/health' || pathname === '/admin/analista'
          ? 'Análisis'
          : pathname === '/admin/users' || pathname === '/admin/logs' || pathname === '/admin/team' || pathname === '/admin/announcements'
            ? 'Administración'
            : 'Moderación';

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
          <Link
            href="/admin/dashboard"
            className="font-semibold tracking-tight text-gray-900 dark:text-gray-100"
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
        <nav className="p-3 space-y-5">
          {navSections.filter((section) => section.visible).map((section) => (
            <div key={section.title}>
              <p className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-[0.18em]">
                {section.title}
              </p>
              <div className="mt-1 space-y-1">
                {section.items.map((item) => {
                  const isActive = getActive(item);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`
                        flex items-center gap-3 px-3.5 py-3 rounded-2xl text-sm font-medium tracking-tight transition-all
                        ${
                          isActive
                            ? 'bg-violet-100/90 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 shadow-[0_4px_20px_rgba(0,0,0,0.03)]'
                            : item.subtle
                              ? 'text-gray-600 dark:text-gray-400 hover:bg-gray-100/80 dark:hover:bg-gray-900'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100/80 dark:hover:bg-gray-900'
                        }
                      `}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
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
          <span className="font-medium text-gray-800 dark:text-gray-200">
            {mobileTitle}
          </span>
        </div>
        <div className="p-4 lg:p-6 max-w-7xl mx-auto w-full">{children}</div>
      </main>
    </div>
  );
}
