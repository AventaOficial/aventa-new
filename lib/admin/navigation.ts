import type { ComponentType } from 'react';
import {
  BarChart3,
  Briefcase,
  CheckCircle,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Flag,
  Heart,
  LayoutDashboard,
  Map as MapIcon,
  Megaphone,
  MessageCircle,
  NotebookPen,
  Scale,
  ShieldOff,
  UserCog,
  Users,
  Wrench,
  XCircle,
} from 'lucide-react';
import type { Role } from '@/lib/admin/roles';
import {
  canAccessHealth,
  canAccessMetrics,
  canAccessModeration,
  canAccessOwnerOperationsPanel,
  canAccessUsersLogs,
  canManageAnnouncements,
  canManageTeam,
} from '@/lib/admin/roles';

/** Áreas del sidebar Founder First */
export type NavDomain =
  | 'negocio'
  | 'comunidad'
  | 'crecimiento'
  | 'monetizacion'
  | 'operaciones'
  | 'sistema'
  | 'usuarios';

export type NavFrequency = 'diario' | 'semanal' | 'mensual' | 'excepcional';

export type NavAudience = 'founder' | 'moderador' | 'admin' | 'analista' | 'tecnico';

/** primary = home · moderation = sección visible · daily = enlace diario owner · submenu = acordeón */
export type NavVisibility = 'primary' | 'moderation' | 'daily' | 'submenu';

export type AdminNavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
  subtle?: boolean;
  domain: NavDomain;
  frequency: NavFrequency;
  audiences: NavAudience[];
  visibility: NavVisibility;
};

export type AdminNavSection = {
  id: NavDomain;
  title: string;
  subtitle: string;
  defaultOpen: boolean;
  items: AdminNavItem[];
};

export const SECTION_META: Record<
  Exclude<NavDomain, 'negocio'>,
  { title: string; subtitle: string }
> = {
  comunidad: { title: 'Comunidad', subtitle: 'Más herramientas de contenido' },
  crecimiento: { title: 'Crecimiento', subtitle: 'Métricas y producto' },
  monetizacion: { title: 'Monetización', subtitle: 'Ingresos y afiliación' },
  operaciones: { title: 'Operaciones', subtitle: 'Centro de control y bot' },
  sistema: { title: 'Sistema', subtitle: 'Técnico y mantenimiento' },
  usuarios: { title: 'Usuarios', subtitle: 'Equipo y permisos' },
};

export const ADMIN_SCREEN_REGISTRY: Omit<AdminNavItem, 'icon'>[] = [
  {
    href: '/admin/owner',
    label: 'Owner Dashboard',
    domain: 'negocio',
    frequency: 'diario',
    audiences: ['founder'],
    visibility: 'primary',
  },
  {
    href: '/admin/dashboard',
    label: 'Panel clásico',
    domain: 'sistema',
    frequency: 'excepcional',
    audiences: ['founder', 'admin', 'moderador'],
    visibility: 'submenu',
    subtle: true,
  },
  {
    href: '/admin/metrics',
    label: 'Métricas',
    domain: 'crecimiento',
    frequency: 'semanal',
    audiences: ['founder', 'admin', 'analista'],
    visibility: 'submenu',
  },
  {
    href: '/admin/operaciones',
    label: 'Centro de operaciones',
    domain: 'operaciones',
    frequency: 'mensual',
    audiences: ['founder'],
    visibility: 'submenu',
  },
  {
    href: '/admin/commissions',
    label: 'Comisiones y ledger',
    domain: 'monetizacion',
    frequency: 'mensual',
    audiences: ['founder'],
    visibility: 'daily',
  },
  {
    href: '/admin/moderation',
    label: 'Cola pendientes',
    domain: 'comunidad',
    frequency: 'diario',
    audiences: ['founder', 'moderador', 'admin'],
    visibility: 'moderation',
  },
  {
    href: '/admin/reports',
    label: 'Reportes',
    domain: 'comunidad',
    frequency: 'diario',
    audiences: ['founder', 'moderador', 'admin'],
    visibility: 'moderation',
  },
  {
    href: '/admin/moderation/comments',
    label: 'Comentarios',
    domain: 'comunidad',
    frequency: 'semanal',
    audiences: ['founder', 'moderador', 'admin'],
    visibility: 'submenu',
  },
  {
    href: '/admin/moderation/approved',
    label: 'Aprobadas',
    domain: 'comunidad',
    frequency: 'excepcional',
    audiences: ['founder', 'moderador', 'admin'],
    visibility: 'submenu',
  },
  {
    href: '/admin/moderation/rejected',
    label: 'Rechazadas',
    domain: 'comunidad',
    frequency: 'excepcional',
    audiences: ['founder', 'moderador', 'admin'],
    visibility: 'submenu',
  },
  {
    href: '/admin/moderation/bans',
    label: 'Baneos',
    domain: 'comunidad',
    frequency: 'excepcional',
    audiences: ['founder', 'moderador', 'admin'],
    visibility: 'submenu',
  },
  {
    href: '/admin/announcements',
    label: 'Avisos al sitio',
    domain: 'comunidad',
    frequency: 'mensual',
    audiences: ['founder'],
    visibility: 'submenu',
  },
  {
    href: '/admin/users',
    label: 'Usuarios',
    domain: 'usuarios',
    frequency: 'mensual',
    audiences: ['founder', 'admin'],
    visibility: 'daily',
  },
  {
    href: '/admin/team',
    label: 'Equipo y roles',
    domain: 'usuarios',
    frequency: 'mensual',
    audiences: ['founder', 'admin'],
    visibility: 'submenu',
  },
  {
    href: '/admin/vote-weights',
    label: 'Peso de voto',
    domain: 'sistema',
    frequency: 'excepcional',
    audiences: ['founder', 'tecnico'],
    visibility: 'submenu',
  },
  {
    href: '/admin/operaciones/trabajo',
    label: 'Bot y trabajo',
    domain: 'operaciones',
    frequency: 'semanal',
    audiences: ['founder'],
    visibility: 'submenu',
  },
  {
    href: '/admin/health',
    label: 'Salud del sistema',
    domain: 'sistema',
    frequency: 'mensual',
    audiences: ['founder', 'admin', 'analista', 'tecnico'],
    visibility: 'submenu',
  },
  {
    href: '/admin/technical',
    label: 'Datos técnicos',
    domain: 'sistema',
    frequency: 'excepcional',
    audiences: ['founder', 'tecnico'],
    visibility: 'submenu',
  },
  {
    href: '/admin/logs',
    label: 'Logs de moderación',
    domain: 'sistema',
    frequency: 'excepcional',
    audiences: ['founder', 'admin', 'tecnico'],
    visibility: 'submenu',
  },
  {
    href: '/admin/mantenimiento',
    label: 'Mantenimiento',
    domain: 'sistema',
    frequency: 'excepcional',
    audiences: ['founder', 'tecnico'],
    visibility: 'submenu',
  },
  {
    href: '/contexto',
    label: 'Contexto del sistema',
    domain: 'sistema',
    frequency: 'excepcional',
    audiences: ['founder', 'admin'],
    visibility: 'submenu',
    subtle: true,
  },
];

const ICON_BY_HREF: Record<string, ComponentType<{ className?: string }>> = {
  '/admin/owner': LayoutDashboard,
  '/admin/dashboard': LayoutDashboard,
  '/admin/metrics': BarChart3,
  '/admin/operaciones': LayoutDashboard,
  '/admin/commissions': CircleDollarSign,
  '/admin/moderation': ClipboardList,
  '/admin/reports': Flag,
  '/admin/moderation/comments': MessageCircle,
  '/admin/moderation/approved': CheckCircle,
  '/admin/moderation/rejected': XCircle,
  '/admin/moderation/bans': ShieldOff,
  '/admin/announcements': Megaphone,
  '/admin/users': Users,
  '/admin/team': UserCog,
  '/admin/vote-weights': Scale,
  '/admin/operaciones/trabajo': Briefcase,
  '/admin/health': Heart,
  '/admin/technical': Wrench,
  '/admin/logs': FileText,
  '/admin/mantenimiento': NotebookPen,
  '/contexto': MapIcon,
};

const OWNER_SECTION_ORDER: Exclude<NavDomain, 'negocio'>[] = [
  'comunidad',
  'crecimiento',
  'operaciones',
  'sistema',
  'usuarios',
];

function roleToAudiences(role: Role): NavAudience[] {
  switch (role) {
    case 'owner':
      return ['founder', 'tecnico'];
    case 'admin':
      return ['admin'];
    case 'moderator':
      return ['moderador'];
    case 'analyst':
      return ['analista'];
    default:
      return [];
  }
}

function canRoleAccessScreen(role: Role, screen: (typeof ADMIN_SCREEN_REGISTRY)[number]): boolean {
  const audiences = roleToAudiences(role);
  if (!screen.audiences.some((a) => audiences.includes(a))) return false;

  switch (screen.href) {
    case '/admin/owner':
      return role === 'owner';
    case '/admin/dashboard':
      return role !== 'owner';
    case '/admin/operaciones':
    case '/admin/commissions':
    case '/admin/operaciones/trabajo':
    case '/admin/vote-weights':
    case '/admin/mantenimiento':
      return canAccessOwnerOperationsPanel(role);
    case '/admin/technical':
      return role === 'owner';
    case '/admin/announcements':
      return canManageAnnouncements(role);
    case '/admin/users':
    case '/admin/logs':
      return canAccessUsersLogs(role);
    case '/admin/team':
      return canManageTeam(role);
    case '/contexto':
      return canManageTeam(role);
    case '/admin/metrics':
      return canAccessMetrics(role);
    case '/admin/health':
      return canAccessHealth(role);
    default:
      if (screen.href.startsWith('/admin/moderation') || screen.href === '/admin/reports') {
        return canAccessModeration(role);
      }
      return true;
  }
}

function toNavItem(screen: (typeof ADMIN_SCREEN_REGISTRY)[number]): AdminNavItem {
  return {
    ...screen,
    icon: ICON_BY_HREF[screen.href] ?? LayoutDashboard,
    exact: screen.href === '/admin/moderation' || screen.href === '/admin/owner',
  };
}

export type AdminNavigationModel = {
  home: AdminNavItem | null;
  /** Cola + reportes siempre visibles cuando hay permiso de moderación */
  moderationMain: AdminNavItem[];
  /** Enlaces diarios del fundador (usuarios, monetización) */
  dailyLinks: AdminNavItem[];
  sections: AdminNavSection[];
};

function buildOwnerNavigation(accessible: AdminNavItem[]): AdminNavigationModel {
  const home = accessible.find((s) => s.href === '/admin/owner') ?? null;
  const homeHref = home?.href;

  const moderationMain = accessible.filter((s) => s.visibility === 'moderation');
  const dailyLinks = accessible.filter((s) => s.visibility === 'daily');

  const sections: AdminNavSection[] = OWNER_SECTION_ORDER.map((domainId) => {
    const meta = SECTION_META[domainId];
    const items = accessible.filter(
      (s) => s.domain === domainId && s.visibility === 'submenu' && s.href !== homeHref
    );
    return {
      id: domainId,
      title: meta.title,
      subtitle: meta.subtitle,
      defaultOpen: false,
      items,
    };
  }).filter((s) => s.items.length > 0);

  return { home, moderationMain, dailyLinks, sections };
}

function buildStaffNavigation(role: Role, accessible: AdminNavItem[]): AdminNavigationModel {
  const home =
    role === 'moderator'
      ? accessible.find((s) => s.href === '/admin/moderation') ??
        accessible.find((s) => s.href === '/admin/dashboard') ??
        null
      : role === 'analyst'
        ? accessible.find((s) => s.href === '/admin/metrics') ?? null
        : accessible.find((s) => s.href === '/admin/dashboard') ?? null;

  const homeHref = home?.href;
  const moderationMain = accessible.filter(
    (s) => s.visibility === 'moderation' && s.href !== homeHref
  );
  const dailyLinks: AdminNavItem[] = [];

  const byDomain = new Map<NavDomain, AdminNavItem[]>();
  for (const item of accessible) {
    if (item.href === homeHref || item.visibility === 'moderation' || item.visibility === 'daily') continue;
    const list = byDomain.get(item.domain) ?? [];
    list.push(item);
    byDomain.set(item.domain, list);
  }

  const order: NavDomain[] =
    role === 'moderator'
      ? ['comunidad', 'sistema']
      : role === 'analyst'
        ? ['crecimiento', 'sistema']
        : ['comunidad', 'usuarios', 'crecimiento', 'sistema'];

  const sections: AdminNavSection[] = order
    .map((domainId) => {
      const items = byDomain.get(domainId) ?? [];
      if (items.length === 0) return null;
      const meta =
        domainId === 'negocio'
          ? { title: 'Negocio', subtitle: '' }
          : SECTION_META[domainId as Exclude<NavDomain, 'negocio'>];
      return {
        id: domainId,
        title: meta.title,
        subtitle: meta.subtitle,
        defaultOpen: role === 'moderator' && domainId === 'comunidad',
        items,
      };
    })
    .filter((s): s is AdminNavSection => s != null);

  return { home, moderationMain, dailyLinks, sections };
}

export function buildAdminNavigation(role: Role | null): AdminNavigationModel {
  if (!role) return { home: null, moderationMain: [], dailyLinks: [], sections: [] };

  const accessible = ADMIN_SCREEN_REGISTRY.filter((s) => canRoleAccessScreen(role, s)).map(toNavItem);

  if (role === 'owner') return buildOwnerNavigation(accessible);
  return buildStaffNavigation(role, accessible);
}

export function getDefaultAdminHome(role: Role | null): string {
  if (role === 'owner') return '/admin/owner';
  if (role === 'moderator') return '/admin/moderation';
  if (role === 'analyst') return '/admin/metrics';
  return '/admin/dashboard';
}

/** Clave de acordeón en layout (home + secciones) */
export type SidebarAccordionKey = NavDomain | 'moderation';

export function getInitialOpenSections(
  role: Role | null,
  nav: AdminNavigationModel
): Partial<Record<SidebarAccordionKey, boolean>> {
  const open: Partial<Record<SidebarAccordionKey, boolean>> = {};
  for (const s of nav.sections) {
    open[s.id] = s.defaultOpen;
  }
  return open;
}
