import { extractAmazonAsin } from '@/lib/offers/offerUrlFingerprint';
import { extractMercadoLibreItemId } from '@/lib/offers/resolveMercadoLibreItem';

/** Tope de un pegado. Suficiente para un dump de cazador; evita timeouts. */
export const OFFER_BATCH_MAX = 25;

const URL_RE = /https?:\/\/[^\s<>"'`)\]\}]+/gi;

function stripTrailingJunk(raw: string): string {
  return raw.trim().replace(/[.,;:!?)]+$/g, '');
}

/** Imágenes pegadas junto a la oferta no son una segunda oferta. */
export function isEmbeddedAssetUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (
      host.includes('media-amazon.') ||
      host.includes('images-amazon.') ||
      host.includes('ssl-images-amazon.') ||
      host.includes('mlstatic.com') ||
      host.includes('fbcdn.net')
    ) {
      return true;
    }
    return /\.(?:jpg|jpeg|png|webp|gif|avif)(?:$)/i.test(u.pathname);
  } catch {
    return false;
  }
}

export function offerBatchIdentityKey(url: string): string {
  const asin = extractAmazonAsin(url);
  if (asin) return `amz:${asin}`;
  const ml = extractMercadoLibreItemId(url);
  if (ml) return `ml:${ml}`;
  try {
    const u = new URL(url);
    return `u:${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * Saca URLs de un texto mezclado (dump de cazador, lista, o párrafo).
 * Dedup por ASIN / id ML / path. No valida tienda: eso lo hace parse + create.
 */
export function extractOfferUrlsFromText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const matches = String(text ?? '').match(URL_RE) ?? [];
  for (const raw of matches) {
    const href = stripTrailingJunk(raw).replace(/^http:/i, 'https:');
    if (!href.startsWith('https://')) continue;
    try {
      const u = new URL(href);
      if (u.protocol !== 'https:') continue;
      if (!u.hostname.includes('.')) continue;
      if (isEmbeddedAssetUrl(u.toString())) continue;
    } catch {
      continue;
    }
    const key = offerBatchIdentityKey(href);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(href);
    if (out.length >= OFFER_BATCH_MAX) break;
  }
  return out;
}
