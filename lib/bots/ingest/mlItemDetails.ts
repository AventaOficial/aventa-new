import type { OfferQualitySignals } from './offerQualitySignals';
import { BOT_INGEST_USER_AGENT, sleep } from './ingestHttp';

const ML_MULTIGET_MAX = 20;
const BETWEEN_CHUNK_MS = 320;

export type MlItemApiBody = {
  id: string;
  title?: string;
  price?: number;
  original_price?: number;
  permalink?: string;
  sold_quantity?: number;
  condition?: string;
  category_id?: string;
  listing_type_id?: string;
  pictures?: Array<{ secure_url?: string; url?: string }>;
};

type MlMultiEntry = { code?: number; body?: MlItemApiBody };

/**
 * GET /items?ids= — hasta 20 IDs por request (API Mercado Libre).
 */
export async function fetchMercadoLibreItemsMulti(ids: string[]): Promise<Map<string, MlItemApiBody>> {
  const out = new Map<string, MlItemApiBody>();
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += ML_MULTIGET_MAX) {
    if (i > 0) await sleep(BETWEEN_CHUNK_MS);
    const chunk = unique.slice(i, i + ML_MULTIGET_MAX);
    const url = `https://api.mercadolibre.com/items?ids=${encodeURIComponent(chunk.join(','))}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': BOT_INGEST_USER_AGENT },
        cache: 'no-store',
      });
    } catch {
      continue;
    }
    if (!res.ok) continue;
    let rows: unknown;
    try {
      rows = await res.json();
    } catch {
      continue;
    }
    if (!Array.isArray(rows)) continue;
    for (const row of rows as MlMultiEntry[]) {
      if (row?.code !== 200 || !row.body?.id) continue;
      out.set(row.body.id, row.body);
    }
  }
  return out;
}

export function mlItemBodyToSignals(body: MlItemApiBody): OfferQualitySignals {
  return {
    soldQuantity: typeof body.sold_quantity === 'number' ? body.sold_quantity : null,
    condition: typeof body.condition === 'string' ? body.condition : null,
    categoryId: typeof body.category_id === 'string' ? body.category_id : null,
    listingTypeId: typeof body.listing_type_id === 'string' ? body.listing_type_id : null,
  };
}
