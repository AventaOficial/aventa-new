import {
  extractMercadoLibreItemId,
  extractMercadoLibreItemIdFromHtml,
} from '@/lib/offers/parseOfferPageHtml';
import { fetchMlApi } from '@/lib/integrations/mercadolibre/apiClient';

export type MercadoLibreOfferSource = 'ml_api' | 'anonymous';

export type MercadoLibrePublicOffer = {
  title: string | null;
  price: number | null;
  originalPrice: number | null;
  pictures: string[];
  categoryId: string | null;
  pathNames: string[];
  source: MercadoLibreOfferSource;
};

type MlItemBody = {
  error?: string;
  title?: string;
  price?: number;
  original_price?: number;
  category_id?: string;
  pictures?: Array<{ id?: string; secure_url?: string; url?: string }>;
};

type MlProductBody = {
  error?: string;
  name?: string;
  pictures?: Array<{ id?: string; url?: string }>;
  buy_box_winner?: { price?: number; original_price?: number; item_id?: string };
};

async function fetchJson(path: string): Promise<{ data: unknown | null; authenticated: boolean }> {
  const result = await fetchMlApi(path);
  if (!result.ok) return { data: null, authenticated: result.authenticated };
  return { data: result.data, authenticated: result.authenticated };
}

function httpsUrl(raw: string | undefined | null): string | null {
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  return raw.replace(/^http:\/\//i, 'https://');
}

function picturesFrom(
  body: { pictures?: Array<{ id?: string; secure_url?: string; url?: string }> } | null | undefined,
): string[] {
  if (!body?.pictures?.length) return [];
  const out: string[] = [];
  for (const p of body.pictures) {
    // Preferir tamaño grande (como scrapers tipo PD): -O / 2X antes que thumbnails.
    const direct = httpsUrl(p.secure_url || p.url);
    if (direct) {
      const upsized = direct
        .replace(/-I\.(jpg|webp|jpeg|png)/i, '-O.$1')
        .replace(/D_Q_NP_/i, 'D_NQ_NP_2X_');
      out.push(upsized);
    } else if (p.id) {
      out.push(`https://http2.mlstatic.com/D_NQ_NP_2X_${p.id}-F.webp`);
    }
    if (out.length >= 24) break;
  }
  return out;
}

function mergePictures(...lists: string[][]): string[] {
  const out: string[] = [];
  for (const list of lists) {
    for (const u of list) {
      const key = u.split('?')[0];
      if (out.some((x) => x.split('?')[0] === key)) continue;
      out.push(u);
      if (out.length >= 24) return out;
    }
  }
  return out;
}

function isUsableItem(item: MlItemBody | null): item is MlItemBody {
  return Boolean(item && !item.error && (item.title || (item.price && item.price > 0) || item.pictures?.length));
}

export async function fetchMercadoLibrePublicOffer(
  rawUrl: string,
  html?: string | null,
): Promise<MercadoLibrePublicOffer | null> {
  const id =
    extractMercadoLibreItemId(rawUrl) || (html ? extractMercadoLibreItemIdFromHtml(html) : null);
  if (!id) return null;

  let usedAuthenticatedApi = false;

  const itemPath = `/items/${encodeURIComponent(id)}`;
  const productPath = `/products/${encodeURIComponent(id)}`;

  const [itemFetch, productFetch] = await Promise.all([fetchJson(itemPath), fetchJson(productPath)]);
  if (itemFetch.authenticated || productFetch.authenticated) usedAuthenticatedApi = true;

  const item = itemFetch.data as MlItemBody | null;
  const product = productFetch.data as MlProductBody | null;

  let title: string | null = null;
  let price: number | null = null;
  let originalPrice: number | null = null;
  let pictures: string[] = [];
  let categoryId: string | null = null;

  if (isUsableItem(item)) {
    title = typeof item.title === 'string' ? item.title : null;
    price = typeof item.price === 'number' && item.price > 0 ? item.price : null;
    originalPrice =
      typeof item.original_price === 'number' && item.original_price > 0 ? item.original_price : null;
    pictures = picturesFrom(item);
    categoryId = typeof item.category_id === 'string' ? item.category_id : null;
  }

  if (product && !product.error) {
    title = title || (typeof product.name === 'string' ? product.name : null);
    if (typeof product.buy_box_winner?.price === 'number' && product.buy_box_winner.price > 0) {
      price = price ?? product.buy_box_winner.price;
    }
    if (
      typeof product.buy_box_winner?.original_price === 'number' &&
      product.buy_box_winner.original_price > 0
    ) {
      originalPrice = originalPrice ?? product.buy_box_winner.original_price;
    }
    pictures = mergePictures(pictures, picturesFrom(product));

    const winnerId = product.buy_box_winner?.item_id;
    if (winnerId && winnerId !== id) {
      const winnerFetch = await fetchJson(`/items/${encodeURIComponent(winnerId)}`);
      if (winnerFetch.authenticated) usedAuthenticatedApi = true;
      const winner = winnerFetch.data as MlItemBody | null;
      if (isUsableItem(winner)) {
        title = title || (typeof winner.title === 'string' ? winner.title : null);
        if (typeof winner.price === 'number' && winner.price > 0) price = price ?? winner.price;
        if (typeof winner.original_price === 'number' && winner.original_price > 0) {
          originalPrice = originalPrice ?? winner.original_price;
        }
        categoryId = categoryId || (typeof winner.category_id === 'string' ? winner.category_id : null);
        pictures = mergePictures(pictures, picturesFrom(winner));
      }
    }
  }

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

  if (!title && !price && pictures.length === 0) return null;
  return {
    title,
    price,
    originalPrice,
    pictures,
    categoryId,
    pathNames,
    source: usedAuthenticatedApi ? 'ml_api' : 'anonymous',
  };
}
