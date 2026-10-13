import type { OfferQualitySignals } from './offerQualitySignals';
import { sleep } from './ingestHttp';
import { fetchMlApi, type FetchMlApiResult } from '@/lib/integrations/mercadolibre/apiClient';

const ML_MULTIGET_MAX = 20;
const BETWEEN_CHUNK_MS = 320;

export type MlItemApiBody = {
  id: string;
  title?: string;
  price?: number;
  original_price?: number;
  currency_id?: string;
  /** active | paused | closed | under_review | inactive */
  status?: string;
  available_quantity?: number;
  permalink?: string;
  sold_quantity?: number;
  condition?: string;
  category_id?: string;
  listing_type_id?: string;
  pictures?: Array<{ id?: string; secure_url?: string; url?: string }>;
};

/** Por qué un id pedido no volvió con detalle. */
export type MlItemFetchFailure =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'upstream_error'
  | 'timeout'
  | 'invalid_response';

export type MlItemsBulkResult = {
  items: Map<string, MlItemApiBody>;
  missing: Map<string, MlItemFetchFailure>;
};

export type MlItemsBulkDeps = {
  fetchApi?: (path: string) => Promise<FetchMlApiResult>;
  pause?: (ms: number) => Promise<void>;
};

type MlMultiEntry = { code?: number; body?: MlItemApiBody };

function failureForStatus(status: number, timedOut?: boolean): MlItemFetchFailure {
  if (timedOut) return 'timeout';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status === 0 || status >= 500) return 'upstream_error';
  return 'invalid_response';
}

/**
 * GET /items/bulk?ids= (máx. 20 por llamada). `/items?ids=` se retiró el 25/10/2026: no hay fallback.
 * Un 429 corta los lotes restantes; ningún id se reintenta en esta corrida.
 * Los campos ausentes quedan ausentes: el consumidor decide qué puede verificar.
 */
export async function fetchMercadoLibreItemsBulk(
  ids: string[],
  deps: MlItemsBulkDeps = {},
): Promise<MlItemsBulkResult> {
  const fetchApi = deps.fetchApi ?? fetchMlApi;
  const pause = deps.pause ?? sleep;
  const items = new Map<string, MlItemApiBody>();
  const missing = new Map<string, MlItemFetchFailure>();
  const unique = [...new Set(ids.filter(Boolean))];

  for (let i = 0; i < unique.length; i += ML_MULTIGET_MAX) {
    const chunk = unique.slice(i, i + ML_MULTIGET_MAX);
    if (i > 0) await pause(BETWEEN_CHUNK_MS);
    const res = await fetchApi(`/items/bulk?ids=${encodeURIComponent(chunk.join(','))}`);
    if (!res.ok) {
      const failure = failureForStatus(res.status, res.timedOut);
      const affected = failure === 'rate_limited' ? unique.slice(i) : chunk;
      for (const id of affected) missing.set(id, failure);
      if (failure === 'rate_limited') break;
      continue;
    }

    const rows = Array.isArray(res.data) ? (res.data as MlMultiEntry[]) : [];
    for (const row of rows) {
      const id = row?.body?.id;
      if (row?.code === 200 && id && chunk.includes(id)) items.set(id, row.body!);
    }
    const byId = new Map(rows.map((row) => [row?.body?.id, row?.code]));
    for (const id of chunk) {
      if (items.has(id)) continue;
      const code = byId.get(id);
      missing.set(id, typeof code === 'number' ? failureForStatus(code) : 'invalid_response');
    }
  }

  return { items, missing };
}

export async function fetchMercadoLibreItemsMulti(ids: string[]): Promise<Map<string, MlItemApiBody>> {
  return (await fetchMercadoLibreItemsBulk(ids)).items;
}

export function mlItemBodyToSignals(body: MlItemApiBody): OfferQualitySignals {
  return {
    soldQuantity: typeof body.sold_quantity === 'number' ? body.sold_quantity : null,
    condition: typeof body.condition === 'string' ? body.condition : null,
    categoryId: typeof body.category_id === 'string' ? body.category_id : null,
    listingTypeId: typeof body.listing_type_id === 'string' ? body.listing_type_id : null,
  };
}
