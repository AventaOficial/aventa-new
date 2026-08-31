/**
 * URLs de oferta: tags de plataforma Aventa + sub-id Rewards cuando la red lo permite.
 */
import { applyPlatformAffiliateTags } from '@/lib/affiliate/applyPlatformAffiliateTags';
import {
  applyAdapterOutboundTracking,
  type OutboundTrackingContext,
} from '@/lib/rewards/adapters/types';

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
  const { fetchFollowingRedirectsSafely } = await import('@/lib/server/fetchUrlSafety');
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (!isMeliLaShortUrl(trimmed)) return trimmed;

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return trimmed;
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
  try {
    const result = await fetchFollowingRedirectsSafely(u.toString(), {
      timeoutMs: RESOLVE_TIMEOUT_MS,
      method: 'GET',
      requireHttps: true,
      requireAllowlist: true,
      signal: controller.signal,
      headers: {
        'User-Agent': RESOLVE_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!result.ok) return trimmed;
    const final = result.finalUrl;
    if (!final || final === trimmed) return trimmed;
    let finalUrl: URL;
    try {
      finalUrl = new URL(final);
    } catch {
      return trimmed;
    }
    if (!isMercadoLibreOfferUrl(finalUrl.toString())) return trimmed;
    if (isMeliLaShortUrl(trimmed)) return final;
    const { extractMercadoLibreItemId } = await import('@/lib/offers/offerUrlFingerprint');
    if (!extractMercadoLibreItemId(final) && !extractMercadoLibreItemId(trimmed)) {
      return trimmed;
    }
    return final;
  } catch {
    return trimmed;
  } finally {
    clearTimeout(timeoutId);
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
  const { fetchFollowingRedirectsSafely } = await import('@/lib/server/fetchUrlSafety');
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (!isAmazonShortUrl(trimmed)) return trimmed;

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return trimmed;
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
  try {
    const result = await fetchFollowingRedirectsSafely(u.toString(), {
      timeoutMs: RESOLVE_TIMEOUT_MS,
      method: 'GET',
      requireHttps: true,
      requireAllowlist: true,
      signal: controller.signal,
      headers: {
        'User-Agent': RESOLVE_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!result.ok) return trimmed;
    const final = result.finalUrl;
    if (!final || final === trimmed) return trimmed;
    let finalUrl: URL;
    try {
      finalUrl = new URL(final);
    } catch {
      return trimmed;
    }
    if (!isAmazonOfferUrl(finalUrl.toString())) return trimmed;
    const { extractAmazonAsin } = await import('@/lib/offers/offerUrlFingerprint');
    if (!extractAmazonAsin(final) && extractAmazonAsin(trimmed) == null) {
      return trimmed;
    }
    return final;
  } catch {
    return trimmed;
  } finally {
    clearTimeout(timeoutId);
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
 * URL final al abrir CTA: tags de plataforma Aventa + sub-id cuando la red lo permite.
 */
export function buildOfferUrl(
  offerUrl: string | null | undefined,
  tracking?: OutboundTrackingContext,
): string {
  const url = offerUrl?.trim();
  if (!url) return '';
  const tagged = applyPlatformAffiliateTags(url);
  if (tracking?.offerId && tracking?.clickId) {
    return applyAdapterOutboundTracking(tagged, tracking);
  }
  return tagged;
}
