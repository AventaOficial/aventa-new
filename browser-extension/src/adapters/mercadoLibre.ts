import type { ExtractedProduct, StoreAdapter } from '../types/product';
import { parsePriceText } from '../lib/parsePrice';
import { sanitizePreviewText } from '../lib/normalize';

function getDomain(hostname: string): string {
  return hostname.replace(/^www\./, '').toLowerCase();
}

export function isMercadoLibreProductUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const d = getDomain(u.hostname);
    if (!d.includes('mercadolibre') && !d.includes('mercadolivre')) return false;
    if (/\/p\/ML[A-Z]\d+/i.test(u.pathname)) return true;
    if (/articulo\.mercadolibre/i.test(u.hostname) && /ML[A-Z]\d+/i.test(u.pathname)) return true;
    return /MLM\d+/i.test(u.href) || /MLA\d+/i.test(u.href);
  } catch {
    return false;
  }
}

function extractMlmId(url: string): string | null {
  const m = url.match(/(ML[A-Z]\d{6,})/i);
  return m?.[1]?.toUpperCase() ?? null;
}

function getMeta(doc: Document, property: string): string | null {
  const el = doc.querySelector(`meta[property="${property}"], meta[name="${property}"]`);
  return el?.getAttribute('content')?.trim() || null;
}

function firstText(doc: Document, selectors: string[]): string | null {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    const text = el?.textContent?.trim();
    if (text) return text;
  }
  return null;
}

function extractMlPrices(doc: Document): { price: number | null; original: number | null } {
  const priceText =
    firstText(doc, [
      '.ui-pdp-price__second-line .andes-money-amount__fraction',
      '.ui-pdp-price__main .andes-money-amount__fraction',
      '[itemprop="price"]',
      '.price-tag-fraction',
    ]) ??
    getMeta(doc, 'product:price:amount') ??
    getMeta(doc, 'og:price:amount');

  const originalText = firstText(doc, [
    '.ui-pdp-price__original-value .andes-money-amount__fraction',
    's.ui-pdp-price__original-value',
    '.price-tag__previous-price',
  ]);

  return {
    price: parsePriceText(priceText),
    original: parsePriceText(originalText),
  };
}

export function extractMercadoLibreProduct(doc: Document, pageUrl: string): ExtractedProduct {
  const title = sanitizePreviewText(getMeta(doc, 'og:title') ?? firstText(doc, ['h1.ui-pdp-title'])) || null;
  const imageUrl = getMeta(doc, 'og:image');
  const { price, original } = extractMlPrices(doc);
  const productId = extractMlmId(pageUrl);
  const partial = !title || price == null;

  return {
    store: 'Mercado Libre',
    offerUrl: pageUrl,
    title,
    price,
    originalPrice: original,
    imageUrl,
    productId: productId,
    partial,
  };
}

export const mercadoLibreAdapter: StoreAdapter = {
  canHandle: isMercadoLibreProductUrl,
  getStoreName: () => 'Mercado Libre',
  extractProduct: extractMercadoLibreProduct,
};
