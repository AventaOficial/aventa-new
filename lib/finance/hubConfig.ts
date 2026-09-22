import type { ComponentType } from 'react';
import { Banknote, BookOpen, Landmark, LayoutDashboard, Wallet } from 'lucide-react';

export type FinanceTabId = 'overview' | 'ledger' | 'payments' | 'pools' | 'payout_ops';

export type FinanceTabDef = {
  id: FinanceTabId;
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
  /** Solo owner + finance (requirePayoutOps). Se muestra igual; el API decide. */
  restricted?: boolean;
};

export const PAYOUT_OPS_PATH = '/equipo/contabilidad/centro-pagos';

export const FINANCE_TABS: FinanceTabDef[] = [
  { id: 'overview', href: '/equipo/contabilidad', label: 'Resumen', icon: LayoutDashboard, exact: true },
  { id: 'payout_ops', href: PAYOUT_OPS_PATH, label: 'Centro de pagos', icon: Landmark, restricted: true },
  { id: 'ledger', href: '/equipo/contabilidad/ledger', label: 'Ledger', icon: BookOpen },
  { id: 'payments', href: '/equipo/contabilidad/pagos', label: 'Pagos', icon: Wallet },
  { id: 'pools', href: '/equipo/contabilidad/pools', label: 'Pools', icon: Banknote },
];

export function resolveFinanceTab(pathname: string): FinanceTabId {
  if (pathname.startsWith(PAYOUT_OPS_PATH)) return 'payout_ops';
  if (pathname.startsWith('/equipo/contabilidad/ledger')) return 'ledger';
  if (pathname.startsWith('/equipo/contabilidad/pagos')) return 'payments';
  if (pathname.startsWith('/equipo/contabilidad/pools')) return 'pools';
  return 'overview';
}

export function centsToMx(cents: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export const NETWORK_LABELS: Record<string, string> = {
  amazon: 'Amazon',
  mercadolibre: 'Mercado Libre',
  aliexpress: 'AliExpress',
  temu: 'Temu',
  walmart: 'Walmart',
  shein: 'Shein',
  other: 'Otra',
};
