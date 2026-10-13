import type { SupabaseClient } from '@supabase/supabase-js';
import { anchorKey, type ProductAnchor } from './identity';
import {
  isMissingColumnError,
  LEGACY_SNAPSHOT_SELECT,
  OBSERVATION_SELECT,
  PRICE_OBSERVATION_POLICY as P,
  type StoredObservationRow,
} from './policy';

export type OfferObservationHistory = {
  rows: StoredObservationRow[];
  /** false si la consulta de su lote falló o llegó recortada. */
  complete: boolean;
};

export type ObservationReadResult = {
  byOffer: Map<string, OfferObservationHistory>;
  /** La base todavía no tiene las columnas del motor: todo se lee como legado. */
  schema: 'observations' | 'legacy';
  failedChunks: number;
  truncatedChunks: number;
};

type ChunkOutcome = { rows: StoredObservationRow[]; ok: boolean; truncated: boolean; missingColumns: boolean };

/**
 * Historial de varias ofertas en lotes de 8 (8 × 120 filas < 1000 de PostgREST).
 * Un lote que falla o llega recortado deja a sus ofertas como historial incompleto:
 * un historial parcial podría fabricar una mediana o un mínimo falsos.
 */
export async function readOfferObservations(
  supabase: SupabaseClient,
  offerIds: readonly string[],
  opts: { now: Date; onlyCapture?: boolean },
): Promise<ObservationReadResult> {
  const byOffer = new Map<string, OfferObservationHistory>();
  const ids = [...new Set(offerIds.filter(Boolean))];
  if (ids.length === 0) return { byOffer, schema: 'observations', failedChunks: 0, truncatedChunks: 0 };

  const since = new Date(opts.now.getTime() - P.windowDays * 86_400_000).toISOString();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += P.offersPerQuery) chunks.push(ids.slice(i, i + P.offersPerQuery));

  const runChunk = async (chunk: string[], columns: string): Promise<ChunkOutcome> => {
    let q = supabase
      .from('offer_price_snapshots')
      .select(columns, { count: 'exact' })
      .in('offer_id', chunk)
      .gte('recorded_at', since);
    if (opts.onlyCapture) q = q.eq('source', 'capture');
    const { data, error, count } = await q.order('recorded_at', { ascending: false }).limit(chunk.length * P.maxRowsPerOffer);
    if (error) return { rows: [], ok: false, truncated: false, missingColumns: isMissingColumnError(error) };
    const rows = (data ?? []) as unknown as StoredObservationRow[];
    const truncated = count == null || count > rows.length;
    return { rows, ok: !truncated, truncated, missingColumns: false };
  };

  let schema: ObservationReadResult['schema'] = 'observations';
  let outcomes = await Promise.all(chunks.map((c) => runChunk(c, OBSERVATION_SELECT)));
  if (outcomes.some((o) => o.missingColumns)) {
    schema = 'legacy';
    outcomes = opts.onlyCapture
      ? outcomes.map(() => ({ rows: [], ok: true, truncated: false, missingColumns: true }))
      : await Promise.all(chunks.map((c) => runChunk(c, LEGACY_SNAPSHOT_SELECT)));
  }

  let failedChunks = 0;
  let truncatedChunks = 0;
  chunks.forEach((chunk, i) => {
    const o = outcomes[i];
    if (o.truncated) truncatedChunks += 1;
    else if (!o.ok) failedChunks += 1;
    for (const id of chunk) byOffer.set(id, { rows: [], complete: o.ok });
    if (!o.ok) return;
    for (const row of o.rows) byOffer.get(row.offer_id)?.rows.push(row);
  });
  return { byOffer, schema, failedChunks, truncatedChunks };
}

export type ProductObservationReadResult = {
  /** Por `anchorKey` (tienda:item externo): filas capturadas de todas las ofertas del producto. */
  byAnchor: Map<string, OfferObservationHistory>;
  schema: 'observations' | 'legacy';
  failedChunks: number;
  truncatedChunks: number;
};

/**
 * Historial capturado por producto, no por oferta: una oferta nueva del mismo item no reinicia
 * la serie y la caducidad de una oferta no la borra. Mismos lotes y misma regla que
 * `readOfferObservations`: un lote fallido o recortado deja a sus productos como incompletos.
 * Sin la migración, no hay capturas que leer.
 */
export async function readProductObservations(
  supabase: SupabaseClient,
  anchors: readonly ProductAnchor[],
  opts: { now: Date },
): Promise<ProductObservationReadResult> {
  const byAnchor = new Map<string, OfferObservationHistory>();
  const unique = new Map<string, ProductAnchor>();
  for (const a of anchors) if (a?.externalItemId) unique.set(anchorKey(a), a);
  if (unique.size === 0) return { byAnchor, schema: 'observations', failedChunks: 0, truncatedChunks: 0 };

  const since = new Date(opts.now.getTime() - P.windowDays * 86_400_000).toISOString();
  const bySource = new Map<string, ProductAnchor[]>();
  for (const a of unique.values()) bySource.set(a.sourceId, [...(bySource.get(a.sourceId) ?? []), a]);
  const chunks: ProductAnchor[][] = [];
  for (const list of bySource.values()) {
    for (let i = 0; i < list.length; i += P.offersPerQuery) chunks.push(list.slice(i, i + P.offersPerQuery));
  }

  const outcomes = await Promise.all(
    chunks.map(async (chunk): Promise<ChunkOutcome> => {
      const { data, error, count } = await supabase
        .from('offer_price_snapshots')
        .select(OBSERVATION_SELECT, { count: 'exact' })
        .eq('source', 'capture')
        .eq('source_id', chunk[0].sourceId)
        .in(
          'external_item_id',
          chunk.map((a) => a.externalItemId),
        )
        .gte('recorded_at', since)
        .order('recorded_at', { ascending: false })
        .limit(chunk.length * P.maxRowsPerOffer);
      if (error) return { rows: [], ok: false, truncated: false, missingColumns: isMissingColumnError(error) };
      const rows = (data ?? []) as unknown as StoredObservationRow[];
      const truncated = count == null || count > rows.length;
      return { rows, ok: !truncated, truncated, missingColumns: false };
    }),
  );

  if (outcomes.some((o) => o.missingColumns)) {
    for (const k of unique.keys()) byAnchor.set(k, { rows: [], complete: true });
    return { byAnchor, schema: 'legacy', failedChunks: 0, truncatedChunks: 0 };
  }

  let failedChunks = 0;
  let truncatedChunks = 0;
  chunks.forEach((chunk, i) => {
    const o = outcomes[i];
    if (o.truncated) truncatedChunks += 1;
    else if (!o.ok) failedChunks += 1;
    for (const a of chunk) byAnchor.set(anchorKey(a), { rows: [], complete: o.ok });
    if (!o.ok) return;
    for (const row of o.rows) {
      if (!row.source_id || !row.external_item_id) continue;
      byAnchor.get(`${row.source_id}:${row.external_item_id}`)?.rows.push(row);
    }
  });
  return { byAnchor, schema: 'observations', failedChunks, truncatedChunks };
}
