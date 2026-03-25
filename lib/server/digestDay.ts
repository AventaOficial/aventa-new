/**
 * Límites del día calendario en una zona horaria IANA (p. ej. digest nocturno México).
 * Sin dependencias externas: búsqueda por ventana alrededor del mediodía UTC del día civil.
 */

const DEFAULT_TZ = process.env.DIGEST_TIMEZONE || 'America/Mexico_City';

/** Clave YYYY-MM-DD del día civil en la zona (para agrupar ofertas). */
export function zonedCalendarKey(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function hourMinuteInZone(d: Date, timeZone: string): { h: number; min: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(d);
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '99', 10);
  const min = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '99', 10);
  return { h, min };
}

/**
 * Inicio (inclusivo) y fin (exclusivo) en UTC del día calendario de `ref` en `timeZone`.
 */
export function getZonedDayRange(ref: Date, timeZone: string = DEFAULT_TZ): { start: Date; end: Date } {
  const dayStr = zonedCalendarKey(ref, timeZone);
  const [y, m, d] = dayStr.split('-').map(Number);
  const center = Date.UTC(y, m - 1, d, 12, 0, 0);
  let start: Date | null = null;
  for (let q = -40 * 4; q <= 40 * 4; q++) {
    const t = new Date(center + q * 15 * 60 * 1000);
    if (zonedCalendarKey(t, timeZone) !== dayStr) continue;
    const { h, min } = hourMinuteInZone(t, timeZone);
    if (h === 0 && min === 0) {
      start = t;
      break;
    }
  }
  if (!start) {
    for (let q = -40 * 4; q <= 40 * 4; q++) {
      const t = new Date(center + q * 15 * 60 * 1000);
      if (zonedCalendarKey(t, timeZone) !== dayStr) continue;
      const { h, min } = hourMinuteInZone(t, timeZone);
      if (h === 0 && min < 30) {
        start = t;
        break;
      }
    }
  }
  if (!start) {
    start = new Date(center - 6 * 3600000);
  }
  const end = new Date(start.getTime() + 86400000);
  return { start, end };
}

/** Etiqueta corta para un día (ej. "lun 17 mar") en es-MX. */
export function formatZonedDayLabel(d: Date, timeZone: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d);
}
