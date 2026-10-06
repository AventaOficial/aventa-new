import { offerUrlFingerprint } from '@/lib/offers/offerUrlFingerprint';
import type { ProductIdentity } from './types';

const STRONG_PREFIX = /^(amz|ml|liv):/;
const CAPACITY = /(\d+)\s*gb\b/i;
const SIZE = /talla\s*(\d+(?:[.,]\d+)?)/i;

/** Variante explícita en el título. null si el título no la declara. */
export function variantToken(title: string | null | undefined): string | null {
  const text = title?.trim() ?? '';
  if (!text) return null;
  const capacity = text.match(CAPACITY);
  if (capacity?.[1]) return `capacity:${capacity[1]}`;
  const size = text.match(SIZE);
  if (size?.[1]) return `size:${size[1].replace(',', '.')}`;
  return null;
}

/**
 * Identidad reutilizando el fingerprint de URL.
 * Solo ASIN, item de Mercado Libre o SKU de Liverpool son señales fuertes.
 * Un path genérico no alcanza para decir que es el mismo producto.
 */
export function identityFromOffer(input: {
  offerUrl: string | null | undefined;
  title?: string | null;
}): ProductIdentity {
  const url = input.offerUrl?.trim() ?? '';
  const key = url ? offerUrlFingerprint(url) : null;
  const variant = variantToken(input.title);
  if (!key) return { key: null, strength: 'none', variant };
  if (STRONG_PREFIX.test(key)) return { key, strength: 'strong', variant };
  if (key.startsWith('url:')) return { key, strength: 'listing', variant };
  return { key, strength: 'none', variant };
}
