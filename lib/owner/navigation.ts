import type { ComponentType } from 'react';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  BowArrow,
  CalendarDays,
  Calculator,
  CircleDollarSign,
  Cog,
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
  Tag,
  Tags,
  Target,
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
  /** CEO | OPERATIONS | TECHNICAL */
  audience: 'CEO' | 'OPERATIONS' | 'TECHNICAL';
  /** Herramientas de uso frecuente: siempre visibles. */
  items: OwnerNavItem[];
  /** Herramientas especializadas: plegadas bajo «Más herramientas». */
  more?: OwnerNavItem[];
};

/**
 * Menú principal del owner: las secciones del CEO Dashboard.
 * Cada entrada abre la herramienta real que opera ese dato, nunca una composición de referencia.
 */
export const OWNER_VISTA_NAV: OwnerNavItem[] = [
  { href: '/admin/owner', label: 'Vista general', icon: LayoutDashboard, exact: true },
  { href: '/admin/commissions', label: 'Ingresos estimados', icon: CircleDollarSign },
  { href: '/admin/owner/crecimiento', label: 'Actividad de la comunidad', icon: UsersRound },
  { href: '/admin/metrics', label: 'Usuarios en tiempo real', icon: Users },
  { href: '/admin/moderation/approved', label: 'Ofertas publicadas', icon: Tag },
  { href: '/admin/owner/team-management', label: 'Equipo de moderación', icon: Shield },
  { href: '/admin/rewards', label: 'Pagos pendientes', icon: Wallet },
  { href: '/admin/infraestructura', label: 'Capacidad de Aventa', icon: Server },
  { href: '/admin/announcements', label: 'Siguiente temporada', icon: CalendarDays },
  { href: '/admin/moderation', label: 'Metas del día', icon: Target },
  { href: '/admin/operaciones', label: 'Prioridades del CEO', icon: Zap, exact: true },
];

/**
 * Founder OS: CEO decide, Operations ejecuta, Technical sostiene.
 * Nada se elimina: lo especializado queda plegado y sigue en el buscador.
 */
export const OWNER_NAV_SECTIONS: OwnerNavSection[] = [
  {
    id: 'ceo',
    title: 'CEO',
    question: '¿Qué debo decidir hoy?',
    audience: 'CEO',
    items: [
      { href: '/admin/owner', label: 'Control Center', icon: LayoutDashboard, exact: true },
      { href: '/admin/moderation', label: 'Moderation', icon: Shield },
      { href: '/admin/hunter', label: 'Supply', icon: BowArrow },
      { href: '/admin/commissions', label: 'Money', icon: CircleDollarSign },
      { href: '/admin/users', label: 'Users', icon: Users },
      { href: '/admin/health', label: 'Health', icon: Heart },
    ],
    more: [
      { href: '/admin/owner/cazadores', label: 'Cazadores de confianza', icon: BadgeCheck },
      { href: '/admin/coupons', label: 'Cupones', icon: Ticket },
      { href: '/equipo/contabilidad', label: 'Contabilidad', icon: Calculator },
    ],
  },
  {
    id: 'operations',
    title: 'Operations',
    question: '¿Cómo está funcionando Aventa hoy?',
    audience: 'OPERATIONS',
    items: [
      { href: '/admin/metrics', label: 'Live Metrics', icon: BarChart3 },
      { href: '/admin/owner/crecimiento', label: 'Growth', icon: Rocket },
      { href: '/admin/rewards', label: 'Rewards Ops', icon: Gift },
      { href: '/admin/operaciones', label: 'Operaciones', icon: AlertTriangle, exact: true },
      { href: '/admin/operaciones/trabajo', label: 'Bot y trabajo', icon: Zap },
      { href: '/admin/logs', label: 'Activity', icon: Activity },
    ],
    more: [
      { href: '/admin/distribution', label: 'Distribución', icon: Share2 },
      { href: '/admin/announcements', label: 'Avisos del sitio', icon: Megaphone },
      { href: '/admin/creator-tags', label: 'Tags de creadores', icon: Tags },
    ],
  },
  {
    id: 'technical',
    title: 'Technical',
    question: '¿Cómo está armado y quién puede hacer qué?',
    audience: 'TECHNICAL',
    items: [
      { href: '/admin/infraestructura', label: 'Infrastructure', icon: Server },
      { href: '/admin/sistemas/mapa', label: 'Systems Map', icon: Map },
      { href: '/admin/contexto', label: 'Configuration', icon: Cog },
      { href: '/admin/technical', label: 'Technical', icon: Network },
      { href: '/admin/team', label: 'Roles y permisos', icon: UserCog },
    ],
    more: [
      { href: '/admin/owner/team-management', label: 'Equipos de trabajo', icon: UsersRound },
      { href: '/equipo', label: 'Team Hub', icon: Users, exact: true },
      { href: '/admin/vote-weights', label: 'Peso de voto', icon: Scale },
      { href: '/admin/mantenimiento', label: 'Mantenimiento', icon: Wrench },
    ],
  },
];

/** Items para command palette (búsqueda global): todo lo navegable, una sola vez. */
export const OWNER_COMMAND_ITEMS: { href: string; label: string; group: string }[] = OWNER_NAV_SECTIONS.flatMap((s) =>
  [...s.items, ...(s.more ?? [])].map((i) => ({ href: i.href, label: i.label, group: s.title })),
);
