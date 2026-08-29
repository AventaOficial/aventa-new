/**
 * URLs de oferta: Mercado Libre y Amazon con atribución.
 * Prioridad: tag del **creador** (si existe) → tag de plataforma (env).
 * Así el 40% atribuible se puede conciliar por tag en el ledger.
 */
import { applyPlatformAffiliateTags } from '@/lib/affiliate/applyPlatformAffiliateTags';

const RESOLVE_TIMEOUT_MS = 12_000;
const RESOLVE_USER_AGENT =
  'Mozilla/5.0 (compatible; AVENTA-OfferUrl/1.0; +https://aventaofertas.com)';

export type OfferCreatorAffiliateTags = {
  mlTag?: string | null;
  amazonTag?: string | null;
};

/** Normaliza URLs pegadas desde apps móviles (sin https, espacios, caracteres invisibles). */
export function normalizePastedOfferUrl(raw: string): string {
  let s = raw.trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s.replace(/^\/\//, '')}`;
  }
  return s;
}

/** Enlaces cortos del programa de colaboradores (redirigen a articulo.mercadolibre…). */
export function isMeliLaShortUrl(url: string): boolean {
  try {
    const h = new URL(url.trim()).hostname.toLowerCase();
    return h === 'meli.la' || h.endsWith('.meli.la');
  } catch {
    return false;
  }
}

function isMercadoLibreOfferUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes('mercadolibre.')) return true;
  return isMeliLaShortUrl(url);
}

export function isAmazonOfferUrl(url: string): boolean {
  try {
    const h = new URL(url.trim()).hostname.toLowerCase();
    return h.includes('amazon.') || h === 'amzn.to' || h === 'a.co';
  } catch {
    return false;
  }
}

export function applyMercadoLibreAffiliateTag(url: string, tag: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('tag', tag);
    return parsed.toString();
  } catch {
    return url;
  }
}

export function applyAmazonAssociateTag(url: string, tag: string): string {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (!h.includes('amazon.') && h !== 'amzn.to' && h !== 'a.co') return url;
    u.searchParams.set('tag', tag);
    return u.toString();
  } catch {
    return url;
  }
}

/** Tag de afiliado de AVENTA en ML (mismo valor en servidor y cliente si usas NEXT_PUBLIC). */
export function getPlatformMercadoLibreAffiliateTag(): string | null {
  const t =
    process.env.ML_AFFILIATE_TAG?.trim() ||
    process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG?.trim();
  return t || null;
}

export function getPlatformAmazonAssociateTag(): string | null {
  const t =
    process.env.AMAZON_ASSOCIATE_TAG?.trim() ||
    process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG?.trim();
  return t || null;
}

/**
 * Sigue redirecciones HTTP (p. ej. meli.la/xxx → articulo.mercadolibre.com.mx/…).
 * Si falla la red o no es destino ML, devuelve la URL original.
 */
export async function resolveMercadoLibreShortlinks(url: string): Promise<string> {
  const { isBlockedOfferParseUrl } = await import('@/lib/server/fetchUrlSafety');
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (!isMeliLaShortUrl(trimmed)) return trimmed;

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return trimmed;
  }
  if (isBlockedOfferParseUrl(u).blocked) return trimmed;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
  try {
    const res = await fetch(trimmed, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': RESOLVE_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timeoutId);
    const final = res.url;
    if (!final || final === trimmed) return trimmed;
    let finalUrl: URL;
    try {
      finalUrl = new URL(final);
    } catch {
      return trimmed;
    }
    if (isBlockedOfferParseUrl(finalUrl).blocked) return trimmed;
    if (!final.toLowerCase().includes('mercadolibre.')) return trimmed;
    // meli.la puede redirigir a /social/… sin item id en la URL; igual es destino ML válido.
    if (isMeliLaShortUrl(trimmed)) return final;
    const { extractMercadoLibreItemId } = await import('@/lib/offers/offerUrlFingerprint');
    if (!extractMercadoLibreItemId(final) && !extractMercadoLibreItemId(trimmed)) {
      return trimmed;
    }
    return final;
  } catch {
    clearTimeout(timeoutId);
    return trimmed;
  }
}

/** Acortadores de Associates (redirigen a amazon.* /dp/…). */
export function isAmazonShortUrl(url: string): boolean {
  try {
    const h = new URL(url.trim()).hostname.toLowerCase();
    return h === 'amzn.to' || h === 'a.co';
  } catch {
    return false;
  }
}

/**
 * Sigue redirecciones HTTP (amzn.to, a.co → amazon.*).
 * Si falla la red o el destino no es Amazon, devuelve la URL original.
 */
export async function resolveAmazonShortlinks(url: string): Promise<string> {
  const { isBlockedOfferParseUrl } = await import('@/lib/server/fetchUrlSafety');
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (!isAmazonShortUrl(trimmed)) return trimmed;

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return trimmed;
  }
  if (isBlockedOfferParseUrl(u).blocked) return trimmed;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
  try {
    const res = await fetch(trimmed, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': RESOLVE_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timeoutId);
    const final = res.url;
    if (!final || final === trimmed) return trimmed;
    let finalUrl: URL;
    try {
      finalUrl = new URL(final);
    } catch {
      return trimmed;
    }
    if (isBlockedOfferParseUrl(finalUrl).blocked) return trimmed;
    if (!final.toLowerCase().includes('amazon.')) return trimmed;
    const { extractAmazonAsin } = await import('@/lib/offers/offerUrlFingerprint');
    if (!extractAmazonAsin(final) && extractAmazonAsin(trimmed) == null) {
      // Captcha / home de Amazon: no sustituir el shortlink por la portada.
      return trimmed;
    }
    return final;
  } catch {
    clearTimeout(timeoutId);
    return trimmed;
  }
}

/** Normaliza en memoria (tags de plataforma por dominio); no resuelve meli.la. */
export function normalizeMercadoLibreOfferUrlForStorage(url: string): string {
  return applyPlatformAffiliateTags(url);
}

export { isMercadoLibreOfferUrl };

function normalizeCreatorTags(
  creatorTags?: string | OfferCreatorAffiliateTags | null,
): OfferCreatorAffiliateTags {
  if (creatorTags == null) return {};
  if (typeof creatorTags === 'string') return { mlTag: creatorTags };
  return creatorTags;
}

/**
 * URL final al abrir CTA: siempre tags de plataforma Aventa.
 * Los tags del creador ya no sobrescriben la monetización del sitio.
 */
export function buildOfferUrl(offerUrl: string | null | undefined): string {
  const url = offerUrl?.trim();
  if (!url) return '';
  return applyPlatformAffiliateTags(url);
}
