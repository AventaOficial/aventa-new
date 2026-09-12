/**
 * Extracción determinista de Product JSON-LD / meta mínima.
 * No inventa precio. No usa vision.
 */
import {
  joinProductBoundTexts,
  scanProductBoundPromotionText,
} from '@/lib/hunter/dealQualification/signals';

export type PublicProductCandidate = {
  url: string;
  title: string | null;
  price: number | null;
  originalPrice: number | null;
  currency: string | null;
  image: string | null;
  productId: string | null;
  brand: string | null;
  availability: string | null;
  category: string | null;
  explicitDiscountPercent?: number | null;
  explicitSavings?: number | null;
  promotionType?: string | null;
  promotionBoundToProduct?: boolean;
  priceValidUntil?: string | null;
  /** false si AggregateOffer low≠high (rango, no tachado). */
  priceReliable?: boolean;
};

function finitePositive(n: unknown): number | null {
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
  if (typeof n === 'string') {
    const v = Number(n.replace(/,/g, '').trim());
    if (Number.isFinite(v) && v > 0) return Math.round(v * 100) / 100;
  }
  return null;
}

function walk(node: unknown, visit: (o: Record<string, unknown>) => void) {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const x of node) walk(x, visit);
    return;
  }
  if (typeof node !== 'object') return;
  const o = node as Record<string, unknown>;
  visit(o);
  if (o['@graph']) walk(o['@graph'], visit);
  if (o.itemListElement) walk(o.itemListElement, visit);
  if (o.item) walk(o.item, visit);
}

function typeStr(o: Record<string, unknown>): string {
  const t = o['@type'];
  return Array.isArray(t) ? t.map(String).join(',') : String(t ?? '');
}

function extractOfferPrices(offers: unknown): {
  price: number | null;
  originalPrice: number | null;
  currency: string | null;
  availability: string | null;
  explicitDiscountPercent: number | null;
  priceValidUntil: string | null;
  offerText: string;
  priceReliable: boolean;
} {
  let price: number | null = null;
  let originalPrice: number | null = null;
  let currency: string | null = null;
  let availability: string | null = null;
  let explicitDiscountPercent: number | null = null;
  let priceValidUntil: string | null = null;
  let priceReliable = true;
  const offerTexts: string[] = [];

  const consider = (off: Record<string, unknown>) => {
    const t = typeStr(off);
    const isAgg = t.includes('AggregateOffer');
    if (isAgg) {
      const low = finitePositive(off.lowPrice);
      const high = finitePositive(off.highPrice);
      if (low != null && high != null && low !== high) priceReliable = false;
      // high/low de AggregateOffer es rango, no original vs current.
    } else {
      price = price ?? finitePositive(off.price);
    }
    if (typeof off.priceCurrency === 'string') currency = currency ?? off.priceCurrency;
    if (typeof off.availability === 'string') availability = availability ?? off.availability;
    if (typeof off.priceValidUntil === 'string') priceValidUntil = priceValidUntil ?? off.priceValidUntil;
    const disc =
      finitePositive(off.discount) ??
      finitePositive(off.discountPercentage) ??
      finitePositive(off.discountPercent);
    if (disc != null && disc > 0 && disc < 100) explicitDiscountPercent = explicitDiscountPercent ?? disc;
    if (typeof off.name === 'string') offerTexts.push(off.name);
    if (typeof off.description === 'string') offerTexts.push(off.description);
    if (off.priceSpecification && typeof off.priceSpecification === 'object') {
      const spec = off.priceSpecification as Record<string, unknown>;
      price = price ?? finitePositive(spec.price);
      if (typeof spec.priceCurrency === 'string') currency = currency ?? spec.priceCurrency;
      const ref = finitePositive(spec.referencePrice) ?? finitePositive(spec.listPrice);
      if (ref != null) originalPrice = originalPrice ?? ref;
    }
  };

  const empty = {
    price,
    originalPrice,
    currency,
    availability,
    explicitDiscountPercent,
    priceValidUntil,
    offerText: '',
    priceReliable,
  };
  if (!offers) return empty;
  if (Array.isArray(offers)) {
    for (const o of offers) if (o && typeof o === 'object') consider(o as Record<string, unknown>);
  } else if (typeof offers === 'object') {
    const o = offers as Record<string, unknown>;
    consider(o);
    if (o.offers) {
      const nested = extractOfferPrices(o.offers);
      price = price ?? nested.price;
      originalPrice = originalPrice ?? nested.originalPrice;
      currency = currency ?? nested.currency;
      availability = availability ?? nested.availability;
      explicitDiscountPercent = explicitDiscountPercent ?? nested.explicitDiscountPercent;
      priceValidUntil = priceValidUntil ?? nested.priceValidUntil;
      if (nested.offerText) offerTexts.push(nested.offerText);
      if (!nested.priceReliable) priceReliable = false;
    }
  }
  if (originalPrice != null && price != null && originalPrice <= price) originalPrice = null;
  return {
    price,
    originalPrice,
    currency,
    availability,
    explicitDiscountPercent,
    priceValidUntil,
    offerText: offerTexts.join(' · '),
    priceReliable,
  };
}

export function parseJsonLdProducts(html: string, pageUrl: string): PublicProductCandidate[] {
  const out: PublicProductCandidate[] = [];
  const blocks = [
    ...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];
  for (const m of blocks) {
    const raw = m[1]?.trim();
    if (!raw || raw.length > 800_000) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    walk(parsed, (o) => {
      if (!typeStr(o).includes('Product')) return;
      const name = typeof o.name === 'string' ? o.name.trim() : null;
      const url =
        (typeof o['@id'] === 'string' && o['@id'].startsWith('http') ? o['@id'] : null) ||
        (typeof o.url === 'string' ? o.url : null) ||
        pageUrl;
      const image =
        typeof o.image === 'string'
          ? o.image
          : Array.isArray(o.image) && typeof o.image[0] === 'string'
            ? o.image[0]
            : o.image && typeof o.image === 'object' && typeof (o.image as { url?: string }).url === 'string'
              ? (o.image as { url: string }).url
              : null;
      const brand =
        typeof o.brand === 'string'
          ? o.brand
          : o.brand && typeof o.brand === 'object' && typeof (o.brand as { name?: string }).name === 'string'
            ? (o.brand as { name: string }).name
            : null;
      const asId = (v: unknown): string | null => {
        if (typeof v === 'string' && v.trim()) return v.trim();
        if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v));
        return null;
      };
      let productId =
        asId(o.sku) || asId(o.mpn) || asId(o.gtin) || asId(o.productID) || asId(o.productId);
      if (!productId) {
        const fromUrl = url.match(/-(\d+)(?:\/p)?\/?(?:$|\?)/i);
        if (fromUrl?.[1]) productId = fromUrl[1];
      }
      const offer = extractOfferPrices(o.offers);
      const boundText = joinProductBoundTexts([
        name,
        typeof o.description === 'string' ? o.description : null,
        offer.offerText,
      ]);
      const promo = scanProductBoundPromotionText(boundText);
      out.push({
        url,
        title: name,
        price: offer.priceReliable ? offer.price : null,
        originalPrice: offer.originalPrice,
        currency: offer.currency,
        image,
        productId,
        brand,
        availability: offer.availability,
        category: typeof o.category === 'string' ? o.category : null,
        explicitDiscountPercent: offer.explicitDiscountPercent ?? promo.explicitDiscountPercent,
        explicitSavings: promo.explicitSavings,
        promotionType: promo.kind,
        promotionBoundToProduct:
          promo.kind != null || promo.explicitDiscountPercent != null || promo.explicitSavings != null,
        priceValidUntil: offer.priceValidUntil,
        priceReliable: offer.priceReliable,
      });
    });
  }
  const deduped = dedupeProducts(out);
  return bindProductsToPage(deduped, pageUrl);
}

function canonicalPath(raw: string): string {
  try {
    const u = new URL(raw);
    return u.pathname.replace(/\/+$/, '').toLowerCase();
  } catch {
    return raw.split('?')[0]?.toLowerCase() ?? raw;
  }
}

function dedupeProducts(products: PublicProductCandidate[]): PublicProductCandidate[] {
  const seen = new Set<string>();
  const out: PublicProductCandidate[] = [];
  for (const p of products) {
    const key = canonicalPath(p.url) || p.productId || p.title || '';
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function bindProductsToPage(products: PublicProductCandidate[], pageUrl: string): PublicProductCandidate[] {
  const pagePath = canonicalPath(pageUrl);
  const isPdp = /\/p(?:\/|$)/i.test(pagePath);
  if (!isPdp || products.length <= 1) return products;
  const matched = products.filter((p) => {
    const path = canonicalPath(p.url);
    if (path && path === pagePath) return true;
    if (p.productId && pagePath.includes(p.productId.replace(/^0+/, ''))) return true;
    return false;
  });
  return matched.length > 0 ? matched : products.slice(0, 1);
}

/** Señales de challenge/anti-bot — no intentar evadir. */
export function detectBotChallenge(html: string, status: number): boolean {
  if (status === 401 || status === 403) return true;
  const head = html.slice(0, 12_000);
  return /px-captcha|captcha|bot.?detect|access denied|identity.?challenge|blocked/i.test(head);
}
