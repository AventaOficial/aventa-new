import {
  extractMercadoLibreItemId,
  resolveMercadoLibreItem,
} from '@/lib/offers/resolveMercadoLibreItem';
import { fetchMlApi, type FetchMlApiResult } from '@/lib/integrations/mercadolibre/apiClient';
import {
  mergeMlImageCandidates,
  mlImageCandidatesToUrls,
  picturesFromMlApiBody,
  picturesFromMlVariations,
  type MlImageCandidate,
} from '@/lib/offers/mlImageProvenance';
import { extractMercadoLibreItemIdFromHtml } from '@/lib/offers/parseOfferPageHtml';
import { resolveMercadoLibrePrice } from '@/lib/offers/resolveMercadoLibrePrice';

export type MercadoLibreOfferSource = 'ml_api' | 'anonymous';

export type MercadoLibrePublicOffer = {
  title: string | null;
  price: number | null;
  originalPrice: number | null;
  currency: string | null;
  priceSource: string | null;
  pictures: string[];
  pictureCandidates: MlImageCandidate[];
  categoryId: string | null;
  pathNames: string[];
  permalink: string | null;
  canonicalUrl: string | null;
  itemId: string | null;
  catalogProductId: string | null;
  source: MercadoLibreOfferSource;
};

type MlItemBody = {
  error?: string;
  title?: string;
  price?: number;
  original_price?: number;
  permalink?: string;
  category_id?: string;
  pictures?: Array<{ id?: string; secure_url?: string; url?: string }>;
  variations?: Array<{ picture_ids?: string[] }>;
};

type MlProductBody = {
  error?: string;
  name?: string;
  permalink?: string;
  pictures?: Array<{ id?: string; url?: string }>;
  buy_box_winner?: { price?: number; original_price?: number; item_id?: string };
};

function unwrapMlApi(result: FetchMlApiResult): { data: unknown | null; authenticated: boolean } {
  if (result.ok) return { data: result.data, authenticated: result.authenticated };
  if (result.timedOut) {
    const err = new Error('ml_api_timeout');
    err.name = 'AbortError';
    throw err;
  }
  return { data: null, authenticated: result.authenticated };
}

async function fetchJson(path: string): Promise<{ data: unknown | null; authenticated: boolean }> {
  return unwrapMlApi(await fetchMlApi(path));
}

function isUsableItem(item: MlItemBody | null): item is MlItemBody {
  return Boolean(item && !item.error && (item.title || item.pictures?.length));
}

/** Combina dos respuestas ML (API + HTML) sin perder fotos únicas del mismo item. */
export function mergeMercadoLibrePublicOffers(
  a: MercadoLibrePublicOffer,
  b: MercadoLibrePublicOffer,
): MercadoLibrePublicOffer {
  const toCandidates = (offer: MercadoLibrePublicOffer): MlImageCandidate[] => {
    if (offer.pictureCandidates?.length) return offer.pictureCandidates;
    const source = offer.source === 'ml_api' ? 'ml_api' : 'og';
    return (offer.pictures ?? []).map((url, index) => ({
      url,
      source,
      sourceItemId: offer.itemId,
      pictureId: null,
      isPrimary: index === 0,
    }));
  };
  const itemId = a.itemId ?? b.itemId;
  const mergedCandidates = mergeMlImageCandidates([[...toCandidates(a), ...toCandidates(b)]], {
    sourceItemId: itemId,
    minApiToSkipFallback: 1,
  });
  return {
    title: a.title || b.title,
    price: a.price ?? b.price,
    originalPrice: a.originalPrice ?? b.originalPrice,
    currency: a.currency || b.currency,
    priceSource: a.priceSource || b.priceSource,
    pictures: mlImageCandidatesToUrls(mergedCandidates),
    pictureCandidates: mergedCandidates,
    categoryId: a.categoryId || b.categoryId,
    pathNames: a.pathNames.length >= b.pathNames.length ? a.pathNames : b.pathNames,
    permalink: a.permalink || b.permalink,
    canonicalUrl: a.canonicalUrl || b.canonicalUrl,
    itemId,
    catalogProductId: a.catalogProductId || b.catalogProductId,
    source: a.source === 'ml_api' || b.source === 'ml_api' ? 'ml_api' : 'anonymous',
  };
}

export async function fetchMercadoLibrePublicOffer(
  rawUrl: string,
  html?: string | null,
): Promise<MercadoLibrePublicOffer | null> {
  const resolved =
    resolveMercadoLibreItem(rawUrl) ??
    (html
      ? (() => {
          const fromHtml = extractMercadoLibreItemIdFromHtml(html);
          return fromHtml ? resolveMercadoLibreItem(`https://mercadolibre.com.mx/${fromHtml}`) : null;
        })()
      : null);

  const id =
    resolved?.itemId ??
    extractMercadoLibreItemId(rawUrl) ??
    (html ? extractMercadoLibreItemIdFromHtml(html) : null);
  if (!id) return null;

  const catalogProductId = resolved?.catalogProductId ?? null;
  let usedAuthenticatedApi = false;
  const pictureCandidates: MlImageCandidate[] = [];

  const itemPath = `/items/${encodeURIComponent(id)}`;
  const productPath = `/products/${encodeURIComponent(catalogProductId ?? id)}`;

  const [itemFetch, productFetch] = await Promise.all([fetchJson(itemPath), fetchJson(productPath)]);
  if (itemFetch.authenticated || productFetch.authenticated) usedAuthenticatedApi = true;

  const item = itemFetch.data as MlItemBody | null;
  const product = productFetch.data as MlProductBody | null;

  let title: string | null = null;
  let categoryId: string | null = null;
  let permalink: string | null = null;

  if (isUsableItem(item)) {
    title = typeof item.title === 'string' ? item.title : null;
    pictureCandidates.push(...picturesFromMlApiBody(item, id));
    pictureCandidates.push(...picturesFromMlVariations(item, id));
    categoryId = typeof item.category_id === 'string' ? item.category_id : null;
    permalink = typeof item.permalink === 'string' ? item.permalink : null;
  }

  if (product && !product.error) {
    title = title || (typeof product.name === 'string' ? product.name : null);
    permalink = permalink || (typeof product.permalink === 'string' ? product.permalink : null);
    pictureCandidates.push(...picturesFromMlApiBody(product, id));
  }

  // Precio: resolver oficial único (prices → sale_price → products/items exact match).
  // No usar price/original_price deprecados de /items como fuente primaria.
  const priceResolution = await resolveMercadoLibrePrice({
    itemId: id,
    siteId: resolved?.siteId,
    catalogProductId,
  });
  if (priceResolution.status === 'resolved') usedAuthenticatedApi = true;

  const price = priceResolution.price;
  const originalPrice = priceResolution.originalPrice;

  const pathNames: string[] = [];
  if (categoryId) {
    const catFetch = await fetchJson(`/categories/${encodeURIComponent(categoryId)}`);
    if (catFetch.authenticated) usedAuthenticatedApi = true;
    const cat = catFetch.data as {
      path_from_root?: Array<{ name?: string }>;
    } | null;
    for (const n of cat?.path_from_root ?? []) {
      if (n?.name) pathNames.push(n.name);
    }
  }

  const mergedCandidates = mergeMlImageCandidates([pictureCandidates], { sourceItemId: id });
  const pictures = mlImageCandidatesToUrls(mergedCandidates);

  const canonicalUrl =
    permalink ||
    resolved?.canonicalUrl ||
    (catalogProductId
      ? `https://www.mercadolibre.com.mx/p/${catalogProductId}?wid=${id}`
      : null);

  if (!title && !price && pictures.length === 0) return null;
  return {
    title,
    price,
    originalPrice,
    currency: priceResolution.currency,
    priceSource: priceResolution.resolvedBy,
    pictures,
    pictureCandidates: mergedCandidates,
    categoryId,
    pathNames,
    permalink,
    canonicalUrl,
    itemId: id,
    catalogProductId,
    source: usedAuthenticatedApi ? 'ml_api' : 'anonymous',
  };
}
