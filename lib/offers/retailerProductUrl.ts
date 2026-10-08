import { offerUrlFingerprint } from '@/lib/offers/offerUrlFingerprint';

/**
 * PDP de retailers soportados.
 * Amazon y Mercado Libre usan la huella fuerte (ASIN / item).
 * Soriana y Costco usan el path real de producto observado en catálogo.
 * Un host permitido sin path de producto no pasa.
 */

function hostOf(rawUrl: string): { host: string; pathname: string } | null {
  try {
    const url = new URL(rawUrl.trim());
    return {
      host: url.hostname.replace(/^www\./i, '').toLowerCase(),
      pathname: url.pathname,
    };
  } catch {
    return null;
  }
}

function hostIs(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

/** https://www.soriana.com/{slug}/{id}.html */
export function isSorianaProductUrl(rawUrl: string): boolean {
  const parsed = hostOf(rawUrl);
  if (!parsed || !hostIs(parsed.host, 'soriana.com')) return false;
  return /\/\d{5,}\.html$/i.test(parsed.pathname);
}

/** https://www.costco.com.mx/{categorías}/{nombre}/p/{id} */
export function isCostcoMxProductUrl(rawUrl: string): boolean {
  const parsed = hostOf(rawUrl);
  if (!parsed || !hostIs(parsed.host, 'costco.com.mx')) return false;
  return /\/p\/\d{4,}\/?$/i.test(parsed.pathname);
}

/** https://www.chedraui.com.mx/{slug}/p */
export function isChedrauiProductUrl(rawUrl: string): boolean {
  const parsed = hostOf(rawUrl);
  if (!parsed || !hostIs(parsed.host, 'chedraui.com.mx')) return false;
  return /\/[^/]+\/p\/?$/i.test(parsed.pathname);
}

export function isSupportedRetailerProductUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  const fingerprint = offerUrlFingerprint(trimmed);
  if (fingerprint && (fingerprint.startsWith('amz:') || fingerprint.startsWith('ml:'))) return true;
  return isSorianaProductUrl(trimmed) || isCostcoMxProductUrl(trimmed) || isChedrauiProductUrl(trimmed);
}

export type OfferPageKind = 'PRODUCT' | 'CATEGORY' | 'SEARCH' | 'HOME' | 'UNKNOWN';

const KNOWN_RETAILER = [
  'amazon.',
  'mercadolibre.',
  'meli.la',
  'soriana.com',
  'chedraui.com.mx',
  'costco.com.mx',
];

/** Clasifica la página sin fetch. Un PDP usa las reglas de producto ya existentes. */
export function classifyOfferPageKind(rawUrl: string): OfferPageKind {
  const parsed = hostOf(rawUrl);
  if (!parsed) return 'UNKNOWN';
  const path = parsed.pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return 'HOME';
  if (isSupportedRetailerProductUrl(rawUrl)) return 'PRODUCT';
  const known = KNOWN_RETAILER.some((fragment) => parsed.host.includes(fragment) || hostIs(parsed.host, fragment));
  if (!known) return 'UNKNOWN';
  if (/^\/(s|search|buscar|busqueda|jm\/search)(\/|$)/i.test(parsed.pathname) || /\/search(\/|$)/i.test(parsed.pathname)) {
    return 'SEARCH';
  }
  return 'CATEGORY';
}
