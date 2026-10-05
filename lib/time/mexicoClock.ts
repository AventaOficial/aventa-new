const MEXICO_CITY = 'America/Mexico_City';

/** Same string on the server (UTC) and the browser. Locale alone is not enough. */
export function formatMexicoDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: MEXICO_CITY,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

/** «4 oct» en hora de México: estable entre servidor y navegador. */
export function formatMexicoShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX', { timeZone: MEXICO_CITY, day: 'numeric', month: 'short' }).format(date);
}

/**
 * «hace 5 min» cuando se conoce el reloj del navegador; con `nowMs = null` (render del servidor
 * y primer render de hidratación) devuelve la fecha corta, que no depende de la hora actual.
 */
export function formatRelativeMexico(iso: string, nowMs: number | null): string {
  if (nowMs == null) return formatMexicoShortDate(iso);
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '';
  const diffMs = nowMs - time;
  const diffM = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffM < 1) return 'Ahora mismo';
  if (diffM < 60) return `hace ${diffM} min`;
  if (diffH < 24) return `hace ${diffH}h`;
  if (diffD === 1) return 'hace 1 día';
  if (diffD < 7) return `hace ${diffD} días`;
  if (diffD < 30) return `hace ${Math.floor(diffD / 7)} sem`;
  return formatMexicoShortDate(iso);
}

export function remainingDaysLabel(expiresAt: string | null | undefined, nowMs: number): string | null {
  if (!expiresAt) return null;
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end) || end <= nowMs) return null;
  const days = Math.ceil((end - nowMs) / 86_400_000);
  return days === 1 ? '1 día restante' : `${days} días restantes`;
}
