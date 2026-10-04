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

export function remainingDaysLabel(expiresAt: string | null | undefined, nowMs: number): string | null {
  if (!expiresAt) return null;
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end) || end <= nowMs) return null;
  const days = Math.ceil((end - nowMs) / 86_400_000);
  return days === 1 ? '1 día restante' : `${days} días restantes`;
}
