/**
 * Detección de tienda hostname-first para el parser de ofertas.
 * El item id ML nunca implica tienda si el host no es Mercado Libre.
 */

function getDomain(hostname: string): string {
  return hostname.replace(/^www\./, '').toLowerCase();
}

export function isOfferMercadoLibreHost(hostname: string): boolean {
  const d = getDomain(hostname);
  return (
    d.includes('mercadolibre') ||
    d.includes('mercadolivre') ||
    d === 'meli.la' ||
    d.endsWith('.meli.la')
  );
}

export function isOfferAmazonHost(hostname: string): boolean {
  const d = getDomain(hostname);
  return (
    d.includes('amazon.') ||
    d === 'amzn.to' ||
    d === 'a.co' ||
    d.endsWith('.amzn.to') ||
    d.endsWith('.a.co')
  );
}

export function isOfferMeliLaHost(hostname: string): boolean {
  const d = getDomain(hostname);
  return d === 'meli.la' || d.endsWith('.meli.la');
}

export type OfferStoreFlags = { isAmazon: boolean; isMercadoLibre: boolean };

/**
 * Hostname de entrada + host tras redirect. Gana el destino final si es inequívoco.
 * Nunca usa item ids del path.
 */
export function resolveOfferStoreFlags(inputHost: string, pageHost: string): OfferStoreFlags {
  const inputMl = isOfferMercadoLibreHost(inputHost);
  const pageMl = isOfferMercadoLibreHost(pageHost);
  const inputAmz = isOfferAmazonHost(inputHost);
  const pageAmz = isOfferAmazonHost(pageHost);

  if (pageMl && !pageAmz) return { isAmazon: false, isMercadoLibre: true };
  if (pageAmz && !pageMl) return { isAmazon: true, isMercadoLibre: false };
  if (inputMl && !inputAmz) return { isAmazon: false, isMercadoLibre: true };
  if (inputAmz && !inputMl) return { isAmazon: true, isMercadoLibre: false };
  return { isAmazon: pageAmz || inputAmz, isMercadoLibre: pageMl || inputMl };
}

export function offerStoreLabelFromFlags(flags: OfferStoreFlags): 'Amazon' | 'Mercado Libre' | null {
  if (flags.isMercadoLibre && !flags.isAmazon) return 'Mercado Libre';
  if (flags.isAmazon && !flags.isMercadoLibre) return 'Amazon';
  if (flags.isMercadoLibre) return 'Mercado Libre';
  if (flags.isAmazon) return 'Amazon';
  return null;
}
