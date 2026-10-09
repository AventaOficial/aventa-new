function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

export function appendOffersById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const seen = new Set(current.map((offer) => offer.id));
  const extra = incoming.filter((offer) => offer.id && !seen.has(offer.id));
  return extra.length === 0 ? current : [...current, ...extra];
}

/**
 * Refresco de la primera página.
 * La ventana recién leída sustituye el prefijo: lo que ya no viene, sale.
 * El resto cargado con «cargar más» se conserva si sigue fuera de esa ventana.
 * Una respuesta vacía vacía la lista: no se simula un feed que el servidor ya no devuelve.
 */
export function refreshFeedWithoutDroppingPages<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const fresh = dedupeById(incoming);
  if (fresh.length === 0) return [];
  if (current.length === 0 || current.length <= fresh.length) return fresh;
  const seen = new Set(fresh.map((offer) => offer.id));
  const tail = current.slice(fresh.length).filter((offer) => offer.id && !seen.has(offer.id));
  return [...fresh, ...tail];
}
