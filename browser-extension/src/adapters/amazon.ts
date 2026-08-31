import type { ExtractedProduct, StoreAdapter } from '../types/product';
import { parsePriceText } from '../lib/parsePrice';
import { sanitizePreviewText } from '../lib/normalize';

function getDomain(hostname: string): string {
  return hostname.replace(/^www\./, '').toLowerCase();
}

export function isAmazonProductUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const d = getDomain(u.hostname);
    if (!d.includes('amazon.')) return false;
    if (/\/dp\/[A-Z0-9]{10}/i.test(u.pathname)) return true;
    if (/\/gp\/product\//i.test(u.pathname)) return true;
    if (/\/gp\/aw\/d\//i.test(u.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

function extractAsin(url: string): string | null {
  const m = url.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i);
  return m?.[1]?.toUpperCase() ?? null;
}

function firstText(doc: Document, selectors: string[]): string | null {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    const text = el?.textContent?.trim();
    if (text) return text;
  }
  return null;
}

function firstAttr(doc: Document, selectors: string[], attr: string): string | null {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    const val = el?.getAttribute(attr)?.trim();
    if (val) return val;
  }
  return null;
}

function getMeta(doc: Document, property: string): string | null {
  const el = doc.querySelector(`meta[property="${property}"], meta[name="${property}"]`);
  return el?.getAttribute('content')?.trim() || null;
}

function extractAmazonPrices(doc: Document): { price: number | null; original: number | null } {
  const priceText =
    firstText(doc, [
      '#corePrice_feature_div .a-price .a-offscreen',
      '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '#price_inside_buybox',
      '.priceToPay .a-offscreen',
      '#tp_price_block_total_price_ww .a-offscreen',
    ]) ?? firstAttr(doc, ['#corePrice_feature_div .a-price', '.priceToPay'], 'content');

  const originalText =
    firstText(doc, [
      '#corePrice_feature_div .basisPrice .a-offscreen',
      'span.a-price[data-a-strike="true"] .a-offscreen',
      '#listPrice',
      '.a-text-price .a-offscreen',
    ]) ?? null;

  return {
    price: parsePriceText(priceText),
    original: parsePriceText(originalText),
  };
}

export function extractAmazonProduct(doc: Document, pageUrl: string): ExtractedProduct {
  const title =
    sanitizePreviewText(
      firstText(doc, ['#productTitle', '#title', 'h1#title']) ?? getMeta(doc, 'og:title'),
    ) || null;

  const imageUrl =
    firstAttr(doc, ['#landingImage', '#imgBlkFront', '#main-image'], 'src') ??
    getMeta(doc, 'og:image');

  const { price, original } = extractAmazonPrices(doc);
  const asin = extractAsin(pageUrl);
  const partial = !title || price == null;

  return {
    store: 'Amazon',
    offerUrl: pageUrl,
    title,
    price,
    originalPrice: original,
    imageUrl,
    productId: asin,
    partial,
  };
}

export const amazonAdapter: StoreAdapter = {
  canHandle: isAmazonProductUrl,
  getStoreName: () => 'Amazon',
  extractProduct: extractAmazonProduct,
};
