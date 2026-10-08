import type { ComponentType } from 'react';
import {
  Activity,
  BadgeCheck,
  BarChart3,
  Bot,
  BowArrow,
  Calculator,
  CircleDollarSign,
  Cog,
  FlaskConical,
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
  Tags,
  Ticket,
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

export type OwnerNavSection = {
  id: string;
  title: string;
  /** La pregunta que responde la sección. */
  question: string;
  audience: 'CEO' | 'OPERAR' | 'CRECER' | 'DINERO' | 'SISTEMA' | 'ADMINISTRACION' | 'HERRAMIENTAS';
  items: OwnerNavItem[];
  /** Compatibilidad con lectores que aún miran el cajón plegado. Vacío: todo vive en items. */
  more?: OwnerNavItem[];
};

/**
 * CEO OS. Una sola configuración de navegación para el owner.
 * Una sección abierta a la vez. Las herramientas puntuales no compiten con operar.
 */
export const OWNER_NAV_SECTIONS: OwnerNavSection[] = [
  {
    id: 'ceo',
    title: 'CEO',
    question: '¿Cómo está Aventa hoy?',
    audience: 'CEO',
    items: [{ href: '/admin/owner', label: 'Dashboard', icon: LayoutDashboard, exact: true }],
  },
  {
    id: 'operar',
    title: 'OPERAR',
    question: '¿Qué hay que operar ahora?',
    audience: 'OPERAR',
    items: [
      { href: '/admin/moderation', label: 'Moderación', icon: Shield },
      { href: '/admin/supply', label: 'Supply', icon: BowArrow },
      { href: '/admin/users', label: 'Usuarios', icon: Users },
      { href: '/admin/distribution', label: 'Distribución', icon: Share2 },
    ],
  },
  {
    id: 'crecer',
    title: 'CRECER',
    question: '¿Está creciendo la oferta humana?',
    audience: 'CRECER',
    items: [
      { href: '/admin/owner/crecimiento', label: 'Growth', icon: Rocket, exact: true },
      { href: '/admin/owner/crecimiento/cazadores', label: 'Cazadores', icon: UsersRound },
      { href: '/admin/metrics', label: 'Analytics', icon: BarChart3 },
      { href: '/admin/owner/experimentos', label: 'Experimentos', icon: FlaskConical },
    ],
  },
  {
    id: 'dinero',
    title: 'DINERO',
    question: '¿En qué estado está el dinero?',
    audience: 'DINERO',
    items: [
      { href: '/admin/owner/economia', label: 'Economía', icon: CircleDollarSign },
      { href: '/admin/commissions', label: 'Comisiones', icon: CircleDollarSign },
      { href: '/admin/rewards', label: 'Rewards', icon: Gift },
      { href: '/equipo/contabilidad', label: 'Contabilidad', icon: Calculator },
      { href: '/admin/owner/payouts', label: 'Payouts', icon: Wallet },
    ],
  },
  {
    id: 'sistema',
    title: 'SISTEMA',
    question: '¿Cómo está armado el sistema?',
    audience: 'SISTEMA',
    items: [
      { href: '/admin/sistemas/mapa', label: 'Systems Map', icon: Map },
      { href: '/admin/health', label: 'Health', icon: Heart },
      { href: '/admin/infraestructura', label: 'Infrastructure', icon: Server },
      { href: '/admin/technical', label: 'Technical', icon: Network },
      { href: '/admin/machine-clients', label: 'MCP', icon: Bot },
    ],
  },
  {
    id: 'administracion',
    title: 'ADMINISTRACIÓN',
    question: '¿Quién puede hacer qué?',
    audience: 'ADMINISTRACION',
    items: [
      { href: '/admin/owner/team-management', label: 'Equipos', icon: UsersRound },
      { href: '/admin/team', label: 'Roles y permisos', icon: UserCog },
    ],
  },
  {
    id: 'herramientas',
    title: 'HERRAMIENTAS',
    question: '¿Qué herramienta puntual necesitas?',
    audience: 'HERRAMIENTAS',
    items: [
      { href: '/admin/coupons', label: 'Cupones', icon: Ticket },
      { href: '/admin/announcements', label: 'Avisos', icon: Megaphone },
      { href: '/admin/creator-tags', label: 'Creator Tags', icon: Tags },
      { href: '/admin/owner/cazadores', label: 'Trusted Hunters', icon: BadgeCheck },
      { href: '/admin/vote-weights', label: 'Vote Weights', icon: Scale },
      { href: '/admin/hunters-ai', label: 'Hunters IA', icon: Bot },
      { href: '/admin/hunter', label: 'Motor de oferta', icon: Zap },
      { href: '/admin/logs', label: 'Activity', icon: Activity },
      { href: '/admin/operaciones', label: 'Operaciones', icon: Cog, exact: true },
      { href: '/admin/operaciones/trabajo', label: 'Bot y trabajo', icon: Wrench },
      { href: '/admin/mantenimiento', label: 'Mantenimiento', icon: Wrench },
      { href: '/equipo', label: 'Team Hub', icon: Users, exact: true },
    ],
  },
];

/** Items para command palette (búsqueda global): todo lo navegable, una sola vez. */
export const OWNER_COMMAND_ITEMS: { href: string; label: string; group: string }[] = OWNER_NAV_SECTIONS.flatMap((s) =>
  [...s.items, ...(s.more ?? [])].map((i) => ({ href: i.href, label: i.label, group: s.title })),
);

export function ownerNavSectionForPath(pathname: string): string {
  for (const section of OWNER_NAV_SECTIONS) {
    const hit = section.items.some((item) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)));
    if (hit) return section.id;
  }
  return 'ceo';
}
