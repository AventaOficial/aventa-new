import { isChedrauiProductUrl } from '@/lib/offers/retailerProductUrl';

/**
 * Chedraui (VTEX). El HTML de la PDP no expone el producto de forma estable.
 * La propia web usa la búsqueda pública de catálogo por `linkText` (`/{slug}/p`).
 */

const CHEDRAUI_ORIGIN = 'https://www.chedraui.com.mx';

export type ChedrauiExtractResult = {
  title: string | null;
  image: string | null;
  images: string[];
  store: 'Chedraui';
  suggestedDiscount: number | null;
  suggestedOriginal: number | null;
};

function chedrauiLinkText(pageUrl: string): string | null {
  if (!isChedrauiProductUrl(pageUrl)) return null;
  const slug = new URL(pageUrl).pathname.match(/^\/([^/]+)\/p\/?$/i)?.[1] ?? null;
  return slug && /^[a-z0-9][a-z0-9-]*$/i.test(slug) ? slug.toLowerCase() : null;
}

export function chedrauiProductApiUrl(pageUrl: string): string | null {
  const slug = chedrauiLinkText(pageUrl);
  return slug ? `${CHEDRAUI_ORIGIN}/api/catalog_system/pub/products/search/${slug}/p` : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record).filter((x): x is Record<string, unknown> => x != null) : [];
}

function amount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

/** Null si la respuesta no es el producto de la URL. */
export function extractChedrauiProductFromApi(json: unknown, pageUrl: string): ChedrauiExtractResult | null {
  const slug = chedrauiLinkText(pageUrl);
  if (!slug) return null;
  const product = records(json).find((p) => typeof p.linkText === 'string' && p.linkText.toLowerCase() === slug);
  if (!product) return null;

  const items = records(product.items);
  const skuId = new URL(pageUrl).searchParams.get('skuId');
  const item = (skuId ? items.find((i) => String(i.itemId ?? '') === skuId) : items[0]) ?? null;
  const sellers = records(item?.sellers);
  const seller = sellers.find((s) => s.sellerDefault === true) ?? sellers[0] ?? null;
  const offer = record(seller?.commertialOffer);
  const price = offer && offer.IsAvailable !== false ? amount(offer.Price) : null;
  const list = price == null ? null : amount(offer?.ListPrice);

  const images: string[] = [];
  for (const img of records(item?.images)) {
    const url = typeof img.imageUrl === 'string' ? img.imageUrl.trim() : '';
    if (/^https:\/\//i.test(url) && !images.includes(url)) images.push(url);
  }
  const name = typeof product.productName === 'string' ? product.productName.trim() : '';
  return {
    title: name || null,
    image: images[0] ?? null,
    images,
    store: 'Chedraui',
    suggestedDiscount: price,
    suggestedOriginal: list != null && price != null && list > price ? list : null,
  };
}
