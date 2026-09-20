/**
 * Offer scope (online / in-store) — presentation + bot persistence authority.
 * Stored as a line in offers.conditions by ActionBar; bots must write the same.
 */

export type OfferScopeUi = 'online' | 'in_store';
export type OfferScopeWrite = 'online' | 'in_store' | 'both';

export function parseOfferScopeFromConditions(
  conditions: string | null | undefined
): OfferScopeUi | null {
  if (!conditions?.trim()) return null;
  const head = conditions.slice(0, 400);
  if (/Alcance:\s*compra\s+en\s+línea/i.test(head)) return 'online';
  if (/Alcance:\s*en\s+línea\s+y\s+en\s+tienda/i.test(head)) return null;
  if (/Alcance:.*tienda\s+física|Alcance:.*sucursales/i.test(head)) return 'in_store';
  return null;
}

/** Canonical condition lines — must match ActionBar persistence. */
export function formatOfferScopeCondition(scope: OfferScopeWrite): string {
  if (scope === 'online') return 'Alcance: compra en línea.';
  if (scope === 'in_store') return 'Alcance: oferta en tienda física / sucursales.';
  return 'Alcance: en línea y en tienda física.';
}

/**
 * Infer scope for machine-created offers from store/host.
 * Prefer null (unknown) over inventing in-store for marketplaces.
 */
export function inferBotOfferScope(params: {
  store?: string | null;
  url?: string | null;
}): OfferScopeWrite | null {
  const store = (params.store ?? '').toLowerCase();
  let host = '';
  try {
    host = params.url ? new URL(params.url).hostname.toLowerCase() : '';
  } catch {
    host = '';
  }
  const onlineHints =
    /mercado\s*libre|amazon|walmart|liverpool|coppel|elektra|best\s*buy|shein|temu|ebay/i;
  if (onlineHints.test(store) || onlineHints.test(host) || /mercadolibre|amazon\./i.test(host)) {
    return 'online';
  }
  return null;
}
