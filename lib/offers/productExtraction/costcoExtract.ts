import { isCostcoMxProductUrl } from '@/lib/offers/retailerProductUrl';

/**
 * Costco MX (SAP Commerce). La PDP es una SPA: el HTML no trae título, precio ni fotos.
 * La propia web los lee de `/rest/v2/mexico/products/{código}`, que es público.
 */

const COSTCO_ORIGIN = 'https://www.costco.com.mx';
const IMAGE_FORMATS = ['zoom', 'product'] as const;

export type CostcoExtractResult = {
  title: string | null;
  image: string | null;
  images: string[];
  store: 'Costco';
  suggestedDiscount: number | null;
  suggestedOriginal: number | null;
};

function costcoProductCode(pageUrl: string): string | null {
  if (!isCostcoMxProductUrl(pageUrl)) return null;
  return new URL(pageUrl).pathname.match(/\/p\/(\d{4,})\/?$/i)?.[1] ?? null;
}

export function costcoProductApiUrl(pageUrl: string): string | null {
  const code = costcoProductCode(pageUrl);
  return code ? `${COSTCO_ORIGIN}/rest/v2/mexico/products/${code}?lang=es_MX&curr=MXN` : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function mxnAmount(value: unknown): number | null {
  const price = record(value);
  if (!price || price.currencyIso !== 'MXN') return null;
  const n = price.value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function costcoImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const entries = value
    .map(record)
    .filter((img): img is Record<string, unknown> => img != null)
    .filter((img) => img.imageType === 'PRIMARY' || img.imageType === 'GALLERY')
    .filter((img) => typeof img.url === 'string' && /^\/medias\//.test(img.url));
  const out: string[] = [];
  const indexOf = (img: Record<string, unknown>) => (typeof img.galleryIndex === 'number' ? img.galleryIndex : 0);
  const indexes = [...new Set(entries.map(indexOf))].sort((a, b) => a - b);
  for (const index of indexes) {
    const atIndex = entries.filter((img) => indexOf(img) === index);
    const best = IMAGE_FORMATS.map((format) => atIndex.find((img) => img.format === format)).find(Boolean);
    if (!best) continue;
    const url = new URL(String(best.url), COSTCO_ORIGIN).toString();
    if (!out.includes(url)) out.push(url);
  }
  return out;
}

/** Null si la respuesta no es el producto de la URL. */
export function extractCostcoProductFromApi(json: unknown, pageUrl: string): CostcoExtractResult | null {
  const code = costcoProductCode(pageUrl);
  const product = record(json);
  if (!code || !product || String(product.code ?? '') !== code) return null;

  const name = typeof product.name === 'string' ? product.name.trim() : '';
  const price = product.hidePriceValue === true ? null : mxnAmount(product.price);
  const base = price == null ? null : mxnAmount(product.basePrice);
  const images = costcoImages(product.images);
  return {
    title: name || null,
    image: images[0] ?? null,
    images,
    store: 'Costco',
    suggestedDiscount: price,
    suggestedOriginal: base != null && price != null && base > price ? base : null,
  };
}
