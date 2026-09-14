import type { ComponentType } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BowArrow,
  CircleDollarSign,
  Cog,
  Heart,
  LayoutDashboard,
  Map,
  Network,
  Rocket,
  Server,
  Shield,
  Users,
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
  /** CEO | OPERATIONS | TECHNICAL */
  audience: 'CEO' | 'OPERATIONS' | 'TECHNICAL';
  items: OwnerNavItem[];
};

/**
 * Navegación por audiencia de decisión.
 * Legacy/technical permanece accesible, no domina.
 */
export const OWNER_NAV_SECTIONS: OwnerNavSection[] = [
  {
    id: 'ceo',
    title: 'CEO',
    audience: 'CEO',
    items: [
      { href: '/admin/owner', label: 'Control Center', icon: LayoutDashboard, exact: true },
      { href: '/admin/moderation', label: 'Moderation', icon: Shield },
      { href: '/admin/hunter', label: 'Supply', icon: BowArrow },
      { href: '/admin/commissions', label: 'Money', icon: CircleDollarSign },
      { href: '/admin/users', label: 'Users', icon: Users },
      { href: '/admin/health', label: 'Health', icon: Heart },
    ],
  },
  {
    id: 'operations',
    title: 'Operations',
    audience: 'OPERATIONS',
    items: [
      { href: '/admin/metrics', label: 'Live Metrics', icon: BarChart3 },
      { href: '/admin/owner/crecimiento', label: 'Growth', icon: Rocket },
      { href: '/admin/rewards', label: 'Rewards ops', icon: CircleDollarSign },
      { href: '/admin/operaciones', label: 'Alerts', icon: AlertTriangle },
      { href: '/admin/operaciones/trabajo', label: 'Automations', icon: Zap },
      { href: '/admin/logs', label: 'Activity', icon: Activity },
    ],
  },
  {
    id: 'technical',
    title: 'Technical',
    audience: 'TECHNICAL',
    items: [
      { href: '/admin/infraestructura', label: 'Infrastructure', icon: Server },
      { href: '/admin/sistemas/mapa', label: 'Systems Map', icon: Map },
      { href: '/admin/contexto', label: 'Configuration', icon: Cog },
      { href: '/admin/technical', label: 'Technical', icon: Network },
      { href: '/admin/team', label: 'Team', icon: Users },
    ],
  },
];

/** Items para command palette (búsqueda global) */
export const OWNER_COMMAND_ITEMS: { href: string; label: string; group: string }[] = [
  ...OWNER_NAV_SECTIONS.flatMap((s) =>
    s.items.map((i) => ({ href: i.href, label: i.label, group: s.title })),
  ),
  { href: '/admin/announcements', label: 'Anuncios', group: 'Operations' },
  { href: '/admin/creator-tags', label: 'Creator Tags', group: 'Operations' },
  { href: '/admin/owner/cazadores', label: 'Cazadores', group: 'CEO' },
  { href: '/equipo', label: 'Team Hub', group: 'Operations' },
  { href: '/admin/mantenimiento', label: 'Mantenimiento', group: 'Technical' },
  { href: '/equipo/contabilidad', label: 'Contabilidad', group: 'CEO' },
];
