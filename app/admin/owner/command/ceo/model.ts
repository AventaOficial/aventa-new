import type { OwnerRangeKey } from '@/lib/owner/ownerRange';
import type { SourceState } from '../types';
import { STALE_AFTER_MS } from '../useCommandCenter';

/** Texto corto de comparación por período ("vs. ayer"). */
export const VS_LABEL: Record<OwnerRangeKey, string> = {
  today: 'vs. ayer',
  '7d': 'vs. 7 d previos',
  '30d': 'vs. 30 d previos',
  month: 'vs. mes anterior',
};

/** Sufijo del período para contadores ("23 hoy"). */
export const PERIOD_SUFFIX: Record<OwnerRangeKey, string> = {
  today: 'hoy',
  '7d': '7 d',
  '30d': '30 d',
  month: 'mes',
};

/** Título entre paréntesis ("(hoy)"). */
export const PERIOD_TITLE: Record<OwnerRangeKey, string> = {
  today: 'hoy',
  '7d': '7 días',
  '30d': '30 días',
  month: 'este mes',
};

export function formatCount(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('es-MX');
}

const MONEY = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatMoneyCents(cents: number): string {
  return `$ ${MONEY.format(cents / 100)}`;
}

export function share(part: number | null, total: number | null): number | null {
  if (part == null || total == null || total <= 0) return null;
  return Math.round((part / total) * 100);
}

export function isStale<T>(s: SourceState<T>, now: number): boolean {
  return s.fetchedAt != null && now - s.fetchedAt > STALE_AFTER_MS;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}
