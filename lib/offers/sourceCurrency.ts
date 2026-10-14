/**
 * Moneda de origen a partir del retailer, no del símbolo "$".
 * Solo hosts cuya página de precio es inequívocamente mexicana.
 * amazon.com, costco.com, mercadolibre.com.ar y acortadores (meli.la, link.amazon) quedan sin moneda.
 * También los dominios globales con ruta por país (zara.com, hm.com, samsung.com…) y lululemon.mx,
 * cuyo checkout de terceros puede cotizar en la moneda del visitante.
 */

const MEXICAN_RETAILER_HOSTS = [
  'amazon.com.mx',
  'mercadolibre.com.mx',
  'mercadolibre.mx',
  'soriana.com',
  'costco.com.mx',
  'chedraui.com.mx',
  'cityclub.com.mx',
  'walmart.com.mx',
  'liverpool.com.mx',
  'elektra.mx',
  'bodegaaurrera.com.mx',
  'sams.com.mx',
  'farmaciasguadalajara.com',
  'fahorro.com',
  'farmaciasanpablo.com.mx',
  'benavides.com.mx',
  'asics.com.mx',
  'newbalancemexico.com',
  'underarmour.com.mx',
  'converse.com.mx',
  'crocs.com.mx',
  'hoka.mx',
  'mx.puma.com',
  'vans.com.mx',
  'skechers.com.mx',
  'marti.mx',
  'flexi.com.mx',
  'cuadra.com.mx',
  'mx.tommy.com',
  'calvinklein.mx',
  'levi.com.mx',
  'guess.mx',
  'sephora.com.mx',
  'ulta.com.mx',
  'sallymexico.com',
  'fragancias.com.mx',
  'store.sony.com.mx',
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
/** ISO 4217 de tres letras. Un símbolo o un texto libre no cuenta como moneda. */
export function isoCurrencyCode(raw: string | null | undefined): string | null {
  const explicit = raw?.trim().toUpperCase() ?? '';
  return /^[A-Z]{3}$/.test(explicit) ? explicit : null;
}

/**
 * Moneda que se puede mostrar y guardar.
 * La divisa explícita de una API gana. Si no hay, solo el host inequívoco.
 * El nombre de la tienda no confirma MXN.
 */
export function confirmedExtractionCurrency(input: {
  apiCurrency?: string | null;
  pageUrl?: string | null;
}): string | null {
  return isoCurrencyCode(input.apiCurrency) ?? mexicanRetailerCurrency(input.pageUrl);
}

export function resolveOfferSourceCurrency(
  stored: string | null | undefined,
  offerUrl?: string | null,
): string | null {
  return confirmedExtractionCurrency({ apiCurrency: stored, pageUrl: offerUrl });
}

/**
 * Moneda de la vista previa al subir. Un enlace corto (meli.la, link.amazon) no dice la tienda,
 * pero el análisis del enlace ya la confirmó sobre la ficha expandida, igual que el servidor al guardar.
 * Solo vale si ese análisis es del enlace que sigue en el formulario.
 */
export function uploadPreviewCurrency(input: {
  offerUrl: string;
  parsed: { url: string; currency: string | null } | null;
}): string | null {
  const parsedCurrency =
    input.parsed && input.parsed.url === input.offerUrl ? isoCurrencyCode(input.parsed.currency) : null;
  return parsedCurrency ?? resolveOfferSourceCurrency(null, input.offerUrl);
}
