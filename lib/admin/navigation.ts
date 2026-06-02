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

/** Las 5 áreas del centro de mando. */
export type NavDomain = 'negocio' | 'comunidad' | 'usuarios' | 'operaciones' | 'sistema';

export type NavFrequency = 'diario' | 'semanal' | 'mensual' | 'excepcional';

export type NavAudience = 'founder' | 'moderador' | 'admin' | 'analista' | 'tecnico';

export type NavVisibility = 'primary' | 'pinned' | 'submenu';

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

export type AdminNavDomainSection = {
  id: NavDomain;
  title: string;
  subtitle: string;
  defaultOpen: boolean;
  items: AdminNavItem[];
};

export const DOMAIN_META: Record<
  NavDomain,
  { title: string; subtitle: string }
> = {
  negocio: { title: 'Negocio', subtitle: 'Ingresos, crecimiento y decisiones' },
  comunidad: { title: 'Comunidad', subtitle: 'Ofertas, calidad y convivencia' },
  usuarios: { title: 'Usuarios', subtitle: 'Cuentas, equipo y reputación' },
  operaciones: { title: 'Operaciones', subtitle: 'Abastecimiento y ejecución' },
  sistema: { title: 'Sistema', subtitle: 'Salud, técnico y mantenimiento' },
};

/**
 * Inventario de pantallas admin (documentación + filtrado por rol).
 * Ninguna ruta se elimina; solo define categoría y visibilidad ideal.
 */
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
    domain: 'negocio',
    frequency: 'excepcional',
    audiences: ['founder', 'admin', 'moderador'],
    visibility: 'submenu',
  },
  {
    href: '/admin/metrics',
    label: 'Métricas',
    domain: 'negocio',
    frequency: 'semanal',
    audiences: ['founder', 'admin', 'analista'],
    visibility: 'pinned',
  },
  {
    href: '/admin/operaciones',
    label: 'Centro de operaciones',
    domain: 'negocio',
    frequency: 'mensual',
    audiences: ['founder'],
    visibility: 'submenu',
  },
  {
    href: '/admin/commissions',
    label: 'Comisiones y ledger',
    domain: 'negocio',
    frequency: 'mensual',
    audiences: ['founder'],
    visibility: 'submenu',
  },
  {
    href: '/admin/moderation',
    label: 'Cola pendientes',
    domain: 'comunidad',
    frequency: 'diario',
    audiences: ['founder', 'moderador', 'admin'],
    visibility: 'pinned',
  },
  {
    href: '/admin/reports',
    label: 'Reportes',
    domain: 'comunidad',
    frequency: 'diario',
    audiences: ['founder', 'moderador', 'admin'],
    visibility: 'pinned',
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
    visibility: 'submenu',
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
    domain: 'usuarios',
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
    visibility: 'pinned',
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

const DOMAIN_ORDER: NavDomain[] = ['negocio', 'comunidad', 'usuarios', 'operaciones', 'sistema'];

export type AdminNavigationModel = {
  home: AdminNavItem | null;
  pinned: AdminNavItem[];
  domains: AdminNavDomainSection[];
};

export function buildAdminNavigation(role: Role | null): AdminNavigationModel {
  if (!role) return { home: null, pinned: [], domains: [] };

  const accessible = ADMIN_SCREEN_REGISTRY.filter((s) => canRoleAccessScreen(role, s)).map(toNavItem);

  const homeScreen =
    role === 'owner'
      ? accessible.find((s) => s.href === '/admin/owner') ?? null
      : role === 'moderator'
        ? accessible.find((s) => s.href === '/admin/moderation') ?? accessible.find((s) => s.href === '/admin/dashboard') ?? null
        : role === 'analyst'
          ? accessible.find((s) => s.href === '/admin/metrics') ?? null
          : accessible.find((s) => s.href === '/admin/dashboard') ?? null;

  const homeHref = homeScreen?.href;
  const pinned = accessible.filter(
    (s) => s.visibility === 'pinned' && s.href !== homeHref
  );

  const domains: AdminNavDomainSection[] = DOMAIN_ORDER.map((domainId) => {
    const meta = DOMAIN_META[domainId];
    const items = accessible.filter(
      (s) =>
        s.domain === domainId &&
        s.href !== homeHref &&
        s.visibility !== 'pinned'
    );
    const defaultOpen =
      role === 'moderator'
        ? domainId === 'comunidad'
        : role === 'analyst'
          ? domainId === 'negocio' || domainId === 'sistema'
          : role === 'admin'
            ? domainId === 'comunidad'
            : false;

    return {
      id: domainId,
      title: meta.title,
      subtitle: meta.subtitle,
      defaultOpen,
      items,
    };
  }).filter((d) => d.items.length > 0);

  return {
    home: homeScreen,
    pinned,
    domains,
  };
}

export function getDefaultAdminHome(role: Role | null): string {
  if (role === 'owner') return '/admin/owner';
  if (role === 'moderator') return '/admin/moderation';
  if (role === 'analyst') return '/admin/metrics';
  return '/admin/dashboard';
}
