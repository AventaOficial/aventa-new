import { parseJsonLdProducts } from '@/lib/hunter/dayToDay/parsePublicProductHtml';
import {
  absoluteUrl,
  extractOfferMetaImages,
  getMetaContent,
} from '@/lib/offers/parseOfferPageHtml';
import { selectOfferImages, isHighConfidenceJunkImage } from '@/lib/offers/selectOfferImages';
import { enrichRetailOfferFromHtml } from '@/lib/offers/enrichRetailOfferFromHtml';

export type CoppelExtractResult = {
  title: string | null;
  image: string | null;
  images: string[];
  store: 'Coppel';
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

function collectCoppelCdnImages(html: string, base: string): string[] {
  const out: string[] = [];
  const re =
    /(https?:\/\/(?:cdn|static|images)[^"'\\\s]*coppel[^"'\\\s]*\.(?:jpg|jpeg|webp|png))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (/sprite|logo|icon|1x1|pixel|favicon/i.test(m[1])) continue;
    pushUnique(out, absoluteUrl(base, m[1]));
    if (out.length >= 24) break;
  }
  return out;
}

export function extractCoppelProduct(html: string, pageUrl: string): CoppelExtractResult {
  const retail = enrichRetailOfferFromHtml(html, pageUrl);
  const products = parseJsonLdProducts(html, pageUrl);
  const primary = products[0] ?? null;

  const images: string[] = [];
  for (const u of collectJsonLdImages(html, pageUrl)) pushUnique(images, u);
  for (const u of collectCoppelCdnImages(html, pageUrl)) pushUnique(images, u);
  for (const u of extractOfferMetaImages(html, pageUrl)) pushUnique(images, u);
  if (retail.image) pushUnique(images, retail.image);

  const selected = selectOfferImages(images, {
    preferredCover: retail.image || primary?.image || null,
  });

  let discount = retail.suggestedDiscount ?? primary?.price ?? null;
  let original = retail.suggestedOriginal ?? primary?.originalPrice ?? null;
  if (original != null && discount != null && original <= discount) original = null;

  const title =
    retail.title ||
    primary?.title ||
    getMetaContent(html, 'og:title') ||
    getMetaContent(html, 'twitter:title') ||
    null;

  return {
    title: title?.trim() ? title.trim() : null,
    image: selected[0] ?? null,
    images: selected,
    store: 'Coppel',
    suggestedDiscount: discount,
    suggestedOriginal: original,
  };
}
