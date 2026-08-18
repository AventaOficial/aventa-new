import type { TrafficLight } from '@/lib/owner/buildOwnerDashboard';

export function formatNum(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('es-MX');
}

export function formatMoneyCents(cents: number | null | undefined, currency = 'MXN'): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatPct(delta: number | null | undefined, suffix = '%'): string {
  if (delta == null) return '—';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta}${suffix}`;
}

export function statusColor(status: TrafficLight | 'ok' | 'attention' | 'critical' | 'info'): string {
  if (status === 'green' || status === 'ok') return 'var(--status-ok)';
  if (status === 'yellow' || status === 'attention') return 'var(--status-attention)';
  if (status === 'red' || status === 'critical') return 'var(--status-critical)';
  return 'var(--status-info)';
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
