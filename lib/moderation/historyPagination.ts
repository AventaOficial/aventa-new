/** Aprobadas / Rechazadas en moderación: página por cursor de created_at. */
export const HISTORY_PAGE_SIZE = 50;

/**
 * Filtro `or` de PostgREST para buscar en servidor por título o tienda.
 * Comas, paréntesis, comodines y barras romperían la sintaxis del filtro: se quitan.
 */
export function historySearchFilter(raw: string): string | null {
  const term = raw.replace(/[,()*%\\"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!term) return null;
  return `title.ilike.%${term}%,store.ilike.%${term}%`;
}

/**
 * La página siguiente se pide con `created_at <= cursor` para no saltarse ofertas que comparten
 * timestamp con la última cargada; las repetidas se descartan aquí.
 */
export function mergeHistoryPage<T extends { id: string }>(current: T[], page: T[]): { offers: T[]; added: number } {
  const seen = new Set(current.map((o) => o.id));
  const fresh = page.filter((o) => !seen.has(o.id));
  return { offers: [...current, ...fresh], added: fresh.length };
}
