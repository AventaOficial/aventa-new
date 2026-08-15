import {
  extractMercadoLibreItemId,
  extractMercadoLibreItemIdFromHtml,
} from '@/lib/offers/parseOfferPageHtml';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export type MercadoLibrePublicOffer = {
  title: string | null;
  price: number | null;
  originalPrice: number | null;
  pictures: string[];
  categoryId: string | null;
  pathNames: string[];
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

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': UA,
        'Accept-Language': 'es-MX,es;q=0.9',
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
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
    const direct = httpsUrl(p.secure_url || p.url);
    if (direct) out.push(direct);
    else if (p.id) out.push(`https://http2.mlstatic.com/D_NQ_NP_2X_${p.id}-F.webp`);
    if (out.length >= 8) break;
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
      if (out.length >= 8) return out;
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

  const [itemRaw, productRaw] = await Promise.all([
    fetchJson(`https://api.mercadolibre.com/items/${encodeURIComponent(id)}`),
    fetchJson(`https://api.mercadolibre.com/products/${encodeURIComponent(id)}`),
  ]);

  const item = itemRaw as MlItemBody | null;
  const product = productRaw as MlProductBody | null;

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
      const winner = (await fetchJson(
        `https://api.mercadolibre.com/items/${encodeURIComponent(winnerId)}`,
      )) as MlItemBody | null;
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
    const cat = (await fetchJson(`https://api.mercadolibre.com/categories/${encodeURIComponent(categoryId)}`)) as {
      path_from_root?: Array<{ name?: string }>;
    } | null;
    for (const n of cat?.path_from_root ?? []) {
      if (n?.name) pathNames.push(n.name);
    }
  }

  if (!title && !price && pictures.length === 0) return null;
  return { title, price, originalPrice, pictures, categoryId, pathNames };
}
