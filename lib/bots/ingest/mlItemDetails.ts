import type { OfferQualitySignals } from './offerQualitySignals';
import { sleep } from './ingestHttp';
import { fetchMlApi } from '@/lib/integrations/mercadolibre/apiClient';

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
  pictures?: Array<{ id?: string; secure_url?: string; url?: string }>;
};

type MlMultiEntry = { code?: number; body?: MlItemApiBody };

function parseMultiResponse(rows: unknown): MlMultiEntry[] {
  if (!Array.isArray(rows)) return [];
  return rows as MlMultiEntry[];
}

async function fetchItemsChunk(chunk: string[]): Promise<Map<string, MlItemApiBody>> {
  const out = new Map<string, MlItemApiBody>();
  const encoded = encodeURIComponent(chunk.join(','));

  const bulk = await fetchMlApi(`/items/bulk?ids=${encoded}`);
  if (bulk.ok) {
    for (const row of parseMultiResponse(bulk.data)) {
      if (row?.code !== 200 || !row.body?.id) continue;
      out.set(row.body.id, row.body);
    }
    if (out.size > 0) return out;
  }

  const legacy = await fetchMlApi(`/items?ids=${encoded}`);
  if (legacy.ok) {
    for (const row of parseMultiResponse(legacy.data)) {
      if (row?.code !== 200 || !row.body?.id) continue;
      out.set(row.body.id, row.body);
    }
  }

  return out;
}

/**
 * GET /items/bulk?ids= (preferido) con fallback a /items?ids=.
 * Usa OAuth cuando está disponible.
 */
export async function fetchMercadoLibreItemsMulti(ids: string[]): Promise<Map<string, MlItemApiBody>> {
  const out = new Map<string, MlItemApiBody>();
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += ML_MULTIGET_MAX) {
    if (i > 0) await sleep(BETWEEN_CHUNK_MS);
    const chunk = unique.slice(i, i + ML_MULTIGET_MAX);
    const chunkMap = await fetchItemsChunk(chunk);
    for (const [id, body] of chunkMap) {
      out.set(id, body);
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
