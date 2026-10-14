import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeCandidateUrl } from '@/lib/mcp/candidates';
import { MCP_MAX_PRICE, MCP_PRICE_REFERENCE_WINDOW_DAYS } from '@/lib/mcp/contract';
import type { McpOutcome } from '@/lib/mcp/submissions';
import { resolveIngestionIdentity } from '@/lib/offers/ingestion/identity';
import { readProduct } from '@/lib/offers/priceObservations/identity';
import { isUsableSnapshot, round2, toPrice } from '@/lib/offers/priceObservations/policy';

/**
 * get_price_reference: ¿este precio es bajo para este producto? ¿el precio de lista está inflado?
 * Compara contra lo que Aventa ya vio del mismo producto (precios leídos de la ficha al crear o
 * capturar una oferta) y, si existe, contra la referencia pública de Profeco.
 * Sólo lectura. No hace fetch ni expone ofertas, estados ni moderación.
 */

/** Margen para que redondeos o centavos no cambien el veredicto. */
const LIST_TOLERANCE = 0.1;
const OFFER_LOOKUP_LIMIT = 50;
const SNAPSHOT_LIMIT = 500;
const MARKET_ROWS_LIMIT = 200;

export type PriceVerdict = 'lowest_seen' | 'below_typical' | 'within_seen' | 'above_seen' | 'insufficient_history';
export type ListPriceVerdict = 'consistent' | 'raised_vs_history' | 'above_market' | 'unknown' | 'not_provided';
export type MarketVerdict = 'below_market' | 'within_market' | 'above_market' | 'no_reference';

export type PriceReferenceResult = {
  windowDays: number;
  history: {
    observations: number;
    distinctDays: number;
    minPrice: number | null;
    medianPrice: number | null;
    maxPrice: number | null;
    lastPrice: number | null;
    lastSeenAt: string | null;
    maxListPrice: number | null;
  };
  market: {
    source: 'profeco_qqp';
    periodEnd: string;
    minPrice: number;
    medianPrice: number;
    maxPrice: number;
    observations: number;
  } | null;
  verdict: { price: PriceVerdict; listPrice: ListPriceVerdict; market: MarketVerdict };
  summary: string;
};

type OfferRow = { id: string; title: string | null; price: unknown; original_price: unknown; created_at: string | null };
type SnapshotRow = {
  offer_id: string;
  price: unknown;
  original_price: unknown;
  recorded_at: string | null;
  validation_status: string | null;
  availability: string | null;
};
type MarketRow = { period_end: string; min_price: unknown; median_price: unknown; max_price: unknown; observations: unknown };
type Observation = { price: number; listPrice: number | null; at: string };

const INTERNAL = { ok: false as const, code: 'INTERNAL_ERROR' as const, message: 'No se pudo consultar la referencia de precio.' };

function money(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0 || raw > MCP_MAX_PRICE) return null;
  return round2(raw);
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return round2(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
}

function positive(raw: unknown): number | null {
  const n = toPrice(raw);
  return n != null && n > 0 ? n : null;
}

export function summarizeHistory(observations: readonly Observation[]): PriceReferenceResult['history'] {
  const prices = observations.map((o) => o.price);
  const lists = observations.map((o) => o.listPrice).filter((n): n is number => n != null);
  const last = [...observations].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))[0] ?? null;
  return {
    observations: observations.length,
    distinctDays: new Set(observations.map((o) => o.at.slice(0, 10))).size,
    minPrice: prices.length ? round2(Math.min(...prices)) : null,
    medianPrice: median(prices),
    maxPrice: prices.length ? round2(Math.max(...prices)) : null,
    lastPrice: last ? round2(last.price) : null,
    lastSeenAt: last?.at ?? null,
    maxListPrice: lists.length ? round2(Math.max(...lists)) : null,
  };
}

export function priceVerdict(price: number, h: PriceReferenceResult['history']): PriceVerdict {
  if (h.distinctDays < 2 || h.minPrice == null || h.medianPrice == null || h.maxPrice == null) return 'insufficient_history';
  if (price <= h.minPrice) return 'lowest_seen';
  if (price < h.medianPrice) return 'below_typical';
  if (price <= h.maxPrice) return 'within_seen';
  return 'above_seen';
}

export function listPriceVerdict(
  originalPrice: number | null,
  h: PriceReferenceResult['history'],
  market: PriceReferenceResult['market'],
): ListPriceVerdict {
  if (originalPrice == null) return 'not_provided';
  if (h.maxListPrice != null && originalPrice > h.maxListPrice * (1 + LIST_TOLERANCE)) return 'raised_vs_history';
  if (market && originalPrice > market.maxPrice * (1 + LIST_TOLERANCE)) return 'above_market';
  if (h.maxListPrice != null) return 'consistent';
  return 'unknown';
}

export function marketVerdict(price: number, market: PriceReferenceResult['market']): MarketVerdict {
  if (!market) return 'no_reference';
  if (price < market.minPrice) return 'below_market';
  if (price > market.maxPrice) return 'above_market';
  return 'within_market';
}

function summaryOf(v: PriceReferenceResult['verdict'], h: PriceReferenceResult['history']): string {
  const parts: string[] = [];
  switch (v.price) {
    case 'lowest_seen':
      parts.push(`Es el precio más bajo que Aventa ha visto en ${h.distinctDays} días con registro.`);
      break;
    case 'below_typical':
      parts.push(`Está por debajo de la mediana que Aventa ha visto ($${h.medianPrice}).`);
      break;
    case 'within_seen':
      parts.push(`Está dentro del rango que Aventa ha visto; antes estuvo en $${h.minPrice}.`);
      break;
    case 'above_seen':
      parts.push(`Está por encima de todo lo que Aventa ha visto (máximo $${h.maxPrice}). No es oferta.`);
      break;
    default:
      parts.push('Aventa no tiene historial suficiente de este producto; juzga sólo con lo que muestra la ficha.');
  }
  if (v.listPrice === 'raised_vs_history') parts.push(`El precio de lista supera el que Aventa vio antes ($${h.maxListPrice}): parece inflado.`);
  if (v.listPrice === 'above_market') parts.push('El precio de lista supera la referencia de mercado: parece inflado.');
  if (v.market === 'below_market') parts.push('Está por debajo de la referencia de mercado.');
  if (v.market === 'above_market') parts.push('Está por encima de la referencia de mercado.');
  return parts.join(' ');
}

async function loadOffers(supabase: SupabaseClient, url: string): Promise<OfferRow[] | null> {
  const identity = resolveIngestionIdentity(url);
  const lookups: Array<[string, string]> = [];
  if (identity.key) lookups.push(['ingestion_identity_key', identity.key]);
  if (identity.productFingerprint) lookups.push(['product_fingerprint', identity.productFingerprint]);
  lookups.push(['offer_url', url]);
  const byId = new Map<string, OfferRow>();
  for (const [column, value] of lookups) {
    const { data, error } = await supabase
      .from('offers')
      .select('id, title, price, original_price, created_at')
      .eq(column, value)
      .order('created_at', { ascending: false })
      .limit(OFFER_LOOKUP_LIMIT);
    if (error) return null;
    for (const row of (data ?? []) as OfferRow[]) byId.set(row.id, row);
  }
  return [...byId.values()];
}

async function loadObservations(supabase: SupabaseClient, offers: readonly OfferRow[], since: string): Promise<Observation[] | null> {
  if (offers.length === 0) return [];
  const { data, error } = await supabase
    .from('offer_price_snapshots')
    .select('offer_id, price, original_price, recorded_at, validation_status, availability')
    .in('offer_id', offers.map((o) => o.id))
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: false })
    .limit(SNAPSHOT_LIMIT);
  if (error) return null;
  const out: Observation[] = [];
  const withSnapshot = new Set<string>();
  for (const row of (data ?? []) as SnapshotRow[]) {
    withSnapshot.add(row.offer_id);
    const price = positive(row.price);
    if (price == null || !row.recorded_at || !isUsableSnapshot(row as never)) continue;
    const list = positive(row.original_price);
    out.push({ price, listPrice: list != null && list > price ? list : null, at: row.recorded_at });
  }
  for (const offer of offers) {
    if (withSnapshot.has(offer.id) || !offer.created_at || offer.created_at < since) continue;
    const price = positive(offer.price);
    if (price == null) continue;
    const list = positive(offer.original_price);
    out.push({ price, listPrice: list != null && list > price ? list : null, at: offer.created_at });
  }
  return out;
}

/** Referencia Profeco del periodo más reciente. Si la tabla o los datos no están, no hay referencia. */
async function loadMarket(supabase: SupabaseClient, title: string | null): Promise<PriceReferenceResult['market']> {
  const product = readProduct(title);
  if (!product.needId || !product.presentationKey) return null;
  let query = supabase
    .from('price_references')
    .select('period_end, min_price, median_price, max_price, observations')
    .eq('need_id', product.needId)
    .eq('presentation_key', product.presentationKey);
  if (product.variantId) query = query.eq('variant_id', product.variantId);
  const { data, error } = await query.order('period_end', { ascending: false }).limit(MARKET_ROWS_LIMIT);
  if (error || !data?.length) return null;
  const rows = data as MarketRow[];
  const latest = rows[0].period_end;
  const current = rows.filter((r) => r.period_end === latest);
  const mins = current.map((r) => positive(r.min_price)).filter((n): n is number => n != null);
  const medians = current.map((r) => positive(r.median_price)).filter((n): n is number => n != null);
  const maxes = current.map((r) => positive(r.max_price)).filter((n): n is number => n != null);
  if (!mins.length || !medians.length || !maxes.length) return null;
  return {
    source: 'profeco_qqp',
    periodEnd: latest,
    minPrice: round2(Math.min(...mins)),
    medianPrice: median(medians) ?? 0,
    maxPrice: round2(Math.max(...maxes)),
    observations: current.reduce((sum, r) => sum + (typeof r.observations === 'number' ? r.observations : 0), 0),
  };
}

export async function getPriceReference(
  supabase: SupabaseClient,
  input: { url: unknown; price: unknown; originalPrice?: unknown; title?: unknown },
  now: Date = new Date(),
): Promise<McpOutcome<PriceReferenceResult>> {
  const normalized = normalizeCandidateUrl(input.url);
  if (!normalized.ok) return { ok: false, code: 'INVALID_INPUT', message: 'url debe ser https de una tienda soportada.' };
  const price = money(input.price);
  if (price == null) return { ok: false, code: 'INVALID_INPUT', message: 'price debe ser un número en MXN mayor que 0.' };
  let originalPrice: number | null = null;
  if (input.originalPrice !== undefined && input.originalPrice !== null) {
    originalPrice = money(input.originalPrice);
    if (originalPrice == null || !(originalPrice > price)) {
      return { ok: false, code: 'INVALID_INPUT', message: 'originalPrice debe ser mayor que price.' };
    }
  }
  const hintTitle = typeof input.title === 'string' && input.title.trim() ? input.title.trim().slice(0, 200) : null;

  const offers = await loadOffers(supabase, normalized.url);
  if (!offers) return INTERNAL;
  const since = new Date(now.getTime() - MCP_PRICE_REFERENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const observations = await loadObservations(supabase, offers, since);
  if (!observations) return INTERNAL;

  const history = summarizeHistory(observations);
  const market = await loadMarket(supabase, hintTitle ?? offers[0]?.title ?? null);
  const verdict = {
    price: priceVerdict(price, history),
    listPrice: listPriceVerdict(originalPrice, history, market),
    market: marketVerdict(price, market),
  };
  return {
    ok: true,
    data: { windowDays: MCP_PRICE_REFERENCE_WINDOW_DAYS, history, market, verdict, summary: summaryOf(verdict, history) },
  };
}
