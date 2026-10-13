import type { ComponentType } from 'react';
import {
  Activity,
  BadgeCheck,
  BarChart3,
  Bot,
  CalendarDays,
  Calculator,
  CircleDollarSign,
  Cog,
  Database,
  Gift,
  Heart,
  LayoutDashboard,
  Map,
  Megaphone,
  Network,
  Rocket,
  Scale,
  Server,
  Share2,
  Shield,
  SlidersHorizontal,
  Tag,
  Tags,
  Target,
  Ticket,
  TrendingUp,
  UserCog,
  Users,
  UsersRound,
  Wallet,
  Wrench,
  Zap,
} from 'lucide-react';

export type OwnerNavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
};

export type OwnerNavAudience = 'VER' | 'HACER' | 'TECNICO';

export type OwnerNavSection = {
  id: string;
  title: string;
  /** La pregunta que responde la sección. */
  question: string;
  /** VER = leer cómo está Aventa. HACER = herramientas que cambian algo. TECNICO = diagnóstico, plegado. */
  audience: OwnerNavAudience;
  items: OwnerNavItem[];
  /** Compatibilidad con lectores que aún miran el cajón plegado. Vacío: todo vive en items. */
  more?: OwnerNavItem[];
};

/**
 * CEO OS. Una sola configuración de navegación para el owner.
 * VER siempre abierta; de HACER y TÉCNICO solo una abierta a la vez.
 */
export const OWNER_NAV_SECTIONS: OwnerNavSection[] = [
  {
    id: 'ver',
    title: 'CEO DASHBOARD',
    question: '¿Cómo está Aventa hoy?',
    audience: 'VER',
    items: [
      { href: '/admin/owner', label: 'Vista general', icon: LayoutDashboard, exact: true },
      { href: '/admin/owner/vista/prioridades', label: 'Prioridades del CEO', icon: Zap },
      { href: '/admin/owner/vista/metas', label: 'Metas del día', icon: Target },
      { href: '/admin/owner/vista/ingresos', label: 'Ingresos estimados', icon: CircleDollarSign },
      { href: '/admin/owner/vista/pagos', label: 'Pagos pendientes', icon: Wallet },
      { href: '/admin/owner/vista/crecimiento', label: 'Crecimiento', icon: TrendingUp },
      { href: '/admin/owner/vista/ofertas', label: 'Ofertas publicadas', icon: Tag },
      { href: '/admin/owner/vista/comunidad', label: 'Actividad de la comunidad', icon: UsersRound },
      { href: '/admin/owner/vista/usuarios', label: 'Usuarios en tiempo real', icon: Users },
      { href: '/admin/owner/vista/equipos', label: 'Equipos', icon: Shield },
      { href: '/admin/owner/vista/capacidad', label: 'Capacidad de Aventa', icon: Server },
      { href: '/admin/owner/vista/temporada', label: 'Siguiente temporada', icon: CalendarDays },
    ],
  },
  {
    id: 'ofertas',
    title: 'OFERTAS',
    question: '¿Qué ofertas hay que decidir?',
    audience: 'HACER',
    items: [
      { href: '/admin/moderation', label: 'Moderación', icon: Shield },
      { href: '/admin/hunters-ai', label: 'Hunters IA', icon: Bot },
      { href: '/admin/owner/cazadores', label: 'Trusted Hunters', icon: BadgeCheck },
      { href: '/admin/distribution', label: 'Distribución', icon: Share2 },
      { href: '/admin/coupons', label: 'Cupones', icon: Ticket },
      { href: '/admin/announcements', label: 'Avisos', icon: Megaphone },
    ],
  },
  {
    id: 'dinero',
    title: 'DINERO',
    question: '¿Qué dinero hay que registrar o mover?',
    audience: 'HACER',
    items: [
      { href: '/admin/commissions', label: 'Comisiones', icon: CircleDollarSign },
      { href: '/admin/rewards', label: 'Rewards', icon: Gift },
      { href: '/equipo/contabilidad', label: 'Contabilidad', icon: Calculator },
      { href: '/admin/creator-tags', label: 'Creator Tags', icon: Tags },
    ],
  },
  {
    id: 'administracion',
    title: 'ADMINISTRACIÓN',
    question: '¿Quién puede hacer qué?',
    audience: 'HACER',
    items: [
      { href: '/admin/users', label: 'Usuarios', icon: Users },
      { href: '/admin/owner/team-management', label: 'Gestión de equipos', icon: UsersRound },
      { href: '/admin/team', label: 'Roles y permisos', icon: UserCog },
      { href: '/admin/vote-weights', label: 'Vote Weights', icon: Scale },
      { href: '/admin/machine-clients', label: 'MCP', icon: Bot },
      { href: '/admin/owner/control', label: 'Centro de control', icon: SlidersHorizontal },
      { href: '/equipo', label: 'Team Hub', icon: Users, exact: true },
    ],
  },
  {
    id: 'tecnico',
    title: 'TÉCNICO',
    question: '¿Qué dice el diagnóstico detallado?',
    audience: 'TECNICO',
    items: [
      { href: '/admin/hunter', label: 'Motor de oferta', icon: Zap },
      { href: '/admin/health', label: 'Health', icon: Heart },
      { href: '/admin/infraestructura', label: 'Infrastructure', icon: Server },
      { href: '/admin/owner/crecimiento', label: 'Costos y hoja de ruta', icon: Rocket },
      { href: '/admin/metrics', label: 'Analytics', icon: BarChart3 },
      { href: '/admin/technical', label: 'Technical', icon: Network },
      { href: '/admin/sistemas/mapa', label: 'Systems Map', icon: Map },
      { href: '/admin/sistemas/atlas', label: 'Database Atlas', icon: Database },
      { href: '/admin/logs', label: 'Activity', icon: Activity },
      { href: '/admin/operaciones', label: 'Operaciones', icon: Cog, exact: true },
      { href: '/admin/operaciones/trabajo', label: 'Bot y trabajo', icon: Wrench },
      { href: '/admin/mantenimiento', label: 'Mantenimiento', icon: Wrench },
    ],
  },
];

/** Items para command palette (búsqueda global): todo lo navegable, una sola vez. */
export const OWNER_COMMAND_ITEMS: { href: string; label: string; group: string }[] = OWNER_NAV_SECTIONS.flatMap((s) =>
  [...s.items, ...(s.more ?? [])].map((i) => ({ href: i.href, label: i.label, group: s.title })),
);

export function isOwnerNavItemActive(item: OwnerNavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function ownerNavSectionForPath(pathname: string): string {
  for (const section of OWNER_NAV_SECTIONS) {
    if (section.items.some((item) => isOwnerNavItemActive(item, pathname))) return section.id;
  }
  return 'ver';
}

/** Sección e item activos, para el rastro de migas de las herramientas. */
export function ownerNavLocation(pathname: string): { section: OwnerNavSection; item: OwnerNavItem } | null {
  let best: { section: OwnerNavSection; item: OwnerNavItem } | null = null;
  for (const section of OWNER_NAV_SECTIONS) {
    for (const item of section.items) {
      if (!isOwnerNavItemActive(item, pathname)) continue;
      if (!best || item.href.length > best.item.href.length) best = { section, item };
    }
  }
  return best;
}
