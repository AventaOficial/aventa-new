/** Tiempo relativo en español para la cola de moderación. */
export function formatModerationRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const diffM = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffM < 1) return 'Hace un momento';
  if (diffM < 60) return `Hace ${diffM} min`;
  if (diffH < 24) return `Hace ${diffH}h`;
  if (diffD === 1) return 'Hace 1 día';
  if (diffD < 7) return `Hace ${diffD} días`;
  if (diffD < 30) return `Hace ${Math.floor(diffD / 7)} sem`;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export function getOfferDiscountPercent(
  price: number | null | undefined,
  originalPrice: number | null | undefined
): number {
  const p = Number(price ?? 0);
  const o = Number(originalPrice ?? 0);
  if (!Number.isFinite(p) || !Number.isFinite(o)) return 0;
  if (o <= 0 || o <= p) return 0;
  return Math.round(((o - p) / o) * 100);
}
