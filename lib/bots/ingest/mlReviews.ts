import { BOT_INGEST_USER_AGENT, sleep } from './ingestHttp';

export type MlRatingSummary = { average: number; total: number };

const BETWEEN_MS = 350;

/**
 * Resumen de valoraciones de producto en ML (si el endpoint responde).
 * Estructura puede variar; se tolera ausencia de datos.
 */
export async function fetchMlItemRatingSummary(itemId: string): Promise<MlRatingSummary | null> {
  await sleep(BETWEEN_MS);
  const url = `https://api.mercadolibre.com/reviews/item/${encodeURIComponent(itemId)}?limit=1`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': BOT_INGEST_USER_AGENT },
      cache: 'no-store',
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let j: Record<string, unknown>;
  try {
    j = (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
  const paging = j.paging as Record<string, unknown> | undefined;
  const totalRaw = paging?.total ?? j.total ?? j.reviews_amount;
  const total = typeof totalRaw === 'number' && Number.isFinite(totalRaw) ? totalRaw : 0;

  const ratingRaw =
    j.rating_average ??
    j.rating_avg ??
    (Array.isArray(j.reviews) && j.reviews[0]
      ? (j.reviews[0] as { rating?: number }).rating
      : null);
  const average =
    typeof ratingRaw === 'number' && Number.isFinite(ratingRaw) ? ratingRaw : null;

  if (average == null || total < 1) return null;
  return { average, total };
}

export async function attachMlRatingsToMap(
  itemIds: string[],
  maxFetches: number
): Promise<Map<string, MlRatingSummary>> {
  const map = new Map<string, MlRatingSummary>();
  let n = 0;
  for (const id of itemIds) {
    if (n >= maxFetches) break;
    const s = await fetchMlItemRatingSummary(id);
    n += 1;
    if (s) map.set(id, s);
  }
  return map;
}
