import { SEASONS } from '@/lib/seasons/resolve';

/**
 * La ventana de cada temporada vive en el catálogo de Seasons.
 * Este módulo solo pregunta qué temporada cubre un instante.
 */
export function seasonIdAt(iso: string, nowCatalog = SEASONS): string | null {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const match = nowCatalog.find((season) => {
    const start = Date.parse(season.startAt);
    const end = Date.parse(season.endAt);
    return Number.isFinite(start) && Number.isFinite(end) && time >= start && time < end;
  });
  return match?.id ?? null;
}

export function seasonWindowOpenFor(seasonId: string, now = new Date()): boolean {
  return seasonIdAt(now.toISOString()) === seasonId;
}
