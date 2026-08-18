import type { ComponentType } from 'react';
import { ClipboardList, LayoutDashboard, ListTodo, Users } from 'lucide-react';

export type GerenciaTabId = 'overview' | 'queues' | 'areas' | 'team';

export type GerenciaTabDef = {
  id: GerenciaTabId;
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
};

export const GERENCIA_TABS: GerenciaTabDef[] = [
  { id: 'overview', href: '/equipo/gerencia', label: 'Resumen', icon: LayoutDashboard, exact: true },
  { id: 'queues', href: '/equipo/gerencia/colas', label: 'Colas', icon: ListTodo },
  { id: 'areas', href: '/equipo/gerencia/areas', label: 'Áreas', icon: ClipboardList },
  { id: 'team', href: '/equipo/gerencia/equipo', label: 'Equipo', icon: Users },
];

export function resolveGerenciaTab(pathname: string): GerenciaTabId {
  if (pathname.startsWith('/equipo/gerencia/colas')) return 'queues';
  if (pathname.startsWith('/equipo/gerencia/areas')) return 'areas';
  if (pathname.startsWith('/equipo/gerencia/equipo')) return 'team';
  return 'overview';
}

export function queueToneClass(tone: 'ok' | 'attention' | 'blocked'): string {
  if (tone === 'ok') return 'border-emerald-500/20 bg-emerald-50/60 dark:bg-emerald-950/20';
  if (tone === 'attention') return 'border-amber-500/20 bg-amber-50/60 dark:bg-amber-950/20';
  return 'border-red-500/20 bg-red-50/60 dark:bg-red-950/20';
}

export function pctToneClass(pct: number): string {
  if (pct >= 85) return 'text-emerald-600 dark:text-emerald-400';
  if (pct >= 65) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}
