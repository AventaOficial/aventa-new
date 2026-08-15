import { extractMercadoLibreItemId } from '@/lib/offers/parseOfferPageHtml';

const UA = 'Mozilla/5.0 (compatible; AVENTA-OfferParse/1.0; +https://aventaofertas.com)';

export type MercadoLibrePublicOffer = {
  title: string | null;
  price: number | null;
  originalPrice: number | null;
  pictures: string[];
  categoryId: string | null;
  pathNames: string[];
};

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function picturesFrom(body: { pictures?: Array<{ secure_url?: string; url?: string }> } | null): string[] {
  if (!body?.pictures?.length) return [];
  return body.pictures
    .map((p) => p.secure_url || p.url)
    .filter((u): u is string => Boolean(u && /^https?:\/\//i.test(u)))
    .slice(0, 8);
}

export async function fetchMercadoLibrePublicOffer(rawUrl: string): Promise<MercadoLibrePublicOffer | null> {
  const id = extractMercadoLibreItemId(rawUrl);
  if (!id) return null;

  const item = (await fetchJson(`https://api.mercadolibre.com/items/${encodeURIComponent(id)}`)) as {
    title?: string;
    price?: number;
    original_price?: number;
    category_id?: string;
    pictures?: Array<{ secure_url?: string; url?: string }>;
  } | null;

  let title = typeof item?.title === 'string' ? item.title : null;
  let price = typeof item?.price === 'number' && item.price > 0 ? item.price : null;
  let originalPrice =
    typeof item?.original_price === 'number' && item.original_price > 0 ? item.original_price : null;
  let pictures = picturesFrom(item);
  let categoryId = typeof item?.category_id === 'string' ? item.category_id : null;

  if (!item || (!price && pictures.length === 0)) {
    const product = (await fetchJson(`https://api.mercadolibre.com/products/${encodeURIComponent(id)}`)) as {
      name?: string;
      pictures?: Array<{ url?: string }>;
      buy_box_winner?: { price?: number; item_id?: string };
    } | null;
    if (product) {
      title = title || (typeof product.name === 'string' ? product.name : null);
      if (typeof product.buy_box_winner?.price === 'number' && product.buy_box_winner.price > 0) {
        price = price ?? product.buy_box_winner.price;
      }
      const prodPics = (product.pictures ?? [])
        .map((p) => p.url)
        .filter((u): u is string => Boolean(u && /^https?:\/\//i.test(u)));
      if (prodPics.length) pictures = [...pictures, ...prodPics].slice(0, 8);
      const winnerId = product.buy_box_winner?.item_id;
      if (winnerId && !categoryId) {
        const winner = (await fetchJson(`https://api.mercadolibre.com/items/${encodeURIComponent(winnerId)}`)) as {
          category_id?: string;
          price?: number;
          original_price?: number;
          pictures?: Array<{ secure_url?: string; url?: string }>;
        } | null;
        if (winner) {
          categoryId = typeof winner.category_id === 'string' ? winner.category_id : categoryId;
          if (typeof winner.price === 'number' && winner.price > 0) price = price ?? winner.price;
          if (typeof winner.original_price === 'number' && winner.original_price > 0) {
            originalPrice = originalPrice ?? winner.original_price;
          }
          const more = picturesFrom(winner);
          if (more.length) pictures = [...pictures, ...more].slice(0, 8);
        }
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
