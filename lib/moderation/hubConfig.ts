import type { ComponentType } from 'react';
import {
  CheckCircle,
  ClipboardList,
  ClipboardPaste,
  Flag,
  Radar,
  MessageCircle,
  PackageX,
  Share2,
  TrendingDown,
  Users,
  Bot,
  XCircle,
} from 'lucide-react';

export type ModerationHubMode = 'admin' | 'workspace';

export type ModerationTabDef = {
  id: string;
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
};

export const ADMIN_MODERATION_TABS: ModerationTabDef[] = [
  { id: 'pending', href: '/admin/moderation', label: 'Pendientes', icon: ClipboardList, exact: true },
  { id: 'lote', href: '/admin/moderation/lote', label: 'Lotes', icon: ClipboardPaste },
  { id: 'adquisicion', href: '/admin/moderation/adquisicion', label: 'Adquisición', icon: Radar },
  { id: 'approved', href: '/admin/moderation/approved', label: 'Aprobadas', icon: CheckCircle },
  { id: 'rejected', href: '/admin/moderation/rejected', label: 'Rechazadas', icon: XCircle },
  { id: 'comments', href: '/admin/moderation/comments', label: 'Comentarios', icon: MessageCircle },
  { id: 'reports', href: '/admin/moderation/reports', label: 'Reportes', icon: Flag },
  { id: 'social', href: '/admin/moderation/social', label: 'Redes', icon: Share2 },
];

export const WORKSPACE_MODERATION_TABS: ModerationTabDef[] = [
  { id: 'all', href: '/equipo/moderacion', label: 'Todas', icon: ClipboardList, exact: true },
  { id: 'bot', href: '/equipo/moderacion/bot', label: 'Bot', icon: Bot },
  { id: 'hunters', href: '/equipo/moderacion/cazadores', label: 'Cazadores', icon: Users },
  { id: 'lote', href: '/equipo/moderacion/lote', label: 'Lotes', icon: ClipboardPaste },
  { id: 'adquisicion', href: '/equipo/moderacion/adquisicion', label: 'Adquisición', icon: Radar },
  { id: 'reports', href: '/equipo/moderacion/reportes', label: 'Reportes', icon: Flag },
  { id: 'price', href: '/equipo/moderacion/precio', label: 'Precio', icon: TrendingDown },
  { id: 'oos', href: '/equipo/moderacion/agotadas', label: 'Agotadas', icon: PackageX },
  { id: 'comments', href: '/equipo/moderacion/comentarios', label: 'Comentarios', icon: MessageCircle },
  { id: 'approved', href: '/equipo/moderacion/aprobadas', label: 'Aprobadas', icon: CheckCircle },
  { id: 'rejected', href: '/equipo/moderacion/rechazadas', label: 'Rechazadas', icon: XCircle },
];

export function getModerationTabs(mode: ModerationHubMode): ModerationTabDef[] {
  return mode === 'workspace' ? WORKSPACE_MODERATION_TABS : ADMIN_MODERATION_TABS;
}

export function resolveModerationTabId(pathname: string, mode: ModerationHubMode): string {
  if (mode === 'admin') {
    if (pathname === '/admin/reports' || pathname.startsWith('/admin/moderation/reports')) return 'reports';
    if (pathname.startsWith('/admin/moderation/social')) return 'social';
    if (pathname.startsWith('/admin/moderation/approved')) return 'approved';
    if (pathname.startsWith('/admin/moderation/rejected')) return 'rejected';
    if (pathname.startsWith('/admin/moderation/comments')) return 'comments';
    if (pathname.startsWith('/admin/moderation/lote')) return 'lote';
    if (pathname.startsWith('/admin/moderation/adquisicion')) return 'adquisicion';
    return 'pending';
  }

  if (pathname.startsWith('/equipo/moderacion/bot')) return 'bot';
  if (pathname.startsWith('/equipo/moderacion/cazadores')) return 'hunters';
  if (pathname.startsWith('/equipo/moderacion/lote')) return 'lote';
  if (pathname.startsWith('/equipo/moderacion/adquisicion')) return 'adquisicion';
  if (pathname.startsWith('/equipo/moderacion/reportes')) return 'reports';
  if (pathname.startsWith('/equipo/moderacion/precio')) return 'price';
  if (pathname.startsWith('/equipo/moderacion/agotadas')) return 'oos';
  if (pathname.startsWith('/equipo/moderacion/comentarios')) return 'comments';
  if (pathname.startsWith('/equipo/moderacion/aprobadas')) return 'approved';
  if (pathname.startsWith('/equipo/moderacion/rechazadas')) return 'rejected';
  return 'all';
}

export type ModerationQueueView = 'split' | 'bot' | 'hunters';

export function queueViewForTab(tabId: string): ModerationQueueView {
  if (tabId === 'bot') return 'bot';
  if (tabId === 'hunters') return 'hunters';
  return 'split';
}

/** Ruta base de cola pendiente (normalización al entrar) */
export function pendingBasePath(mode: ModerationHubMode): string {
  return mode === 'workspace' ? '/equipo/moderacion' : '/admin/moderation';
}

export function loteBasePath(mode: ModerationHubMode): string {
  return mode === 'workspace' ? '/equipo/moderacion/lote' : '/admin/moderation/lote';
}
