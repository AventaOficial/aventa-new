import { parseJsonLdProducts } from '@/lib/hunter/dayToDay/parsePublicProductHtml';
import {
  absoluteUrl,
  extractOfferMetaImages,
  getMetaContent,
} from '@/lib/offers/parseOfferPageHtml';
import { selectOfferImages, isHighConfidenceJunkImage } from '@/lib/offers/selectOfferImages';
import { enrichRetailOfferFromHtml } from '@/lib/offers/enrichRetailOfferFromHtml';

export type WalmartExtractResult = {
  title: string | null;
  image: string | null;
  images: string[];
  store: 'Walmart';
  suggestedDiscount: number | null;
  suggestedOriginal: number | null;
};

function pushUnique(list: string[], url: string | null | undefined) {
  if (!url || typeof url !== 'string') return;
  const u = url.trim();
  if (!/^https?:\/\//i.test(u)) return;
  if (isHighConfidenceJunkImage(u)) return;
  const key = u.split('?')[0] ?? u;
  if (list.some((x) => (x.split('?')[0] ?? x) === key || x === u)) return;
  list.push(u);
}

function collectJsonLdImages(html: string, base: string): string[] {
  const out: string[] = [];
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
    const visit = (node: unknown) => {
      if (node == null) return;
      if (Array.isArray(node)) {
        for (const x of node) visit(x);
        return;
      }
      if (typeof node !== 'object') return;
      const o = node as Record<string, unknown>;
      const t = o['@type'];
      const typeStr = Array.isArray(t) ? t.map(String).join(',') : String(t ?? '');
      if (typeStr.includes('Product')) {
        const img = o.image;
        const add = (v: unknown) => {
          if (typeof v === 'string') pushUnique(out, absoluteUrl(base, v));
          else if (v && typeof v === 'object' && 'url' in (v as object)) {
            pushUnique(out, absoluteUrl(base, String((v as { url?: unknown }).url ?? '')));
          }
        };
        if (Array.isArray(img)) img.forEach(add);
        else add(img);
      }
      if (o['@graph']) visit(o['@graph']);
    };
    visit(parsed);
  }
  return out;
}

/** Extrae URLs de imagen desde __NEXT_DATA__ (Walmart Next.js). */
function collectNextDataImages(html: string, base: string): string[] {
  const out: string[] = [];
  const m = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!m?.[1]) return out;
  let data: unknown;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return out;
  }

  const walk = (node: unknown, depth: number) => {
    if (depth > 14 || node == null) return;
    if (Array.isArray(node)) {
      for (const x of node) walk(x, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    const o = node as Record<string, unknown>;

    // imageInfo.allImages[{url}] / allImages string[]
    if (o.allImages && Array.isArray(o.allImages)) {
      for (const img of o.allImages) {
        if (typeof img === 'string') pushUnique(out, absoluteUrl(base, img));
        else if (img && typeof img === 'object') {
          const url =
            (img as { url?: unknown }).url ??
            (img as { src?: unknown }).src ??
            (img as { imageUrl?: unknown }).imageUrl;
          if (typeof url === 'string') pushUnique(out, absoluteUrl(base, url));
        }
      }
    }
    if (typeof o.thumbnailUrl === 'string') pushUnique(out, absoluteUrl(base, o.thumbnailUrl));
    if (typeof o.imageUrl === 'string') pushUnique(out, absoluteUrl(base, o.imageUrl));

    for (const v of Object.values(o)) {
      if (v && typeof v === 'object') walk(v, depth + 1);
    }
  };
  walk(data, 0);
  return out;
}

function collectNextDataPrices(html: string): {
  discount: number | null;
  original: number | null;
} {
  const m = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!m?.[1]) return { discount: null, original: null };
  let data: unknown;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return { discount: null, original: null };
  }

  let discount: number | null = null;
  let original: number | null = null;

  const asPrice = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.round(v * 100) / 100;
    if (typeof v === 'string') {
      const n = Number(v.replace(/,/g, '').trim());
      if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
    }
    return null;
  };

  const walk = (node: unknown, depth: number) => {
    if (depth > 14 || node == null || (discount != null && original != null)) return;
    if (Array.isArray(node)) {
      for (const x of node) walk(x, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    if (o.priceInfo && typeof o.priceInfo === 'object') {
      const pi = o.priceInfo as Record<string, unknown>;
      const cur =
        asPrice((pi.currentPrice as { price?: unknown } | undefined)?.price) ??
        asPrice(pi.currentPrice);
      const was =
        asPrice((pi.wasPrice as { price?: unknown } | undefined)?.price) ??
        asPrice(pi.wasPrice) ??
        asPrice((pi.listPrice as { price?: unknown } | undefined)?.price);
      if (cur != null) discount = discount ?? cur;
      if (was != null) original = original ?? was;
    }
    for (const v of Object.values(o)) {
      if (v && typeof v === 'object') walk(v, depth + 1);
    }
  };
  walk(data, 0);
  if (original != null && discount != null && original <= discount) original = null;
  return { discount, original };
}

function collectNextDataTitle(html: string): string | null {
  const m = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!m?.[1]) return null;
  let data: unknown;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return null;
  }
  const product = (data as { props?: { pageProps?: { initialData?: { data?: { product?: { name?: unknown } } } } } })
    ?.props?.pageProps?.initialData?.data?.product;
  if (product && typeof product.name === 'string' && product.name.trim()) {
    return product.name.trim();
  }
  return null;
}

/**
 * Extracción Walmart estilo Amazon: JSON-LD → __NEXT_DATA__ → meta → ranking.
 */
export function extractWalmartProduct(html: string, pageUrl: string): WalmartExtractResult {
  const base = pageUrl;
  const retail = enrichRetailOfferFromHtml(html, pageUrl);
  const products = parseJsonLdProducts(html, pageUrl);
  const primary = products[0] ?? null;

  const images: string[] = [];
  for (const u of collectJsonLdImages(html, base)) pushUnique(images, u);
  for (const u of collectNextDataImages(html, base)) pushUnique(images, u);
  for (const u of extractOfferMetaImages(html, base)) pushUnique(images, u);
  if (retail.image) pushUnique(images, retail.image);

  const selected = selectOfferImages(images, {
    preferredCover: retail.image || primary?.image || null,
  });

  const nextPrices = collectNextDataPrices(html);
  let discount = retail.suggestedDiscount ?? primary?.price ?? nextPrices.discount;
  let original = retail.suggestedOriginal ?? primary?.originalPrice ?? nextPrices.original;
  if (original != null && discount != null && original <= discount) original = null;

  const title =
    retail.title ||
    primary?.title ||
    collectNextDataTitle(html) ||
    getMetaContent(html, 'og:title') ||
    getMetaContent(html, 'twitter:title') ||
    null;

  return {
    title: title && title.trim() ? title.trim().replace(/\s*\|\s*Walmart.*$/i, '').trim() : null,
    image: selected[0] ?? null,
    images: selected,
    store: 'Walmart',
    suggestedDiscount: discount,
    suggestedOriginal: original,
  };
}
