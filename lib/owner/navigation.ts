import type { ComponentType } from 'react';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  BowArrow,
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
  Tags,
  Ticket,
  UserCog,
  Users,
  UsersRound,
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
  /** La pregunta de negocio que responde la sección. */
  question: string;
  /** CEO | OPERATIONS | TECHNICAL */
  audience: 'CEO' | 'OPERATIONS' | 'TECHNICAL';
  /** Herramientas de uso frecuente: siempre visibles. */
  items: OwnerNavItem[];
  /** Herramientas especializadas: plegadas bajo «Más herramientas». */
  more?: OwnerNavItem[];
};

/**
 * Founder OS: una sola entrada (Control Center) y el resto agrupado por capacidad.
 * Nada se elimina: lo especializado o técnico queda como drill-down plegado.
 */
export const OWNER_NAV_SECTIONS: OwnerNavSection[] = [
  {
    id: 'control',
    title: 'Control Center',
    question: '¿Qué debo decidir hoy?',
    audience: 'CEO',
    items: [{ href: '/admin/owner', label: 'Control Center', icon: LayoutDashboard, exact: true }],
  },
  {
    id: 'producto',
    title: 'Producto',
    question: '¿Qué está viendo la gente hoy?',
    audience: 'OPERATIONS',
    items: [
      { href: '/admin/moderation', label: 'Moderación', icon: Shield },
      { href: '/admin/hunter', label: 'Supply · Hunter', icon: BowArrow },
      { href: '/admin/users', label: 'Usuarios', icon: Users },
    ],
    more: [
      { href: '/admin/owner/cazadores', label: 'Cazadores de confianza', icon: BadgeCheck },
      { href: '/admin/coupons', label: 'Cupones', icon: Ticket },
    ],
  },
  {
    id: 'crecimiento',
    title: 'Crecimiento',
    question: '¿Estamos creciendo?',
    audience: 'OPERATIONS',
    items: [
      { href: '/admin/owner/crecimiento', label: 'Crecimiento', icon: Rocket },
      { href: '/admin/metrics', label: 'Métricas en vivo', icon: BarChart3 },
    ],
    more: [
      { href: '/admin/distribution', label: 'Distribución', icon: Share2 },
      { href: '/admin/announcements', label: 'Avisos del sitio', icon: Megaphone },
    ],
  },
  {
    id: 'negocio',
    title: 'Negocio',
    question: '¿Cuánto genera Aventa y cuánto debe?',
    audience: 'CEO',
    items: [
      { href: '/admin/commissions', label: 'Afiliación y comisiones', icon: CircleDollarSign },
      { href: '/admin/rewards', label: 'Recompensas', icon: Gift },
    ],
    more: [
      { href: '/equipo/contabilidad', label: 'Contabilidad', icon: Calculator },
      { href: '/admin/creator-tags', label: 'Tags de creadores', icon: Tags },
    ],
  },
  {
    id: 'salud',
    title: 'Salud',
    question: '¿Algo está fallando?',
    audience: 'TECHNICAL',
    items: [
      { href: '/admin/health', label: 'Salud del sistema', icon: Heart },
      { href: '/admin/operaciones', label: 'Centro de operaciones', icon: AlertTriangle, exact: true },
    ],
    more: [
      { href: '/admin/logs', label: 'Actividad', icon: Activity },
      { href: '/admin/infraestructura', label: 'Infraestructura', icon: Server },
      { href: '/admin/operaciones/trabajo', label: 'Bot y trabajo', icon: Zap },
    ],
  },
  {
    id: 'sistema',
    title: 'Sistema',
    question: '¿Cómo está armado y quién puede hacer qué?',
    audience: 'TECHNICAL',
    items: [
      { href: '/admin/sistemas/mapa', label: 'Mapa de sistemas', icon: Map },
      { href: '/admin/team', label: 'Roles y permisos', icon: UserCog },
      { href: '/admin/owner/team-management', label: 'Equipos de trabajo', icon: UsersRound },
    ],
    more: [
      { href: '/equipo', label: 'Team Hub', icon: Users, exact: true },
      { href: '/admin/contexto', label: 'Configuración y contexto', icon: Cog },
      { href: '/admin/technical', label: 'Datos técnicos', icon: Network },
      { href: '/admin/vote-weights', label: 'Peso de voto', icon: Scale },
      { href: '/admin/mantenimiento', label: 'Mantenimiento', icon: Wrench },
    ],
  },
];

/** Items para command palette (búsqueda global): todo lo navegable, una sola vez. */
export const OWNER_COMMAND_ITEMS: { href: string; label: string; group: string }[] = OWNER_NAV_SECTIONS.flatMap((s) =>
  [...s.items, ...(s.more ?? [])].map((i) => ({ href: i.href, label: i.label, group: s.title })),
);
