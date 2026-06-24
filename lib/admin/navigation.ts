import type { ComponentType } from 'react';
import {
  BarChart3,
  Briefcase,
  CheckCircle,
  CircleDollarSign,
  ClipboardList,
  Database,
  FileText,
  Flag,
  Heart,
  LayoutDashboard,
  Map as MapIcon,
  Megaphone,
  MessageCircle,
  NotebookPen,
  Rocket,
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

/** CEO OS — dominios del sidebar */
export type NavDomain =
  | 'negocio'
  | 'crecimiento'
  | 'contenido'
  | 'monetizacion'
  | 'operacion'
  | 'personas'
  | 'hangar';

export type NavFrequency = 'diario' | 'semanal' | 'mensual' | 'excepcional';

export type NavAudience = 'founder' | 'moderador' | 'admin' | 'analista' | 'tecnico';

/** primary = home · moderation = acceso rápido · daily = legacy (owner usa submenús) · submenu = acordeón */
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
  crecimiento: { title: 'Crecimiento', subtitle: '¿Aventa está creciendo?' },
  contenido: { title: 'Contenido', subtitle: '¿La comunidad está viva?' },
  monetizacion: { title: 'Monetización', subtitle: '¿Estamos ganando dinero?' },
  operacion: { title: 'Operación', subtitle: '¿Hay algo roto?' },
  personas: { title: 'Personas', subtitle: '¿Quién usa y administra Aventa?' },
  hangar: { title: 'Hangar técnico', subtitle: 'Herramientas avanzadas' },
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
    href: '/admin/owner/crecimiento',
    label: 'Crecimiento AVENTA',
    domain: 'crecimiento',
    frequency: 'semanal',
    audiences: ['founder'],
    visibility: 'submenu',
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
    href: '/admin/moderation',
    label: 'Moderación',
    domain: 'contenido',
    frequency: 'diario',
    audiences: ['founder', 'moderador', 'admin'],
    visibility: 'moderation',
  },
  {
    href: '/admin/moderation/reports',
    label: 'Reportes',
    domain: 'contenido',
    frequency: 'diario',
    audiences: ['founder', 'moderador', 'admin'],
    visibility: 'submenu',
  },
  {
    href: '/admin/moderation/approved',
    label: 'Aprobadas',
    domain: 'contenido',
    frequency: 'excepcional',
    audiences: ['founder', 'moderador', 'admin'],
    visibility: 'submenu',
  },
  {
    href: '/admin/moderation/rejected',
    label: 'Rechazadas',
    domain: 'contenido',
    frequency: 'excepcional',
    audiences: ['founder', 'moderador', 'admin'],
    visibility: 'submenu',
  },
  {
    href: '/admin/moderation/comments',
    label: 'Comentarios',
    domain: 'contenido',
    frequency: 'semanal',
    audiences: ['founder', 'moderador', 'admin'],
    visibility: 'submenu',
  },
  {
    href: '/admin/announcements',
    label: 'Avisos al sitio',
    domain: 'contenido',
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
    visibility: 'submenu',
  },
  {
    href: '/admin/operaciones/trabajo',
    label: 'Bot y trabajo',
    domain: 'monetizacion',
    frequency: 'semanal',
    audiences: ['founder'],
    visibility: 'submenu',
  },
  {
    href: '/admin/operaciones',
    label: 'Centro de operaciones',
    domain: 'operacion',
    frequency: 'mensual',
    audiences: ['founder'],
    visibility: 'submenu',
  },
  {
    href: '/admin/health',
    label: 'Salud del sistema',
    domain: 'operacion',
    frequency: 'mensual',
    audiences: ['founder', 'admin', 'analista', 'tecnico'],
    visibility: 'submenu',
  },
  {
    href: '/admin/technical',
    label: 'Datos técnicos',
    domain: 'operacion',
    frequency: 'excepcional',
    audiences: ['founder', 'tecnico'],
    visibility: 'submenu',
  },
  {
    href: '/admin/users',
    label: 'Usuarios',
    domain: 'personas',
    frequency: 'mensual',
    audiences: ['founder', 'admin'],
    visibility: 'submenu',
  },
  {
    href: '/admin/team',
    label: 'Equipo y roles',
    domain: 'personas',
    frequency: 'mensual',
    audiences: ['founder', 'admin'],
    visibility: 'submenu',
  },
  {
    href: '/admin/moderation/bans',
    label: 'Baneos',
    domain: 'personas',
    frequency: 'excepcional',
    audiences: ['founder', 'moderador', 'admin'],
    visibility: 'submenu',
  },
  {
    href: '/admin/sistemas/mapa',
    label: 'Mapa de sistemas AVENTA',
    domain: 'hangar',
    frequency: 'mensual',
    audiences: ['founder'],
    visibility: 'submenu',
  },
  {
    href: '/admin/infraestructura',
    label: 'Infraestructura AVENTA',
    domain: 'hangar',
    frequency: 'mensual',
    audiences: ['founder'],
    visibility: 'submenu',
  },
  {
    href: '/admin/contexto',
    label: 'Contexto del sistema',
    domain: 'hangar',
    frequency: 'excepcional',
    audiences: ['founder'],
    visibility: 'submenu',
    subtle: true,
  },
  {
    href: '/admin/mantenimiento',
    label: 'Mantenimiento',
    domain: 'hangar',
    frequency: 'excepcional',
    audiences: ['founder', 'tecnico'],
    visibility: 'submenu',
  },
  {
    href: '/admin/logs',
    label: 'Logs de moderación',
    domain: 'hangar',
    frequency: 'excepcional',
    audiences: ['founder', 'admin', 'tecnico'],
    visibility: 'submenu',
  },
  {
    href: '/admin/vote-weights',
    label: 'Peso de voto',
    domain: 'hangar',
    frequency: 'excepcional',
    audiences: ['founder', 'tecnico'],
    visibility: 'submenu',
  },
  {
    href: '/admin/dashboard',
    label: 'Panel clásico',
    domain: 'hangar',
    frequency: 'excepcional',
    audiences: ['founder', 'admin', 'moderador'],
    visibility: 'submenu',
    subtle: true,
  },
];

const ICON_BY_HREF: Record<string, ComponentType<{ className?: string }>> = {
  '/admin/owner': LayoutDashboard,
  '/admin/owner/crecimiento': Rocket,
  '/admin/dashboard': LayoutDashboard,
  '/admin/metrics': BarChart3,
  '/admin/operaciones': LayoutDashboard,
  '/admin/commissions': CircleDollarSign,
  '/admin/moderation': ClipboardList,
  '/admin/moderation/reports': Flag,
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
  '/admin/sistemas/mapa': MapIcon,
  '/admin/infraestructura': Database,
  '/admin/health': Heart,
  '/admin/technical': Wrench,
  '/admin/logs': FileText,
  '/admin/mantenimiento': NotebookPen,
  '/admin/contexto': MapIcon,
};

const OWNER_SECTION_ORDER: Exclude<NavDomain, 'negocio'>[] = [
  'crecimiento',
  'contenido',
  'monetizacion',
  'operacion',
  'personas',
  'hangar',
];

const STAFF_SECTION_ORDER: Record<Exclude<Role, 'owner'>, Exclude<NavDomain, 'negocio'>[]> = {
  moderator: ['contenido', 'personas'],
  analyst: ['crecimiento', 'operacion'],
  admin: ['contenido', 'personas', 'crecimiento', 'operacion', 'hangar'],
};

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
    case '/admin/owner/crecimiento':
      return role === 'owner';
    case '/admin/dashboard':
      return role !== 'owner';
    case '/admin/operaciones':
    case '/admin/commissions':
    case '/admin/operaciones/trabajo':
    case '/admin/vote-weights':
    case '/admin/mantenimiento':
    case '/admin/sistemas/mapa':
    case '/admin/infraestructura':
    case '/admin/contexto':
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
  /** Reservado (owner usa submenús por sistema) */
  dailyLinks: AdminNavItem[];
  sections: AdminNavSection[];
};

function buildOwnerNavigation(accessible: AdminNavItem[]): AdminNavigationModel {
  const home = accessible.find((s) => s.href === '/admin/owner') ?? null;
  const homeHref = home?.href;

  const moderationMain = accessible.filter((s) => s.visibility === 'moderation');
  const dailyLinks: AdminNavItem[] = [];

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

function buildStaffNavigation(role: Exclude<Role, 'owner'>, accessible: AdminNavItem[]): AdminNavigationModel {
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

  const order = STAFF_SECTION_ORDER[role];

  const sections = order
    .map((domainId): AdminNavSection | null => {
      const items = byDomain.get(domainId) ?? [];
      if (items.length === 0) return null;
      const meta = SECTION_META[domainId];
      return {
        id: domainId,
        title: meta.title,
        subtitle: meta.subtitle,
        defaultOpen: role === 'moderator' && domainId === 'contenido',
        items,
      };
    })
    .filter((s): s is AdminNavSection => s !== null);

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

/** Título móvil del sistema CEO OS según ruta */
export function getAdminMobileSectionTitle(pathname: string): string {
  if (pathname === '/admin/owner') return 'Owner Dashboard';
  if (pathname === '/admin/owner/crecimiento') return 'Crecimiento AVENTA';
  if (pathname === '/admin/metrics') return 'Crecimiento';
  if (pathname === '/admin/moderation/bans') return 'Personas';
  if (
    pathname.startsWith('/admin/moderation') ||
    pathname.startsWith('/admin/reports') ||
    pathname === '/admin/announcements'
  ) {
    return 'Contenido';
  }
  if (pathname === '/admin/commissions' || pathname.startsWith('/admin/operaciones/trabajo')) {
    return 'Monetización';
  }
  if (
    pathname.startsWith('/admin/operaciones') ||
    pathname === '/admin/health' ||
    pathname === '/admin/technical'
  ) {
    return 'Operación';
  }
  if (pathname === '/admin/users' || pathname === '/admin/team') {
    return 'Personas';
  }
  if (
    pathname === '/admin/sistemas/mapa' ||
    pathname === '/admin/infraestructura' ||
    pathname === '/admin/contexto' ||
    pathname === '/admin/mantenimiento' ||
    pathname === '/admin/logs' ||
    pathname === '/admin/vote-weights' ||
    pathname === '/admin/dashboard'
  ) {
    return 'Hangar técnico';
  }
  return 'Admin';
}
