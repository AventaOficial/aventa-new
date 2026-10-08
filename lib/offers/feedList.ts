export function appendOffersById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const seen = new Set(current.map((offer) => offer.id));
  const extra = incoming.filter((offer) => offer.id && !seen.has(offer.id));
  return extra.length === 0 ? current : [...current, ...extra];
}

/** Un refresco de la primera página no tira las páginas ya cargadas ni reordena el scroll. */
export function refreshFeedWithoutDroppingPages<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  if (current.length === 0 || current.length <= incoming.length) {
    const seen = new Set<string>();
    return incoming.filter((offer) => {
      if (!offer.id || seen.has(offer.id)) return false;
      seen.add(offer.id);
      return true;
    });
  }
  const fresh = new Map(incoming.map((offer) => [offer.id, offer]));
  return current.map((offer) => fresh.get(offer.id) ?? offer);
}
