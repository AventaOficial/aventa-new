import { BOT_INGEST_USER_AGENT } from './ingestHttp';
import { fetchWithTimeout, HUNTER_HTTP_TIMEOUT_MS } from '@/lib/server/fetchWithTimeout';
import { resolveMercadoLibreItem } from '@/lib/offers/resolveMercadoLibreItem';
import { resolveMercadoLibrePrice } from '@/lib/offers/resolveMercadoLibrePrice';

export type MlPriceQuote = {
  current: number;
  listPrice: number | null;
  regularPrice: number | null;
};

type MlPriceRow = {
  type?: string;
  amount?: number;
  regular_amount?: number | null;
};

type MlPricesResponse = {
  prices?: MlPriceRow[];
  reference_prices?: MlPriceRow[];
};

function finitePositive(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  return Number(n.toFixed(2));
}

function pickAmount(rows: MlPriceRow[] | undefined, type: string): number | null {
  const row = rows?.find((p) => (p.type ?? '').toLowerCase() === type);
  return finitePositive(row?.amount);
}

/**
 * GET /items/{id}/prices (+ fallback oficial catalog/items vía resolveMercadoLibrePrice).
 */
export async function fetchMlItemPriceQuote(
  itemId: string,
  fallback: { current: number; listPrice: number | null; regularPrice?: number | null },
  opts?: { url?: string | null; catalogProductId?: string | null },
): Promise<MlPriceQuote> {
  const safeFallback: MlPriceQuote = {
    current: fallback.current,
    listPrice: fallback.listPrice,
    regularPrice: fallback.regularPrice ?? null,
  };

  const fromUrl = opts?.url ? resolveMercadoLibreItem(opts.url) : null;
  const catalogProductId =
    opts?.catalogProductId ?? fromUrl?.catalogProductId ?? null;

  try {
    const resolved = await resolveMercadoLibrePrice({
      itemId,
      catalogProductId,
      siteId: fromUrl?.siteId ?? null,
    });
    if (resolved.status === 'resolved' && resolved.price != null) {
      return {
        current: resolved.price,
        listPrice: resolved.originalPrice ?? fallback.listPrice,
        regularPrice: resolved.regularPrice ?? fallback.regularPrice ?? null,
      };
    }
  } catch {
    /* fallback anónimo abajo */
  }

  const url = `https://api.mercadolibre.com/items/${encodeURIComponent(itemId)}/prices`;
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      headers: { Accept: 'application/json', 'User-Agent': BOT_INGEST_USER_AGENT },
      cache: 'no-store',
      timeoutMs: HUNTER_HTTP_TIMEOUT_MS,
    });
  } catch {
    return safeFallback;
  }
  if (!res.ok) return safeFallback;

  let json: MlPricesResponse;
  try {
    json = (await res.json()) as MlPricesResponse;
  } catch {
    return safeFallback;
  }

  const promo = pickAmount(json.prices, 'promotion');
  const standard = pickAmount(json.prices, 'standard');
  const promoRegular = finitePositive(
    json.prices?.find((p) => (p.type ?? '').toLowerCase() === 'promotion')?.regular_amount,
  );
  const current = promo ?? fallback.current;
  const regularPrice = standard ?? promoRegular ?? null;
  const listPrice =
    fallback.listPrice != null && regularPrice != null
      ? Math.max(fallback.listPrice, regularPrice)
      : (fallback.listPrice ?? regularPrice);

  return {
    current,
    listPrice,
    regularPrice,
  };
}
