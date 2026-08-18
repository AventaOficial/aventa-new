import type { ComponentType } from 'react';
import { Activity, BarChart3, LayoutDashboard, Package } from 'lucide-react';

export type OperationsTabId = 'overview' | 'health' | 'offers' | 'metrics';

export type OperationsTabDef = {
  id: OperationsTabId;
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
};

export const OPERATIONS_TABS: OperationsTabDef[] = [
  { id: 'overview', href: '/equipo/operaciones', label: 'Resumen', icon: LayoutDashboard, exact: true },
  { id: 'health', href: '/equipo/operaciones/salud', label: 'Salud', icon: Activity },
  { id: 'offers', href: '/equipo/operaciones/ofertas', label: 'Ofertas', icon: Package },
  { id: 'metrics', href: '/equipo/operaciones/metricas', label: 'Métricas', icon: BarChart3 },
];

export function resolveOperationsTab(pathname: string): OperationsTabId {
  if (pathname.startsWith('/equipo/operaciones/salud')) return 'health';
  if (pathname.startsWith('/equipo/operaciones/ofertas')) return 'offers';
  if (pathname.startsWith('/equipo/operaciones/metricas')) return 'metrics';
  return 'overview';
}

export function signalTone(status: 'ok' | 'error' | 'degraded' | 'green' | 'yellow' | 'red'): 'ok' | 'attention' | 'critical' | 'neutral' {
  if (status === 'ok' || status === 'green') return 'ok';
  if (status === 'degraded' || status === 'yellow') return 'attention';
  if (status === 'error' || status === 'red') return 'critical';
  return 'neutral';
}

export function formatNum(n: number): string {
  return n.toLocaleString('es-MX', { maximumFractionDigits: 0 });
}
