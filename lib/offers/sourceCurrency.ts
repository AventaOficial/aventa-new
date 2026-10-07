/**
 * Moneda de origen a partir del retailer, no del símbolo "$".
 * Solo hosts cuya página de precio es inequívocamente mexicana.
 * amazon.com, costco.com, mercadolibre.com.ar y acortadores (meli.la, link.amazon) quedan sin moneda.
 */

const MEXICAN_RETAILER_HOSTS = [
  'amazon.com.mx',
  'mercadolibre.com.mx',
  'mercadolibre.mx',
  'soriana.com',
  'costco.com.mx',
  'chedraui.com.mx',
  'cityclub.com.mx',
] as const;

function hostOf(rawUrl: string): string | null {
  try {
    return new URL(rawUrl.trim()).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

function isMexicanRetailerHost(host: string): boolean {
  return MEXICAN_RETAILER_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/** MXN cuando el enlace es de un retailer mexicano soportado. Si no, null. */
export function mexicanRetailerCurrency(rawUrl: string | null | undefined): 'MXN' | null {
  if (!rawUrl?.trim()) return null;
  const host = hostOf(rawUrl);
  if (!host || !isMexicanRetailerHost(host)) return null;
  return 'MXN';
}

/**
 * La columna gana si ya es un ISO de 3 letras.
 * Si está vacía, se deriva del host del enlace.
 */
export function resolveOfferSourceCurrency(
  stored: string | null | undefined,
  offerUrl?: string | null,
): string | null {
  const explicit = stored?.trim().toUpperCase() ?? '';
  if (/^[A-Z]{3}$/.test(explicit)) return explicit;
  return mexicanRetailerCurrency(offerUrl);
}
