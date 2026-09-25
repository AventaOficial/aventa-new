import { parseJsonLdProducts } from '@/lib/hunter/dayToDay/parsePublicProductHtml';
import {
  absoluteUrl,
  extractOfferMetaImages,
  getMetaContent,
} from '@/lib/offers/parseOfferPageHtml';
import { selectOfferImages, isHighConfidenceJunkImage } from '@/lib/offers/selectOfferImages';
import { enrichRetailOfferFromHtml } from '@/lib/offers/enrichRetailOfferFromHtml';

export type LiverpoolExtractResult = {
  title: string | null;
  image: string | null;
  images: string[];
  store: 'Liverpool';
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

/** CDN Liverpool embebido (sscdn) — solo URLs http(s) explícitas, no scrape agresivo. */
function collectLiverpoolCdnImages(html: string, base: string): string[] {
  const out: string[] = [];
  const re =
    /(https?:\/\/(?:sscdn|assetscdn)\.liverpool\.com\.mx\/[^\s"'<>]+?\.(?:jpg|jpeg|webp|png))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const u = m[1];
    if (/sprite|logo|icon|1x1|pixel|favicon/i.test(u)) continue;
    pushUnique(out, absoluteUrl(base, u));
    if (out.length >= 24) break;
  }
  return out;
}

function liverpoolTestIdBlock(html: string, testId: 'discounted' | 'original'): string | null {
  const marker = `data-testid="${testId}"`;
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const rest = html.slice(start, start + 900);
  const next = rest.slice(marker.length).search(/data-testid="/);
  return next >= 0 ? rest.slice(0, next + marker.length) : rest;
}

/** Precio SSR de Liverpool: `$<!-- -->2,969` + centavos en `<span class="invisible">.</span>10`. */
function moneyFromLiverpoolBlock(block: string | null): number | null {
  if (!block) return null;
  const major = block.match(/\$\s*(?:<!--\s*-->)?\s*(\d{1,3}(?:,\d{3})+|\d+)/);
  if (!major?.[1]) return null;
  const cents = block.match(/invisible">\.<\/span>\s*(\d{2})/);
  const n = Number(`${major[1].replace(/,/g, '')}${cents?.[1] ? `.${cents[1]}` : ''}`);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function extractLiverpoolDomPrices(html: string): {
  discount: number | null;
  original: number | null;
} {
  return {
    discount: moneyFromLiverpoolBlock(liverpoolTestIdBlock(html, 'discounted')),
    original: moneyFromLiverpoolBlock(liverpoolTestIdBlock(html, 'original')),
  };
}

/**
 * Extracción Liverpool estilo Amazon: JSON-LD multi-image → CDN estructurado → meta.
 */
export function extractLiverpoolProduct(html: string, pageUrl: string): LiverpoolExtractResult {
  const retail = enrichRetailOfferFromHtml(html, pageUrl);
  const products = parseJsonLdProducts(html, pageUrl);
  const primary = products[0] ?? null;

  const images: string[] = [];
  for (const u of collectJsonLdImages(html, pageUrl)) pushUnique(images, u);
  for (const u of collectLiverpoolCdnImages(html, pageUrl)) pushUnique(images, u);
  for (const u of extractOfferMetaImages(html, pageUrl)) pushUnique(images, u);
  if (retail.image) pushUnique(images, retail.image);

  const selected = selectOfferImages(images, {
    preferredCover: retail.image || primary?.image || null,
  });

  const dom = extractLiverpoolDomPrices(html);
  const discount = retail.suggestedDiscount ?? primary?.price ?? dom.discount;
  let original = retail.suggestedOriginal ?? primary?.originalPrice ?? dom.original;
  if (original != null && discount != null && original <= discount) original = null;

  const title =
    (typeof retail.title === 'string' ? retail.title : null) ||
    (typeof primary?.title === 'string' ? primary.title : null) ||
    getMetaContent(html, 'og:title') ||
    getMetaContent(html, 'twitter:title') ||
    html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ||
    null;

  return {
    title: typeof title === 'string' && title.trim() ? title.trim() : null,
    image: selected[0] ?? null,
    images: selected,
    store: 'Liverpool',
    suggestedDiscount: discount,
    suggestedOriginal: original,
  };
}
