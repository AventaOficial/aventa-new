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

export type NavTier = 1 | 2 | 3 | 4;

export type AdminNavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
  subtle?: boolean;
  tier: NavTier;
  tierLabel: string;
  /** Visible en sidebar sin abrir «Más» */
  pinned?: boolean;
};

export type AdminNavGroup = {
  id: string;
  title: string;
  subtitle?: string;
  tier: NavTier;
  defaultOpen: boolean;
  items: AdminNavItem[];
};

const TIER_LABELS: Record<NavTier, string> = {
  1: 'Uso diario',
  2: 'Uso semanal',
  3: 'Uso mensual',
  4: 'Uso excepcional',
};

function item(
  partial: Omit<AdminNavItem, 'tier' | 'tierLabel'> & { tier: NavTier; pinned?: boolean }
): AdminNavItem {
  return { ...partial, tierLabel: TIER_LABELS[partial.tier] };
}

/** Rutas y metadatos para fundador (owner). Otras roles usan subconjuntos. */
export function buildAdminNavigation(role: Role | null): AdminNavGroup[] {
  if (!role) return [];

  const isOwner = role === 'owner';
  const isAdmin = role === 'admin';
  const isModerator = role === 'moderator';
  const isAnalyst = role === 'analyst';

  const groups: AdminNavGroup[] = [];

  if (isOwner) {
    groups.push({
      id: 'command',
      title: 'Centro de mando',
      subtitle: 'Pantalla principal',
      tier: 1,
      defaultOpen: true,
      items: [
        item({
          href: '/admin/owner',
          label: 'Owner Dashboard',
          icon: LayoutDashboard,
          exact: true,
          tier: 1,
          pinned: true,
        }),
      ],
    });
  } else if (isAdmin || isModerator || isAnalyst) {
    groups.push({
      id: 'command',
      title: 'Inicio',
      tier: 1,
      defaultOpen: true,
      items: [
        item({
          href: '/admin/dashboard',
          label: 'Panel',
          icon: LayoutDashboard,
          exact: true,
          tier: 1,
          pinned: true,
        }),
      ],
    });
  }

  if (canAccessModeration(role)) {
    const modDaily: AdminNavItem[] = [
      item({
        href: '/admin/moderation',
        label: 'Cola pendientes',
        icon: ClipboardList,
        exact: true,
        tier: 1,
        pinned: isOwner || isModerator || isAdmin,
      }),
      item({
        href: '/admin/reports',
        label: 'Reportes',
        icon: Flag,
        tier: 1,
        pinned: isOwner || isModerator || isAdmin,
      }),
    ];

    const modWeekly: AdminNavItem[] = [
      item({
        href: '/admin/moderation/comments',
        label: 'Comentarios',
        icon: MessageCircle,
        tier: 2,
      }),
    ];

    const modExceptional: AdminNavItem[] = [
      item({
        href: '/admin/moderation/approved',
        label: 'Aprobadas',
        icon: CheckCircle,
        tier: 4,
      }),
      item({
        href: '/admin/moderation/rejected',
        label: 'Rechazadas',
        icon: XCircle,
        tier: 4,
      }),
      item({
        href: '/admin/moderation/bans',
        label: 'Baneos',
        icon: ShieldOff,
        tier: 4,
      }),
    ];

    groups.push({
      id: 'moderation-daily',
      title: 'Moderación',
      subtitle: 'Hoy',
      tier: 1,
      defaultOpen: isModerator,
      items: modDaily,
    });

    if (modWeekly.length > 0 && (isOwner || isAdmin || isModerator)) {
      groups.push({
        id: 'moderation-weekly',
        title: 'Moderación',
        subtitle: 'Esta semana',
        tier: 2,
        defaultOpen: false,
        items: modWeekly,
      });
    }

    groups.push({
      id: 'moderation-archive',
      title: 'Moderación',
      subtitle: 'Archivo y excepciones',
      tier: 4,
      defaultOpen: false,
      items: modExceptional,
    });
  }

  if (isOwner) {
    groups.push({
      id: 'operations-weekly',
      title: 'Operaciones',
      subtitle: 'Esta semana',
      tier: 2,
      defaultOpen: false,
      items: [
        item({
          href: '/admin/operaciones/trabajo',
          label: 'Bot y trabajo',
          icon: Briefcase,
          tier: 2,
          pinned: true,
        }),
        item({
          href: '/admin/metrics',
          label: 'Métricas',
          icon: BarChart3,
          tier: 2,
          pinned: true,
        }),
      ],
    });

    groups.push({
      id: 'business-monthly',
      title: 'Negocio',
      subtitle: 'Este mes',
      tier: 3,
      defaultOpen: false,
      items: [
        item({
          href: '/admin/operaciones',
          label: 'Centro de operaciones',
          icon: LayoutDashboard,
          tier: 3,
        }),
        item({
          href: '/admin/commissions',
          label: 'Comisiones y ledger',
          icon: CircleDollarSign,
          tier: 3,
        }),
        item({
          href: '/admin/users',
          label: 'Usuarios',
          icon: Users,
          tier: 3,
        }),
        item({
          href: '/admin/health',
          label: 'Salud del sistema',
          icon: Heart,
          tier: 3,
        }),
        item({
          href: '/admin/announcements',
          label: 'Avisos al sitio',
          icon: Megaphone,
          tier: 3,
        }),
        item({
          href: '/admin/team',
          label: 'Equipo y roles',
          icon: UserCog,
          tier: 3,
        }),
      ],
    });

    groups.push({
      id: 'advanced',
      title: 'Avanzado',
      subtitle: 'Solo cuando haga falta',
      tier: 4,
      defaultOpen: false,
      items: [
        item({
          href: '/admin/logs',
          label: 'Logs de moderación',
          icon: FileText,
          tier: 4,
        }),
        item({
          href: '/admin/technical',
          label: 'Datos técnicos',
          icon: Wrench,
          tier: 4,
        }),
        item({
          href: '/admin/vote-weights',
          label: 'Peso de voto',
          icon: Scale,
          tier: 4,
        }),
        item({
          href: '/admin/mantenimiento',
          label: 'Mantenimiento',
          icon: NotebookPen,
          tier: 4,
        }),
        item({
          href: '/admin/dashboard',
          label: 'Panel clásico',
          icon: LayoutDashboard,
          tier: 4,
          subtle: true,
        }),
        item({
          href: '/contexto',
          label: 'Contexto del sistema',
          icon: MapIcon,
          tier: 4,
          subtle: true,
        }),
      ],
    });
  } else if (isAdmin) {
    if (canAccessUsersLogs(role)) {
      groups.push({
        id: 'administration',
        title: 'Administración',
        tier: 2,
        defaultOpen: false,
        items: [
          item({ href: '/admin/users', label: 'Usuarios', icon: Users, tier: 2 }),
          item({ href: '/admin/logs', label: 'Logs', icon: FileText, tier: 3 }),
          item({ href: '/admin/team', label: 'Equipo', icon: UserCog, tier: 3 }),
        ],
      });
    }
    if (canAccessMetrics(role) || canAccessHealth(role)) {
      groups.push({
        id: 'analysis',
        title: 'Análisis',
        tier: 2,
        defaultOpen: false,
        items: [
          ...(canAccessMetrics(role)
            ? [item({ href: '/admin/metrics', label: 'Métricas', icon: BarChart3, tier: 2 })]
            : []),
          ...(canAccessHealth(role)
            ? [item({ href: '/admin/health', label: 'Health', icon: Heart, tier: 3 })]
            : []),
        ],
      });
    }
  } else if (isAnalyst) {
    groups.push({
      id: 'analysis',
      title: 'Análisis',
      tier: 1,
      defaultOpen: true,
      items: [
        ...(canAccessMetrics(role)
          ? [item({ href: '/admin/metrics', label: 'Métricas', icon: BarChart3, tier: 1, pinned: true })]
          : []),
        ...(canAccessHealth(role)
          ? [item({ href: '/admin/health', label: 'Health', icon: Heart, tier: 2, pinned: true })]
          : []),
      ],
    });
  }

  if (isAdmin && canManageAnnouncements(role)) {
    /* owner ya tiene announcements en business-monthly */
  }

  return groups.filter((g) => g.items.length > 0);
}

/** Ítems fijados arriba del sidebar (tier 1 + pinned). */
export function getPinnedItems(groups: AdminNavGroup[]): AdminNavItem[] {
  const seen = new Set<string>();
  const out: AdminNavItem[] = [];
  for (const g of groups) {
    for (const item of g.items) {
      if (item.pinned && !seen.has(item.href)) {
        seen.add(item.href);
        out.push(item);
      }
    }
  }
  return out;
}

export function getDefaultAdminHome(role: Role | null): string {
  if (role === 'owner') return '/admin/owner';
  if (role === 'moderator') return '/admin/moderation';
  if (role === 'analyst') return '/admin/metrics';
  return '/admin/dashboard';
}

const TIER_ACCORDION_TITLES: Record<NavTier, string> = {
  1: 'Uso diario',
  2: 'Esta semana',
  3: 'Este mes',
  4: 'Avanzado',
};

/** Agrupa ítems no fijados en acordeones por nivel (evita 6 secciones repetidas). */
export function buildTierAccordions(
  groups: AdminNavGroup[],
  pinnedHrefs: Set<string>
): { tier: NavTier; title: string; items: AdminNavItem[] }[] {
  const byTier = new Map<NavTier, AdminNavItem[]>();
  for (const g of groups) {
    if (g.id === 'command') continue;
    for (const navItem of g.items) {
      if (pinnedHrefs.has(navItem.href)) continue;
      const list = byTier.get(navItem.tier) ?? [];
      if (!list.some((x) => x.href === navItem.href)) list.push(navItem);
      byTier.set(navItem.tier, list);
    }
  }
  return ([2, 3, 4] as NavTier[])
    .map((tier) => ({
      tier,
      title: TIER_ACCORDION_TITLES[tier],
      items: byTier.get(tier) ?? [],
    }))
    .filter((a) => a.items.length > 0);
}
