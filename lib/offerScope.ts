/**
 * El formulario guarda líneas tipo "Alcance: compra en línea." en `conditions`.
 * Extrae si la oferta es en web o en tienda física para UI (badges).
 */
export type OfferScopeUi = 'online' | 'in_store';

export function parseOfferScopeFromConditions(
  conditions: string | null | undefined
): OfferScopeUi | null {
  if (!conditions?.trim()) return null;
  const head = conditions.slice(0, 400);
  if (/Alcance:\s*compra\s+en\s+línea/i.test(head)) return 'online';
  if (/Alcance:.*tienda\s+física|Alcance:.*sucursales/i.test(head)) return 'in_store';
  return null;
}
