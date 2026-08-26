import { isBlockedOfferParseUrl } from '@/lib/server/fetchUrlSafety';

const MAX_IMAGES = 12;

export function getMetaContent(html: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const propertyMatch = html.match(
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`, 'i'),
  );
  if (propertyMatch) return propertyMatch[1].trim() || null;
  const contentFirstMatch = html.match(
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'),
  );
  return contentFirstMatch ? contentFirstMatch[1].trim() || null : null;
}

export function getAllMetaContents(html: string, selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const out: string[] = [];
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
    'gi',
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const v = m[1].trim();
    if (v) out.push(v);
  }
  return out;
}

export function getById(html: string, id: string, attr: 'content' | 'src' | 'text'): string | null {
  const idEsc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (attr === 'text') {
    const m = html.match(new RegExp(`<[^>]+id=["']${idEsc}["'][^>]*>([\\s\\S]*?)<\\/`, 'i'));
    return m ? m[1].replace(/<[^>]+>/g, '').trim() || null : null;
  }
  const m = html.match(new RegExp(`<[^>]+id=["']${idEsc}["'][^>]+${attr}=["']([^"']*)["']`, 'i'));
  if (m) return m[1].trim() || null;
  const m2 = html.match(new RegExp(`<[^>]+${attr}=["']([^"']*)["'][^>]+id=["']${idEsc}["']`, 'i'));
  return m2 ? m2[1].trim() || null : null;
}

export function absoluteUrl(base: string, path: string | null): string | null {
  if (!path || !path.trim()) return null;
  const trimmed = path.trim().replace(/\\u002F/g, '/').replace(/\\\//g, '/');
  let href: string;
  if (/^https?:\/\//i.test(trimmed)) href = trimmed;
  else {
    try {
      href = new URL(trimmed, base).href;
    } catch {
      return null;
    }
  }
  try {
    const u = new URL(href);
    if (isBlockedOfferParseUrl(u).blocked) return null;
    if (!/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u.pathname) && !/mlstatic|media-amazon|ssl-images-amazon|http2\.mlstatic/i.test(u.hostname)) {
      if (!/images|img|static|cdn/i.test(u.hostname + u.pathname)) return u.href;
    }
    return u.href;
  } catch {
    return null;
  }
}

export function parsePositiveLocalizedNumber(raw: string | null | undefined): number | null {
  if (!raw || !String(raw).trim()) return null;
  const clean = String(raw).replace(/[^\d,.-]/g, '').trim();
  if (!clean) return null;
  const hasComma = clean.includes(',');
  const hasDot = clean.includes('.');
  let normalized = clean;
  if (hasComma && hasDot) {
    if (clean.lastIndexOf('.') > clean.lastIndexOf(',')) {
      normalized = clean.replace(/,/g, '');
    } else {
      normalized = clean.replace(/\./g, '').replace(',', '.');
    }
  } else if (hasComma && !hasDot) {
    const parts = clean.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      normalized = `${parts[0].replace(/,/g, '')}.${parts[1]}`;
    } else {
      normalized = clean.replace(/,/g, '');
    }
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parsePositiveNumber(raw: string | null | undefined): number | null {
  if (!raw || !String(raw).trim()) return null;
  const n = parseFloat(String(raw).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function extractJsonLikeNumber(html: string, field: string): number | null {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match =
    html.match(new RegExp(`["']${escaped}["']\\s*:\\s*["']([^"']+)["']`, 'i'))?.[1] ??
    html.match(new RegExp(`["']${escaped}["']\\s*:\\s*([0-9][0-9.,]*)`, 'i'))?.[1] ??
    null;
  return parsePositiveLocalizedNumber(match);
}

export type ExtractedPrices = { discount: number | null; original: number | null };

/** Precio visible en ficha Amazon. Evita el primer `"price":749` (umbral de envío gratis, widgets). */
export function extractAmazonDomPrices(html: string): ExtractedPrices {
  if (!/a-price|data-asin-price|priceAmount|productTitle/i.test(html)) {
    return { discount: null, original: null };
  }
  const core =
    html.match(/id="corePrice(?:Display)?(?:_desktop)?_feature_div"[\s\S]{0,4000}/i)?.[0] ??
    html.match(/class="[^"]*priceToPay[^"]*"[\s\S]{0,1200}/i)?.[0] ??
    '';
  const scope = core || html;
  const offscreen = parsePositiveLocalizedNumber(scope.match(/a-offscreen[^>]*>([^<]{1,40})/i)?.[1]);
  const whole = scope.match(/a-price-whole[^>]*>([0-9.,]+)/i)?.[1];
  const frac = scope.match(/a-price-fraction[^>]*>([0-9]{1,2})/i)?.[1];
  let fromWhole: number | null = null;
  if (whole) {
    const combined = frac ? `${whole.replace(/<[^>]+>/g, '')}.${frac}` : whole;
    fromWhole = parsePositiveLocalizedNumber(combined);
  }
  const asinPrice = parsePositiveLocalizedNumber(html.match(/data-asin-price=["']([^"']+)["']/i)?.[1]);
  const priceAmount = parsePositiveLocalizedNumber(html.match(/"priceAmount"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i)?.[1]);
  const displayPrice = parsePositiveLocalizedNumber(html.match(/"displayPrice"\s*:\s*"([^"]+)"/i)?.[1]);
  const discount = offscreen ?? fromWhole ?? asinPrice ?? priceAmount ?? displayPrice;
  const list =
    parsePositiveLocalizedNumber(html.match(/basisPrice[\s\S]{0,400}?a-offscreen[^>]*>([^<]+)/i)?.[1]) ??
    parsePositiveLocalizedNumber(html.match(/"listPrice"\s*:\s*"([^"]+)"/i)?.[1]);
  return {
    discount,
    original: list != null && discount != null && list > discount ? list : null,
  };
}

export function amazonHtmlMatchesAsin(html: string, asin: string): boolean {
  return html.toUpperCase().includes(asin.toUpperCase());
}

function collectLdJson(html: string): unknown[] {
  const out: unknown[] = [];
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw || raw.length > 500_000) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      /* inválido */
    }
  }
  return out;
}

function walkLd(node: unknown, visit: (o: Record<string, unknown>, typeStr: string) => void) {
  if (node == null) return;
  if (Array.isArray(node)) {
    node.forEach((n) => walkLd(n, visit));
    return;
  }
  if (typeof node !== 'object') return;
  const o = node as Record<string, unknown>;
  if (o['@graph']) walkLd(o['@graph'], visit);
  const types = o['@type'];
  const typeStr = Array.isArray(types) ? types.map(String).join(',') : String(types ?? '');
  visit(o, typeStr);
  if (o.offers) walkLd(o.offers, visit);
}

export function extractSuggestedPrices(html: string): ExtractedPrices {
  let discount: number | null = null;
  let original: number | null = parsePositiveNumber(getMetaContent(html, 'product:original_price:amount'));

  for (const parsed of collectLdJson(html)) {
    walkLd(parsed, (o, typeStr) => {
      if (!typeStr.includes('Offer') && !typeStr.includes('AggregateOffer')) return;
      const low = o.lowPrice;
      const high = o.highPrice;
      const p = o.price;
      if (typeof low === 'number' && low > 0) discount = discount ?? low;
      else if (typeof low === 'string') discount = discount ?? parsePositiveLocalizedNumber(low);
      if (typeof p === 'number' && p > 0) discount = discount ?? p;
      else if (typeof p === 'string') discount = discount ?? parsePositiveLocalizedNumber(p);
      if (typeof high === 'number' && high > 0) original = original ?? high;
      else if (typeof high === 'string') original = original ?? parsePositiveLocalizedNumber(high);
    });
  }

  if (discount == null) {
    discount = parsePositiveLocalizedNumber(html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i)?.[1]);
  }
  const amazonDom = extractAmazonDomPrices(html);
  if (amazonDom.discount) discount = amazonDom.discount;
  if (amazonDom.original) original = amazonDom.original || original;
  if (original == null) {
    original =
      extractJsonLikeNumber(html, 'original_price') ||
      extractJsonLikeNumber(html, 'priceBefore') ||
      parsePositiveLocalizedNumber(html.match(/["']basisPrice["']\s*:\s*["']([^"']+)["']/i)?.[1]) ||
      parsePositiveLocalizedNumber(html.match(/["']listPrice["']\s*:\s*["']([^"']+)["']/i)?.[1]);
  }

  const mlDom = extractMercadoLibreDomPrices(html);
  if (mlDom.discount) discount = mlDom.discount;
  if (mlDom.original) original = mlDom.original;

  if (discount == null && /productTitle|andes-money-amount|ld\+json/i.test(html)) {
    discount =
      parsePositiveLocalizedNumber(getMetaContent(html, 'product:price:amount')) ||
      parsePositiveLocalizedNumber(getMetaContent(html, 'og:price:amount'));
  }

  if (original != null && discount != null && original < discount) {
    const tmp = original;
    original = discount;
    discount = tmp;
  }
  return { discount, original };
}

function pushUnique(list: string[], url: string | null) {
  if (!url) return;
  const clean = url.split('?')[0] ?? url;
  if (list.some((u) => u.split('?')[0] === clean || u === url)) return;
  if (list.length >= MAX_IMAGES) return;
  list.push(url);
}

function unescapeJsonUrl(raw: string): string {
  return raw.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/\\"/g, '"');
}

export function extractOfferImages(html: string, base: string): string[] {
  const images: string[] = [];

  for (const raw of getAllMetaContents(html, 'og:image')) {
    pushUnique(images, absoluteUrl(base, raw));
  }
  pushUnique(images, absoluteUrl(base, getMetaContent(html, 'og:image:secure_url')));
  pushUnique(images, absoluteUrl(base, getMetaContent(html, 'twitter:image')));
  pushUnique(images, absoluteUrl(base, getById(html, 'landingImage', 'src')));

  for (const parsed of collectLdJson(html)) {
    walkLd(parsed, (o, typeStr) => {
      if (!typeStr.includes('Product') && !typeStr.includes('ImageObject')) return;
      const img = o.image ?? o.url;
      const add = (v: unknown) => {
        if (typeof v === 'string') pushUnique(images, absoluteUrl(base, v));
        else if (v && typeof v === 'object' && 'url' in (v as object)) {
          pushUnique(images, absoluteUrl(base, String((v as { url?: unknown }).url ?? '')));
        }
      };
      if (Array.isArray(img)) img.forEach(add);
      else add(img);
    });
  }

  const hiResRe = /"hiRes"\s*:\s*"(https?:\\?\/\\?\/[^"]+)"/gi;
  let hm: RegExpExecArray | null;
  while ((hm = hiResRe.exec(html)) !== null) {
    pushUnique(images, absoluteUrl(base, unescapeJsonUrl(hm[1])));
  }

  const largeRe = /"large"\s*:\s*"(https?:\\?\/\\?\/m\.media-amazon\.com[^"]+)"/gi;
  while ((hm = largeRe.exec(html)) !== null) {
    pushUnique(images, absoluteUrl(base, unescapeJsonUrl(hm[1])));
  }

  const mlPicRe = /"secure_url"\s*:\s*"(https?:\\?\/\\?\/[^"]*mlstatic[^"]+)"/gi;
  while ((hm = mlPicRe.exec(html)) !== null) {
    pushUnique(images, absoluteUrl(base, unescapeJsonUrl(hm[1])));
  }
  const mlUrlRe = /"url"\s*:\s*"(https?:\\?\/\\?\/http2\.mlstatic\.com[^"]+)"/gi;
  while ((hm = mlUrlRe.exec(html)) !== null) {
    pushUnique(images, absoluteUrl(base, unescapeJsonUrl(hm[1])));
  }

  const mlCdnRe = /(https?:\/\/http2\.mlstatic\.com\/D_(?:NQ_NP_2X_)?[A-Za-z0-9_-]+\.(?:jpg|jpeg|webp|png))/gi;
  while ((hm = mlCdnRe.exec(html)) !== null) {
    const u = hm[1];
    if (/D_NQ_NP_2X_|-F\.|-O\./i.test(u)) pushUnique(images, absoluteUrl(base, u));
  }

  const amzIRe = /(https?:\/\/[^"'\\\s]*media-amazon\.com\/images\/I\/[A-Za-z0-9,._%+-]+)/gi;
  while ((hm = amzIRe.exec(html)) !== null) {
    const u = hm[1];
    if (/_AC_US\d{1,2}_|_SS\d{1,2}_|_SR\d+,\d+|sprite|grey-pixel|1x1/i.test(u)) continue;
    pushUnique(images, absoluteUrl(base, u));
  }

  const oldHiresRe = /data-old-hires=["'](https?:[^"']+)["']/gi;
  while ((hm = oldHiresRe.exec(html)) !== null) {
    pushUnique(images, absoluteUrl(base, hm[1]));
  }

  const altImgRe = /id=["']altImages["'][\s\S]{0,8000}/i;
  const altBlock = html.match(altImgRe)?.[0];
  if (altBlock) {
    const srcRe = /(?:src|data-src)=["'](https?:[^"']+media-amazon[^"']+)["']/gi;
    while ((hm = srcRe.exec(altBlock)) !== null) {
      if (/_AC_US\d{1,2}_|_SS\d{1,2}_/i.test(hm[1])) continue;
      pushUnique(images, absoluteUrl(base, hm[1]));
    }
  }

  // Galería Amazon (mismo JSON que usan scrapers tipo PromoDescuentos)
  const colorImagesBlocks = [
    html.match(/["']colorImages["']\s*:\s*(\{[\s\S]*?\})\s*,\s*["']colorToAsin["']/i)?.[1],
    html.match(/["']colorImages["']\s*:\s*(\{[\s\S]{0,120000}?\})\s*[,}]/i)?.[1],
  ].filter(Boolean) as string[];
  for (const block of colorImagesBlocks) {
    const hi = /["'](?:hiRes|large|mainUrl|thumb)["']\s*:\s*["'](https?:[^"']+)["']/gi;
    let cm: RegExpExecArray | null;
    while ((cm = hi.exec(block)) !== null) {
      const u = unescapeJsonUrl(cm[1]);
      if (/sprite|grey-pixel|1x1|_US\d{1,2}_|_SS\d{1,2}_/i.test(u)) continue;
      pushUnique(images, absoluteUrl(base, u));
    }
  }

  const imageGalleryRe = /["']imageGalleryData["']\s*:\s*(\[[\s\S]{0,80000}?\])/i;
  const galleryRaw = html.match(imageGalleryRe)?.[1];
  if (galleryRaw) {
    const mainRe = /["']mainUrl["']\s*:\s*["'](https?:[^"']+)["']/gi;
    while ((hm = mainRe.exec(galleryRaw)) !== null) {
      pushUnique(images, absoluteUrl(base, unescapeJsonUrl(hm[1])));
    }
  }

  return images.slice(0, MAX_IMAGES);
}

export function extractBreadcrumbs(html: string): string[] {
  const crumbs: string[] = [];
  const itemRe = /itemprop=["']name["'][^>]*>([^<]+)</gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(html)) !== null) {
    const t = m[1].replace(/&amp;/g, '&').trim();
    if (t && t.length < 80) crumbs.push(t);
  }
  return crumbs.slice(0, 8);
}

function normalizeMlId(raw: string): string {
  return raw.replace(/-/g, '').toUpperCase();
}

export function extractMercadoLibreItemId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const directId =
      url.searchParams.get('wid') || url.searchParams.get('item_id') || url.searchParams.get('itemId');
    if (directId && /^ML[A-Z]{0,3}-?\d+$/i.test(directId.trim())) return normalizeMlId(directId.trim());

    const pdpFilters = url.searchParams.get('pdp_filters');
    const fromFilters = pdpFilters?.match(/item_id:(ML[A-Z]{0,3}-?\d+)/i)?.[1];
    if (fromFilters) return normalizeMlId(fromFilters);

    const fromPath = url.pathname.match(/\/((?:ML[A-Z]{1,3})-?\d{6,})(?:[/?#-]|$)/i)?.[1];
    return fromPath ? normalizeMlId(fromPath) : null;
  } catch {
    return null;
  }
}

export function extractMercadoLibreItemIdFromHtml(html: string): string | null {
  const canonical =
    html.match(/rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] ??
    html.match(/href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1];
  if (canonical) {
    const fromCanonical = extractMercadoLibreItemId(canonical);
    if (fromCanonical) return fromCanonical;
  }
  const fromJson =
    html.match(/["'](?:item_id|itemId|catalog_product_id)["']\s*:\s*["'](ML[A-Z]{0,3}-?\d+)["']/i)?.[1] ??
    html.match(/\/((?:ML[A-Z]{1,3})-?\d{6,})/i)?.[1];
  return fromJson ? normalizeMlId(fromJson) : null;
}

/** Precios visibles en el HTML de Mercado Libre (fracción + precio tachado). */
export function extractMercadoLibreDomPrices(html: string): ExtractedPrices {
  const previous = html.match(
    /andes-money-amount--previous[\s\S]{0,500}?andes-money-amount__fraction[^>]*>([0-9.]+)/i,
  )?.[1];
  const current = html.match(/andes-money-amount__fraction[^>]*>([0-9.]+)/i)?.[1];
  const mxnPrice = html.match(/"price"\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*"currency_id"\s*:\s*"MXN"/i)?.[1];
  const mxnOriginal = html.match(/"original_price"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i)?.[1];
  return {
    discount: parsePositiveLocalizedNumber(mxnPrice) ?? parsePositiveLocalizedNumber(current),
    original: parsePositiveLocalizedNumber(mxnOriginal) ?? parsePositiveLocalizedNumber(previous),
  };
}
