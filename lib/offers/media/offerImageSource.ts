import { isNextImageAllowedSrc } from '@/lib/offers/isNextImageAllowedSrc';

/**
 * CDNs que rechazan el Referer de AVENTA y a los que el optimizador de Next no llega
 * (Soriana: Cloudflare bloquea el Referer y `/_next/image` responde 400).
 * Se cargan siempre directo con `<img referrerPolicy="no-referrer">`, nunca vía remotePatterns.
 */
const DIRECT_NO_REFERRER_HOST_SUFFIXES = ['soriana.com'] as const;

export type OfferImageSource = { url: string; optimized: boolean };

function hostMatches(hostname: string, suffix: string): boolean {
  const h = hostname.toLowerCase();
  return h === suffix || h.endsWith(`.${suffix}`);
}

/** URLs guardadas con `&amp;` literal (meta HTML sin decodificar) → `&`. */
export function normalizeOfferImageUrl(src: string | null | undefined): string {
  const url = typeof src === 'string' ? src.trim() : '';
  if (!url || !/^https?:\/\//i.test(url)) return url;
  return url.replace(/&amp;/gi, '&');
}

export function offerImageHost(src: string | null | undefined): string | null {
  const url = typeof src === 'string' ? src.trim() : '';
  if (!url) return null;
  if (url.startsWith('/')) return 'self';
  try {
    return new URL(url).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

export function isDirectNoReferrerImageHost(hostname: string | null | undefined): boolean {
  if (!hostname) return false;
  return DIRECT_NO_REFERRER_HOST_SUFFIXES.some((suffix) => hostMatches(hostname, suffix));
}

/**
 * Criterio único para fotos de oferta (tarjeta, detalle, miniaturas, galería):
 * - hosts de `remotePatterns` → next/image;
 * - cualquier otro https (y los CDNs que bloquean Referer) → `<img>` directo sin Referer;
 * - el resto → sin foto.
 */
export function resolveOfferImageSource(src: string | null | undefined): OfferImageSource | null {
  const url = normalizeOfferImageUrl(src);
  if (!url) return null;
  const isHttps = /^https:\/\//i.test(url);
  if (isHttps && isDirectNoReferrerImageHost(offerImageHost(url))) return { url, optimized: false };
  if (isNextImageAllowedSrc(url)) return { url, optimized: true };
  return isHttps ? { url, optimized: false } : null;
}

/**
 * Una imagen que falló antes de hidratar no vuelve a disparar `onError`.
 * `complete && naturalWidth === 0` es la huella de ese fallo; los SVG sin tamaño intrínseco
 * también dan 0, así que se excluyen.
 */
export function isImageElementBroken(
  img: Pick<HTMLImageElement, 'complete' | 'naturalWidth' | 'currentSrc' | 'src'> | null | undefined,
): boolean {
  if (!img || !img.complete) return false;
  const src = img.currentSrc || img.src || '';
  if (!src) return false;
  if (/\.svg(?:[?#]|$)/i.test(src)) return false;
  return img.naturalWidth === 0;
}
