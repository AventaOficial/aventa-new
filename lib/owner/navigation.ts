import type { ComponentType } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BowArrow,
  CircleDollarSign,
  Cog,
  Globe2,
  Heart,
  LayoutDashboard,
  Map,
  Network,
  Rocket,
  Server,
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
  items: OwnerNavItem[];
};

/** Sidebar agrupado por decisiones — no por implementación técnica */
export const OWNER_NAV_SECTIONS: OwnerNavSection[] = [
  {
    id: 'command',
    title: 'Command',
    items: [
      { href: '/admin/owner', label: 'Overview', icon: LayoutDashboard, exact: true },
      { href: '/admin/metrics', label: 'Live Metrics', icon: BarChart3 },
      { href: '/admin/logs', label: 'Activity', icon: Activity },
    ],
  },
  {
    id: 'business',
    title: 'Business',
    items: [
      { href: '/admin/owner/crecimiento', label: 'Growth', icon: Rocket },
      { href: '/admin/commissions', label: 'Revenue', icon: CircleDollarSign },
      { href: '/admin/metrics', label: 'Markets', icon: Globe2 },
    ],
  },
  {
    id: 'people',
    title: 'People',
    items: [
      { href: '/admin/team', label: 'Team', icon: Users },
      { href: '/admin/users', label: 'Users', icon: Users },
      { href: '/equipo/gerencia', label: 'Workspace', icon: Users },
    ],
  },
  {
    id: 'operations',
    title: 'Operations',
    items: [
      { href: '/admin/health', label: 'Health', icon: Heart },
      { href: '/admin/operaciones', label: 'Alerts', icon: AlertTriangle },
      { href: '/admin/operaciones/trabajo', label: 'Automations', icon: Zap },
      { href: '/admin/hunter', label: 'Hunter', icon: BowArrow },
    ],
  },
  {
    id: 'system',
    title: 'System',
    items: [
      { href: '/admin/infraestructura', label: 'Infrastructure', icon: Server },
      { href: '/admin/sistemas/mapa', label: 'Systems Map', icon: Map },
      { href: '/admin/contexto', label: 'Configuration', icon: Cog },
      { href: '/admin/technical', label: 'Technical', icon: Network },
    ],
  },
];

/** Items para command palette (búsqueda global) */
export const OWNER_COMMAND_ITEMS: { href: string; label: string; group: string }[] = [
  ...OWNER_NAV_SECTIONS.flatMap((s) =>
    s.items.map((i) => ({ href: i.href, label: i.label, group: s.title }))
  ),
  { href: '/admin/moderation', label: 'Moderación', group: 'Admin' },
  { href: '/admin/announcements', label: 'Anuncios', group: 'Admin' },
  { href: '/admin/creator-tags', label: 'Creator Tags', group: 'Admin' },
  { href: '/admin/owner/cazadores', label: 'Cazadores', group: 'Admin' },
  { href: '/admin/hunter', label: 'Hunter', group: 'Operations' },
  { href: '/equipo', label: 'Team Hub', group: 'Workspace' },
  { href: '/admin/mantenimiento', label: 'Mantenimiento', group: 'System' },
];
